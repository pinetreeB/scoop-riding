import { useState, useCallback } from "react";
import {
  Text,
  View,
  FlatList,
  Pressable,
  RefreshControl,
  Platform,
  Image,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Haptics from "expo-haptics";

import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";

interface NotificationItem {
  id: number;
  type: string;
  title: string;
  body: string | null;
  entityType: string | null;
  entityId: number | null;
  actorId: number | null;
  isRead: boolean;
  createdAt: Date;
  actorName: string | null;
  actorProfileImageUrl: string | null;
}

export default function NotificationsCenterScreen() {
  const router = useRouter();
  const colors = useColors();
  const utils = trpc.useUtils();
  const [refreshing, setRefreshing] = useState(false);

  const { data: notifications, refetch } = trpc.notifications.list.useQuery();

  const markAsReadMutation = trpc.notifications.markAsRead.useMutation({
    onSuccess: () => {
      utils.notifications.list.invalidate();
      utils.notifications.unreadCount.invalidate();
    },
  });

  const markAllAsReadMutation = trpc.notifications.markAllAsRead.useMutation({
    onSuccess: () => {
      utils.notifications.list.invalidate();
      utils.notifications.unreadCount.invalidate();
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    },
  });

  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch])
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const handleNotificationPress = (notification: NotificationItem) => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    // Mark as read
    if (!notification.isRead) {
      markAsReadMutation.mutate({ notificationId: notification.id });
    }

    // Navigate based on type
    if (notification.entityType === "post" && notification.entityId) {
      router.push(`/post-detail?id=${notification.entityId}` as never);
    } else if (notification.entityType === "user" && notification.actorId) {
      router.push(`/user-profile?userId=${notification.actorId}` as never);
    } else if (notification.type === "friend_request") {
      // Navigate to friend requests tab
      router.push("/friends?tab=requests" as never);
    } else if (notification.type === "friend_accepted") {
      // Navigate to friends list
      router.push("/friends" as never);
    } else if (notification.type === "friend_riding" || notification.type === "friend_started_riding") {
      // Navigate to friends real-time location map
      router.push("/friends-map" as never);
    } else if (notification.type === "like" || notification.type === "comment") {
      // Navigate to community tab
      router.push("/(tabs)/community" as never);
    } else if (notification.type === "challenge" || notification.type === "challenge_invite") {
      // Navigate to challenges
      router.push("/challenges" as never);
    } else if (notification.type === "group_riding" || notification.type === "group_invite") {
      // Navigate to group riding
      router.push("/group-riding" as never);
    } else if (notification.type === "badge") {
      // Navigate to badges
      router.push("/badges" as never);
    } else if (notification.type === "level_up") {
      // Navigate to profile
      router.push("/(tabs)/profile" as never);
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case "friend_request":
        return "person-add";
      case "friend_accepted":
        return "people";
      case "like":
        return "favorite";
      case "comment":
        return "chat-bubble";
      case "follow":
        return "person-add";
      case "challenge":
        return "emoji-events";
      default:
        return "notifications";
    }
  };

  const getNotificationColor = (type: string) => {
    switch (type) {
      case "friend_request":
      case "friend_accepted":
        return colors.primary;
      case "like":
        return "#EF4444";
      case "comment":
        return "#3B82F6";
      case "follow":
        return "#8B5CF6";
      case "challenge":
        return "#F59E0B";
      default:
        return colors.muted;
    }
  };

  const formatTime = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - new Date(date).getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return "방금 전";
    if (minutes < 60) return `${minutes}분 전`;
    if (hours < 24) return `${hours}시간 전`;
    if (days < 7) return `${days}일 전`;
    return new Date(date).toLocaleDateString("ko-KR");
  };

  const renderNotification = ({ item }: { item: NotificationItem }) => (
    <Pressable
      onPress={() => handleNotificationPress(item)}
      style={({ pressed }) => [
        {
          opacity: pressed ? 0.7 : 1,
          backgroundColor: item.isRead ? "transparent" : colors.surface,
        },
      ]}
      className="flex-row items-start p-4 border-b border-border"
    >
      {/* Actor Avatar or Icon */}
      <View className="mr-3">
        {item.actorProfileImageUrl ? (
          <Image
            source={{ uri: item.actorProfileImageUrl }}
            style={{ width: 44, height: 44, borderRadius: 22 }}
          />
        ) : item.actorName ? (
          <View
            className="w-11 h-11 rounded-full items-center justify-center"
            style={{ backgroundColor: colors.primary }}
          >
            <Text className="text-white text-lg font-bold">
              {item.actorName.charAt(0).toUpperCase()}
            </Text>
          </View>
        ) : (
          <View
            className="w-11 h-11 rounded-full items-center justify-center"
            style={{ backgroundColor: getNotificationColor(item.type) + "20" }}
          >
            <MaterialIcons
              name={getNotificationIcon(item.type) as any}
              size={24}
              color={getNotificationColor(item.type)}
            />
          </View>
        )}
      </View>

      {/* Content */}
      <View className="flex-1">
        <Text
          className={`text-foreground ${item.isRead ? "" : "font-semibold"}`}
          numberOfLines={2}
        >
          {item.title}
        </Text>
        {item.body && (
          <Text className="text-muted text-sm mt-1" numberOfLines={2}>
            {item.body}
          </Text>
        )}
        <Text className="text-muted text-xs mt-1">
          {formatTime(item.createdAt)}
        </Text>
      </View>

      {/* Unread indicator */}
      {!item.isRead && (
        <View
          className="w-2 h-2 rounded-full ml-2 mt-2"
          style={{ backgroundColor: colors.primary }}
        />
      )}
    </Pressable>
  );

  const unreadCount = notifications?.filter((n) => !n.isRead).length || 0;

  return (
    <ScreenContainer>
      {/* Header */}
      <View className="flex-row items-center justify-between px-5 py-4 border-b border-border">
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
        >
          <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
        </Pressable>
        <Text className="text-lg font-bold text-foreground">알림</Text>
        {unreadCount > 0 ? (
          <Pressable
            onPress={() => markAllAsReadMutation.mutate()}
            style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
          >
            <Text className="text-primary text-sm">모두 읽음</Text>
          </Pressable>
        ) : (
          <View style={{ width: 60 }} />
        )}
      </View>

      {/* Notifications List */}
      <FlatList
        data={notifications || []}
        renderItem={renderNotification}
        keyExtractor={(item) => item.id.toString()}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
          />
        }
        ListEmptyComponent={
          <View className="flex-1 items-center justify-center py-20">
            <MaterialIcons name="notifications-none" size={64} color={colors.muted} />
            <Text className="text-muted text-lg mt-4">알림이 없습니다</Text>
          </View>
        }
        contentContainerStyle={{ flexGrow: 1 }}
      />
    </ScreenContainer>
  );
}
