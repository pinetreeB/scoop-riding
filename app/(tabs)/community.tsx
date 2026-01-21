import { useState, useCallback } from "react";
import {
  Text,
  View,
  FlatList,
  Pressable,
  RefreshControl,
  ActivityIndicator,
  Platform,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Haptics from "expo-haptics";

import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useAuth } from "@/hooks/use-auth";
import { trpc } from "@/lib/trpc";

const POST_TYPE_LABELS: Record<string, { label: string; color: string; icon: string }> = {
  general: { label: "일반", color: "#6B7280", icon: "chat-bubble-outline" },
  ride_share: { label: "주행기록", color: "#3B82F6", icon: "route" },
  question: { label: "질문", color: "#F59E0B", icon: "help-outline" },
  tip: { label: "팁", color: "#10B981", icon: "lightbulb-outline" },
};

export default function CommunityScreen() {
  const colors = useColors();
  const router = useRouter();
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [refreshing, setRefreshing] = useState(false);

  const trpcUtils = trpc.useUtils();
  const postsQuery = trpc.community.getPosts.useQuery(
    { limit: 50, offset: 0 },
    { enabled: isAuthenticated }
  );

  useFocusEffect(
    useCallback(() => {
      if (isAuthenticated) {
        postsQuery.refetch();
      }
    }, [isAuthenticated])
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    await postsQuery.refetch();
    setRefreshing(false);
  };

  const handleCreatePost = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    router.push("/create-post" as any);
  };

  const formatDate = (date: Date | string) => {
    const d = new Date(date);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return "방금 전";
    if (minutes < 60) return `${minutes}분 전`;
    if (hours < 24) return `${hours}시간 전`;
    if (days < 7) return `${days}일 전`;
    return d.toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
  };

  const getAuthorName = (post: any) => {
    if (post.authorName) return post.authorName;
    if (post.authorEmail) return post.authorEmail.split("@")[0];
    return "익명";
  };

  if (authLoading) {
    return (
      <ScreenContainer>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </ScreenContainer>
    );
  }

  if (!isAuthenticated) {
    return (
      <ScreenContainer>
        <View className="flex-1 items-center justify-center p-6">
          <MaterialIcons name="forum" size={64} color={colors.muted} />
          <Text className="text-xl font-bold text-foreground mt-4">커뮤니티</Text>
          <Text className="text-muted text-center mt-2">
            다른 라이더들과 주행 기록을 공유하고 소통해보세요
          </Text>
          <Pressable
            onPress={() => router.push("/login")}
            style={({ pressed }) => [
              { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 },
            ]}
            className="mt-6 px-8 py-3 rounded-xl"
          >
            <Text className="text-white font-bold">로그인하기</Text>
          </Pressable>
        </View>
      </ScreenContainer>
    );
  }

  const renderPost = ({ item }: { item: any }) => {
    const typeInfo = POST_TYPE_LABELS[item.postType] || POST_TYPE_LABELS.general;

    return (
      <Pressable
        onPress={() => router.push(`/post-detail?id=${item.id}` as any)}
        style={({ pressed }) => [{ opacity: pressed ? 0.9 : 1 }]}
      >
        <View className="bg-surface mx-4 mb-3 rounded-2xl p-4 border border-border">
          {/* Header */}
          <View className="flex-row items-center mb-2">
            <View
              className="px-2 py-1 rounded-full mr-2"
              style={{ backgroundColor: typeInfo.color + "20" }}
            >
              <Text style={{ color: typeInfo.color }} className="text-xs font-medium">
                {typeInfo.label}
              </Text>
            </View>
            <Pressable
              onPress={(e) => {
                e.stopPropagation();
                router.push(`/user-profile?id=${item.userId}&name=${encodeURIComponent(item.authorName || "")}&email=${encodeURIComponent(item.authorEmail || "")}` as any);
              }}
              style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
            >
              <Text className="text-primary text-xs font-medium">{getAuthorName(item)}</Text>
            </Pressable>
            <View className="flex-1" />
            <Text className="text-muted text-xs">{formatDate(item.createdAt)}</Text>
          </View>

          {/* Title */}
          <Text className="text-foreground font-semibold text-base mb-1" numberOfLines={2}>
            {item.title}
          </Text>

          {/* Content Preview */}
          <Text className="text-muted text-sm mb-3" numberOfLines={2}>
            {item.content}
          </Text>

          {/* Footer */}
          <View className="flex-row items-center">
            <View className="flex-row items-center mr-4">
              <MaterialIcons
                name={item.isLiked ? "favorite" : "favorite-border"}
                size={16}
                color={item.isLiked ? colors.error : colors.muted}
              />
              <Text className="text-muted text-xs ml-1">{item.likeCount}</Text>
            </View>
            <View className="flex-row items-center mr-4">
              <MaterialIcons name="chat-bubble-outline" size={16} color={colors.muted} />
              <Text className="text-muted text-xs ml-1">{item.commentCount}</Text>
            </View>
            <View className="flex-row items-center">
              <MaterialIcons name="visibility" size={16} color={colors.muted} />
              <Text className="text-muted text-xs ml-1">{item.viewCount}</Text>
            </View>
          </View>
        </View>
      </Pressable>
    );
  };

  return (
    <ScreenContainer>
      {/* Header */}
      <View className="flex-row items-center justify-between px-5 pt-4 pb-3">
        <Text className="text-2xl font-bold text-foreground">커뮤니티</Text>
        <Pressable
          onPress={handleCreatePost}
          style={({ pressed }) => [
            { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 },
          ]}
          className="flex-row items-center px-4 py-2 rounded-full"
        >
          <MaterialIcons name="edit" size={18} color="#FFFFFF" />
          <Text className="text-white font-medium ml-1">글쓰기</Text>
        </Pressable>
      </View>

      {/* Posts List */}
      <FlatList
        data={postsQuery.data || []}
        renderItem={renderPost}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={{ paddingTop: 8, paddingBottom: 100 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
          />
        }
        ListEmptyComponent={
          <View className="flex-1 items-center justify-center py-20">
            {postsQuery.isLoading ? (
              <ActivityIndicator size="large" color={colors.primary} />
            ) : (
              <>
                <MaterialIcons name="forum" size={48} color={colors.muted} />
                <Text className="text-muted mt-4">아직 게시글이 없습니다</Text>
                <Text className="text-muted text-sm mt-1">첫 번째 글을 작성해보세요!</Text>
              </>
            )}
          </View>
        }
      />
    </ScreenContainer>
  );
}
