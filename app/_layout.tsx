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

const DEFAULT_WEB_INSETS: EdgeInsets = { top: 0, right: 0, bottom: 0, left: 0 };
const DEFAULT_WEB_FRAME: Rect = { x: 0, y: 0, width: 0, height: 0 };

export const unstable_settings = {
  anchor: "(tabs)",
};

// Auth guard component
function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading } = useAuthContext();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    const inAuthGroup = segments[0] === "login" || segments[0] === "register";

    if (!isAuthenticated && !inAuthGroup) {
      // Redirect to login if not authenticated and not already on auth pages
      router.replace("/login");
    } else if (isAuthenticated && inAuthGroup) {
      // Redirect to home if authenticated and on auth pages
      router.replace("/(tabs)");
    }
  }, [isAuthenticated, loading, segments, router]);

  return <>{children}</>;
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
      <trpc.Provider client={trpcClient} queryClient={queryClient}>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <AuthGuard>
              <NetworkSyncManager />
              <UpdateBanner />
              <RootLayoutContent />
            </AuthGuard>
          </AuthProvider>
        </QueryClientProvider>
      </trpc.Provider>
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
