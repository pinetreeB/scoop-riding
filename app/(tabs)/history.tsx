import { useEffect, useState, useCallback } from "react";
import {
  Text,
  View,
  FlatList,
  RefreshControl,
  Pressable,
  Alert,
} from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import {
  getRidingRecords,
  deleteRidingRecord,
  formatDuration,
  formatDistance,
  type RidingRecord,
} from "@/lib/riding-store";
import { useFocusEffect } from "expo-router";

export default function HistoryScreen() {
  const colors = useColors();
  const [records, setRecords] = useState<RidingRecord[]>([]);
  const [refreshing, setRefreshing] = useState(false);

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

  const handleDelete = (id: string) => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    Alert.alert("기록 삭제", "이 주행 기록을 삭제하시겠습니까?", [
      { text: "취소", style: "cancel" },
      {
        text: "삭제",
        style: "destructive",
        onPress: async () => {
          await deleteRidingRecord(id);
          await loadRecords();
        },
      },
    ]);
  };

  const renderItem = ({ item }: { item: RidingRecord }) => (
    <View className="bg-surface rounded-xl p-4 mb-3 mx-4">
      <View className="flex-row justify-between items-start mb-3">
        <View>
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
        <Pressable
          onPress={() => handleDelete(item.id)}
          style={({ pressed }) => [{ opacity: pressed ? 0.5 : 1 }]}
          className="p-1"
        >
          <MaterialIcons name="delete-outline" size={20} color={colors.muted} />
        </Pressable>
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

      <View className="flex-row mt-3 pt-3 border-t border-border">
        <View className="flex-1">
          <Text className="text-xs text-muted">최고 속도</Text>
          <Text className="text-sm font-semibold text-foreground">
            {item.maxSpeed.toFixed(1)} km/h
          </Text>
        </View>
      </View>
    </View>
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
          총 {records.length}개의 기록
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
