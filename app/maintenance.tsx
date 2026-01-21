import { useState, useEffect, useCallback } from "react";
import {
  Text,
  View,
  ScrollView,
  Pressable,
  Alert,
  Platform,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Haptics from "expo-haptics";
import Slider from "@react-native-community/slider";

import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useAuth } from "@/hooks/use-auth";
import { trpc } from "@/lib/trpc";

export default function MaintenanceScreen() {
  const router = useRouter();
  const colors = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { isAuthenticated } = useAuth();
  
  const [maintenanceInterval, setMaintenanceInterval] = useState(500000); // 500km default
  const [isSaving, setIsSaving] = useState(false);
  
  const trpcUtils = trpc.useUtils();
  const scooterQuery = trpc.scooters.list.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const updateMutation = trpc.scooters.update.useMutation();

  const scooter = scooterQuery.data?.find((s) => s.id === Number(id));

  useEffect(() => {
    if (scooter) {
      setMaintenanceInterval(scooter.maintenanceInterval || 500000);
    }
  }, [scooter]);

  const handleSave = async () => {
    if (!scooter) return;

    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    setIsSaving(true);
    try {
      await updateMutation.mutateAsync({
        id: scooter.id,
        maintenanceInterval,
      });
      await trpcUtils.scooters.list.invalidate();
      
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      Alert.alert("저장 완료", "정비 알림 설정이 저장되었습니다.");
    } catch (error) {
      Alert.alert("오류", "설정 저장에 실패했습니다.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleCompleteMaintenance = async () => {
    if (!scooter) return;

    Alert.alert(
      "정비 완료",
      "정비를 완료하셨나요? 정비 기록이 업데이트됩니다.",
      [
        { text: "취소", style: "cancel" },
        {
          text: "완료",
          onPress: async () => {
            if (Platform.OS !== "web") {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            }

            try {
              const totalDistance = (scooter.initialOdometer || 0) + (scooter.totalDistance || 0);
              await updateMutation.mutateAsync({
                id: scooter.id,
                lastMaintenanceDistance: totalDistance,
                lastMaintenanceDate: new Date().toISOString(),
              });
              await trpcUtils.scooters.list.invalidate();
              
              if (Platform.OS !== "web") {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              }
              Alert.alert("완료", "정비 기록이 업데이트되었습니다.");
            } catch (error) {
              Alert.alert("오류", "정비 기록 업데이트에 실패했습니다.");
            }
          },
        },
      ]
    );
  };

  if (!scooter) {
    return (
      <ScreenContainer className="p-4">
        <View className="flex-1 items-center justify-center">
          <Text className="text-muted">기체 정보를 불러오는 중...</Text>
        </View>
      </ScreenContainer>
    );
  }

  const totalDistance = (scooter.initialOdometer || 0) + (scooter.totalDistance || 0);
  const distanceSinceMaintenance = totalDistance - (scooter.lastMaintenanceDistance || 0);
  const maintenanceProgress = Math.min(100, (distanceSinceMaintenance / maintenanceInterval) * 100);
  const needsMaintenance = distanceSinceMaintenance >= maintenanceInterval;

  const formatDistance = (meters: number) => {
    if (meters >= 1000) {
      return `${(meters / 1000).toFixed(1)}km`;
    }
    return `${Math.round(meters)}m`;
  };

  const formatDate = (date: string | Date | null) => {
    if (!date) return "기록 없음";
    const d = new Date(date);
    return d.toLocaleDateString("ko-KR", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]}>
      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View className="flex-row items-center px-4 py-3 border-b border-border">
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
            className="p-2 -ml-2"
          >
            <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
          </Pressable>
          <Text className="text-lg font-semibold text-foreground ml-2">정비 알림</Text>
        </View>

        {/* Scooter Info */}
        <View className="mx-4 mt-4 bg-surface rounded-2xl p-4">
          <View className="flex-row items-center mb-3">
            <View
              className="w-12 h-12 rounded-full items-center justify-center"
              style={{ backgroundColor: scooter.color || colors.primary }}
            >
              <MaterialIcons name="electric-scooter" size={24} color="#FFFFFF" />
            </View>
            <View className="ml-3">
              <Text className="text-foreground font-bold text-lg">{scooter.name}</Text>
              {scooter.model && (
                <Text className="text-muted text-sm">{scooter.brand} {scooter.model}</Text>
              )}
            </View>
          </View>
          <View className="flex-row justify-between">
            <View>
              <Text className="text-muted text-xs">총 주행거리</Text>
              <Text className="text-foreground font-bold">{formatDistance(totalDistance)}</Text>
            </View>
            <View>
              <Text className="text-muted text-xs">마지막 정비</Text>
              <Text className="text-foreground font-bold">{formatDate(scooter.lastMaintenanceDate)}</Text>
            </View>
          </View>
        </View>

        {/* Maintenance Status */}
        <View className="mx-4 mt-4 bg-surface rounded-2xl p-4">
          <Text className="text-foreground font-semibold mb-3">정비 상태</Text>
          
          {needsMaintenance ? (
            <View className="bg-error/10 rounded-xl p-4 mb-4">
              <View className="flex-row items-center mb-2">
                <MaterialIcons name="warning" size={24} color={colors.error} />
                <Text className="text-error font-bold ml-2">정비가 필요합니다!</Text>
              </View>
              <Text className="text-muted text-sm">
                마지막 정비 후 {formatDistance(distanceSinceMaintenance)}를 주행했습니다.
              </Text>
            </View>
          ) : (
            <View className="bg-success/10 rounded-xl p-4 mb-4">
              <View className="flex-row items-center mb-2">
                <MaterialIcons name="check-circle" size={24} color={colors.success} />
                <Text style={{ color: colors.success }} className="font-bold ml-2">정비 상태 양호</Text>
              </View>
              <Text className="text-muted text-sm">
                다음 정비까지 {formatDistance(maintenanceInterval - distanceSinceMaintenance)} 남았습니다.
              </Text>
            </View>
          )}

          {/* Progress Bar */}
          <View className="mb-2">
            <View className="flex-row justify-between mb-1">
              <Text className="text-muted text-xs">정비 진행도</Text>
              <Text className="text-muted text-xs">{maintenanceProgress.toFixed(0)}%</Text>
            </View>
            <View className="h-3 bg-border rounded-full overflow-hidden">
              <View
                className="h-full rounded-full"
                style={{
                  backgroundColor: needsMaintenance ? colors.error : colors.success,
                  width: `${maintenanceProgress}%`,
                }}
              />
            </View>
            <Text className="text-muted text-xs mt-1">
              {formatDistance(distanceSinceMaintenance)} / {formatDistance(maintenanceInterval)}
            </Text>
          </View>

          {/* Complete Maintenance Button */}
          <Pressable
            onPress={handleCompleteMaintenance}
            style={({ pressed }) => [
              {
                backgroundColor: needsMaintenance ? colors.error : colors.primary,
                opacity: pressed ? 0.7 : 1,
              },
            ]}
            className="py-3 rounded-xl items-center mt-4"
          >
            <Text className="text-white font-semibold">정비 완료</Text>
          </Pressable>
        </View>

        {/* Maintenance Interval Setting */}
        <View className="mx-4 mt-4 bg-surface rounded-2xl p-4">
          <Text className="text-foreground font-semibold mb-3">정비 주기 설정</Text>
          
          <View className="flex-row items-center justify-between mb-2">
            <View className="flex-row items-center">
              <MaterialIcons name="settings" size={20} color={colors.primary} />
              <Text className="text-foreground font-medium ml-2">정비 주기</Text>
            </View>
            <Text className="text-primary font-bold">
              {formatDistance(maintenanceInterval)}
            </Text>
          </View>
          
          <Slider
            style={{ width: "100%", height: 40 }}
            minimumValue={100000}
            maximumValue={2000000}
            step={50000}
            value={maintenanceInterval}
            onValueChange={(value: number) => setMaintenanceInterval(value)}
            minimumTrackTintColor={colors.primary}
            maximumTrackTintColor={colors.border}
            thumbTintColor={colors.primary}
          />
          <View className="flex-row justify-between">
            <Text className="text-muted text-xs">100km</Text>
            <Text className="text-muted text-xs">2,000km</Text>
          </View>

          <Text className="text-muted text-sm mt-4">
            정비 주기는 타이어 교체, 브레이크 점검, 배터리 관리 등 정기적인 점검 주기를 설정합니다.
          </Text>
        </View>

        {/* Save Button */}
        <View className="mx-4 mt-6 mb-6">
          <Pressable
            onPress={handleSave}
            disabled={isSaving}
            style={({ pressed }) => [
              {
                backgroundColor: colors.primary,
                opacity: pressed || isSaving ? 0.7 : 1,
              },
            ]}
            className="py-4 rounded-xl items-center"
          >
            <Text className="text-white font-semibold">
              {isSaving ? "저장 중..." : "설정 저장"}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
