import { useState, useCallback } from "react";
import {
  Text,
  View,
  TextInput,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform,
  KeyboardAvoidingView,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Haptics from "expo-haptics";

import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useAuth } from "@/hooks/use-auth";
import { trpc } from "@/lib/trpc";
import { getRidingRecords, type RidingRecord, formatDuration } from "@/lib/riding-store";

const POST_TYPES = [
  { value: "general", label: "일반", icon: "chat-bubble-outline" },
  { value: "ride_share", label: "주행기록", icon: "route" },
  { value: "question", label: "질문", icon: "help-outline" },
  { value: "tip", label: "팁", icon: "lightbulb-outline" },
] as const;

export default function CreatePostScreen() {
  const colors = useColors();
  const router = useRouter();
  const { isAuthenticated } = useAuth();

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [postType, setPostType] = useState<string>("general");
  const [selectedRide, setSelectedRide] = useState<RidingRecord | null>(null);
  const [showRideSelector, setShowRideSelector] = useState(false);
  const [rides, setRides] = useState<RidingRecord[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const trpcUtils = trpc.useUtils();
  const createPostMutation = trpc.community.createPost.useMutation({
    onSuccess: () => {
      trpcUtils.community.getPosts.invalidate();
      router.back();
    },
    onError: (error) => {
      Alert.alert("오류", error.message || "글 작성에 실패했습니다.");
    },
  });

  useFocusEffect(
    useCallback(() => {
      getRidingRecords().then(setRides);
    }, [])
  );

  const handleSubmit = async () => {
    if (!title.trim()) {
      Alert.alert("알림", "제목을 입력해주세요.");
      return;
    }
    if (!content.trim()) {
      Alert.alert("알림", "내용을 입력해주세요.");
      return;
    }

    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }

    setIsSubmitting(true);
    try {
      await createPostMutation.mutateAsync({
        title: title.trim(),
        content: content.trim(),
        postType: postType as any,
        ridingRecordId: selectedRide?.id,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSelectRide = (ride: RidingRecord) => {
    setSelectedRide(ride);
    setShowRideSelector(false);
    if (postType !== "ride_share") {
      setPostType("ride_share");
    }
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

  return (
    <ScreenContainer edges={["top", "left", "right", "bottom"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1"
      >
        {/* Header */}
        <View className="flex-row items-center justify-between px-5 pt-4 pb-3 border-b border-border">
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
            className="p-1"
          >
            <MaterialIcons name="close" size={24} color={colors.foreground} />
          </Pressable>
          <Text className="text-lg font-bold text-foreground">글쓰기</Text>
          <Pressable
            onPress={handleSubmit}
            disabled={isSubmitting || !title.trim() || !content.trim()}
            style={({ pressed }) => [
              {
                backgroundColor: colors.primary,
                opacity: isSubmitting || !title.trim() || !content.trim() ? 0.5 : pressed ? 0.8 : 1,
              },
            ]}
            className="px-4 py-2 rounded-full"
          >
            {isSubmitting ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text className="text-white font-medium">등록</Text>
            )}
          </Pressable>
        </View>

        <ScrollView className="flex-1" keyboardShouldPersistTaps="handled">
          {/* Post Type Selector */}
          <View className="px-5 py-4">
            <Text className="text-muted text-sm mb-2">카테고리</Text>
            <View className="flex-row flex-wrap">
              {POST_TYPES.map((type) => (
                <Pressable
                  key={type.value}
                  onPress={() => setPostType(type.value)}
                  style={({ pressed }) => [
                    {
                      backgroundColor: postType === type.value ? colors.primary : colors.surface,
                      opacity: pressed ? 0.8 : 1,
                    },
                  ]}
                  className="flex-row items-center px-3 py-2 rounded-full mr-2 mb-2 border border-border"
                >
                  <MaterialIcons
                    name={type.icon as any}
                    size={16}
                    color={postType === type.value ? "#FFFFFF" : colors.muted}
                  />
                  <Text
                    className="ml-1 text-sm font-medium"
                    style={{ color: postType === type.value ? "#FFFFFF" : colors.foreground }}
                  >
                    {type.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Title Input */}
          <View className="px-5 pb-4">
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="제목을 입력하세요"
              placeholderTextColor={colors.muted}
              maxLength={200}
              className="text-lg font-semibold text-foreground py-2 border-b border-border"
              style={{ color: colors.foreground }}
            />
          </View>

          {/* Content Input */}
          <View className="px-5 pb-4">
            <TextInput
              value={content}
              onChangeText={setContent}
              placeholder="내용을 입력하세요"
              placeholderTextColor={colors.muted}
              multiline
              textAlignVertical="top"
              className="text-base text-foreground min-h-[200px]"
              style={{ color: colors.foreground }}
            />
          </View>

          {/* Attach Ride Record */}
          <View className="px-5 pb-4">
            <Text className="text-muted text-sm mb-2">주행 기록 첨부 (선택)</Text>
            
            {selectedRide ? (
              <View className="bg-surface rounded-xl p-4 border border-border">
                <View className="flex-row items-center justify-between">
                  <View className="flex-1">
                    <Text className="text-foreground font-medium">{selectedRide.date}</Text>
                    <Text className="text-muted text-sm">
                      {(selectedRide.distance / 1000).toFixed(2)}km • {formatDuration(selectedRide.duration)} • 평균 {selectedRide.avgSpeed.toFixed(1)}km/h
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => setSelectedRide(null)}
                    style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
                    className="p-2"
                  >
                    <MaterialIcons name="close" size={20} color={colors.muted} />
                  </Pressable>
                </View>
              </View>
            ) : (
              <Pressable
                onPress={() => setShowRideSelector(true)}
                style={({ pressed }) => [
                  { backgroundColor: colors.surface, opacity: pressed ? 0.8 : 1 },
                ]}
                className="flex-row items-center justify-center py-4 rounded-xl border border-dashed border-border"
              >
                <MaterialIcons name="add" size={20} color={colors.muted} />
                <Text className="text-muted ml-2">주행 기록 선택</Text>
              </Pressable>
            )}
          </View>
        </ScrollView>

        {/* Ride Selector Modal */}
        {showRideSelector && (
          <View className="absolute inset-0 bg-black/50">
            <Pressable
              className="flex-1"
              onPress={() => setShowRideSelector(false)}
            />
            <View
              className="bg-background rounded-t-3xl max-h-[60%]"
              style={{ paddingBottom: 34 }}
            >
              <View className="flex-row items-center justify-between px-5 py-4 border-b border-border">
                <Text className="text-lg font-bold text-foreground">주행 기록 선택</Text>
                <Pressable
                  onPress={() => setShowRideSelector(false)}
                  style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
                >
                  <MaterialIcons name="close" size={24} color={colors.foreground} />
                </Pressable>
              </View>
              <ScrollView className="max-h-[400px]">
                {rides.length === 0 ? (
                  <View className="items-center py-10">
                    <MaterialIcons name="route" size={48} color={colors.muted} />
                    <Text className="text-muted mt-2">주행 기록이 없습니다</Text>
                  </View>
                ) : (
                  rides.slice(0, 20).map((ride) => (
                    <Pressable
                      key={ride.id}
                      onPress={() => handleSelectRide(ride)}
                      style={({ pressed }) => [{ opacity: pressed ? 0.8 : 1 }]}
                      className="px-5 py-4 border-b border-border"
                    >
                      <Text className="text-foreground font-medium">{ride.date}</Text>
                      <Text className="text-muted text-sm">
                        {(ride.distance / 1000).toFixed(2)}km • {formatDuration(ride.duration)} • 평균 {ride.avgSpeed.toFixed(1)}km/h
                      </Text>
                    </Pressable>
                  ))
                )}
              </ScrollView>
            </View>
          </View>
        )}
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}
