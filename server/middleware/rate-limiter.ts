/**
 * Rate Limiting Middleware
 * 
 * API 남용 방지를 위한 요청 빈도 제한 미들웨어
 * Leaky Bucket 알고리즘 기반으로 구현
 */

import { Request, Response, NextFunction } from "express";

interface RateLimitEntry {
  tokens: number;
  lastRefill: number;
}

interface RateLimiterConfig {
  maxTokens: number;       // 버킷 최대 토큰 수
  refillRate: number;      // 초당 토큰 리필 수
  windowMs: number;        // 시간 윈도우 (밀리초)
}

// 사용자별 요청 추적을 위한 메모리 저장소
const rateLimitStore = new Map<string, RateLimitEntry>();

// 기본 설정: 분당 100회 요청 허용
const defaultConfig: RateLimiterConfig = {
  maxTokens: 100,
  refillRate: 100 / 60,  // 초당 약 1.67개 토큰 리필
  windowMs: 60 * 1000,   // 1분
};

// AI API용 설정: 분당 20회 요청 허용 (비용 절감)
const aiApiConfig: RateLimiterConfig = {
  maxTokens: 20,
  refillRate: 20 / 60,   // 초당 약 0.33개 토큰 리필
  windowMs: 60 * 1000,
};

// 인증 API용 설정: 분당 10회 요청 허용 (브루트포스 방지)
const authApiConfig: RateLimiterConfig = {
  maxTokens: 10,
  refillRate: 10 / 60,
  windowMs: 60 * 1000,
};

/**
 * 클라이언트 식별자 추출
 * IP 주소 또는 사용자 ID 기반
 */
function getClientIdentifier(req: Request): string {
  // 인증된 사용자는 사용자 ID 사용
  const userId = (req as any).userId;
  if (userId) {
    return `user:${userId}`;
  }
  
  // 비인증 사용자는 IP 주소 사용
  const forwarded = req.headers["x-forwarded-for"];
  const ip = forwarded 
    ? (typeof forwarded === "string" ? forwarded.split(",")[0] : forwarded[0])
    : req.socket.remoteAddress || "unknown";
  
  return `ip:${ip}`;
}

/**
 * 토큰 버킷 리필
 */
function refillTokens(entry: RateLimitEntry, config: RateLimiterConfig): void {
  const now = Date.now();
  const timePassed = (now - entry.lastRefill) / 1000; // 초 단위
  const tokensToAdd = timePassed * config.refillRate;
  
  entry.tokens = Math.min(config.maxTokens, entry.tokens + tokensToAdd);
  entry.lastRefill = now;
}

/**
 * Rate Limiter 미들웨어 생성
 */
export function createRateLimiter(config: RateLimiterConfig = defaultConfig) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const clientId = getClientIdentifier(req);
    const now = Date.now();
    
    // 클라이언트 엔트리 가져오기 또는 생성
    let entry = rateLimitStore.get(clientId);
    if (!entry) {
      entry = {
        tokens: config.maxTokens,
        lastRefill: now,
      };
      rateLimitStore.set(clientId, entry);
    }
    
    // 토큰 리필
    refillTokens(entry, config);
    
    // 토큰 소비 시도
    if (entry.tokens >= 1) {
      entry.tokens -= 1;
      
      // Rate limit 헤더 추가
      res.setHeader("X-RateLimit-Limit", config.maxTokens.toString());
      res.setHeader("X-RateLimit-Remaining", Math.floor(entry.tokens).toString());
      res.setHeader("X-RateLimit-Reset", Math.ceil(now / 1000 + (config.maxTokens - entry.tokens) / config.refillRate).toString());
      
      next();
    } else {
      // 토큰 부족 - 요청 거부
      const retryAfter = Math.ceil((1 - entry.tokens) / config.refillRate);
      
      res.setHeader("Retry-After", retryAfter.toString());
      res.setHeader("X-RateLimit-Limit", config.maxTokens.toString());
      res.setHeader("X-RateLimit-Remaining", "0");
      res.setHeader("X-RateLimit-Reset", Math.ceil(now / 1000 + retryAfter).toString());
      
      res.status(429).json({
        error: "Too Many Requests",
        message: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요.",
        retryAfter,
      });
    }
  };
}

/**
 * 오래된 엔트리 정리 (메모리 관리)
 */
function cleanupOldEntries(): void {
  const now = Date.now();
  const maxAge = 10 * 60 * 1000; // 10분
  
  for (const [key, entry] of rateLimitStore.entries()) {
    if (now - entry.lastRefill > maxAge) {
      rateLimitStore.delete(key);
    }
  }
}

// 5분마다 정리 실행
setInterval(cleanupOldEntries, 5 * 60 * 1000);

// 사전 정의된 Rate Limiter 인스턴스
export const defaultRateLimiter = createRateLimiter(defaultConfig);
export const aiRateLimiter = createRateLimiter(aiApiConfig);
export const authRateLimiter = createRateLimiter(authApiConfig);

// 통계 조회 (관리자용)
export function getRateLimitStats(): { totalClients: number; entries: Array<{ clientId: string; tokens: number; lastRefill: Date }> } {
  const entries = Array.from(rateLimitStore.entries()).map(([clientId, entry]) => ({
    clientId,
    tokens: Math.floor(entry.tokens),
    lastRefill: new Date(entry.lastRefill),
  }));
  
  return {
    totalClients: rateLimitStore.size,
    entries,
  };
}
