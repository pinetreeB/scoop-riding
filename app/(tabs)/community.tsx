import { useState, useCallback, useMemo } from "react";
import {
  Text,
  View,
  FlatList,
  Pressable,
  RefreshControl,
  ActivityIndicator,
  Platform,
  Image,
  Dimensions,
  Share,
  Alert,
  StyleSheet,
  TouchableOpacity,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Haptics from "expo-haptics";

import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useAuth } from "@/hooks/use-auth";
import { trpc } from "@/lib/trpc";
import { useTranslation } from "@/hooks/use-translation";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

const getPostTypeLabels = (t: (key: string) => string): Record<string, { label: string; color: string; icon: string }> => ({
  general: { label: t("community.categories.general"), color: "#6B7280", icon: "chat-bubble-outline" },
  ride_share: { label: t("community.categories.rideShare"), color: "#3B82F6", icon: "route" },
  question: { label: t("community.categories.question"), color: "#F59E0B", icon: "help-outline" },
  tip: { label: t("community.categories.tip"), color: "#10B981", icon: "lightbulb-outline" },
});

type PostType = "all" | "general" | "ride_share" | "question" | "tip";

const getCategoryTabs = (t: (key: string) => string): { key: PostType; label: string; icon: string }[] => [
  { key: "all", label: t("community.categories.all"), icon: "apps" },
  { key: "general", label: t("community.categories.general"), icon: "chat-bubble-outline" },
  { key: "ride_share", label: t("community.categories.rideShare"), icon: "route" },
  { key: "question", label: t("community.categories.question"), icon: "help-outline" },
  { key: "tip", label: t("community.categories.tip"), icon: "lightbulb-outline" },
];

export default function CommunityScreen() {
  const colors = useColors();
  const router = useRouter();
  const { t } = useTranslation();
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const POST_TYPE_LABELS = getPostTypeLabels(t);
  const CATEGORY_TABS = getCategoryTabs(t);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<PostType>("all");

  const trpcUtils = trpc.useUtils();
  const postsQuery = trpc.community.getPosts.useQuery(
    { limit: 50, offset: 0 },
    { 
      enabled: isAuthenticated,
      retry: 2,
      retryDelay: 1000,
    }
  );

  // Filter posts by selected category
  const filteredPosts = useMemo(() => {
    if (!postsQuery.data) return [];
    if (selectedCategory === "all") return postsQuery.data;
    return postsQuery.data.filter((post) => post.postType === selectedCategory);
  }, [postsQuery.data, selectedCategory]);

  const handleCategoryChange = (category: PostType) => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setSelectedCategory(category);
  };

  const likeMutation = trpc.community.toggleLike.useMutation({
    onMutate: async ({ postId }) => {
      // Cancel outgoing refetches
      await trpcUtils.community.getPosts.cancel();
      
      // Snapshot previous value
      const previousPosts = trpcUtils.community.getPosts.getData({ limit: 50, offset: 0 });
      
      // Optimistically update
      trpcUtils.community.getPosts.setData({ limit: 50, offset: 0 }, (old) => {
        if (!old) return old;
        return old.map((post) => {
          if (post.id === postId) {
            const newIsLiked = !post.isLiked;
            return {
              ...post,
              isLiked: newIsLiked,
              likeCount: newIsLiked ? post.likeCount + 1 : post.likeCount - 1,
            };
          }
          return post;
        });
      });
      
      return { previousPosts };
    },
    onError: (err, variables, context) => {
      // Rollback on error
      if (context?.previousPosts) {
        trpcUtils.community.getPosts.setData({ limit: 50, offset: 0 }, context.previousPosts);
      }
    },
  });

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

  const handleLike = (postId: number, isLiked: boolean) => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(isLiked ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Medium);
    }
    likeMutation.mutate({ postId });
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
    return t("community.anonymous");
  };

  const getAuthorInitial = (post: any) => {
    const name = getAuthorName(post);
    return name.charAt(0).toUpperCase();
  };

  const parseImageUrls = (imageUrls: string | null): string[] => {
    if (!imageUrls) return [];
    try {
      return JSON.parse(imageUrls);
    } catch {
      return [];
    }
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
          <TouchableOpacity
            onPress={() => router.push("/login")}
            style={[styles.loginButton, { backgroundColor: colors.primary }]}
            activeOpacity={0.8}
          >
            <Text className="text-white font-bold">로그인하기</Text>
          </TouchableOpacity>
        </View>
      </ScreenContainer>
    );
  }

  const renderPost = ({ item }: { item: any }) => {
    const typeInfo = POST_TYPE_LABELS[item.postType] || POST_TYPE_LABELS.general;
    const images = parseImageUrls(item.imageUrls);
    const hasImages = images.length > 0;

    return (
      <TouchableOpacity
        onPress={() => router.push(`/post-detail?id=${item.id}` as any)}
        activeOpacity={0.98}
        style={[styles.postContainer, { backgroundColor: colors.background, borderBottomColor: colors.border }]}
      >
        {/* Author Header - Instagram Style */}
        <View className="flex-row items-center px-4 py-3">
          <TouchableOpacity
            onPress={() => router.push(`/user-profile?id=${item.userId}&name=${encodeURIComponent(item.authorName || "")}&email=${encodeURIComponent(item.authorEmail || "")}` as any)}
            activeOpacity={0.7}
            style={styles.authorRow}
          >
            {/* Avatar */}
            <View
              className="w-10 h-10 rounded-full items-center justify-center mr-3"
              style={{ backgroundColor: colors.primary }}
            >
              <Text className="text-white font-bold text-lg">{getAuthorInitial(item)}</Text>
            </View>
            <View className="flex-1">
              <View className="flex-row items-center">
                <Text className="text-foreground font-semibold">{getAuthorName(item)}</Text>
                <View
                  className="ml-2 px-2 py-0.5 rounded-full"
                  style={{ backgroundColor: typeInfo.color + "20" }}
                >
                  <Text style={{ color: typeInfo.color }} className="text-xs font-medium">
                    {typeInfo.label}
                  </Text>
                </View>
              </View>
              <Text className="text-muted text-xs">{formatDate(item.createdAt)}</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              if (Platform.OS !== "web") {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }
              Alert.alert(
                t("community.postOptions"),
                "",
                [
                  {
                    text: t("community.viewProfile"),
                    onPress: () => router.push(`/user-profile?id=${item.userId}&name=${encodeURIComponent(item.authorName || "")}&email=${encodeURIComponent(item.authorEmail || "")}` as any),
                  },
                  item.userId === user?.id ? {
                    text: t("community.deletePost"),
                    style: "destructive",
                    onPress: () => {
                      Alert.alert(t("community.confirmDeleteTitle"), t("community.confirmDeleteMessage"), [
                        { text: t("community.cancel"), style: "cancel" },
                        { text: t("community.delete"), style: "destructive", onPress: () => {} },
                      ]);
                    },
                  } : null,
                  { text: t("community.cancel"), style: "cancel" },
                ].filter(Boolean) as any
              );
            }}
            activeOpacity={0.7}
            style={styles.moreButton}
          >
            <MaterialIcons name="more-horiz" size={20} color={colors.muted} />
          </TouchableOpacity>
        </View>

        {/* Images - Instagram Style */}
        {hasImages && (
          <TouchableOpacity
            onPress={() => router.push(`/post-detail?id=${item.id}` as any)}
            activeOpacity={1}
          >
            {images.length === 1 ? (
              <Image
                source={{ uri: images[0] }}
                style={{ width: SCREEN_WIDTH, height: SCREEN_WIDTH * 0.75 }}
                resizeMode="cover"
              />
            ) : (
              <View className="flex-row flex-wrap">
                {images.slice(0, 4).map((uri, index) => (
                  <View
                    key={index}
                    style={{
                      width: images.length === 2 ? SCREEN_WIDTH / 2 : SCREEN_WIDTH / 2,
                      height: images.length === 2 ? SCREEN_WIDTH * 0.5 : SCREEN_WIDTH / 2 * 0.75,
                    }}
                  >
                    <Image
                      source={{ uri }}
                      style={{ width: "100%", height: "100%" }}
                      resizeMode="cover"
                    />
                    {index === 3 && images.length > 4 && (
                      <View className="absolute inset-0 bg-black/50 items-center justify-center">
                        <Text className="text-white font-bold text-xl">+{images.length - 4}</Text>
                      </View>
                    )}
                  </View>
                ))}
              </View>
            )}
          </TouchableOpacity>
        )}

        {/* Action Buttons - Instagram Style */}
        <View className="flex-row items-center px-4 py-3">
          <TouchableOpacity
            onPress={() => handleLike(item.id, item.isLiked)}
            activeOpacity={0.7}
            style={styles.actionButton}
          >
            <MaterialIcons
              name={item.isLiked ? "favorite" : "favorite-border"}
              size={26}
              color={item.isLiked ? "#EF4444" : colors.foreground}
            />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => router.push(`/post-detail?id=${item.id}` as any)}
            activeOpacity={0.7}
            style={styles.actionButton}
          >
            <MaterialIcons name="chat-bubble-outline" size={24} color={colors.foreground} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={async () => {
              if (Platform.OS !== "web") {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }
              try {
                await Share.share({
                  message: `[SCOOP 커뮤니티] ${item.title}\n\n${item.content.substring(0, 100)}${item.content.length > 100 ? "..." : ""}\n\n- ${getAuthorName(item)}님의 글`,
                });
              } catch (error) {
                console.error("Share error:", error);
              }
            }}
            activeOpacity={0.7}
            style={styles.actionButton}
          >
            <MaterialIcons name="share" size={24} color={colors.foreground} />
          </TouchableOpacity>
          <View className="flex-1" />
          <View className="flex-row items-center">
            <MaterialIcons name="visibility" size={18} color={colors.muted} />
            <Text className="text-muted text-sm ml-1">{item.viewCount}</Text>
          </View>
        </View>

        {/* Like Count */}
        {item.likeCount > 0 && (
          <View className="px-4 pb-1">
            <Text className="text-foreground font-semibold text-sm">
              {t("community.likesCount", { count: item.likeCount })}
            </Text>
          </View>
        )}

        {/* Content */}
        <TouchableOpacity
          onPress={() => router.push(`/post-detail?id=${item.id}` as any)}
          activeOpacity={0.9}
          style={styles.contentArea}
        >
          <Text className="text-foreground font-semibold text-base mb-1">
            {item.title}
          </Text>
          <Text className="text-foreground text-sm leading-5" numberOfLines={3}>
            {item.content}
          </Text>
          {item.content.length > 150 && (
            <Text className="text-muted text-sm mt-1">{t("community.seeMore")}</Text>
          )}
        </TouchableOpacity>

        {/* Comments Preview */}
        {item.commentCount > 0 && (
          <TouchableOpacity
            onPress={() => router.push(`/post-detail?id=${item.id}` as any)}
            activeOpacity={0.7}
            style={styles.commentsPreview}
          >
            <Text className="text-muted text-sm">
              {t("community.commentsCount", { count: item.commentCount })}
            </Text>
          </TouchableOpacity>
        )}

        {/* Spacer */}
        <View style={{ height: 8 }} />
      </TouchableOpacity>
    );
  };

  return (
    <ScreenContainer>
      {/* Header */}
      <View className="flex-row items-center justify-between px-5 pt-4 pb-3 border-b border-border">
        <Text className="text-2xl font-bold text-foreground">{t("community.title")}</Text>
        <View className="flex-row items-center">
          <TouchableOpacity
            onPress={() => router.push("/friends" as any)}
            activeOpacity={0.7}
            style={styles.headerIconButton}
          >
            <MaterialIcons name="people" size={24} color={colors.foreground} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleCreatePost}
            activeOpacity={0.8}
            style={[styles.writeButton, { backgroundColor: colors.primary }]}
          >
            <MaterialIcons name="add" size={20} color="#FFFFFF" />
            <Text className="text-white font-medium ml-1">{t("community.writePost")}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Category Tabs */}
      <View className="border-b border-border">
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={CATEGORY_TABS}
          keyExtractor={(item) => item.key}
          contentContainerStyle={{ paddingHorizontal: 12 }}
          renderItem={({ item }) => {
            const isSelected = selectedCategory === item.key;
            const tabColor = item.key === "all" ? colors.primary : 
              POST_TYPE_LABELS[item.key]?.color || colors.primary;
            return (
              <TouchableOpacity
                onPress={() => handleCategoryChange(item.key)}
                activeOpacity={0.7}
                style={styles.categoryTab}
              >
                <View className="flex-row items-center">
                  <MaterialIcons
                    name={item.icon as any}
                    size={18}
                    color={isSelected ? tabColor : colors.muted}
                  />
                  <Text
                    className="ml-1 font-medium"
                    style={{ color: isSelected ? tabColor : colors.muted }}
                  >
                    {item.label}
                  </Text>
                </View>
                {isSelected && (
                  <View
                    style={[styles.categoryIndicator, { backgroundColor: tabColor }]}
                  />
                )}
              </TouchableOpacity>
            );
          }}
        />
      </View>

      {/* Posts List */}
      <FlatList
        data={filteredPosts}
        renderItem={renderPost}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={{ paddingBottom: 100 }}
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
            ) : postsQuery.isError ? (
              <>
                <MaterialIcons name="cloud-off" size={48} color={colors.muted} />
                <Text className="text-muted mt-4">{t("community.loadError") || "게시글을 불러올 수 없습니다"}</Text>
                <Text className="text-muted text-sm mt-1">{t("community.tryAgain") || "네트워크 연결을 확인하고 다시 시도해주세요"}</Text>
                <TouchableOpacity
                  onPress={() => postsQuery.refetch()}
                  activeOpacity={0.8}
                  style={[styles.retryButton, { backgroundColor: colors.primary }]}
                >
                  <Text className="text-white font-medium">{t("community.retry") || "다시 시도"}</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <MaterialIcons name="forum" size={48} color={colors.muted} />
                <Text className="text-muted mt-4">{t("community.noPosts")}</Text>
                <Text className="text-muted text-sm mt-1">{t("community.firstPost")}</Text>
              </>
            )}
          </View>
        }
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  loginButton: {
    marginTop: 24,
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 12,
  },
  postContainer: {
    borderBottomWidth: 1,
  },
  authorRow: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  moreButton: {
    padding: 8,
  },
  actionButton: {
    marginRight: 16,
  },
  contentArea: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  commentsPreview: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  headerIconButton: {
    padding: 8,
    marginRight: 8,
  },
  writeButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
  },
  categoryTab: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginRight: 4,
  },
  categoryIndicator: {
    position: "absolute",
    bottom: 0,
    left: 12,
    right: 12,
    height: 2,
    borderRadius: 999,
  },
  retryButton: {
    marginTop: 16,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 12,
  },
});
