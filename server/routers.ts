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

// Generate password reset token (short-lived)
async function generatePasswordResetToken(email: string): Promise<string> {
  const token = await new jose.SignJWT({ email, type: "password_reset" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(JWT_SECRET);
  return token;
}

// Verify password reset token
async function verifyPasswordResetToken(token: string): Promise<{ email: string } | null> {
  try {
    const { payload } = await jose.jwtVerify(token, JWT_SECRET);
    if (payload.type !== "password_reset" || !payload.email) {
      return null;
    }
    return { email: payload.email as string };
  } catch {
    return null;
  }
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

    // Request password reset
    requestPasswordReset: publicProcedure
      .input(
        z.object({
          email: z.string().email("올바른 이메일 형식이 아닙니다."),
        })
      )
      .mutation(async ({ input }) => {
        // Check if user exists
        const user = await db.getUserByEmail(input.email);
        
        // Always return success to prevent email enumeration
        // In production, you would send an actual email here
        if (user) {
          const resetToken = await generatePasswordResetToken(input.email);
          // In production: send email with reset link containing the token
          // For now, we'll just log it (in development)
          console.log(`[Password Reset] Token for ${input.email}: ${resetToken}`);
          
          // Store the token in database (optional, for additional security)
          await db.storePasswordResetToken(user.id, resetToken);
        }

        return {
          success: true,
          message: "비밀번호 재설정 링크가 이메일로 발송되었습니다.",
        };
      }),

    // Reset password with token
    resetPassword: publicProcedure
      .input(
        z.object({
          token: z.string(),
          newPassword: z.string().min(6, "비밀번호는 6자 이상이어야 합니다."),
        })
      )
      .mutation(async ({ input }) => {
        // Verify token
        const tokenData = await verifyPasswordResetToken(input.token);
        if (!tokenData) {
          return { success: false, error: "유효하지 않거나 만료된 토큰입니다." };
        }

        // Update password
        const result = await db.updateUserPassword(tokenData.email, input.newPassword);
        if (!result.success) {
          return { success: false, error: result.error };
        }

        return {
          success: true,
          message: "비밀번호가 성공적으로 변경되었습니다.",
        };
      }),

    // Google OAuth login
    googleLogin: publicProcedure
      .input(
        z.object({
          idToken: z.string(),
          email: z.string().email(),
          name: z.string().optional(),
          googleId: z.string(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        // Check if user exists with this Google ID
        let user = await db.getUserByGoogleId(input.googleId);

        if (!user) {
          // Check if email is already registered
          const existingUser = await db.getUserByEmail(input.email);
          if (existingUser) {
            // Link Google account to existing user
            await db.linkGoogleAccount(existingUser.id, input.googleId);
            user = existingUser;
          } else {
            // Create new user with Google
            const result = await db.createUserWithGoogle(
              input.googleId,
              input.email,
              input.name || input.email.split("@")[0]
            );
            if (!result.success) {
              return { success: false, error: result.error };
            }
            user = await db.getUserByGoogleId(input.googleId);
          }
        }

        if (!user) {
          return { success: false, error: "사용자 정보를 찾을 수 없습니다." };
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
