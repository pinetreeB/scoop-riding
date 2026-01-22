import { useEffect, useState, useCallback } from "react";
import {
  Text,
  View,
  FlatList,
  RefreshControl,
  Pressable,
  Alert,
  ActivityIndicator,
} from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Haptics from "expo-haptics";
import { Platform } from "react-native";
import { useRouter } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import {
  getRidingRecords,
  getRidingRecordWithGps,
  deleteRecordEverywhere,
  formatDuration,
  formatDistance,
  type RidingRecord,
} from "@/lib/riding-store";
import { trpc } from "@/lib/trpc";
import { saveAndShareGpx, TrackData } from "@/lib/gps-utils";
import { useFocusEffect } from "expo-router";

export default function HistoryScreen() {
  const colors = useColors();
  const router = useRouter();
  const [records, setRecords] = useState<RidingRecord[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [exportingId, setExportingId] = useState<string | null>(null);

  const loadRecords = useCallback(async () => {
    const data = await getRidingRecords();
    setRecords(data);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadRecords();
    }, [loadRecords])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadRecords();
    setRefreshing(false);
  }, [loadRecords]);

  const trpcUtils = trpc.useUtils();

  const handleDelete = (id: string) => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    Alert.alert("기록 삭제", "이 주행 기록을 삭제하시겠습니까?\n클라우드에서도 삭제됩니다.", [
      { text: "취소", style: "cancel" },
      {
        text: "삭제",
        style: "destructive",
        onPress: async () => {
          await deleteRecordEverywhere(id, trpcUtils);
          await loadRecords();
        },
      },
    ]);
  };

  const handleExportGpx = async (record: RidingRecord) => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    setExportingId(record.id);

    try {
      const fullRecord = await getRidingRecordWithGps(record.id);

      if (!fullRecord || !fullRecord.gpsPoints || fullRecord.gpsPoints.length === 0) {
        Alert.alert(
          "GPS 데이터 없음",
          "이 주행 기록에는 GPS 경로 데이터가 없습니다."
        );
        setExportingId(null);
        return;
      }

      const trackData: TrackData = {
        points: fullRecord.gpsPoints,
        startTime: new Date(fullRecord.startTime),
        endTime: new Date(fullRecord.endTime),
        name: `SCOOP 주행 - ${fullRecord.date}`,
      };

      const dateStr = fullRecord.date.replace(/\./g, "-").replace(/\s/g, "_");
      const filename = `scoop_ride_${dateStr}_${record.id.slice(0, 6)}`;

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
      Alert.alert("오류", "GPX 파일을 내보내는 중 오류가 발생했습니다.");
    } finally {
      setExportingId(null);
    }
  };

  const handleViewDetail = (record: RidingRecord) => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    router.push(`/ride-detail?id=${record.id}`);
  };

  const renderItem = ({ item }: { item: RidingRecord }) => (
    <Pressable
      onPress={() => handleViewDetail(item)}
      style={({ pressed }) => [{ opacity: pressed ? 0.9 : 1 }]}
    >
      <View className="bg-surface rounded-xl p-4 mb-3 mx-4">
        <View className="flex-row justify-between items-start mb-3">
          <View className="flex-1">
            <Text className="text-base font-semibold text-foreground">
              {item.date}
            </Text>
            <Text className="text-xs text-muted mt-1">
              {new Date(item.startTime).toLocaleTimeString("ko-KR", {
                hour: "2-digit",
                minute: "2-digit",
              })}{" "}
              ~{" "}
              {new Date(item.endTime).toLocaleTimeString("ko-KR", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </Text>
          </View>
          <View className="flex-row items-center">
            {/* Sync status icon */}
            <View className="mr-2">
              <MaterialIcons
                name={item.synced ? "cloud-done" : "cloud-off"}
                size={18}
                color={item.synced ? colors.success : colors.muted}
              />
            </View>
            <Pressable
              onPress={(e) => {
                e.stopPropagation();
                handleExportGpx(item);
              }}
              disabled={exportingId === item.id}
              style={({ pressed }) => [
                { opacity: pressed || exportingId === item.id ? 0.5 : 1 },
              ]}
              className="p-2 mr-1"
            >
              {exportingId === item.id ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <MaterialIcons name="file-download" size={22} color={colors.primary} />
              )}
            </Pressable>
            <Pressable
              onPress={(e) => {
                e.stopPropagation();
                handleDelete(item.id);
              }}
              style={({ pressed }) => [{ opacity: pressed ? 0.5 : 1 }]}
              className="p-1"
            >
              <MaterialIcons name="delete-outline" size={20} color={colors.muted} />
            </Pressable>
          </View>
        </View>

        <View className="flex-row justify-between">
          <View className="flex-1">
            <Text className="text-xs text-muted">거리</Text>
            <Text className="text-lg font-bold text-foreground">
              {formatDistance(item.distance)}
            </Text>
          </View>
          <View className="flex-1">
            <Text className="text-xs text-muted">시간</Text>
            <Text className="text-lg font-bold text-foreground">
              {formatDuration(item.duration)}
            </Text>
          </View>
          <View className="flex-1">
            <Text className="text-xs text-muted">평균 속도</Text>
            <Text className="text-lg font-bold text-primary">
              {item.avgSpeed.toFixed(1)} km/h
            </Text>
          </View>
        </View>

        <View className="flex-row mt-3 pt-3 border-t border-border items-center">
          <View className="flex-1">
            <Text className="text-xs text-muted">최고 속도</Text>
            <Text className="text-sm font-semibold text-foreground">
              {item.maxSpeed.toFixed(1)} km/h
            </Text>
          </View>
          <View className="flex-row items-center">
            <Text className="text-xs text-muted mr-1">상세보기</Text>
            <MaterialIcons name="chevron-right" size={20} color={colors.muted} />
          </View>
        </View>
      </View>
    </Pressable>
  );

  const ListEmptyComponent = () => (
    <View className="flex-1 items-center justify-center py-20">
      <MaterialIcons name="history" size={64} color={colors.muted} />
      <Text className="text-muted text-center mt-4">
        아직 주행 기록이 없습니다.
      </Text>
      <Text className="text-muted text-center text-sm mt-1">
        홈에서 주행을 시작해보세요!
      </Text>
    </View>
  );

  return (
    <ScreenContainer>
      {/* Header */}
      <View className="px-4 py-3 border-b border-border">
        <Text className="text-2xl font-bold text-foreground">주행 기록</Text>
        <Text className="text-sm text-muted mt-1">
          총 {records.length}개의 기록 • 탭하여 상세 보기
        </Text>
      </View>

      <FlatList
        data={records}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingVertical: 16, flexGrow: 1 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
        ListEmptyComponent={ListEmptyComponent}
        showsVerticalScrollIndicator={false}
      />
    </ScreenContainer>
  );
}
