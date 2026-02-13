import { getDb } from "./db";
import { aiUsage } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";

// AI 기능 타입 정의
export type AiFeatureType = "chatbot" | "ridingAnalysis" | "aiReport" | "other";

// 기본 월간 제한
const DEFAULT_MONTHLY_LIMIT = 30;

/**
 * 현재 년월 문자열 반환 (e.g., "2026-02")
 */
function getCurrentYearMonth(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

/**
 * 사용자의 현재 월 AI 사용량 조회
 */
export async function getAiUsage(userId: number): Promise<{
  totalCalls: number;
  monthlyLimit: number;
  remaining: number;
  chatbotCalls: number;
  ridingAnalysisCalls: number;
  otherCalls: number;
}> {
  const yearMonth = getCurrentYearMonth();
  const db = await getDb();

  if (!db) {
    return {
      totalCalls: 0,
      monthlyLimit: DEFAULT_MONTHLY_LIMIT,
      remaining: DEFAULT_MONTHLY_LIMIT,
      chatbotCalls: 0,
      ridingAnalysisCalls: 0,
      otherCalls: 0,
    };
  }

  try {
    const [usage] = await db
      .select()
      .from(aiUsage)
      .where(and(eq(aiUsage.userId, userId), eq(aiUsage.yearMonth, yearMonth)))
      .limit(1);

    if (!usage) {
      return {
        totalCalls: 0,
        monthlyLimit: DEFAULT_MONTHLY_LIMIT,
        remaining: DEFAULT_MONTHLY_LIMIT,
        chatbotCalls: 0,
        ridingAnalysisCalls: 0,
        otherCalls: 0,
      };
    }

    return {
      totalCalls: usage.totalCalls,
      monthlyLimit: usage.monthlyLimit,
      remaining: Math.max(0, usage.monthlyLimit - usage.totalCalls),
      chatbotCalls: usage.chatbotCalls,
      ridingAnalysisCalls: usage.ridingAnalysisCalls,
      otherCalls: usage.otherCalls,
    };
  } catch (error) {
    console.error("[AI Usage] Failed to get usage:", error);
    return {
      totalCalls: 0,
      monthlyLimit: DEFAULT_MONTHLY_LIMIT,
      remaining: DEFAULT_MONTHLY_LIMIT,
      chatbotCalls: 0,
      ridingAnalysisCalls: 0,
      otherCalls: 0,
    };
  }
}

/**
 * AI 사용 가능 여부 확인
 */
export async function canUseAi(userId: number): Promise<{
  allowed: boolean;
  remaining: number;
  monthlyLimit: number;
  message?: string;
}> {
  const usage = await getAiUsage(userId);

  if (usage.remaining <= 0) {
    return {
      allowed: false,
      remaining: 0,
      monthlyLimit: usage.monthlyLimit,
      message: `이번 달 AI 사용 횟수(${usage.monthlyLimit}회)를 모두 사용했습니다. 다음 달에 초기화됩니다.`,
    };
  }

  return {
    allowed: true,
    remaining: usage.remaining,
    monthlyLimit: usage.monthlyLimit,
  };
}

/**
 * AI 사용량 증가
 */
export async function incrementAiUsage(
  userId: number,
  featureType: AiFeatureType
): Promise<{
  success: boolean;
  remaining: number;
  error?: string;
}> {
  const yearMonth = getCurrentYearMonth();
  const db = await getDb();

  if (!db) {
    return { success: false, remaining: 0, error: "Database not available" };
  }

  try {
    // 먼저 기존 레코드 확인
    const [existing] = await db
      .select()
      .from(aiUsage)
      .where(and(eq(aiUsage.userId, userId), eq(aiUsage.yearMonth, yearMonth)))
      .limit(1);

    if (existing) {
      // 제한 확인
      if (existing.totalCalls >= existing.monthlyLimit) {
        return {
          success: false,
          remaining: 0,
          error: `이번 달 AI 사용 횟수(${existing.monthlyLimit}회)를 모두 사용했습니다.`,
        };
      }

      // 기존 레코드 업데이트
      const updateData: Record<string, any> = {
        totalCalls: existing.totalCalls + 1,
      };

      if (featureType === "chatbot") {
        updateData.chatbotCalls = existing.chatbotCalls + 1;
      } else if (featureType === "ridingAnalysis") {
        updateData.ridingAnalysisCalls = existing.ridingAnalysisCalls + 1;
      } else {
        updateData.otherCalls = existing.otherCalls + 1;
      }

      await db
        .update(aiUsage)
        .set(updateData)
        .where(eq(aiUsage.id, existing.id));

      return {
        success: true,
        remaining: existing.monthlyLimit - existing.totalCalls - 1,
      };
    } else {
      // 새 레코드 생성
      await db.insert(aiUsage).values({
        userId,
        yearMonth,
        totalCalls: 1,
        chatbotCalls: featureType === "chatbot" ? 1 : 0,
        ridingAnalysisCalls: featureType === "ridingAnalysis" ? 1 : 0,
        otherCalls: featureType === "other" ? 1 : 0,
        monthlyLimit: DEFAULT_MONTHLY_LIMIT,
      });

      return {
        success: true,
        remaining: DEFAULT_MONTHLY_LIMIT - 1,
      };
    }
  } catch (error) {
    console.error("[AI Usage] Failed to increment usage:", error);
    return { success: false, remaining: 0, error: "Failed to update usage" };
  }
}

/**
 * 관리자용: 사용자의 월간 제한 변경
 */
export async function updateMonthlyLimit(
  userId: number,
  newLimit: number
): Promise<boolean> {
  const yearMonth = getCurrentYearMonth();
  const db = await getDb();

  if (!db) return false;

  try {
    const [existing] = await db
      .select()
      .from(aiUsage)
      .where(and(eq(aiUsage.userId, userId), eq(aiUsage.yearMonth, yearMonth)))
      .limit(1);

    if (existing) {
      await db
        .update(aiUsage)
        .set({ monthlyLimit: newLimit })
        .where(eq(aiUsage.id, existing.id));
    } else {
      await db.insert(aiUsage).values({
        userId,
        yearMonth,
        totalCalls: 0,
        chatbotCalls: 0,
        ridingAnalysisCalls: 0,
        otherCalls: 0,
        monthlyLimit: newLimit,
      });
    }

    return true;
  } catch (error) {
    console.error("[AI Usage] Failed to update limit:", error);
    return false;
  }
}


/**
 * 관리자용: AI 사용량 통계 조회
 */
export async function getAiUsageStats(period: 'daily' | 'weekly' | 'monthly'): Promise<{
  totalCalls: number;
  totalTokens: number;
  uniqueUsers: number;
  byFeature: { feature: string; calls: number; tokens: number }[];
  limitReachedUsers: number;
  avgUsagePerUser: number;
}> {
  const db = await getDb();
  
  if (!db) {
    return {
      totalCalls: 0,
      totalTokens: 0,
      uniqueUsers: 0,
      byFeature: [],
      limitReachedUsers: 0,
      avgUsagePerUser: 0,
    };
  }

  try {
    const yearMonth = getCurrentYearMonth();
    
    // 현재 월의 모든 사용량 조회
    const allUsage = await db
      .select()
      .from(aiUsage)
      .where(eq(aiUsage.yearMonth, yearMonth));

    if (allUsage.length === 0) {
      return {
        totalCalls: 0,
        totalTokens: 0,
        uniqueUsers: 0,
        byFeature: [],
        limitReachedUsers: 0,
        avgUsagePerUser: 0,
      };
    }

    // 통계 계산
    let totalCalls = 0;
    let chatbotCalls = 0;
    let ridingAnalysisCalls = 0;
    let otherCalls = 0;
    let limitReachedUsers = 0;

    for (const usage of allUsage) {
      totalCalls += usage.totalCalls;
      chatbotCalls += usage.chatbotCalls;
      ridingAnalysisCalls += usage.ridingAnalysisCalls;
      otherCalls += usage.otherCalls;
      
      if (usage.totalCalls >= usage.monthlyLimit) {
        limitReachedUsers++;
      }
    }

    const uniqueUsers = allUsage.length;
    const avgUsagePerUser = uniqueUsers > 0 ? totalCalls / uniqueUsers : 0;

    // 토큰 추정 (호출당 평균 175 토큰 가정)
    const estimatedTokensPerCall = 175;
    const totalTokens = totalCalls * estimatedTokensPerCall;

    return {
      totalCalls,
      totalTokens,
      uniqueUsers,
      byFeature: [
        { feature: 'chatbot', calls: chatbotCalls, tokens: chatbotCalls * estimatedTokensPerCall },
        { feature: 'ridingAnalysis', calls: ridingAnalysisCalls, tokens: ridingAnalysisCalls * estimatedTokensPerCall },
        { feature: 'other', calls: otherCalls, tokens: otherCalls * estimatedTokensPerCall },
      ].filter(f => f.calls > 0),
      limitReachedUsers,
      avgUsagePerUser,
    };
  } catch (error) {
    console.error("[AI Usage] Failed to get stats:", error);
    return {
      totalCalls: 0,
      totalTokens: 0,
      uniqueUsers: 0,
      byFeature: [],
      limitReachedUsers: 0,
      avgUsagePerUser: 0,
    };
  }
}
