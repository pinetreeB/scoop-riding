import { useEffect } from "react";
import { View, StyleSheet } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { useColors } from "@/hooks/use-colors";
import { cn } from "@/lib/utils";

interface SkeletonProps {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  className?: string;
  style?: any;
}

/**
 * Skeleton loading placeholder with shimmer animation.
 * Used to show loading state before data is available.
 */
export function Skeleton({
  width,
  height = 16,
  borderRadius = 8,
  className,
  style,
}: SkeletonProps) {
  const colors = useColors();
  const opacity = useSharedValue(0.3);

  useEffect(() => {
    opacity.value = withRepeat(
      withTiming(0.7, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      className={cn(className)}
      style={[
        {
          width: width ?? "100%",
          height,
          borderRadius,
          backgroundColor: colors.border,
        },
        animatedStyle,
        style,
      ]}
    />
  );
}

/**
 * Skeleton for a stat card (weekly/monthly stats widget)
 */
export function StatCardSkeleton() {
  return (
    <View className="flex-1 rounded-2xl p-4" style={{ minHeight: 100 }}>
      <Skeleton width={80} height={14} borderRadius={4} />
      <View style={{ marginTop: 12 }}>
        <Skeleton width={100} height={28} borderRadius={6} />
        <View style={{ marginTop: 8, flexDirection: "row", gap: 8 }}>
          <Skeleton width={50} height={12} borderRadius={4} />
          <Skeleton width={60} height={12} borderRadius={4} />
        </View>
      </View>
    </View>
  );
}

/**
 * Skeleton for a quick action card (challenges, goals, badges)
 */
export function QuickActionCardSkeleton() {
  return (
    <View
      className="bg-surface rounded-2xl p-4 border border-border"
      style={{ flex: 1, minHeight: 120, justifyContent: "space-between" }}
    >
      <Skeleton width={40} height={40} borderRadius={20} />
      <View style={{ marginTop: 8 }}>
        <Skeleton width="80%" height={14} borderRadius={4} />
        <Skeleton width="60%" height={10} borderRadius={4} style={{ marginTop: 6 }} />
      </View>
    </View>
  );
}

/**
 * Skeleton for the weather widget
 */
export function WeatherWidgetSkeleton() {
  return (
    <View className="mx-5 mb-3 bg-surface rounded-2xl p-4 border border-border">
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <Skeleton width={48} height={48} borderRadius={24} />
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Skeleton width={120} height={16} borderRadius={4} />
          <Skeleton width={180} height={12} borderRadius={4} style={{ marginTop: 6 }} />
        </View>
        <Skeleton width={50} height={28} borderRadius={6} />
      </View>
    </View>
  );
}

/**
 * Skeleton for a ranking list item
 */
export function RankingItemSkeleton() {
  return (
    <View className="flex-row items-center px-4 py-3 border-b border-border">
      <Skeleton width={24} height={24} borderRadius={12} />
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Skeleton width={100} height={14} borderRadius={4} />
        <Skeleton width={60} height={10} borderRadius={4} style={{ marginTop: 4 }} />
      </View>
      <View style={{ alignItems: "flex-end" }}>
        <Skeleton width={50} height={16} borderRadius={4} />
        <Skeleton width={20} height={10} borderRadius={4} style={{ marginTop: 4 }} />
      </View>
    </View>
  );
}

/**
 * Skeleton for the ranking section (3 items)
 */
export function RankingSectionSkeleton() {
  return (
    <View className="bg-surface rounded-2xl border border-border overflow-hidden">
      <RankingItemSkeleton />
      <RankingItemSkeleton />
      <RankingItemSkeleton />
    </View>
  );
}

/**
 * Skeleton for a recent ride item
 */
export function RideItemSkeleton() {
  return (
    <View className="bg-surface rounded-xl p-4 mb-2 flex-row items-center border border-border">
      <Skeleton width={40} height={40} borderRadius={20} />
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Skeleton width={100} height={14} borderRadius={4} />
        <Skeleton width={140} height={10} borderRadius={4} style={{ marginTop: 4 }} />
      </View>
      <Skeleton width={60} height={16} borderRadius={4} />
    </View>
  );
}

/**
 * Skeleton for the stats card (avg speed, time, distance)
 */
export function StatsCardSkeleton() {
  return (
    <View className="bg-surface rounded-2xl p-5 border border-border">
      <View style={{ alignItems: "center", marginBottom: 16 }}>
        <Skeleton width={80} height={40} borderRadius={8} />
        <Skeleton width={100} height={12} borderRadius={4} style={{ marginTop: 8 }} />
      </View>
      <View style={{ flexDirection: "row", borderTopWidth: 1, borderTopColor: "rgba(0,0,0,0.1)", paddingTop: 16 }}>
        <View style={{ flex: 1 }}>
          <Skeleton width={80} height={20} borderRadius={4} />
          <Skeleton width={40} height={12} borderRadius={4} style={{ marginTop: 4 }} />
        </View>
        <View style={{ flex: 1, paddingLeft: 16 }}>
          <Skeleton width={60} height={20} borderRadius={4} />
          <Skeleton width={40} height={12} borderRadius={4} style={{ marginTop: 4 }} />
        </View>
      </View>
    </View>
  );
}

/**
 * Skeleton for AI coaching card
 */
export function AiCoachingSkeleton() {
  return (
    <View className="bg-surface rounded-2xl p-5 border border-border">
      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12 }}>
        <Skeleton width={32} height={32} borderRadius={16} />
        <Skeleton width={120} height={16} borderRadius={4} style={{ marginLeft: 8 }} />
      </View>
      <Skeleton width="100%" height={14} borderRadius={4} />
      <Skeleton width="90%" height={14} borderRadius={4} style={{ marginTop: 6 }} />
      <Skeleton width="70%" height={14} borderRadius={4} style={{ marginTop: 6 }} />
      <View style={{ marginTop: 12, flexDirection: "row", gap: 8 }}>
        <Skeleton width={80} height={28} borderRadius={14} style={{ flex: 1 }} />
        <Skeleton width={80} height={28} borderRadius={14} style={{ flex: 1 }} />
      </View>
    </View>
  );
}

/**
 * Skeleton for AI Report page
 */
export function AiReportSkeleton() {
  return (
    <View>
      {/* Grade circle */}
      <View className="bg-surface rounded-2xl p-5 mb-4 border border-border items-center">
        <Skeleton width={60} height={14} borderRadius={4} />
        <Skeleton width={80} height={80} borderRadius={40} style={{ marginTop: 12 }} />
        <Skeleton width="80%" height={14} borderRadius={4} style={{ marginTop: 12 }} />
        <Skeleton width="60%" height={14} borderRadius={4} style={{ marginTop: 6 }} />
      </View>

      {/* Change cards */}
      <View style={{ flexDirection: "row", gap: 8, marginBottom: 16 }}>
        <View className="flex-1 bg-surface rounded-xl p-4 border border-border">
          <Skeleton width={80} height={12} borderRadius={4} />
          <Skeleton width={60} height={18} borderRadius={4} style={{ marginTop: 8 }} />
        </View>
        <View className="flex-1 bg-surface rounded-xl p-4 border border-border">
          <Skeleton width={80} height={12} borderRadius={4} />
          <Skeleton width={60} height={18} borderRadius={4} style={{ marginTop: 8 }} />
        </View>
      </View>

      {/* Analysis cards */}
      {[1, 2, 3].map((i) => (
        <View key={i} className="bg-surface rounded-2xl p-4 mb-3 border border-border">
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
            <Skeleton width={20} height={20} borderRadius={10} />
            <Skeleton width={100} height={14} borderRadius={4} style={{ marginLeft: 8 }} />
          </View>
          <Skeleton width="100%" height={14} borderRadius={4} />
          <Skeleton width="85%" height={14} borderRadius={4} style={{ marginTop: 6 }} />
        </View>
      ))}

      {/* Motivational */}
      <View className="rounded-2xl p-5 mb-4 items-center bg-surface border border-border">
        <Skeleton width={32} height={32} borderRadius={16} />
        <Skeleton width="80%" height={14} borderRadius={4} style={{ marginTop: 12 }} />
        <Skeleton width="60%" height={14} borderRadius={4} style={{ marginTop: 6 }} />
      </View>
    </View>
  );
}
