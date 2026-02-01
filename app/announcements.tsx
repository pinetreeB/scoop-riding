import React from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useRouter } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";

export default function AnnouncementsScreen() {
  const router = useRouter();
  const colors = useColors();
  const [refreshing, setRefreshing] = React.useState(false);

  const announcementsQuery = trpc.announcements.getAll.useQuery();

  const onRefresh = async () => {
    setRefreshing(true);
    await announcementsQuery.refetch();
    setRefreshing(false);
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "update":
        return "system-update";
      case "event":
        return "celebration";
      case "maintenance":
        return "build";
      default:
        return "campaign";
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case "update":
        return "#4CAF50";
      case "event":
        return "#FF9800";
      case "maintenance":
        return "#F44336";
      default:
        return colors.primary;
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case "update":
        return "업데이트";
      case "event":
        return "이벤트";
      case "maintenance":
        return "점검";
      default:
        return "공지";
    }
  };

  const formatDate = (date: Date) => {
    const d = new Date(date);
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
  };

  return (
    <ScreenContainer>
      {/* Header */}
      <View className="flex-row items-center px-4 py-3 border-b border-border">
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
          className="p-2 -ml-2"
        >
          <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
        </Pressable>
        <Text className="flex-1 text-lg font-bold text-foreground ml-2">
          공지사항
        </Text>
      </View>

      {announcementsQuery.isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : announcementsQuery.data?.length === 0 ? (
        <View className="flex-1 items-center justify-center px-6">
          <MaterialIcons name="campaign" size={64} color={colors.muted} />
          <Text className="text-muted text-center mt-4">
            등록된 공지사항이 없습니다.
          </Text>
        </View>
      ) : (
        <ScrollView
          className="flex-1"
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
            />
          }
        >
          {announcementsQuery.data?.map((announcement) => (
            <Pressable
              key={announcement.id}
              onPress={() =>
                router.push(`/announcement-detail?id=${announcement.id}` as any)
              }
              style={({ pressed }) => [{ opacity: pressed ? 0.9 : 1 }]}
              className="mx-4 my-2 bg-surface rounded-xl p-4 border border-border"
            >
              <View className="flex-row items-center mb-2">
                <View
                  className="flex-row items-center px-2 py-1 rounded-full mr-2"
                  style={{ backgroundColor: `${getTypeColor(announcement.type)}20` }}
                >
                  <MaterialIcons
                    name={getTypeIcon(announcement.type)}
                    size={14}
                    color={getTypeColor(announcement.type)}
                  />
                  <Text
                    className="text-xs font-medium ml-1"
                    style={{ color: getTypeColor(announcement.type) }}
                  >
                    {getTypeLabel(announcement.type)}
                  </Text>
                </View>
                <Text className="text-muted text-xs">
                  {formatDate(announcement.createdAt)}
                </Text>
              </View>
              <Text className="text-foreground font-semibold text-base mb-1">
                {announcement.title}
              </Text>
              <Text
                className="text-muted text-sm"
                numberOfLines={2}
              >
                {announcement.content}
              </Text>
            </Pressable>
          ))}
          <View className="h-20" />
        </ScrollView>
      )}
    </ScreenContainer>
  );
}
