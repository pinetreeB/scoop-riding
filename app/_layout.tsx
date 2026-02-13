import "@/global.css";
import { Platform } from "react-native";

// Define background location task at module level (required by expo-task-manager)
// Only on native platforms
if (Platform.OS !== "web") {
  const { defineBackgroundLocationTask } = require("@/lib/background-location");
  defineBackgroundLocationTask();
}

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import "react-native-reanimated";
import "@/lib/_core/nativewind-pressable";
import { ThemeProvider } from "@/lib/theme-provider";
import {
  SafeAreaFrameContext,
  SafeAreaInsetsContext,
  SafeAreaProvider,
  initialWindowMetrics,
} from "react-native-safe-area-context";
import type { EdgeInsets, Metrics, Rect } from "react-native-safe-area-context";

import { trpc, createTRPCClient } from "@/lib/trpc";
import { initManusRuntime, subscribeSafeAreaInsets } from "@/lib/_core/manus-runtime";
import { AuthProvider, useAuthContext } from "@/lib/auth-context";
import { NetworkSyncManager } from "@/components/network-sync-manager";
import { UpdateBanner } from "@/components/update-banner";
import { NotificationProvider } from "@/lib/notification-provider";
import { PermissionRequest } from "@/components/permission-request";
import { AlphaTestSurvey, incrementAppUsageCount } from "@/components/alpha-test-survey";
import { BadgeEarnedPopup } from "@/components/badge-earned-popup";
import { AppLoading } from "@/components/app-loading";
import { BatteryOptimizationGuide, useBatteryOptimizationGuide } from "@/components/battery-optimization-guide";
import { ErrorBoundary } from "@/components/error-boundary";
import { I18nProvider } from "@/lib/i18n-provider";

const DEFAULT_WEB_INSETS: EdgeInsets = { top: 0, right: 0, bottom: 0, left: 0 };
const DEFAULT_WEB_FRAME: Rect = { x: 0, y: 0, width: 0, height: 0 };

export const unstable_settings = {
  anchor: "(tabs)",
};

// Battery optimization guide wrapper for Android
function BatteryOptimizationGuideWrapper() {
  const { shouldShow, isVisible, showGuide, hideGuide, markAsShown } = useBatteryOptimizationGuide();
  const { isAuthenticated } = useAuthContext();

  useEffect(() => {
    // Show guide after user is authenticated
    if (isAuthenticated && shouldShow) {
      // Small delay to let the app load first
      const timer = setTimeout(() => {
        showGuide();
        markAsShown();
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [isAuthenticated, shouldShow]);

  return (
    <BatteryOptimizationGuide
      visible={isVisible}
      onClose={hideGuide}
    />
  );
}

// Auth guard component with loading splash
function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading } = useAuthContext();
  const segments = useSegments();
  const router = useRouter();
  const [showLoading, setShowLoading] = useState(true);
  const [loadingMessage, setLoadingMessage] = useState("로딩 중...");

  useEffect(() => {
    if (loading) {
      setLoadingMessage("계정 확인 중...");
      return;
    }

    const inAuthGroup = segments[0] === "login" || segments[0] === "register";

    if (!isAuthenticated && !inAuthGroup) {
      setLoadingMessage("로그인 페이지로 이동 중...");
      // Small delay for smooth transition
      setTimeout(() => {
        router.replace("/login");
        setShowLoading(false);
      }, 300);
    } else if (isAuthenticated && inAuthGroup) {
      setLoadingMessage("홈으로 이동 중...");
      setTimeout(() => {
        router.replace("/(tabs)");
        setShowLoading(false);
      }, 300);
    } else {
      // Already on correct page, hide loading
      setShowLoading(false);
    }
  }, [isAuthenticated, loading, segments, router]);

  return (
    <>
      <AppLoading isLoading={showLoading || loading} message={loadingMessage} />
      {children}
    </>
  );
}

function RootLayoutContent() {
  return (
    <>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="oauth/callback" />
        <Stack.Screen name="login" options={{ presentation: "fullScreenModal" }} />
        <Stack.Screen name="register" options={{ presentation: "card" }} />
        <Stack.Screen name="riding" options={{ presentation: "fullScreenModal" }} />
        <Stack.Screen name="ride-detail" options={{ presentation: "card" }} />
        <Stack.Screen name="goals" options={{ presentation: "card" }} />
        <Stack.Screen name="maintenance" options={{ presentation: "card" }} />
        <Stack.Screen name="create-post" options={{ presentation: "modal" }} />
        <Stack.Screen name="post-detail" options={{ presentation: "card" }} />
        <Stack.Screen name="friends" options={{ presentation: "card" }} />
        <Stack.Screen name="ranking" options={{ presentation: "card" }} />
        <Stack.Screen name="user-profile" options={{ presentation: "card" }} />
        <Stack.Screen name="edit-profile" options={{ presentation: "modal" }} />
        <Stack.Screen name="notifications-center" options={{ presentation: "card" }} />
        <Stack.Screen name="challenges" options={{ presentation: "card" }} />
        <Stack.Screen name="challenge-detail" options={{ presentation: "card" }} />
        <Stack.Screen name="create-challenge" options={{ presentation: "modal" }} />
        <Stack.Screen name="admin" options={{ presentation: "card" }} />
        <Stack.Screen name="admin-dashboard" options={{ presentation: "card" }} />
        <Stack.Screen name="bug-report" options={{ presentation: "modal" }} />
        <Stack.Screen name="eco-leaderboard" options={{ presentation: "card" }} />
      </Stack>
      <StatusBar style="auto" />
    </>
  );
}

export default function RootLayout() {
  const initialInsets = initialWindowMetrics?.insets ?? DEFAULT_WEB_INSETS;
  const initialFrame = initialWindowMetrics?.frame ?? DEFAULT_WEB_FRAME;

  const [insets, setInsets] = useState<EdgeInsets>(initialInsets);
  const [frame, setFrame] = useState<Rect>(initialFrame);

  // Initialize Manus runtime for cookie injection from parent container
  useEffect(() => {
    initManusRuntime();
    // 앱 사용 횟수 증가 (알파 테스트 설문 표시 조건)
    incrementAppUsageCount();
  }, []);

  const handleSafeAreaUpdate = useCallback((metrics: Metrics) => {
    setInsets(metrics.insets);
    setFrame(metrics.frame);
  }, []);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    const unsubscribe = subscribeSafeAreaInsets(handleSafeAreaUpdate);
    return () => unsubscribe();
  }, [handleSafeAreaUpdate]);

  // Create clients once and reuse them
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Disable automatic refetching on window focus for mobile
            refetchOnWindowFocus: false,
            // Retry failed requests once
            retry: 1,
          },
        },
      }),
  );
  const [trpcClient] = useState(() => createTRPCClient());

  // Ensure minimum 8px padding for top and bottom on mobile
  const providerInitialMetrics = useMemo(() => {
    const metrics = initialWindowMetrics ?? { insets: initialInsets, frame: initialFrame };
    return {
      ...metrics,
      insets: {
        ...metrics.insets,
        top: Math.max(metrics.insets.top, 16),
        bottom: Math.max(metrics.insets.bottom, 12),
      },
    };
  }, [initialInsets, initialFrame]);

  const content = (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <I18nProvider>
      <ErrorBoundary
        onError={(error, errorInfo) => {
          console.error("[RootLayout] Global error caught:", error.message);
          // TODO: Sentry 연동 시 여기에 보고 로직 추가
        }}
      >
        <trpc.Provider client={trpcClient} queryClient={queryClient}>
          <QueryClientProvider client={queryClient}>
            <AuthProvider>
              <NotificationProvider>
                <AuthGuard>
                  <PermissionRequest />
                  <BatteryOptimizationGuideWrapper />
                  <AlphaTestSurvey />
                  <BadgeEarnedPopup />
                  <NetworkSyncManager />
                  <UpdateBanner />
                  <RootLayoutContent />
                </AuthGuard>
              </NotificationProvider>
            </AuthProvider>
          </QueryClientProvider>
        </trpc.Provider>
      </ErrorBoundary>
      </I18nProvider>
    </GestureHandlerRootView>
  );

  const shouldOverrideSafeArea = Platform.OS === "web";

  if (shouldOverrideSafeArea) {
    return (
      <ThemeProvider>
        <SafeAreaProvider initialMetrics={providerInitialMetrics}>
          <SafeAreaFrameContext.Provider value={frame}>
            <SafeAreaInsetsContext.Provider value={insets}>
              {content}
            </SafeAreaInsetsContext.Provider>
          </SafeAreaFrameContext.Provider>
        </SafeAreaProvider>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
      <SafeAreaProvider initialMetrics={providerInitialMetrics}>{content}</SafeAreaProvider>
    </ThemeProvider>
  );
}
