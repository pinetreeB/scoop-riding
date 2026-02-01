import React from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";

export default function AnnouncementDetailScreen() {
  const router = useRouter();
  const colors = useColors();
  const params = useLocalSearchParams<{ id: string }>();
  const announcementId = params.id ? parseInt(params.id, 10) : 0;

  const announcementQuery = trpc.announcements.getById.useQuery(
    { id: announcementId },
    { enabled: announcementId > 0 }
  );

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
    return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
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

      {announcementQuery.isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : !announcementQuery.data ? (
        <View className="flex-1 items-center justify-center px-6">
          <MaterialIcons name="error-outline" size={64} color={colors.muted} />
          <Text className="text-muted text-center mt-4">
            공지사항을 찾을 수 없습니다.
          </Text>
        </View>
      ) : (
        <ScrollView
          className="flex-1"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ padding: 20 }}
        >
          {/* Type Badge */}
          <View className="flex-row items-center mb-4">
            <View
              className="flex-row items-center px-3 py-1.5 rounded-full"
              style={{ backgroundColor: `${getTypeColor(announcementQuery.data.type)}20` }}
            >
              <MaterialIcons
                name={getTypeIcon(announcementQuery.data.type)}
                size={16}
                color={getTypeColor(announcementQuery.data.type)}
              />
              <Text
                className="text-sm font-medium ml-1"
                style={{ color: getTypeColor(announcementQuery.data.type) }}
              >
                {getTypeLabel(announcementQuery.data.type)}
              </Text>
            </View>
          </View>

          {/* Title */}
          <Text className="text-2xl font-bold text-foreground mb-2">
            {announcementQuery.data.title}
          </Text>

          {/* Date */}
          <Text className="text-muted text-sm mb-6">
            {formatDate(announcementQuery.data.createdAt)}
          </Text>

          {/* Content */}
          <View className="bg-surface rounded-xl p-4 border border-border">
            <Text className="text-foreground text-base leading-6">
              {announcementQuery.data.content}
            </Text>
          </View>

          <View className="h-20" />
        </ScrollView>
      )}
    </ScreenContainer>
  );
}
