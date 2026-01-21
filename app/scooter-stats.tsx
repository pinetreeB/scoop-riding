import { useCallback, useState, useMemo } from "react";
import {
  Text,
  View,
  ScrollView,
  Pressable,
  Platform,
  ActivityIndicator,
  Dimensions,
} from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Haptics from "expo-haptics";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useAuth } from "@/hooks/use-auth";
import { trpc } from "@/lib/trpc";
import { getRidingRecords, formatDuration, type RidingRecord } from "@/lib/riding-store";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

export default function ScooterStatsScreen() {
  const colors = useColors();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [localRides, setLocalRides] = useState<RidingRecord[]>([]);

  const scootersQuery = trpc.scooters.list.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const scooter = useMemo(() => {
    if (!id || !scootersQuery.data) return null;
    return scootersQuery.data.find((s: any) => s.id === parseInt(id));
  }, [id, scootersQuery.data]);

  // Load local rides for this scooter
  useFocusEffect(
    useCallback(() => {
      if (id) {
        getRidingRecords().then((records) => {
          const scooterRides = records.filter(
            (r) => r.scooterId === parseInt(id)
          );
          setLocalRides(scooterRides);
        });
      }
    }, [id])
  );

  if (authLoading || scootersQuery.isLoading) {
    return (
      <ScreenContainer>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </ScreenContainer>
    );
  }

  if (!scooter) {
    return (
      <ScreenContainer>
        <View className="flex-1 items-center justify-center p-6">
          <MaterialIcons name="error-outline" size={64} color={colors.muted} />
          <Text className="text-xl font-bold text-foreground mt-4">기체를 찾을 수 없습니다</Text>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [
              { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 },
            ]}
            className="mt-6 px-8 py-3 rounded-xl"
          >
            <Text className="text-white font-bold">돌아가기</Text>
          </Pressable>
        </View>
      </ScreenContainer>
    );
  }

  // Calculate statistics
  const totalDistance = (scooter.initialOdometer || 0) + (scooter.totalDistance || 0);
  const totalRides = scooter.totalRides || 0;
  const avgDistancePerRide = totalRides > 0 ? (scooter.totalDistance || 0) / totalRides : 0;
  
  // Calculate from local rides
  const localStats = useMemo(() => {
    if (localRides.length === 0) {
      return {
        avgSpeed: 0,
        maxSpeed: 0,
        totalDuration: 0,
        avgDuration: 0,
      };
    }

    const totalDuration = localRides.reduce((sum, r) => sum + r.duration, 0);
    const avgSpeed = localRides.reduce((sum, r) => sum + r.avgSpeed, 0) / localRides.length;
    const maxSpeed = Math.max(...localRides.map((r) => r.maxSpeed));
    const avgDuration = totalDuration / localRides.length;

    return {
      avgSpeed,
      maxSpeed,
      totalDuration,
      avgDuration,
    };
  }, [localRides]);

  // Get recent rides
  const recentRides = localRides.slice(0, 5);

  return (
    <ScreenContainer>
      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 100 }}
      >
        {/* Header */}
        <View className="flex-row items-center px-5 pt-4 pb-4">
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
            className="mr-3 p-1"
          >
            <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
          </Pressable>
          <Text className="text-2xl font-bold text-foreground flex-1" numberOfLines={1}>
            {scooter.name}
          </Text>
        </View>

        {/* Scooter Info Card */}
        <View className="mx-5 mb-4 p-4 rounded-2xl" style={{ backgroundColor: scooter.color || colors.primary }}>
          <View className="flex-row items-center">
            <View className="w-16 h-16 rounded-2xl bg-white/20 items-center justify-center mr-4">
              <MaterialIcons name="electric-scooter" size={36} color="#FFFFFF" />
            </View>
            <View className="flex-1">
              <Text className="text-white text-xl font-bold">{scooter.name}</Text>
              {(scooter.brand || scooter.model) && (
                <Text className="text-white/80 text-sm">
                  {[scooter.brand, scooter.model].filter(Boolean).join(" ")}
                </Text>
              )}
              {scooter.serialNumber && (
                <Text className="text-white/60 text-xs mt-1">S/N: {scooter.serialNumber}</Text>
              )}
            </View>
          </View>
        </View>

        {/* Main Stats */}
        <View className="mx-5 mb-4 bg-surface rounded-2xl p-5 border border-border">
          <Text className="text-lg font-bold text-foreground mb-4">주행 통계</Text>
          
          {/* Total Distance */}
          <View className="items-center mb-4 pb-4 border-b border-border">
            <Text className="text-4xl font-bold text-primary">
              {(totalDistance / 1000).toFixed(1)}
            </Text>
            <Text className="text-muted text-sm">총 주행거리 (km)</Text>
          </View>

          {/* Stats Grid */}
          <View className="flex-row flex-wrap">
            <View className="w-1/2 mb-4 pr-2">
              <Text className="text-2xl font-bold text-foreground">{totalRides}</Text>
              <Text className="text-muted text-xs">총 주행 횟수</Text>
            </View>
            <View className="w-1/2 mb-4 pl-2">
              <Text className="text-2xl font-bold text-foreground">
                {(avgDistancePerRide / 1000).toFixed(1)} km
              </Text>
              <Text className="text-muted text-xs">평균 주행거리</Text>
            </View>
            <View className="w-1/2 pr-2">
              <Text className="text-2xl font-bold text-foreground">
                {localStats.avgSpeed.toFixed(1)} km/h
              </Text>
              <Text className="text-muted text-xs">평균 속도</Text>
            </View>
            <View className="w-1/2 pl-2">
              <Text className="text-2xl font-bold text-foreground">
                {localStats.maxSpeed.toFixed(1)} km/h
              </Text>
              <Text className="text-muted text-xs">최고 속도</Text>
            </View>
          </View>
        </View>

        {/* Time Stats */}
        <View className="mx-5 mb-4 bg-surface rounded-2xl p-5 border border-border">
          <Text className="text-lg font-bold text-foreground mb-4">시간 통계</Text>
          
          <View className="flex-row">
            <View className="flex-1 pr-2">
              <Text className="text-xl font-bold text-foreground">
                {formatDuration(localStats.totalDuration)}
              </Text>
              <Text className="text-muted text-xs">총 주행시간</Text>
            </View>
            <View className="flex-1 pl-2">
              <Text className="text-xl font-bold text-foreground">
                {formatDuration(Math.round(localStats.avgDuration))}
              </Text>
              <Text className="text-muted text-xs">평균 주행시간</Text>
            </View>
          </View>
        </View>

        {/* Odometer Info */}
        <View className="mx-5 mb-4 bg-surface rounded-2xl p-5 border border-border">
          <Text className="text-lg font-bold text-foreground mb-4">누적 거리</Text>
          
          <View className="flex-row items-center mb-3">
            <View className="flex-1">
              <Text className="text-muted text-xs">초기 주행거리</Text>
              <Text className="text-foreground font-medium">
                {((scooter.initialOdometer || 0) / 1000).toFixed(1)} km
              </Text>
            </View>
            <MaterialIcons name="add" size={20} color={colors.muted} />
            <View className="flex-1 items-center">
              <Text className="text-muted text-xs">앱 기록</Text>
              <Text className="text-foreground font-medium">
                {((scooter.totalDistance || 0) / 1000).toFixed(1)} km
              </Text>
            </View>
            <MaterialIcons name="drag-handle" size={20} color={colors.muted} />
            <View className="flex-1 items-end">
              <Text className="text-muted text-xs">총 주행거리</Text>
              <Text className="text-primary font-bold">
                {(totalDistance / 1000).toFixed(1)} km
              </Text>
            </View>
          </View>

          {/* Progress bar visualization */}
          <View className="h-3 bg-border rounded-full overflow-hidden flex-row">
            <View
              className="h-full"
              style={{
                backgroundColor: colors.muted,
                width: `${totalDistance > 0 ? ((scooter.initialOdometer || 0) / totalDistance) * 100 : 0}%`,
              }}
            />
            <View
              className="h-full"
              style={{
                backgroundColor: colors.primary,
                width: `${totalDistance > 0 ? ((scooter.totalDistance || 0) / totalDistance) * 100 : 0}%`,
              }}
            />
          </View>
        </View>

        {/* Recent Rides */}
        {recentRides.length > 0 && (
          <View className="mx-5 mb-4">
            <Text className="text-lg font-bold text-foreground mb-3">최근 주행</Text>
            
            {recentRides.map((ride) => (
              <Pressable
                key={ride.id}
                onPress={() => router.push(`/ride-detail?id=${ride.id}`)}
                style={({ pressed }) => [{ opacity: pressed ? 0.9 : 1 }]}
              >
                <View className="bg-surface rounded-xl p-4 mb-2 flex-row items-center border border-border">
                  <View className="w-10 h-10 rounded-full items-center justify-center mr-3" style={{ backgroundColor: scooter.color + "20" }}>
                    <MaterialIcons name="route" size={20} color={scooter.color || colors.primary} />
                  </View>
                  <View className="flex-1">
                    <Text className="text-foreground font-medium">{ride.date}</Text>
                    <Text className="text-muted text-xs">
                      {(ride.distance / 1000).toFixed(2)} km • {formatDuration(ride.duration)}
                    </Text>
                  </View>
                  <Text className="text-primary font-bold">
                    {ride.avgSpeed.toFixed(1)} km/h
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>
        )}

        {/* Maintenance Status */}
        <View className="mx-5 mb-4 bg-surface rounded-2xl p-5 border border-border">
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-lg font-bold text-foreground">정비 상태</Text>
            <Pressable
              onPress={() => router.push(`/maintenance?id=${scooter.id}` as any)}
              style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
              className="flex-row items-center"
            >
              <Text className="text-primary text-sm font-medium mr-1">설정</Text>
              <MaterialIcons name="chevron-right" size={18} color={colors.primary} />
            </Pressable>
          </View>
          
          {(() => {
            const maintenanceInterval = scooter.maintenanceInterval || 500000;
            const lastMaintenanceDistance = scooter.lastMaintenanceDistance || 0;
            const distanceSinceMaintenance = totalDistance - lastMaintenanceDistance;
            const maintenanceProgress = Math.min(100, (distanceSinceMaintenance / maintenanceInterval) * 100);
            const needsMaintenance = distanceSinceMaintenance >= maintenanceInterval;
            
            return (
              <>
                {needsMaintenance ? (
                  <View className="bg-error/10 rounded-xl p-3 mb-3">
                    <View className="flex-row items-center">
                      <MaterialIcons name="warning" size={20} color={colors.error} />
                      <Text className="text-error font-medium ml-2">정비가 필요합니다!</Text>
                    </View>
                  </View>
                ) : (
                  <View className="bg-success/10 rounded-xl p-3 mb-3">
                    <View className="flex-row items-center">
                      <MaterialIcons name="check-circle" size={20} color={colors.success} />
                      <Text style={{ color: colors.success }} className="font-medium ml-2">정비 상태 양호</Text>
                    </View>
                  </View>
                )}
                
                <View className="mb-1">
                  <View className="flex-row justify-between mb-1">
                    <Text className="text-muted text-xs">다음 정비까지</Text>
                    <Text className="text-muted text-xs">{maintenanceProgress.toFixed(0)}%</Text>
                  </View>
                  <View className="h-2 bg-border rounded-full overflow-hidden">
                    <View
                      className="h-full rounded-full"
                      style={{
                        backgroundColor: needsMaintenance ? colors.error : colors.success,
                        width: `${maintenanceProgress}%`,
                      }}
                    />
                  </View>
                  <Text className="text-muted text-xs mt-1">
                    {((maintenanceInterval - distanceSinceMaintenance) / 1000).toFixed(1)}km 남음
                  </Text>
                </View>
              </>
            );
          })()}
        </View>

        {/* Notes */}
        {scooter.notes && (
          <View className="mx-5 mb-4 bg-surface rounded-2xl p-5 border border-border">
            <Text className="text-lg font-bold text-foreground mb-2">메모</Text>
            <Text className="text-muted">{scooter.notes}</Text>
          </View>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}
