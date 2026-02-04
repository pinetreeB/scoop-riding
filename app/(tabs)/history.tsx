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
import { useTranslation } from "@/hooks/use-translation";

export default function HistoryScreen() {
  const colors = useColors();
  const router = useRouter();
  const { t } = useTranslation();
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

    Alert.alert(t("history.alerts.deleteTitle"), t("history.alerts.deleteMessage"), [
      { text: t("history.alerts.cancel"), style: "cancel" },
      {
        text: t("history.alerts.delete"),
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
          t("history.alerts.noGpsData"),
          t("history.alerts.noGpsDataMessage")
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
        Alert.alert(t("history.alerts.exportFailed"), t("history.alerts.exportFailedMessage"));
      }
    } catch (error) {
      console.error("GPX export error:", error);
      Alert.alert(t("history.alerts.error"), t("history.alerts.errorMessage"));
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
            <Text className="text-xs text-muted">{t("history.distance")}</Text>
            <Text className="text-lg font-bold text-foreground">
              {formatDistance(item.distance)}
            </Text>
          </View>
          <View className="flex-1">
            <Text className="text-xs text-muted">{t("history.time")}</Text>
            <Text className="text-lg font-bold text-foreground">
              {formatDuration(item.duration)}
            </Text>
          </View>
          <View className="flex-1">
            <Text className="text-xs text-muted">{t("history.avgSpeed")}</Text>
            <Text className="text-lg font-bold text-primary">
              {item.avgSpeed.toFixed(1)} km/h
            </Text>
          </View>
        </View>

        <View className="flex-row mt-3 pt-3 border-t border-border items-center">
          <View className="flex-1">
            <Text className="text-xs text-muted">{t("history.maxSpeed")}</Text>
            <Text className="text-sm font-semibold text-foreground">
              {item.maxSpeed.toFixed(1)} km/h
            </Text>
          </View>
          <View className="flex-row items-center">
            <Text className="text-xs text-muted mr-1">{t("history.viewDetail")}</Text>
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
        {t("history.noRecordsYet")}
      </Text>
      <Text className="text-muted text-center text-sm mt-1">
        {t("history.startFromHome")}
      </Text>
    </View>
  );

  return (
    <ScreenContainer>
      {/* Header */}
      <View className="px-4 py-3 border-b border-border">
        <View className="flex-row items-center justify-between">
          <View>
            <Text className="text-2xl font-bold text-foreground">{t("history.title")}</Text>
            <Text className="text-sm text-muted mt-1">
              {t("history.totalRecords", { count: records.length })} • {t("history.tapToViewDetail")}
            </Text>
          </View>
          {records.length >= 2 && (
            <Pressable
              onPress={() => {
                if (Platform.OS !== "web") {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }
                router.push("/compare-routes");
              }}
              style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
              className="flex-row items-center bg-primary/10 px-3 py-2 rounded-lg"
            >
              <MaterialIcons name="compare-arrows" size={18} color={colors.primary} />
              <Text style={{ color: colors.primary }} className="text-sm font-medium ml-1">
                {t("history.compareRoutes")}
              </Text>
            </Pressable>
          )}
        </View>
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
