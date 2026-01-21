import { useState, useCallback } from "react";
import {
  Text,
  View,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
  KeyboardAvoidingView,
} from "react-native";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Haptics from "expo-haptics";

import { ScreenContainer } from "@/components/screen-container";
import { RoutePreview } from "@/components/route-preview";
import { useColors } from "@/hooks/use-colors";
import { useAuth } from "@/hooks/use-auth";
import { trpc } from "@/lib/trpc";
import { getRidingRecordWithGps, formatDuration, type RidingRecord } from "@/lib/riding-store";

const POST_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  general: { label: "일반", color: "#6B7280" },
  ride_share: { label: "주행기록", color: "#3B82F6" },
  question: { label: "질문", color: "#F59E0B" },
  tip: { label: "팁", color: "#10B981" },
};

export default function PostDetailScreen() {
  const colors = useColors();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { isAuthenticated, user } = useAuth();

  const [commentText, setCommentText] = useState("");
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [attachedRide, setAttachedRide] = useState<RidingRecord | null>(null);

  const trpcUtils = trpc.useUtils();

  const postQuery = trpc.community.getPost.useQuery(
    { id: parseInt(id || "0") },
    { enabled: !!id && isAuthenticated }
  );

  const commentsQuery = trpc.community.getComments.useQuery(
    { postId: parseInt(id || "0") },
    { enabled: !!id && isAuthenticated }
  );

  const toggleLikeMutation = trpc.community.toggleLike.useMutation({
    onSuccess: () => {
      postQuery.refetch();
    },
  });

  const createCommentMutation = trpc.community.createComment.useMutation({
    onSuccess: () => {
      setCommentText("");
      commentsQuery.refetch();
      postQuery.refetch();
    },
    onError: (error) => {
      Alert.alert("오류", error.message || "댓글 작성에 실패했습니다.");
    },
  });

  const deletePostMutation = trpc.community.deletePost.useMutation({
    onSuccess: () => {
      trpcUtils.community.getPosts.invalidate();
      router.back();
    },
  });

  const deleteCommentMutation = trpc.community.deleteComment.useMutation({
    onSuccess: () => {
      commentsQuery.refetch();
      postQuery.refetch();
    },
  });

  // Load attached ride if exists
  useFocusEffect(
    useCallback(() => {
      if (postQuery.data?.ridingRecordId) {
        getRidingRecordWithGps(postQuery.data.ridingRecordId).then(setAttachedRide);
      }
    }, [postQuery.data?.ridingRecordId])
  );

  const handleLike = () => {
    if (!id) return;
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    toggleLikeMutation.mutate({ postId: parseInt(id) });
  };

  const handleSubmitComment = async () => {
    if (!commentText.trim() || !id) return;

    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    setIsSubmittingComment(true);
    try {
      await createCommentMutation.mutateAsync({
        postId: parseInt(id),
        content: commentText.trim(),
      });
    } finally {
      setIsSubmittingComment(false);
    }
  };

  const handleDeletePost = () => {
    Alert.alert("삭제 확인", "이 글을 삭제하시겠습니까?", [
      { text: "취소", style: "cancel" },
      {
        text: "삭제",
        style: "destructive",
        onPress: () => {
          if (id) {
            deletePostMutation.mutate({ id: parseInt(id) });
          }
        },
      },
    ]);
  };

  const handleDeleteComment = (commentId: number) => {
    Alert.alert("삭제 확인", "이 댓글을 삭제하시겠습니까?", [
      { text: "취소", style: "cancel" },
      {
        text: "삭제",
        style: "destructive",
        onPress: () => {
          deleteCommentMutation.mutate({ id: commentId });
        },
      },
    ]);
  };

  const formatDate = (date: Date | string) => {
    const d = new Date(date);
    return d.toLocaleDateString("ko-KR", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getAuthorName = (item: any) => {
    if (item.authorName) return item.authorName;
    if (item.authorEmail) return item.authorEmail.split("@")[0];
    return "익명";
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

  if (postQuery.isLoading) {
    return (
      <ScreenContainer>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </ScreenContainer>
    );
  }

  const post = postQuery.data;
  if (!post) {
    return (
      <ScreenContainer>
        <View className="flex-1 items-center justify-center p-6">
          <MaterialIcons name="error-outline" size={64} color={colors.muted} />
          <Text className="text-xl font-bold text-foreground mt-4">게시글을 찾을 수 없습니다</Text>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [
              { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 },
            ]}
            className="mt-6 px-8 py-3 rounded-xl"
          >
            <Text className="text-white font-bold">돌아가기</Text>
          </Pressable>
        </View>
      </ScreenContainer>
    );
  }

  const typeInfo = POST_TYPE_LABELS[post.postType] || POST_TYPE_LABELS.general;
  const isAuthor = user?.id === post.userId;

  return (
    <ScreenContainer edges={["top", "left", "right", "bottom"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1"
      >
        {/* Header */}
        <View className="flex-row items-center px-5 pt-4 pb-3 border-b border-border">
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
            className="mr-3 p-1"
          >
            <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
          </Pressable>
          <Text className="text-lg font-bold text-foreground flex-1">게시글</Text>
          {isAuthor && (
            <Pressable
              onPress={handleDeletePost}
              style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
              className="p-1"
            >
              <MaterialIcons name="delete-outline" size={24} color={colors.error} />
            </Pressable>
          )}
        </View>

        <ScrollView className="flex-1" keyboardShouldPersistTaps="handled">
          {/* Post Content */}
          <View className="px-5 py-4">
            {/* Type Badge */}
            <View
              className="self-start px-2 py-1 rounded-full mb-3"
              style={{ backgroundColor: typeInfo.color + "20" }}
            >
              <Text style={{ color: typeInfo.color }} className="text-xs font-medium">
                {typeInfo.label}
              </Text>
            </View>

            {/* Title */}
            <Text className="text-xl font-bold text-foreground mb-2">{post.title}</Text>

            {/* Author & Date */}
            <View className="flex-row items-center mb-4">
              <View className="w-8 h-8 rounded-full bg-primary/20 items-center justify-center mr-2">
                <MaterialIcons name="person" size={18} color={colors.primary} />
              </View>
              <View className="flex-1">
                <Text className="text-foreground font-medium">{getAuthorName(post)}</Text>
                <Text className="text-muted text-xs">{formatDate(post.createdAt)}</Text>
              </View>
            </View>

            {/* Content */}
            <Text className="text-foreground text-base leading-6 mb-4">{post.content}</Text>

            {/* Attached Ride with Route Preview */}
            {attachedRide && (
              <Pressable
                onPress={() => router.push(`/ride-detail?id=${attachedRide.id}` as any)}
                style={({ pressed }) => [{ opacity: pressed ? 0.9 : 1 }]}
              >
                <View className="bg-surface rounded-xl p-4 border border-border mb-4 overflow-hidden">
                  <View className="flex-row items-center mb-3">
                    <MaterialIcons name="route" size={20} color={colors.primary} />
                    <Text className="text-primary font-medium ml-2">첨부된 주행 기록</Text>
                  </View>
                  
                  {/* Route Preview Map */}
                  {attachedRide.gpsPoints && attachedRide.gpsPoints.length > 1 && (
                    <View className="mb-3 rounded-lg overflow-hidden">
                      <RoutePreview
                        gpsPoints={attachedRide.gpsPoints}
                        height={120}
                        width={undefined}
                      />
                    </View>
                  )}
                  
                  <Text className="text-foreground font-medium" numberOfLines={1}>{attachedRide.date}</Text>
                  <Text className="text-muted text-sm" numberOfLines={1}>
                    {(attachedRide.distance / 1000).toFixed(2)}km • {formatDuration(attachedRide.duration)} • 평균 {attachedRide.avgSpeed.toFixed(1)}km/h
                  </Text>
                </View>
              </Pressable>
            )}

            {/* Stats */}
            <View className="flex-row items-center py-3 border-t border-b border-border">
              <Pressable
                onPress={handleLike}
                style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
                className="flex-row items-center mr-6"
              >
                <MaterialIcons
                  name={post.isLiked ? "favorite" : "favorite-border"}
                  size={22}
                  color={post.isLiked ? colors.error : colors.muted}
                />
                <Text className="text-muted ml-1">{post.likeCount}</Text>
              </Pressable>
              <View className="flex-row items-center mr-6">
                <MaterialIcons name="chat-bubble-outline" size={22} color={colors.muted} />
                <Text className="text-muted ml-1">{post.commentCount}</Text>
              </View>
              <View className="flex-row items-center">
                <MaterialIcons name="visibility" size={22} color={colors.muted} />
                <Text className="text-muted ml-1">{post.viewCount}</Text>
              </View>
            </View>
          </View>

          {/* Comments Section */}
          <View className="px-5 py-4">
            <Text className="text-lg font-bold text-foreground mb-4">
              댓글 {commentsQuery.data?.length || 0}
            </Text>

            {commentsQuery.isLoading ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : commentsQuery.data?.length === 0 ? (
              <View className="items-center py-8">
                <MaterialIcons name="chat-bubble-outline" size={32} color={colors.muted} />
                <Text className="text-muted mt-2">아직 댓글이 없습니다</Text>
              </View>
            ) : (
              commentsQuery.data?.map((comment: any) => (
                <View key={comment.id} className="mb-4">
                  <View className="flex-row items-start">
                    <View className="w-8 h-8 rounded-full bg-surface items-center justify-center mr-2">
                      <MaterialIcons name="person" size={18} color={colors.muted} />
                    </View>
                    <View className="flex-1">
                      <View className="flex-row items-center">
                        <Text className="text-foreground font-medium text-sm">
                          {getAuthorName(comment)}
                        </Text>
                        <Text className="text-muted text-xs ml-2">
                          {formatDate(comment.createdAt)}
                        </Text>
                        {user?.id === comment.userId && (
                          <Pressable
                            onPress={() => handleDeleteComment(comment.id)}
                            style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
                            className="ml-auto p-1"
                          >
                            <MaterialIcons name="close" size={16} color={colors.muted} />
                          </Pressable>
                        )}
                      </View>
                      <Text className="text-foreground text-sm mt-1">{comment.content}</Text>
                    </View>
                  </View>
                </View>
              ))
            )}
          </View>

          {/* Spacer for input */}
          <View className="h-20" />
        </ScrollView>

        {/* Comment Input */}
        <View
          className="absolute bottom-0 left-0 right-0 bg-background border-t border-border px-4 py-3"
          style={{ paddingBottom: Platform.OS === "ios" ? 34 : 16 }}
        >
          <View className="flex-row items-center">
            <TextInput
              value={commentText}
              onChangeText={setCommentText}
              placeholder="댓글을 입력하세요..."
              placeholderTextColor={colors.muted}
              className="flex-1 bg-surface rounded-full px-4 py-2 mr-2 text-foreground"
              style={{ color: colors.foreground }}
              returnKeyType="send"
              onSubmitEditing={handleSubmitComment}
            />
            <Pressable
              onPress={handleSubmitComment}
              disabled={isSubmittingComment || !commentText.trim()}
              style={({ pressed }) => [
                {
                  backgroundColor: colors.primary,
                  opacity: isSubmittingComment || !commentText.trim() ? 0.5 : pressed ? 0.8 : 1,
                },
              ]}
              className="w-10 h-10 rounded-full items-center justify-center"
            >
              {isSubmittingComment ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <MaterialIcons name="send" size={20} color="#FFFFFF" />
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}
