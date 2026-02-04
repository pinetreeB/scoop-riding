/**
 * Error Boundary Component
 * 
 * React 컴포넌트 트리에서 발생하는 JavaScript 오류를 캐치하고
 * 사용자에게 친화적인 오류 화면을 표시합니다.
 */

import React, { Component, ReactNode } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from "react-native";
import { useColors } from "@/hooks/use-colors";
import { handleReactError } from "@/lib/error-reporting";

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

// 오류 정보를 에러 리포팅 시스템에 보고
function reportError(error: Error, errorInfo: React.ErrorInfo): void {
  handleReactError(error, errorInfo);
}

class ErrorBoundaryClass extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    this.setState({ errorInfo });
    
    // 오류 보고
    reportError(error, errorInfo);
    
    // 커스텀 오류 핸들러 호출
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  handleRetry = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      // 커스텀 fallback이 있으면 사용
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // 기본 오류 화면
      return (
        <ErrorFallback
          error={this.state.error}
          onRetry={this.handleRetry}
        />
      );
    }

    return this.props.children;
  }
}

// 기본 오류 화면 컴포넌트
interface ErrorFallbackProps {
  error: Error | null;
  onRetry: () => void;
}

function ErrorFallback({ error, onRetry }: ErrorFallbackProps): React.ReactElement {
  const colors = useColors();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.content}>
        <Text style={[styles.icon]}>⚠️</Text>
        <Text style={[styles.title, { color: colors.foreground }]}>
          문제가 발생했습니다
        </Text>
        <Text style={[styles.message, { color: colors.muted }]}>
          앱에서 예상치 못한 오류가 발생했습니다.{"\n"}
          다시 시도해 주세요.
        </Text>
        
        {error && __DEV__ && (
          <ScrollView style={styles.errorContainer} contentContainerStyle={styles.errorContent}>
            <Text style={[styles.errorTitle, { color: colors.error }]}>
              오류 상세 (개발 모드):
            </Text>
            <Text style={[styles.errorText, { color: colors.muted }]}>
              {error.name}: {error.message}
            </Text>
            {error.stack && (
              <Text style={[styles.stackTrace, { color: colors.muted }]}>
                {error.stack.slice(0, 500)}...
              </Text>
            )}
          </ScrollView>
        )}

        <TouchableOpacity
          style={[styles.retryButton, { backgroundColor: colors.primary }]}
          onPress={onRetry}
          activeOpacity={0.8}
        >
          <Text style={styles.retryButtonText}>다시 시도</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.homeButton, { borderColor: colors.border }]}
          onPress={() => {
            // 홈으로 이동 시도
            try {
              const { router } = require("expo-router");
              router.replace("/(tabs)");
            } catch {
              onRetry();
            }
          }}
          activeOpacity={0.8}
        >
          <Text style={[styles.homeButtonText, { color: colors.foreground }]}>
            홈으로 이동
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  content: {
    alignItems: "center",
    maxWidth: 400,
    width: "100%",
  },
  icon: {
    fontSize: 64,
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 12,
    textAlign: "center",
  },
  message: {
    fontSize: 16,
    textAlign: "center",
    lineHeight: 24,
    marginBottom: 24,
  },
  errorContainer: {
    maxHeight: 150,
    width: "100%",
    marginBottom: 24,
  },
  errorContent: {
    padding: 12,
    borderRadius: 8,
    backgroundColor: "rgba(239, 68, 68, 0.1)",
  },
  errorTitle: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 8,
  },
  errorText: {
    fontSize: 12,
    marginBottom: 8,
  },
  stackTrace: {
    fontSize: 10,
    fontFamily: "monospace",
  },
  retryButton: {
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 12,
    marginBottom: 12,
    width: "100%",
    alignItems: "center",
  },
  retryButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  homeButton: {
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    width: "100%",
    alignItems: "center",
  },
  homeButtonText: {
    fontSize: 16,
    fontWeight: "500",
  },
});

// 함수형 래퍼 컴포넌트
export function ErrorBoundary(props: ErrorBoundaryProps): React.ReactElement {
  return <ErrorBoundaryClass {...props} />;
}

// 화면 단위 Error Boundary
export function ScreenErrorBoundary({ children }: { children: ReactNode }): React.ReactElement {
  return (
    <ErrorBoundary
      onError={(error, errorInfo) => {
        console.error("[ScreenErrorBoundary] Screen error:", error.message);
      }}
    >
      {children}
    </ErrorBoundary>
  );
}

export default ErrorBoundary;
