import { z } from "zod";
import { COOKIE_NAME } from "../shared/const.js";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import * as db from "./db";
import * as jose from "jose";
import { ENV } from "./_core/env";

// JWT secret for session tokens
const JWT_SECRET = new TextEncoder().encode(ENV.cookieSecret || "scoop-riding-secret-key-change-in-production");

// Generate session token
async function generateSessionToken(userId: number, openId: string): Promise<string> {
  const token = await new jose.SignJWT({ userId, openId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(JWT_SECRET);
  return token;
}

export const appRouter = router({
  // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),

    // Email/Password Registration
    register: publicProcedure
      .input(
        z.object({
          email: z.string().email("올바른 이메일 형식이 아닙니다."),
          password: z.string().min(6, "비밀번호는 6자 이상이어야 합니다."),
          name: z.string().min(1, "이름을 입력해주세요.").max(50),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const result = await db.createUserWithEmail(input.email, input.password, input.name);

        if (!result.success) {
          return { success: false, error: result.error };
        }

        // Get the created user
        const user = await db.getUserByEmail(input.email);
        if (!user) {
          return { success: false, error: "회원가입 후 사용자 정보를 찾을 수 없습니다." };
        }

        // Generate session token
        const token = await generateSessionToken(user.id, user.openId);

        // Set cookie for web
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, token, {
          ...cookieOptions,
          maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
        });

        return {
          success: true,
          token,
          user: {
            id: user.id,
            openId: user.openId,
            name: user.name,
            email: user.email,
            loginMethod: user.loginMethod,
            lastSignedIn: user.lastSignedIn,
          },
        };
      }),

    // Email/Password Login
    login: publicProcedure
      .input(
        z.object({
          email: z.string().email("올바른 이메일 형식이 아닙니다."),
          password: z.string().min(1, "비밀번호를 입력해주세요."),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const result = await db.verifyUserCredentials(input.email, input.password);

        if (!result.success || !result.user) {
          return { success: false, error: result.error };
        }

        const user = result.user;

        // Generate session token
        const token = await generateSessionToken(user.id, user.openId);

        // Set cookie for web
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, token, {
          ...cookieOptions,
          maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
        });

        return {
          success: true,
          token,
          user: {
            id: user.id,
            openId: user.openId,
            name: user.name,
            email: user.email,
            loginMethod: user.loginMethod,
            lastSignedIn: user.lastSignedIn,
          },
        };
      }),
  }),

  // Riding records (protected - requires login)
  rides: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return db.getUserRidingRecords(ctx.user.id);
    }),

    create: protectedProcedure
      .input(
        z.object({
          recordId: z.string(),
          date: z.string(),
          duration: z.number(),
          distance: z.number(),
          avgSpeed: z.number(),
          maxSpeed: z.number(),
          startTime: z.string().optional(),
          endTime: z.string().optional(),
          gpsPointsJson: z.string().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const result = await db.createRidingRecord({
          userId: ctx.user.id,
          recordId: input.recordId,
          date: input.date,
          duration: input.duration,
          distance: Math.round(input.distance),
          avgSpeed: Math.round(input.avgSpeed * 10),
          maxSpeed: Math.round(input.maxSpeed * 10),
          startTime: input.startTime ? new Date(input.startTime) : undefined,
          endTime: input.endTime ? new Date(input.endTime) : undefined,
          gpsPointsJson: input.gpsPointsJson,
        });
        return { success: true, id: result };
      }),

    delete: protectedProcedure
      .input(z.object({ recordId: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const success = await db.deleteRidingRecord(input.recordId, ctx.user.id);
        return { success };
      }),
  }),
});

export type AppRouter = typeof appRouter;
