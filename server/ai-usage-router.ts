import { z } from "zod";
import { router, protectedProcedure, adminProcedure } from "./_core/trpc";
import { getAiUsage, canUseAi, incrementAiUsage, updateMonthlyLimit, type AiFeatureType } from "./ai-usage";

/**
 * AI 사용량 관리 라우터
 * 모든 AI 기능에서 사용량을 체크하고 카운트를 증가시킴
 */
export const aiUsageRouter = router({
  // 현재 사용량 조회
  getUsage: protectedProcedure.query(async ({ ctx }) => {
    return await getAiUsage(ctx.user.id);
  }),

  // AI 사용 가능 여부 확인
  canUse: protectedProcedure.query(async ({ ctx }) => {
    return await canUseAi(ctx.user.id);
  }),

  // AI 사용량 증가 (내부용 - 각 AI 기능에서 호출)
  increment: protectedProcedure
    .input(z.object({
      featureType: z.enum(["chatbot", "ridingAnalysis", "other"]),
    }))
    .mutation(async ({ ctx, input }) => {
      return await incrementAiUsage(ctx.user.id, input.featureType as AiFeatureType);
    }),

  // 관리자용: 사용자 월간 제한 변경
  updateLimit: adminProcedure
    .input(z.object({
      userId: z.number(),
      newLimit: z.number().min(0).max(1000),
    }))
    .mutation(async ({ input }) => {
      const success = await updateMonthlyLimit(input.userId, input.newLimit);
      return { success };
    }),
});
