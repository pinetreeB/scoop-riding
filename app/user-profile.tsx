import { useState, useCallback } from "react";
import {
  Text,
  View,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
  Platform,
  RefreshControl,
} from "react-native";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Haptics from "expo-haptics";

import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useAuth } from "@/hooks/use-auth";
import { trpc } from "@/lib/trpc";

export default function UserProfileScreen() {
  const colors = useColors();
  const router = useRouter();
  const { id, name, email } = useLocalSearchParams<{ id: string; name?: string; email?: string }>();
  const { isAuthenticated, user: currentUser } = useAuth();

  const [refreshing, setRefreshing] = useState(false);

  const userId = parseInt(id || "0");
  const isOwnProfile = currentUser?.id === userId;

  const trpcUtils = trpc.useUtils();

  // Check if following
  const isFollowingQuery = trpc.follows.isFollowing.useQuery(
    { userId },
    { enabled: isAuthenticated && !isOwnProfile && userId > 0 }
  );

  // Get follow counts for this user
  // Note: We need to add a new endpoint for getting another user's follow counts
  // For now, we'll show the follow/unfollow button

  // Get user's posts
  const postsQuery = trpc.community.getPosts.useQuery(
    { limit: 10, offset: 0 },
    { enabled: isAuthenticated }
  );

  // Filter posts by this user
  const userPosts = postsQuery.data?.filter(post => post.userId === userId) || [];

  // Mutations
  const followMutation = trpc.follows.follow.useMutation({
    onSuccess: () => {
      isFollowingQuery.refetch();
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    },
    onError: (error) => {
      Alert.alert("오류", error.message || "팔로우에 실패했습니다.");
    },
  });

  const unfollowMutation = trpc.follows.unfollow.useMutation({
    onSuccess: () => {
      isFollowingQuery.refetch();
    },
    onError: (error) => {
      Alert.alert("오류", error.message || "언팔로우에 실패했습니다.");
    },
  });

  const sendFriendRequestMutation = trpc.friends.sendRequest.useMutation({
    onSuccess: () => {
      Alert.alert("성공", "친구 요청을 보냈습니다.");
    },
    onError: (error) => {
      Alert.alert("오류", error.message || "친구 요청에 실패했습니다.");
    },
  });

  useFocusEffect(
    useCallback(() => {
      if (!isOwnProfile) {
        isFollowingQuery.refetch();
      }
    }, [userId])
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      isFollowingQuery.refetch(),
      postsQuery.refetch(),
    ]);
    setRefreshing(false);
  };

  const handleFollow = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    followMutation.mutate({ userId });
  };

  const handleUnfollow = () => {
    Alert.alert(
      "언팔로우",
      "이 사용자를 언팔로우하시겠습니까?",
      [
        { text: "취소", style: "cancel" },
        {
          text: "언팔로우",
          style: "destructive",
          onPress: () => unfollowMutation.mutate({ userId }),
        },
      ]
    );
  };

  const handleSendFriendRequest = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    sendFriendRequestMutation.mutate({ receiverId: userId });
  };

  const getUserName = () => {
    if (name) return name;
    if (email) return email.split("@")[0];
    return "사용자";
  };

  if (!isAuthenticated) {
    return (
      <ScreenContainer>
        <View className="flex-1 items-center justify-center p-6">
          <Text className="text-foreground">로그인이 필요합니다.</Text>
        </View>
      </ScreenContainer>
    );
  }

  const isFollowing = isFollowingQuery.data;

  return (
    <ScreenContainer>
      {/* Header */}
      <View className="flex-row items-center px-5 pt-4 pb-3 border-b border-border">
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
          className="mr-3 p-1"
        >
          <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
        </Pressable>
        <Text className="text-xl font-bold text-foreground">프로필</Text>
      </View>

      <ScrollView
        className="flex-1"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        {/* Profile Card */}
        <View className="items-center py-8 px-5 border-b border-border">
          <View
            className="w-24 h-24 rounded-full items-center justify-center mb-4"
            style={{ backgroundColor: colors.primary }}
          >
            <MaterialIcons name="person" size={48} color="#FFFFFF" />
          </View>
          <Text className="text-2xl font-bold text-foreground mb-1">{getUserName()}</Text>
          {email && (
            <Text className="text-muted text-sm mb-4">{email}</Text>
          )}

          {/* Action Buttons */}
          {!isOwnProfile && (
            <View className="flex-row gap-3">
              {/* Follow/Unfollow Button */}
              {isFollowingQuery.isLoading ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : isFollowing ? (
                <Pressable
                  onPress={handleUnfollow}
                  disabled={unfollowMutation.isPending}
                  style={({ pressed }) => [
                    { backgroundColor: colors.surface, opacity: pressed ? 0.8 : 1 },
                  ]}
                  className="px-6 py-2 rounded-full border border-border"
                >
                  {unfollowMutation.isPending ? (
                    <ActivityIndicator size="small" color={colors.foreground} />
                  ) : (
                    <Text className="text-foreground font-medium">팔로잉</Text>
                  )}
                </Pressable>
              ) : (
                <Pressable
                  onPress={handleFollow}
                  disabled={followMutation.isPending}
                  style={({ pressed }) => [
                    { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 },
                  ]}
                  className="px-6 py-2 rounded-full"
                >
                  {followMutation.isPending ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text className="text-white font-medium">팔로우</Text>
                  )}
                </Pressable>
              )}

              {/* Friend Request Button */}
              <Pressable
                onPress={handleSendFriendRequest}
                disabled={sendFriendRequestMutation.isPending}
                style={({ pressed }) => [
                  { backgroundColor: colors.surface, opacity: pressed ? 0.8 : 1 },
                ]}
                className="px-4 py-2 rounded-full border border-border"
              >
                {sendFriendRequestMutation.isPending ? (
                  <ActivityIndicator size="small" color={colors.foreground} />
                ) : (
                  <MaterialIcons name="person-add" size={20} color={colors.foreground} />
                )}
              </Pressable>
            </View>
          )}
        </View>

        {/* User's Posts */}
        <View className="p-4">
          <Text className="text-lg font-bold text-foreground mb-4">게시글</Text>
          
          {postsQuery.isLoading ? (
            <ActivityIndicator size="large" color={colors.primary} />
          ) : userPosts.length === 0 ? (
            <View className="items-center py-12 bg-surface rounded-xl">
              <MaterialIcons name="article" size={48} color={colors.muted} />
              <Text className="text-muted mt-4">작성한 게시글이 없습니다.</Text>
            </View>
          ) : (
            userPosts.map((post) => (
              <Pressable
                key={post.id}
                onPress={() => router.push(`/post-detail?id=${post.id}` as any)}
                style={({ pressed }) => [{ opacity: pressed ? 0.9 : 1 }]}
              >
                <View className="bg-surface rounded-xl p-4 mb-3 border border-border">
                  <Text className="text-foreground font-medium mb-1" numberOfLines={1}>
                    {post.title}
                  </Text>
                  <Text className="text-muted text-sm" numberOfLines={2}>
                    {post.content}
                  </Text>
                  <View className="flex-row items-center mt-2">
                    <MaterialIcons name="favorite" size={14} color={colors.muted} />
                    <Text className="text-muted text-xs ml-1 mr-3">{post.likeCount}</Text>
                    <MaterialIcons name="chat-bubble-outline" size={14} color={colors.muted} />
                    <Text className="text-muted text-xs ml-1">{post.commentCount}</Text>
                  </View>
                </View>
              </Pressable>
            ))
          )}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
