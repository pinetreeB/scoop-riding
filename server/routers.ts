import { z } from "zod";
import { COOKIE_NAME } from "../shared/const.js";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import * as db from "./db";
import * as jose from "jose";
import { ENV } from "./_core/env";

// JWT secret for session tokens - MUST match sdk.ts getSessionSecret()
// Uses ENV.cookieSecret which comes from JWT_SECRET environment variable
const JWT_SECRET = new TextEncoder().encode(ENV.cookieSecret || "scoop-riding-secret-key-change-in-production");
console.log("[Auth] JWT_SECRET initialized, cookieSecret length:", ENV.cookieSecret?.length || 0);

// Generate session token
// Must include openId, appId, and name to be compatible with SDK verifySession
async function generateSessionToken(userId: number, openId: string, name: string = ""): Promise<string> {
  const token = await new jose.SignJWT({ 
    userId, 
    openId,
    appId: ENV.appId || "scoop-riding",
    name: name || "User"
  })
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

        // Generate session token with user name
        const token = await generateSessionToken(user.id, user.openId, user.name || "");

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

        // Generate session token with user name
        const token = await generateSessionToken(user.id, user.openId, user.name || "");

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

        // Generate session token with user name
        const token = await generateSessionToken(user.id, user.openId, user.name || "");

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

    // Get a specific riding record by ID (for viewing shared records)
    getById: protectedProcedure
      .input(z.object({ recordId: z.string() }))
      .query(async ({ input }) => {
        return db.getRidingRecordById(input.recordId);
      }),
    
    // Check if a record exists by recordId (for sync check)
    get: protectedProcedure
      .input(z.object({ recordId: z.string() }))
      .query(async ({ ctx, input }) => {
        const record = await db.getRidingRecordByRecordId(input.recordId, ctx.user.id);
        return record;
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
        console.log("[rides.create] Called by user:", ctx.user.id, ctx.user.email);
        console.log("[rides.create] Input:", { recordId: input.recordId, date: input.date, duration: input.duration, distance: input.distance });
        
        try {
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
          console.log("[rides.create] Success, id:", result);
          return { success: true, id: result };
        } catch (error: any) {
          console.error("[rides.create] Error:", error?.message || error);
          // Check for duplicate key error
          if (error?.message?.includes('Duplicate') || error?.code === 'ER_DUP_ENTRY') {
            console.log("[rides.create] Duplicate record, returning success");
            return { success: true, id: null, duplicate: true };
          }
          throw error;
        }
      }),

    delete: protectedProcedure
      .input(z.object({ recordId: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const success = await db.deleteRidingRecord(input.recordId, ctx.user.id);
        return { success };
      }),
  }),

  // Scooter (기체) management (protected - requires login)
  scooters: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return db.getUserScooters(ctx.user.id);
    }),

    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        return db.getScooterById(input.id, ctx.user.id);
      }),

    getDefault: protectedProcedure.query(async ({ ctx }) => {
      return db.getDefaultScooter(ctx.user.id);
    }),

    create: protectedProcedure
      .input(
        z.object({
          name: z.string().min(1, "기체 이름을 입력해주세요.").max(100),
          brand: z.string().max(100).optional(),
          model: z.string().max(100).optional(),
          serialNumber: z.string().max(100).optional(),
          purchaseDate: z.string().optional(),
          initialOdometer: z.number().min(0).default(0),
          color: z.string().max(20).optional(),
          notes: z.string().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const result = await db.createScooter({
          userId: ctx.user.id,
          name: input.name,
          brand: input.brand,
          model: input.model,
          serialNumber: input.serialNumber,
          purchaseDate: input.purchaseDate ? new Date(input.purchaseDate) : undefined,
          initialOdometer: input.initialOdometer,
          color: input.color,
          notes: input.notes,
        });
        return { success: true, id: result };
      }),

    update: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          name: z.string().min(1).max(100).optional(),
          brand: z.string().max(100).optional(),
          model: z.string().max(100).optional(),
          serialNumber: z.string().max(100).optional(),
          purchaseDate: z.string().optional(),
          initialOdometer: z.number().min(0).optional(),
          color: z.string().max(20).optional(),
          notes: z.string().optional(),
          maintenanceInterval: z.number().min(0).optional(),
          lastMaintenanceDistance: z.number().min(0).optional(),
          lastMaintenanceDate: z.string().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const { id, ...data } = input;
        const updateData: Record<string, unknown> = {};
        
        if (data.name !== undefined) updateData.name = data.name;
        if (data.brand !== undefined) updateData.brand = data.brand;
        if (data.model !== undefined) updateData.model = data.model;
        if (data.serialNumber !== undefined) updateData.serialNumber = data.serialNumber;
        if (data.purchaseDate !== undefined) updateData.purchaseDate = new Date(data.purchaseDate);
        if (data.initialOdometer !== undefined) updateData.initialOdometer = data.initialOdometer;
        if (data.color !== undefined) updateData.color = data.color;
        if (data.notes !== undefined) updateData.notes = data.notes;
        if (data.maintenanceInterval !== undefined) updateData.maintenanceInterval = data.maintenanceInterval;
        if (data.lastMaintenanceDistance !== undefined) updateData.lastMaintenanceDistance = data.lastMaintenanceDistance;
        if (data.lastMaintenanceDate !== undefined) updateData.lastMaintenanceDate = new Date(data.lastMaintenanceDate);

        const success = await db.updateScooter(id, ctx.user.id, updateData);
        return { success };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const success = await db.deleteScooter(input.id, ctx.user.id);
        return { success };
      }),

    setDefault: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const success = await db.setDefaultScooter(input.id, ctx.user.id);
        return { success };
      }),

    updateStats: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          distanceToAdd: z.number().min(0),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const success = await db.updateScooterStats(input.id, ctx.user.id, input.distanceToAdd);
        return { success };
      }),
  }),

  // Community (posts and comments)
  community: router({
    // Get posts list
    getPosts: protectedProcedure
      .input(
        z.object({
          limit: z.number().min(1).max(50).default(20),
          offset: z.number().min(0).default(0),
        }).optional()
      )
      .query(async ({ ctx, input }) => {
        const limit = input?.limit ?? 20;
        const offset = input?.offset ?? 0;
        return db.getPosts(limit, offset, ctx.user.id);
      }),

    // Get single post
    getPost: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        return db.getPostById(input.id, ctx.user.id);
      }),

    // Create post
    createPost: protectedProcedure
      .input(
        z.object({
          title: z.string().min(1, "제목을 입력해주세요.").max(200),
          content: z.string().min(1, "내용을 입력해주세요."),
          postType: z.enum(["general", "ride_share", "question", "tip", "group_recruit"]).default("general"),
          ridingRecordId: z.string().optional(),
          imageUrls: z.array(z.string()).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const id = await db.createPost({
          userId: ctx.user.id,
          title: input.title,
          content: input.content,
          postType: input.postType,
          ridingRecordId: input.ridingRecordId,
          imageUrls: input.imageUrls ? JSON.stringify(input.imageUrls) : null,
        });
        return { success: true, id };
      }),

    // Update post
    updatePost: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          title: z.string().min(1).max(200).optional(),
          content: z.string().min(1).optional(),
          postType: z.enum(["general", "ride_share", "question", "tip", "group_recruit"]).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const { id, ...data } = input;
        const success = await db.updatePost(id, ctx.user.id, data);
        return { success };
      }),

    // Delete post
    deletePost: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const success = await db.deletePost(input.id, ctx.user.id);
        return { success };
      }),

    // Toggle like
    toggleLike: protectedProcedure
      .input(z.object({ postId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const isLiked = await db.togglePostLike(input.postId, ctx.user.id);
        return { success: true, isLiked };
      }),

    // Get comments
    getComments: protectedProcedure
      .input(z.object({ postId: z.number() }))
      .query(async ({ input }) => {
        return db.getCommentsByPostId(input.postId);
      }),

    // Create comment
    createComment: protectedProcedure
      .input(
        z.object({
          postId: z.number(),
          content: z.string().min(1, "댓글을 입력해주세요."),
          parentId: z.number().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const id = await db.createComment({
          postId: input.postId,
          userId: ctx.user.id,
          content: input.content,
          parentId: input.parentId,
        });
        return { success: true, id };
      }),

    // Delete comment
    deleteComment: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const success = await db.deleteComment(input.id, ctx.user.id);
        return { success };
      }),

    // Get user's posts
    getMyPosts: protectedProcedure.query(async ({ ctx }) => {
      return db.getUserPosts(ctx.user.id);
    }),
  }),

  // Friends
  friends: router({
    // Search users
    searchUsers: protectedProcedure
      .input(z.object({ query: z.string().min(1) }))
      .query(async ({ ctx, input }) => {
        return db.searchUsers(input.query, ctx.user.id);
      }),

    // Send friend request
    sendRequest: protectedProcedure
      .input(z.object({ receiverId: z.number(), message: z.string().optional() }))
      .mutation(async ({ ctx, input }) => {
        const id = await db.sendFriendRequest(ctx.user.id, input.receiverId, input.message);
        return { success: id !== null, id };
      }),

    // Get pending requests (received)
    getPendingRequests: protectedProcedure.query(async ({ ctx }) => {
      return db.getPendingFriendRequests(ctx.user.id);
    }),

    // Get sent requests
    getSentRequests: protectedProcedure.query(async ({ ctx }) => {
      return db.getSentFriendRequests(ctx.user.id);
    }),

    // Accept request
    acceptRequest: protectedProcedure
      .input(z.object({ requestId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const success = await db.acceptFriendRequest(input.requestId, ctx.user.id);
        return { success };
      }),

    // Reject request
    rejectRequest: protectedProcedure
      .input(z.object({ requestId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const success = await db.rejectFriendRequest(input.requestId, ctx.user.id);
        return { success };
      }),

    // Get friends list
    getFriends: protectedProcedure.query(async ({ ctx }) => {
      return db.getFriends(ctx.user.id);
    }),

    // Remove friend
    removeFriend: protectedProcedure
      .input(z.object({ friendId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const success = await db.removeFriend(ctx.user.id, input.friendId);
        return { success };
      }),

    // Get friend's stats for comparison
    getFriendStats: protectedProcedure
      .input(z.object({ friendId: z.number() }))
      .query(async ({ ctx, input }) => {
        return db.getFriendStats(ctx.user.id, input.friendId);
      }),

    // Get my stats for comparison
    getMyStats: protectedProcedure.query(async ({ ctx }) => {
      return db.getUserStats(ctx.user.id);
    }),
  }),

  // Follows
  follows: router({
    // Follow user
    follow: protectedProcedure
      .input(z.object({ userId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const success = await db.followUser(ctx.user.id, input.userId);
        return { success };
      }),

    // Unfollow user
    unfollow: protectedProcedure
      .input(z.object({ userId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const success = await db.unfollowUser(ctx.user.id, input.userId);
        return { success };
      }),

    // Get followers
    getFollowers: protectedProcedure.query(async ({ ctx }) => {
      return db.getFollowers(ctx.user.id);
    }),

    // Get following
    getFollowing: protectedProcedure.query(async ({ ctx }) => {
      return db.getFollowing(ctx.user.id);
    }),

    // Check if following
    isFollowing: protectedProcedure
      .input(z.object({ userId: z.number() }))
      .query(async ({ ctx, input }) => {
        return db.isFollowing(ctx.user.id, input.userId);
      }),

    // Get follow counts
    getCounts: protectedProcedure.query(async ({ ctx }) => {
      return db.getFollowCounts(ctx.user.id);
    }),
  }),

  // Images
  images: router({
    // Upload image (optimized with size limit)
    upload: protectedProcedure
      .input(
        z.object({
          base64: z.string(),
          filename: z.string(),
          contentType: z.string().default("image/jpeg"),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const { storagePut } = await import("./storage");
        const buffer = Buffer.from(input.base64, "base64");
        
        // Size limit: 10MB
        const MAX_SIZE = 10 * 1024 * 1024;
        if (buffer.length > MAX_SIZE) {
          throw new Error("이미지 크기가 10MB를 초과합니다.");
        }
        
        const sanitizedFilename = input.filename.replace(/[^a-zA-Z0-9._-]/g, '_');
        const key = `posts/${ctx.user.id}/${Date.now()}-${sanitizedFilename}`;
        const result = await storagePut(key, buffer, input.contentType);
        return { url: result.url, key: result.key };
      }),
  }),

  // User profile
  profile: router({
    // Update profile
    update: protectedProcedure
      .input(
        z.object({
          name: z.string().min(1).max(50).optional(),
          profileImageUrl: z.string().url().optional().nullable(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        try {
          console.log("[Profile Update] User:", ctx.user.id, "Input:", input);
          const success = await db.updateUserProfile(ctx.user.id, input);
          console.log("[Profile Update] Success:", success);
          return { success };
        } catch (error) {
          console.error("[Profile Update] Error:", error);
          throw new Error("프로필 업데이트에 실패했습니다.");
        }
      }),

    // Upload profile image (optimized with size limit)
    uploadImage: protectedProcedure
      .input(
        z.object({
          base64: z.string(),
          filename: z.string(),
          contentType: z.string().default("image/jpeg"),
        })
      )
      .mutation(async ({ ctx, input }) => {
        try {
          const { storagePut } = await import("./storage");
          const buffer = Buffer.from(input.base64, "base64");
          
          // Size limit: 5MB for profile images
          const MAX_SIZE = 5 * 1024 * 1024;
          if (buffer.length > MAX_SIZE) {
            throw new Error("프로필 이미지 크기가 5MB를 초과합니다.");
          }
          
          // Sanitize filename to prevent issues
          const sanitizedFilename = input.filename.replace(/[^a-zA-Z0-9._-]/g, '_');
          const key = `profiles/${ctx.user.id}/${Date.now()}-${sanitizedFilename}`;
          const result = await storagePut(key, buffer, input.contentType);
          
          // Update user profile with new image URL
          await db.updateUserProfile(ctx.user.id, { profileImageUrl: result.url });
          
          return { url: result.url, key: result.key };
        } catch (error) {
          console.error("Profile image upload error:", error);
          if (error instanceof Error && error.message.includes("초과")) {
            throw error;
          }
          throw new Error("이미지 업로드에 실패했습니다. 다시 시도해주세요.");
        }
      }),

    // Get user profile by ID
    getById: protectedProcedure
      .input(z.object({ userId: z.number() }))
      .query(async ({ input }) => {
        return db.getUserById(input.userId);
      }),
  }),

  // Ranking
  ranking: router({
    // Get weekly ranking
    getWeekly: protectedProcedure
      .input(z.object({ limit: z.number().min(1).max(100).default(50) }).optional())
      .query(async ({ input }) => {
        return db.getRanking("weekly", input?.limit ?? 50);
      }),

    // Get monthly ranking
    getMonthly: protectedProcedure
      .input(z.object({ limit: z.number().min(1).max(100).default(50) }).optional())
      .query(async ({ input }) => {
        return db.getRanking("monthly", input?.limit ?? 50);
      }),
  }),

  // Notifications
  notifications: router({
    // Get user notifications
    list: protectedProcedure
      .input(z.object({ limit: z.number().min(1).max(100).default(50) }).optional())
      .query(async ({ ctx, input }) => {
        return db.getUserNotifications(ctx.user.id, input?.limit ?? 50);
      }),

    // Mark notification as read
    markAsRead: protectedProcedure
      .input(z.object({ notificationId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const success = await db.markNotificationAsRead(input.notificationId, ctx.user.id);
        return { success };
      }),

    // Mark all as read
    markAllAsRead: protectedProcedure.mutation(async ({ ctx }) => {
      const success = await db.markAllNotificationsAsRead(ctx.user.id);
      return { success };
    }),

    // Get unread count
    unreadCount: protectedProcedure.query(async ({ ctx }) => {
      return db.getUnreadNotificationCount(ctx.user.id);
    }),
  }),

  // Challenges
  challenges: router({
    // Get public challenges
    list: protectedProcedure
      .input(z.object({ limit: z.number().min(1).max(100).default(20) }).optional())
      .query(async ({ ctx, input }) => {
        return db.getPublicChallenges(ctx.user.id, input?.limit ?? 20);
      }),

    // Get user's challenges
    mine: protectedProcedure.query(async ({ ctx }) => {
      return db.getUserChallenges(ctx.user.id);
    }),

    // Create challenge
    create: protectedProcedure
      .input(
        z.object({
          title: z.string().min(1).max(200),
          description: z.string().max(1000).optional(),
          type: z.enum(["distance", "rides", "duration"]),
          targetValue: z.number().positive(),
          startDate: z.string(),
          endDate: z.string(),
          isPublic: z.boolean().default(true),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const challengeId = await db.createChallenge({
          creatorId: ctx.user.id,
          title: input.title,
          description: input.description,
          type: input.type,
          targetValue: input.targetValue,
          startDate: new Date(input.startDate),
          endDate: new Date(input.endDate),
          isPublic: input.isPublic,
        });
        return { success: !!challengeId, challengeId };
      }),

    // Join challenge
    join: protectedProcedure
      .input(z.object({ challengeId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const success = await db.joinChallenge(input.challengeId, ctx.user.id);
        return { success };
      }),

    // Get leaderboard
    leaderboard: protectedProcedure
      .input(z.object({ challengeId: z.number() }))
      .query(async ({ input }) => {
        return db.getChallengeLeaderboard(input.challengeId);
      }),

    // Send invitation
    invite: protectedProcedure
      .input(z.object({ challengeId: z.number(), inviteeId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const invitation = await db.sendChallengeInvitation(input.challengeId, ctx.user.id, input.inviteeId);
        return { success: !!invitation, invitation };
      }),

    // Get pending invitations
    pendingInvitations: protectedProcedure.query(async ({ ctx }) => {
      return db.getPendingChallengeInvitations(ctx.user.id);
    }),

    // Respond to invitation
    respondToInvitation: protectedProcedure
      .input(z.object({ invitationId: z.number(), accept: z.boolean() }))
      .mutation(async ({ ctx, input }) => {
        const success = await db.respondToChallengeInvitation(input.invitationId, ctx.user.id, input.accept);
        return { success };
      }),
  }),

  // Live location router
  liveLocation: router({
    // Update current location
    update: protectedProcedure
      .input(z.object({
        latitude: z.number(),
        longitude: z.number(),
        heading: z.number().nullable(),
        speed: z.number().nullable(),
        isRiding: z.boolean(),
        isStarting: z.boolean().optional(), // True when ride just started
      }))
      .mutation(async ({ ctx, input }) => {
        await db.updateLiveLocation(
          ctx.user.id,
          input.latitude,
          input.longitude,
          input.heading,
          input.speed,
          input.isRiding
        );

        // Send notification to friends when ride starts
        if (input.isStarting && input.isRiding) {
          const friends = await db.getFriends(ctx.user.id);
          const userName = ctx.user.name || '친구';
          
          for (const friend of friends) {
            await db.createNotification({
              userId: friend.id,
              type: 'friend_riding',
              title: '친구가 주행 중입니다',
              body: `${userName}님이 주행을 시작했습니다. 실시간 위치를 확인해보세요!`,
              entityType: 'riding',
              entityId: ctx.user.id,
              actorId: ctx.user.id,
            });
          }
        }

        return { success: true };
      }),

    // Stop sharing location
    stop: protectedProcedure.mutation(async ({ ctx }) => {
      await db.stopLiveLocation(ctx.user.id);
      return { success: true };
    }),

    // Get friends' live locations
    friends: protectedProcedure.query(async ({ ctx }) => {
      return db.getFriendsLiveLocations(ctx.user.id);
    }),
  }),

  // App version router
  app: router({
    // Get latest app version
    version: publicProcedure.query(async () => {
      // Try to get from database first
      const latestVersion = await db.getLatestAppVersion("android");
      if (latestVersion) {
        return {
          version: latestVersion.version,
          versionCode: latestVersion.versionCode,
          downloadUrl: latestVersion.downloadUrl,
          releaseNotes: latestVersion.releaseNotes || "",
          forceUpdate: latestVersion.forceUpdate,
          publishedAt: latestVersion.publishedAt?.toISOString() || new Date().toISOString(),
        };
      }
      // Fallback to default version
      return {
        version: "1.0.0",
        versionCode: 1,
        downloadUrl: "https://expo.dev/artifacts/eas/xAcTXn7FmDZcz3RzCJrRqg.apk",
        releaseNotes: "SCOOP Riding 첫 번째 릴리스",
        forceUpdate: false,
        publishedAt: new Date().toISOString(),
      };
    }),

    // Create new app version (admin only)
    createVersion: protectedProcedure
      .input(z.object({
        version: z.string(),
        versionCode: z.number(),
        downloadUrl: z.string(),
        releaseNotes: z.string().optional(),
        forceUpdate: z.boolean().default(false),
      }))
      .mutation(async ({ input }) => {
        const id = await db.createAppVersion({
          version: input.version,
          versionCode: input.versionCode,
          downloadUrl: input.downloadUrl,
          releaseNotes: input.releaseNotes || null,
          forceUpdate: input.forceUpdate,
          platform: "android",
          isActive: true,
        });
        return { success: !!id, id };
      }),

    // Get all app versions
    allVersions: protectedProcedure.query(async () => {
      return db.getAllAppVersions("android");
    }),
  }),

  // Group riding router
  groups: router({
    // Create a new group
    create: protectedProcedure
      .input(z.object({ name: z.string().min(1).max(50) }))
      .mutation(async ({ ctx, input }) => {
        const result = await db.createGroupSession(ctx.user.id, input.name);
        if (!result) throw new Error("그룹 생성에 실패했습니다.");
        return result;
      }),

    // Join a group by code
    join: protectedProcedure
      .input(z.object({ code: z.string().length(6) }))
      .mutation(async ({ ctx, input }) => {
        const result = await db.joinGroupByCode(ctx.user.id, input.code);
        if (!result) throw new Error("그룹을 찾을 수 없거나 이미 참가한 그룹입니다.");
        return result;
      }),

    // Leave a group
    leave: protectedProcedure
      .input(z.object({ groupId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const success = await db.leaveGroup(ctx.user.id, input.groupId);
        return { success };
      }),

    // Get user's groups
    mine: protectedProcedure.query(async ({ ctx }) => {
      return db.getUserGroups(ctx.user.id);
    }),

    // Get group by ID
    getById: protectedProcedure
      .input(z.object({ groupId: z.number() }))
      .query(async ({ input }) => {
        return db.getGroupById(input.groupId);
      }),

    // Update member location
    updateLocation: protectedProcedure
      .input(z.object({
        groupId: z.number(),
        latitude: z.number(),
        longitude: z.number(),
        distance: z.number(),
        duration: z.number(),
        currentSpeed: z.number(),
        isRiding: z.boolean(),
      }))
      .mutation(async ({ ctx, input }) => {
        const success = await db.updateGroupMemberLocation(input.groupId, ctx.user.id, {
          latitude: input.latitude,
          longitude: input.longitude,
          distance: input.distance,
          duration: input.duration,
          currentSpeed: input.currentSpeed,
          isRiding: input.isRiding,
        });
        return { success };
      }),

    // Start group riding (host only)
    startRiding: protectedProcedure
      .input(z.object({ groupId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const success = await db.startGroupRiding(input.groupId, ctx.user.id);
        if (!success) throw new Error("그룹 라이딩을 시작할 수 없습니다. 호스트만 시작할 수 있습니다.");
        return { success };
      }),

    // Stop group riding (host only)
    stopRiding: protectedProcedure
      .input(z.object({ groupId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const success = await db.stopGroupRiding(input.groupId, ctx.user.id);
        return { success };
      }),

    // Get group members' locations
    getMembersLocations: protectedProcedure
      .input(z.object({ groupId: z.number() }))
      .query(async ({ input }) => {
        return db.getGroupMembersLocations(input.groupId);
      }),

    // Send a message to the group
    sendMessage: protectedProcedure
      .input(z.object({
        groupId: z.number(),
        message: z.string().min(1).max(500),
        messageType: z.enum(["text", "location", "alert"]).default("text"),
      }))
      .mutation(async ({ ctx, input }) => {
        const result = await db.sendGroupMessage(
          input.groupId,
          ctx.user.id,
          input.message,
          input.messageType
        );
        if (!result) throw new Error("메시지 전송에 실패했습니다.");
        return result;
      }),

    // Get messages for a group
    getMessages: protectedProcedure
      .input(z.object({
        groupId: z.number(),
        limit: z.number().min(1).max(100).default(50),
        afterId: z.number().optional(),
        beforeId: z.number().optional(),
      }))
      .query(async ({ input }) => {
        return db.getGroupMessages(input.groupId, {
          limit: input.limit,
          afterId: input.afterId,
          beforeId: input.beforeId,
        });
      }),

    // Get new messages since a specific ID (for polling)
    getNewMessages: protectedProcedure
      .input(z.object({
        groupId: z.number(),
        afterId: z.number(),
      }))
      .query(async ({ input }) => {
        return db.getNewGroupMessages(input.groupId, input.afterId);
      }),

    // Get pending members (host only)
    getPendingMembers: protectedProcedure
      .input(z.object({ groupId: z.number() }))
      .query(async ({ ctx, input }) => {
        // Verify user is host
        const group = await db.getGroupById(input.groupId);
        if (!group || group.hostId !== ctx.user.id) {
          throw new Error("호스트만 대기 멤버를 확인할 수 있습니다.");
        }
        return db.getPendingMembers(input.groupId);
      }),

    // Approve a pending member (host only)
    approveMember: protectedProcedure
      .input(z.object({
        groupId: z.number(),
        memberId: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        const success = await db.approveMember(input.groupId, ctx.user.id, input.memberId);
        if (!success) throw new Error("멤버 승인에 실패했습니다.");
        return { success };
      }),

    // Reject a pending member (host only)
    rejectMember: protectedProcedure
      .input(z.object({
        groupId: z.number(),
        memberId: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        const success = await db.rejectMember(input.groupId, ctx.user.id, input.memberId);
        if (!success) throw new Error("멤버 거절에 실패했습니다.");
        return { success };
      }),
  }),

  // App version management
  appVersion: router({
    // Check for updates
    checkUpdate: publicProcedure
      .input(z.object({ 
        currentVersion: z.string(),
        platform: z.string().default("android"),
      }))
      .query(async ({ input }) => {
        console.log("[AppVersion] checkUpdate called with:", input);
        const latestVersion = await db.getLatestAppVersion(input.platform);
        console.log("[AppVersion] Latest version from DB:", latestVersion);
        if (!latestVersion) {
          console.log("[AppVersion] No version found in DB");
          return { hasUpdate: false, latestVersion: null };
        }
        
        // Compare versions
        const currentParts = input.currentVersion.split('.').map(Number);
        const latestParts = latestVersion.version.split('.').map(Number);
        
        let hasUpdate = false;
        for (let i = 0; i < Math.max(currentParts.length, latestParts.length); i++) {
          const current = currentParts[i] || 0;
          const latest = latestParts[i] || 0;
          if (latest > current) {
            hasUpdate = true;
            break;
          } else if (current > latest) {
            break;
          }
        }
        
        return {
          hasUpdate,
          latestVersion: hasUpdate ? {
            version: latestVersion.version,
            versionCode: latestVersion.versionCode,
            downloadUrl: latestVersion.downloadUrl,
            releaseNotes: latestVersion.releaseNotes,
            forceUpdate: latestVersion.forceUpdate,
          } : null,
        };
      }),

    // Get latest version info
    getLatest: publicProcedure
      .input(z.object({ platform: z.string().default("android") }))
      .query(async ({ input }) => {
        return db.getLatestAppVersion(input.platform);
      }),
  }),

  // Announcements router
  announcements: router({
    // Get active announcements (for users)
    getActive: protectedProcedure.query(async ({ ctx }) => {
      const announcements = await db.getActiveAnnouncements();
      const dismissed = await db.getUserDismissedAnnouncements(ctx.user.id);
      
      // Filter out dismissed announcements for popup
      const popupAnnouncements = announcements.filter(
        a => a.showPopup && !dismissed.includes(a.id)
      );
      
      return {
        all: announcements,
        popup: popupAnnouncements,
      };
    }),

    // Get all announcements (for settings page)
    getAll: protectedProcedure.query(async () => {
      return db.getActiveAnnouncements();
    }),

    // Get single announcement by ID
    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return db.getAnnouncementById(input.id);
      }),

    // Dismiss announcement (don't show again)
    dismiss: protectedProcedure
      .input(z.object({ announcementId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const success = await db.dismissAnnouncement(ctx.user.id, input.announcementId);
        return { success };
      }),
  }),

  // Admin router
  admin: router({
    // Get all announcements (admin)
    getAnnouncements: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "admin") throw new Error("관리자 권한이 필요합니다.");
      return db.getAllAnnouncements();
    }),

    // Create announcement (admin)
    createAnnouncement: protectedProcedure
      .input(z.object({
        title: z.string().min(1).max(200),
        content: z.string().min(1),
        type: z.enum(["notice", "update", "event", "maintenance"]).default("notice"),
        showPopup: z.boolean().default(true),
        priority: z.number().default(0),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") throw new Error("관리자 권한이 필요합니다.");
        const id = await db.createAnnouncement({
          title: input.title,
          content: input.content,
          type: input.type,
          showPopup: input.showPopup,
          priority: input.priority,
          startDate: input.startDate ? new Date(input.startDate) : undefined,
          endDate: input.endDate ? new Date(input.endDate) : undefined,
          createdBy: ctx.user.id,
        });
        return { success: !!id, id };
      }),

    // Update announcement (admin)
    updateAnnouncement: protectedProcedure
      .input(z.object({
        id: z.number(),
        title: z.string().min(1).max(200).optional(),
        content: z.string().min(1).optional(),
        type: z.enum(["notice", "update", "event", "maintenance"]).optional(),
        showPopup: z.boolean().optional(),
        priority: z.number().optional(),
        isActive: z.boolean().optional(),
        startDate: z.string().nullable().optional(),
        endDate: z.string().nullable().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") throw new Error("관리자 권한이 필요합니다.");
        const { id, startDate, endDate, ...rest } = input;
        const success = await db.updateAnnouncement(id, {
          ...rest,
          startDate: startDate ? new Date(startDate) : startDate === null ? undefined : undefined,
          endDate: endDate ? new Date(endDate) : endDate === null ? undefined : undefined,
        });
        return { success };
      }),

    // Delete announcement (admin)
    deleteAnnouncement: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") throw new Error("관리자 권한이 필요합니다.");
        const success = await db.deleteAnnouncement(input.id);
        return { success };
      }),

    // Get all users (admin)
    getUsers: protectedProcedure
      .input(z.object({
        page: z.number().default(1),
        limit: z.number().default(50),
      }))
      .query(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") throw new Error("관리자 권한이 필요합니다.");
        return db.getAllUsersAdmin(input.page, input.limit);
      }),

    // Get user details (admin)
    getUserDetails: protectedProcedure
      .input(z.object({ userId: z.number() }))
      .query(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") throw new Error("관리자 권한이 필요합니다.");
        return db.getUserDetailsAdmin(input.userId);
      }),

    // Ban user (admin)
    banUser: protectedProcedure
      .input(z.object({
        userId: z.number(),
        reason: z.string().default("관리자에 의한 제재"),
        banType: z.enum(["temporary", "permanent"]).default("temporary"),
        expiresAt: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") throw new Error("관리자 권한이 필요합니다.");
        const success = await db.banUser({
          userId: input.userId,
          bannedBy: ctx.user.id,
          reason: input.reason,
          banType: input.banType,
          expiresAt: input.expiresAt ? new Date(input.expiresAt) : undefined,
        });
        return { success };
      }),

    // Unban user (admin)
    unbanUser: protectedProcedure
      .input(z.object({ userId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") throw new Error("관리자 권한이 필요합니다.");
        const success = await db.unbanUser(input.userId);
        return { success };
      }),

    // Get banned users (admin)
    getBannedUsers: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "admin") throw new Error("관리자 권한이 필요합니다.");
      return db.getBannedUsers();
    }),

    // Delete post (admin)
    deletePost: protectedProcedure
      .input(z.object({ postId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") throw new Error("관리자 권한이 필요합니다.");
        const success = await db.deletePostAdmin(input.postId);
        return { success };
      }),
  }),

  // Badges router
  badges: router({
    // Get all badges
    all: protectedProcedure.query(async () => {
      return db.getAllBadges();
    }),

    // Get user's earned badges
    mine: protectedProcedure.query(async ({ ctx }) => {
      return db.getUserBadges(ctx.user.id);
    }),

    // Check and award badges
    check: protectedProcedure
      .input(z.object({ totalDistance: z.number(), totalRides: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const newBadges = await db.checkAndAwardBadges(ctx.user.id, input.totalDistance, input.totalRides);
        return { newBadges };
      }),
  }),

  // Survey router
  survey: router({
    // Submit survey response
    submit: protectedProcedure
      .input(z.object({
        overallRating: z.number().min(1).max(5),
        usabilityRating: z.number().min(1).max(5),
        featureRating: z.number().min(1).max(5),
        mostUsedFeature: z.string(),
        improvementSuggestion: z.string().optional(),
        bugReport: z.string().optional(),
        wouldRecommend: z.boolean().nullable(),
        appVersion: z.string().optional(),
        deviceInfo: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const id = await db.submitSurveyResponse({
          userId: ctx.user.id,
          ...input,
        });

        // Award "Alpha Tester" badge for completing survey
        if (id) {
          const alphaTesterBadge = await db.getBadgeByName("알파 테스터");
          if (alphaTesterBadge) {
            await db.awardBadge(ctx.user.id, alphaTesterBadge.id);
          }
        }

        return { success: !!id, id };
      }),

    // Get all survey responses (admin)
    getAll: protectedProcedure
      .input(z.object({
        page: z.number().default(1),
        limit: z.number().default(50),
      }))
      .query(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") throw new Error("관리자 권한이 필요합니다.");
        return db.getAllSurveyResponses(input.page, input.limit);
      }),

    // Get survey statistics (admin)
    getStats: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "admin") throw new Error("관리자 권한이 필요합니다.");
      return db.getSurveyStatistics();
    }),
  }),

  // Bug reports router
  bugReports: router({
    // Submit bug report
    submit: protectedProcedure
      .input(z.object({
        title: z.string().min(1).max(200),
        description: z.string().min(1),
        stepsToReproduce: z.string().optional(),
        expectedBehavior: z.string().optional(),
        actualBehavior: z.string().optional(),
        screenshotUrls: z.string().optional(),
        severity: z.enum(["low", "medium", "high", "critical"]).default("medium"),
        appVersion: z.string().optional(),
        deviceInfo: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const id = await db.submitBugReport({
          userId: ctx.user.id,
          ...input,
        });

        // Notify admins about new bug report
        if (id) {
          const userName = ctx.user.name || "사용자";
          const severityLabels: Record<string, string> = {
            low: "낮음",
            medium: "보통",
            high: "높음",
            critical: "심각",
          };
          await db.notifyAdmins({
            type: "new_bug_report",
            title: "🐛 새 버그 리포트",
            body: `${userName}님이 버그를 신고했습니다: "${input.title}" (심각도: ${severityLabels[input.severity] || input.severity})`,
            entityType: "bug_report",
            entityId: id,
            actorId: ctx.user.id,
          });
        }

        return { success: !!id, id };
      }),

    // Get user's bug reports
    mine: protectedProcedure.query(async ({ ctx }) => {
      return db.getUserBugReports(ctx.user.id);
    }),

    // Get bug report by ID
    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return db.getBugReportById(input.id);
      }),

    // Get all bug reports (admin)
    getAll: protectedProcedure
      .input(z.object({
        page: z.number().default(1),
        limit: z.number().default(50),
        status: z.string().optional(),
      }))
      .query(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") throw new Error("관리자 권한이 필요합니다.");
        return db.getAllBugReports(input.page, input.limit, input.status);
      }),

    // Update bug report status (admin)
    updateStatus: protectedProcedure
      .input(z.object({
        id: z.number(),
        status: z.enum(["open", "in_progress", "resolved", "closed", "wont_fix"]),
        adminNotes: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") throw new Error("관리자 권한이 필요합니다.");
        const success = await db.updateBugReportStatus(input.id, input.status, ctx.user.id, input.adminNotes);
        return { success };
      }),
  }),

  // Storage router
  storage: router({
    // Upload image
    uploadImage: protectedProcedure
      .input(z.object({
        base64Data: z.string(),
        mimeType: z.string().default("image/jpeg"),
        folder: z.string().default("uploads"),
      }))
      .mutation(async ({ ctx, input }) => {
        const { storagePut } = await import("./storage");
        
        // Generate unique filename
        const timestamp = Date.now();
        const randomStr = Math.random().toString(36).substring(2, 8);
        const extension = input.mimeType === "image/png" ? "png" : "jpg";
        const fileName = `${input.folder}/${ctx.user.id}-${timestamp}-${randomStr}.${extension}`;
        
        // Convert base64 to buffer
        const buffer = Buffer.from(input.base64Data, "base64");
        
        // Upload to S3
        const result = await storagePut(fileName, buffer, input.mimeType);
        
        return { url: result.url, key: result.key };
      }),
  }),
});

export type AppRouter = typeof appRouter;
