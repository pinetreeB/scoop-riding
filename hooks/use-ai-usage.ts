import { trpc } from "@/lib/trpc";

/**
 * AI 사용량 관리 훅
 * 월간 30회 제한 정보를 조회하고 표시
 */
export function useAiUsage() {
  const usageQuery = trpc.aiUsage.getUsage.useQuery(undefined, {
    staleTime: 1000 * 60 * 5, // 5분 캐시
    refetchOnWindowFocus: false,
  });

  const canUseQuery = trpc.aiUsage.canUse.useQuery(undefined, {
    staleTime: 1000 * 60, // 1분 캐시
    refetchOnWindowFocus: true,
  });

  return {
    // 사용량 데이터
    totalCalls: usageQuery.data?.totalCalls ?? 0,
    monthlyLimit: usageQuery.data?.monthlyLimit ?? 30,
    remaining: usageQuery.data?.remaining ?? 30,
    chatbotCalls: usageQuery.data?.chatbotCalls ?? 0,
    ridingAnalysisCalls: usageQuery.data?.ridingAnalysisCalls ?? 0,
    
    // AI 사용 가능 여부
    canUse: canUseQuery.data?.allowed ?? true,
    limitMessage: canUseQuery.data?.message,
    
    // 로딩 상태
    isLoading: usageQuery.isLoading || canUseQuery.isLoading,
    
    // 리프레시
    refetch: () => {
      usageQuery.refetch();
      canUseQuery.refetch();
    },
  };
}

/**
 * AI 사용량 표시 텍스트 생성
 */
export function formatAiUsage(remaining: number, limit: number): string {
  if (remaining <= 0) {
    return `이번 달 AI 사용량을 모두 사용했습니다 (${limit}회)`;
  }
  if (remaining <= 5) {
    return `AI 사용량: ${remaining}/${limit}회 남음 (주의)`;
  }
  return `AI 사용량: ${remaining}/${limit}회 남음`;
}
