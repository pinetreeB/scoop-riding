import { useEffect, useState } from "react";
import { Text, View, Pressable, ScrollView, Alert, Platform } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Haptics from "expo-haptics";

import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { RideMap } from "@/components/ride-map";
import { GoogleRideMap } from "@/components/google-ride-map";
import {
  RidingRecord,
  getRidingRecordWithGps,
  deleteRecordEverywhere,
  formatDuration,
} from "@/lib/riding-store";
import { trpc } from "@/lib/trpc";
import {
  GpsPoint,
  saveAndShareGpx,
  TrackData,
} from "@/lib/gps-utils";
import { shareRideAsText } from "@/lib/share-utils";
import { RideChart } from "@/components/ride-chart";
import { RideAnalysisModal, type RideAnalysis } from "@/components/ride-analysis-modal";
import { WeatherInfoCard } from "@/components/weather-icon";

export default function RideDetailScreen() {
  const router = useRouter();
  const colors = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [record, setRecord] = useState<RidingRecord | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [showAnalysisModal, setShowAnalysisModal] = useState(false);
  const [rideAnalysis, setRideAnalysis] = useState<RideAnalysis | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  
  const analyzeRide = trpc.rides.analyzeRide.useMutation();

  useEffect(() => {
    loadRecord();
  }, [id]);

  const loadRecord = async () => {
    if (!id) return;
    // Use getRidingRecordWithGps to load GPS data separately
    const found = await getRidingRecordWithGps(id);
    setRecord(found);
    console.log("[RideDetail] Loaded record:", id, "GPS points:", found?.gpsPoints?.length || 0);
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

  const handleShare = async () => {
    if (!record) return;

    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    setIsSharing(true);

    try {
      const success = await shareRideAsText(record);
      if (success && Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (error) {
      console.error("Share error:", error);
      Alert.alert("공유 실패", "주행 기록을 공유하는 중 오류가 발생했습니다.");
    } finally {
      setIsSharing(false);
    }
  };

  const trpcUtils = trpc.useUtils();

  const handleDelete = () => {
    Alert.alert(
      "기록 삭제",
      "이 주행 기록을 삭제하시겠습니까?\n클라우드에서도 삭제됩니다.",
      [
        { text: "취소", style: "cancel" },
        {
          text: "삭제",
          style: "destructive",
          onPress: async () => {
            if (record) {
              await deleteRecordEverywhere(record.id, trpcUtils);
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

        {/* Date and Scooter */}
        <View className="px-4 py-3">
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center">
              <Text className="text-sm text-muted">{record.date}</Text>
              {record.groupId && (
                <View className="flex-row items-center bg-success/20 px-2 py-0.5 rounded-full ml-2">
                  <MaterialIcons name="group" size={12} color="#22C55E" />
                  <Text className="text-success text-xs font-medium ml-1">그룹 라이딩</Text>
                </View>
              )}
            </View>
            {record.scooterName && (
              <View className="flex-row items-center bg-primary/10 px-3 py-1 rounded-full">
                <MaterialIcons name="electric-scooter" size={14} color={colors.primary} />
                <Text className="text-primary text-xs font-medium ml-1">{record.scooterName}</Text>
              </View>
            )}
          </View>
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

          {/* Group Members */}
          {record.groupMembers && record.groupMembers.length > 0 && (
            <View className="mt-3 bg-surface rounded-xl p-3 border border-border">
              <View className="flex-row items-center mb-2">
                <MaterialIcons name="people" size={16} color={colors.primary} />
                <Text className="text-foreground font-medium ml-2">함께 라이딩한 멤버</Text>
              </View>
              <View className="flex-row flex-wrap gap-2">
                {record.groupMembers.map((member, index) => (
                  <View
                    key={member.userId || index}
                    className="flex-row items-center bg-background rounded-full px-3 py-1.5"
                  >
                    <View
                      style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: colors.primary }}
                      className="items-center justify-center"
                    >
                      <Text className="text-white text-xs font-bold">
                        {(member.name || "?").charAt(0)}
                      </Text>
                    </View>
                    <Text className="text-sm text-foreground ml-1.5">{member.name || "익명"}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}
        </View>

        {/* Map */}
        {hasGpsData ? (
          <View className="mx-4 h-64 rounded-2xl overflow-hidden mb-4">
            {Platform.OS !== "web" ? (
              <GoogleRideMap
                gpsPoints={gpsPoints}
                isLive={false}
                showCurrentLocation={false}
              />
            ) : (
              <RideMap
                gpsPoints={gpsPoints}
                isLive={false}
                showCurrentLocation={false}
              />
            )}
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

        {/* Altitude/Speed Chart (Samsung Health Style) */}
        {hasGpsData && (
          <RideChart gpsPoints={gpsPoints} duration={record.duration} />
        )}

        {/* Weather Info */}
        {(record.temperature !== undefined || record.weatherCondition) && (
          <View className="mx-4 mb-4">
            <WeatherInfoCard
              temperature={record.temperature}
              humidity={record.humidity}
              windSpeed={record.windSpeed}
              weatherCondition={record.weatherCondition}
            />
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

        {/* Action Buttons */}
        <View className="mx-4 mb-6 gap-3">
          {/* Share Button */}
          <Pressable
            onPress={handleShare}
            disabled={isSharing}
            style={({ pressed }) => [
              {
                backgroundColor: colors.primary,
                opacity: pressed || isSharing ? 0.7 : 1,
              },
            ]}
            className="flex-row items-center justify-center py-4 rounded-xl"
          >
            <MaterialIcons name="share" size={20} color="#FFFFFF" />
            <Text className="text-white font-semibold ml-2">
              {isSharing ? "공유 중..." : "주행 기록 공유"}
            </Text>
          </Pressable>

          {/* Export GPX Button */}
          {hasGpsData && (
            <Pressable
              onPress={handleExportGpx}
              disabled={isExporting}
              style={({ pressed }) => [
                {
                  borderColor: colors.primary,
                  borderWidth: 1,
                  opacity: pressed || isExporting ? 0.7 : 1,
                },
              ]}
              className="flex-row items-center justify-center py-4 rounded-xl bg-surface"
            >
              <MaterialIcons name="file-download" size={20} color={colors.primary} />
              <Text style={{ color: colors.primary }} className="font-semibold ml-2">
                {isExporting ? "내보내는 중..." : "GPX 파일 내보내기"}
              </Text>
            </Pressable>
          )}

          {/* AI Analysis Button */}
          <Pressable
            onPress={async () => {
              if (Platform.OS !== "web") {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }
              setShowAnalysisModal(true);
              setIsAnalyzing(true);
              try {
                const result = await analyzeRide.mutateAsync({
                  distance: record.distance,
                  duration: record.duration,
                  avgSpeed: record.avgSpeed,
                  maxSpeed: record.maxSpeed,
                  voltageStart: record.voltageStart,
                  voltageEnd: record.voltageEnd,
                  socStart: record.socStart,
                  socEnd: record.socEnd,
                  gpsPointsCount: gpsPoints.length,
                });
                if (result.success && result.analysis) {
                  setRideAnalysis(result.analysis);
                }
              } catch (e) {
                console.error("AI analysis error:", e);
              } finally {
                setIsAnalyzing(false);
              }
            }}
            disabled={isAnalyzing}
            style={({ pressed }) => [
              {
                borderColor: colors.success,
                borderWidth: 1,
                opacity: pressed || isAnalyzing ? 0.7 : 1,
              },
            ]}
            className="flex-row items-center justify-center py-4 rounded-xl bg-surface"
          >
            <MaterialIcons name="smart-toy" size={20} color={colors.success} />
            <Text style={{ color: colors.success }} className="font-semibold ml-2">
              AI 분석 보기
            </Text>
          </Pressable>
        </View>
      </ScrollView>

      {/* AI Analysis Modal */}
      <RideAnalysisModal
        visible={showAnalysisModal}
        onClose={() => {
          setShowAnalysisModal(false);
          setRideAnalysis(null);
        }}
        analysis={rideAnalysis}
        isLoading={isAnalyzing}
        rideStats={{
          distance: record.distance,
          duration: record.duration,
          avgSpeed: record.avgSpeed,
          maxSpeed: record.maxSpeed,
          voltageStart: record.voltageStart,
          voltageEnd: record.voltageEnd,
          socStart: record.socStart,
          socEnd: record.socEnd,
        }}
      />
    </ScreenContainer>
  );
}
