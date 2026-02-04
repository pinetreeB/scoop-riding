/**
 * 에러 리포팅 유틸리티
 * 
 * Sentry 연동을 위한 추상화 레이어
 * 현재는 콘솔 로깅으로 구현, Sentry SDK 설치 후 실제 연동 가능
 */

import { Platform } from "react-native";

// 에러 심각도 레벨
export type ErrorSeverity = 'fatal' | 'error' | 'warning' | 'info' | 'debug';

// 에러 컨텍스트
export interface ErrorContext {
  userId?: number;
  userEmail?: string;
  screen?: string;
  action?: string;
  extra?: Record<string, unknown>;
}

// 에러 리포트
export interface ErrorReport {
  error: Error;
  severity: ErrorSeverity;
  context?: ErrorContext;
  timestamp: number;
  platform: string;
  appVersion: string;
}

// 로컬 에러 저장소 (Sentry 연동 전 임시 저장)
const errorQueue: ErrorReport[] = [];
const MAX_QUEUE_SIZE = 100;

// 앱 버전 (app.config.ts에서 가져올 수 있음)
const APP_VERSION = "1.0.0";

// Sentry DSN (환경 변수로 설정)
const SENTRY_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN || "";

// Sentry 초기화 여부
let isInitialized = false;

/**
 * 에러 리포팅 초기화
 */
export function initErrorReporting(): void {
  if (isInitialized) return;
  
  // Sentry SDK가 설치되어 있으면 초기화
  if (SENTRY_DSN) {
    try {
      // TODO: Sentry SDK 설치 후 활성화
      // import * as Sentry from "@sentry/react-native";
      // Sentry.init({
      //   dsn: SENTRY_DSN,
      //   environment: __DEV__ ? "development" : "production",
      //   enableAutoSessionTracking: true,
      //   sessionTrackingIntervalMillis: 30000,
      // });
      console.log("[ErrorReporting] Sentry DSN configured, but SDK not installed yet");
    } catch (e) {
      console.error("[ErrorReporting] Failed to initialize Sentry:", e);
    }
  } else {
    console.log("[ErrorReporting] No Sentry DSN configured, using local logging");
  }
  
  isInitialized = true;
}

/**
 * 에러 캡처 및 리포팅
 */
export function captureError(
  error: Error,
  severity: ErrorSeverity = 'error',
  context?: ErrorContext
): void {
  const report: ErrorReport = {
    error,
    severity,
    context,
    timestamp: Date.now(),
    platform: Platform.OS,
    appVersion: APP_VERSION,
  };
  
  // 콘솔 로깅
  const logMethod = severity === 'fatal' || severity === 'error' 
    ? console.error 
    : severity === 'warning' 
      ? console.warn 
      : console.log;
  
  logMethod(`[${severity.toUpperCase()}] ${error.message}`, {
    stack: error.stack?.slice(0, 500),
    context,
  });
  
  // 로컬 큐에 저장
  errorQueue.push(report);
  if (errorQueue.length > MAX_QUEUE_SIZE) {
    errorQueue.shift();
  }
  
  // TODO: Sentry SDK 설치 후 활성화
  // if (SENTRY_DSN) {
  //   Sentry.captureException(error, {
  //     level: severity,
  //     extra: context,
  //   });
  // }
}

/**
 * 메시지 캡처 (에러가 아닌 이벤트)
 */
export function captureMessage(
  message: string,
  severity: ErrorSeverity = 'info',
  context?: ErrorContext
): void {
  const logMethod = severity === 'error' 
    ? console.error 
    : severity === 'warning' 
      ? console.warn 
      : console.log;
  
  logMethod(`[${severity.toUpperCase()}] ${message}`, context);
  
  // TODO: Sentry SDK 설치 후 활성화
  // if (SENTRY_DSN) {
  //   Sentry.captureMessage(message, {
  //     level: severity,
  //     extra: context,
  //   });
  // }
}

/**
 * 사용자 컨텍스트 설정
 */
export function setUserContext(user: { id: number; email?: string; name?: string }): void {
  console.log("[ErrorReporting] User context set:", user.id);
  
  // TODO: Sentry SDK 설치 후 활성화
  // if (SENTRY_DSN) {
  //   Sentry.setUser({
  //     id: String(user.id),
  //     email: user.email,
  //     username: user.name,
  //   });
  // }
}

/**
 * 사용자 컨텍스트 초기화
 */
export function clearUserContext(): void {
  console.log("[ErrorReporting] User context cleared");
  
  // TODO: Sentry SDK 설치 후 활성화
  // if (SENTRY_DSN) {
  //   Sentry.setUser(null);
  // }
}

/**
 * 브레드크럼 추가 (사용자 행동 추적)
 */
export function addBreadcrumb(
  category: string,
  message: string,
  data?: Record<string, unknown>
): void {
  console.log(`[Breadcrumb] ${category}: ${message}`, data);
  
  // TODO: Sentry SDK 설치 후 활성화
  // if (SENTRY_DSN) {
  //   Sentry.addBreadcrumb({
  //     category,
  //     message,
  //     data,
  //     level: "info",
  //   });
  // }
}

/**
 * 성능 트랜잭션 시작
 */
export function startTransaction(name: string, operation: string): { finish: () => void } {
  const startTime = Date.now();
  console.log(`[Transaction] Started: ${name} (${operation})`);
  
  return {
    finish: () => {
      const duration = Date.now() - startTime;
      console.log(`[Transaction] Finished: ${name} (${duration}ms)`);
      
      // TODO: Sentry SDK 설치 후 활성화
      // if (SENTRY_DSN) {
      //   const transaction = Sentry.startTransaction({ name, op: operation });
      //   transaction.finish();
      // }
    },
  };
}

/**
 * 저장된 에러 리포트 조회 (디버깅용)
 */
export function getErrorQueue(): ErrorReport[] {
  return [...errorQueue];
}

/**
 * 에러 큐 초기화
 */
export function clearErrorQueue(): void {
  errorQueue.length = 0;
}

/**
 * 에러 통계 조회
 */
export function getErrorStats(): {
  total: number;
  byLevel: Record<ErrorSeverity, number>;
  recent: ErrorReport[];
} {
  const byLevel: Record<ErrorSeverity, number> = {
    fatal: 0,
    error: 0,
    warning: 0,
    info: 0,
    debug: 0,
  };
  
  for (const report of errorQueue) {
    byLevel[report.severity]++;
  }
  
  return {
    total: errorQueue.length,
    byLevel,
    recent: errorQueue.slice(-10),
  };
}

// React Error Boundary용 에러 핸들러
export function handleReactError(error: Error, errorInfo: React.ErrorInfo): void {
  captureError(error, 'error', {
    action: 'react_error_boundary',
    extra: {
      componentStack: errorInfo.componentStack?.slice(0, 1000),
    },
  });
}

// 네트워크 에러 핸들러
export function handleNetworkError(error: Error, endpoint: string): void {
  captureError(error, 'warning', {
    action: 'network_request',
    extra: {
      endpoint,
      errorType: 'network',
    },
  });
}

// API 에러 핸들러
export function handleApiError(error: Error, endpoint: string, statusCode?: number): void {
  const severity: ErrorSeverity = statusCode && statusCode >= 500 ? 'error' : 'warning';
  
  captureError(error, severity, {
    action: 'api_request',
    extra: {
      endpoint,
      statusCode,
    },
  });
}
