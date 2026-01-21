import { useEffect, useState } from "react";
import { Text, View, Pressable, ScrollView, Alert, Platform } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Haptics from "expo-haptics";

import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { RideMap } from "@/components/ride-map";
import {
  RidingRecord,
  getRidingRecords,
  deleteRidingRecord,
  formatDuration,
} from "@/lib/riding-store";
import {
  GpsPoint,
  saveAndShareGpx,
  TrackData,
} from "@/lib/gps-utils";

export default function RideDetailScreen() {
  const router = useRouter();
  const colors = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [record, setRecord] = useState<RidingRecord | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    loadRecord();
  }, [id]);

  const loadRecord = async () => {
    const records = await getRidingRecords();
    const found = records.find((r) => r.id === id);
    setRecord(found || null);
  };

  const handleExportGpx = async () => {
    if (!record || !record.gpsPoints || record.gpsPoints.length === 0) {
      Alert.alert("내보내기 실패", "GPS 데이터가 없습니다.");
      return;
    }

    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    setIsExporting(true);

    try {
      const trackData: TrackData = {
        points: record.gpsPoints,
        startTime: new Date(record.startTime || record.date),
        endTime: new Date(record.endTime || record.date),
        name: `SCOOP 주행 기록 - ${record.date}`,
      };

      const filename = `scoop_ride_${record.id}`;
      const success = await saveAndShareGpx(trackData, filename);

      if (success) {
        if (Platform.OS !== "web") {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
      } else {
        Alert.alert("내보내기 실패", "GPX 파일을 저장하는 중 오류가 발생했습니다.");
      }
    } catch (error) {
      console.error("GPX export error:", error);
      Alert.alert("내보내기 실패", "GPX 파일을 저장하는 중 오류가 발생했습니다.");
    } finally {
      setIsExporting(false);
    }
  };

  const handleDelete = () => {
    Alert.alert(
      "기록 삭제",
      "이 주행 기록을 삭제하시겠습니까?",
      [
        { text: "취소", style: "cancel" },
        {
          text: "삭제",
          style: "destructive",
          onPress: async () => {
            if (record) {
              await deleteRidingRecord(record.id);
              if (Platform.OS !== "web") {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              }
              router.back();
            }
          },
        },
      ]
    );
  };

  if (!record) {
    return (
      <ScreenContainer className="p-4">
        <View className="flex-1 items-center justify-center">
          <Text className="text-muted">기록을 불러오는 중...</Text>
        </View>
      </ScreenContainer>
    );
  }

  const gpsPoints = record.gpsPoints || [];
  const hasGpsData = gpsPoints.length > 0;

  // Calculate rest time (duration - moving time based on GPS points)
  const movingTime = gpsPoints.length > 1
    ? Math.round((gpsPoints[gpsPoints.length - 1].timestamp - gpsPoints[0].timestamp) / 1000)
    : record.duration;
  const restTime = Math.max(0, record.duration - movingTime);

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]}>
      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View className="flex-row justify-between items-center px-4 py-3 border-b border-border">
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
            className="p-2 -ml-2"
          >
            <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
          </Pressable>
          <Text className="text-lg font-semibold text-foreground">주행 기록</Text>
          <Pressable
            onPress={handleDelete}
            style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
            className="p-2 -mr-2"
          >
            <MaterialIcons name="delete-outline" size={24} color={colors.error} />
          </Pressable>
        </View>

        {/* Date */}
        <View className="px-4 py-3">
          <Text className="text-sm text-muted">{record.date}</Text>
          {record.startTime && (
            <Text className="text-xs text-muted mt-1">
              {new Date(record.startTime).toLocaleTimeString("ko-KR", {
                hour: "2-digit",
                minute: "2-digit",
              })}
              {record.endTime && (
                <>
                  {" ~ "}
                  {new Date(record.endTime).toLocaleTimeString("ko-KR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </>
              )}
            </Text>
          )}
        </View>

        {/* Map */}
        {hasGpsData && Platform.OS !== "web" ? (
          <View className="mx-4 h-64 rounded-2xl overflow-hidden mb-4">
            <RideMap
              gpsPoints={gpsPoints}
              isLive={false}
              showCurrentLocation={false}
            />
            <View className="absolute top-3 right-3">
              <Pressable
                onPress={() => {
                  // Could implement full screen map view here
                }}
                style={({ pressed }) => [
                  { opacity: pressed ? 0.7 : 1 },
                ]}
                className="bg-white/90 rounded-lg px-3 py-1"
              >
                <Text className="text-xs text-gray-700">코스보기</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <View className="mx-4 h-48 rounded-2xl bg-surface items-center justify-center mb-4">
            <MaterialIcons name="map" size={48} color={colors.muted} />
            <Text className="text-muted mt-2">GPS 데이터 없음</Text>
          </View>
        )}

        {/* Stats Grid */}
        <View className="mx-4 bg-surface rounded-2xl p-4 mb-4">
          <View className="flex-row mb-4">
            <View className="flex-1">
              <Text className="text-sm text-muted">주행시간</Text>
              <Text className="text-xl font-bold text-foreground mt-1">
                {formatDuration(record.duration)}
              </Text>
            </View>
            <View className="flex-1">
              <Text className="text-sm text-muted">휴식시간</Text>
              <Text className="text-xl font-bold text-foreground mt-1">
                {formatDuration(restTime)}
              </Text>
            </View>
          </View>
          <View className="h-px bg-border mb-4" />
          <View className="flex-row">
            <View className="flex-1">
              <Text className="text-sm text-muted">거리</Text>
              <Text className="text-xl font-bold text-foreground mt-1">
                {(record.distance / 1000).toFixed(2)}km
              </Text>
            </View>
            <View className="flex-1">
              <Text className="text-sm text-muted">평균속도</Text>
              <Text className="text-xl font-bold text-foreground mt-1">
                {record.avgSpeed.toFixed(1)}km/h
              </Text>
            </View>
          </View>
          <View className="h-px bg-border my-4" />
          <View className="flex-row">
            <View className="flex-1">
              <Text className="text-sm text-muted">최고속도</Text>
              <Text className="text-xl font-bold text-foreground mt-1">
                {record.maxSpeed.toFixed(1)}km/h
              </Text>
            </View>
            <View className="flex-1">
              <Text className="text-sm text-muted">GPS 포인트</Text>
              <Text className="text-xl font-bold text-foreground mt-1">
                {gpsPoints.length}개
              </Text>
            </View>
          </View>
        </View>

        {/* Export Button */}
        {hasGpsData && (
          <View className="mx-4 mb-6">
            <Pressable
              onPress={handleExportGpx}
              disabled={isExporting}
              style={({ pressed }) => [
                {
                  backgroundColor: colors.primary,
                  opacity: pressed || isExporting ? 0.7 : 1,
                },
              ]}
              className="flex-row items-center justify-center py-4 rounded-xl"
            >
              <MaterialIcons name="file-download" size={20} color="#FFFFFF" />
              <Text className="text-white font-semibold ml-2">
                {isExporting ? "내보내는 중..." : "GPX 파일 내보내기"}
              </Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}
