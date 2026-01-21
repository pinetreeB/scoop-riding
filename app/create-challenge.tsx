import { useState } from "react";
import {
  Text,
  View,
  TextInput,
  Pressable,
  ScrollView,
  Platform,
  Alert,
  KeyboardAvoidingView,
} from "react-native";
import { useRouter } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Haptics from "expo-haptics";

import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";

type ChallengeType = "distance" | "rides" | "duration";

export default function CreateChallengeScreen() {
  const router = useRouter();
  const colors = useColors();
  const utils = trpc.useUtils();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<ChallengeType>("distance");
  const [targetValue, setTargetValue] = useState("");
  const [duration, setDuration] = useState<7 | 14 | 30>(7);
  const [isPublic, setIsPublic] = useState(true);

  const createMutation = trpc.challenges.create.useMutation({
    onSuccess: () => {
      utils.challenges.list.invalidate();
      utils.challenges.mine.invalidate();
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      router.back();
    },
    onError: (error) => {
      Alert.alert("오류", error.message || "챌린지 생성에 실패했습니다.");
    },
  });

  const handleCreate = () => {
    if (!title.trim()) {
      Alert.alert("알림", "챌린지 제목을 입력해주세요.");
      return;
    }

    const target = parseFloat(targetValue);
    if (isNaN(target) || target <= 0) {
      Alert.alert("알림", "올바른 목표 값을 입력해주세요.");
      return;
    }

    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }

    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + duration);

    createMutation.mutate({
      title: title.trim(),
      description: description.trim() || undefined,
      type,
      targetValue: target,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      isPublic,
    });
  };

  const getTypeLabel = (t: ChallengeType) => {
    switch (t) {
      case "distance":
        return "거리 (km)";
      case "rides":
        return "주행 횟수";
      case "duration":
        return "시간 (분)";
    }
  };

  const getTypePlaceholder = (t: ChallengeType) => {
    switch (t) {
      case "distance":
        return "예: 100";
      case "rides":
        return "예: 20";
      case "duration":
        return "예: 300";
    }
  };

  return (
    <ScreenContainer>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1"
      >
        {/* Header */}
        <View className="flex-row items-center justify-between px-5 py-4 border-b border-border">
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
          >
            <MaterialIcons name="close" size={24} color={colors.foreground} />
          </Pressable>
          <Text className="text-lg font-bold text-foreground">새 챌린지</Text>
          <Pressable
            onPress={handleCreate}
            disabled={createMutation.isPending}
            style={({ pressed }) => [{ opacity: pressed || createMutation.isPending ? 0.5 : 1 }]}
          >
            <Text className="text-primary font-bold">
              {createMutation.isPending ? "생성 중..." : "생성"}
            </Text>
          </Pressable>
        </View>

        <ScrollView className="flex-1 px-5 py-4">
          {/* Title */}
          <View className="mb-5">
            <Text className="text-foreground font-medium mb-2">챌린지 제목 *</Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="예: 이번 주 100km 달성하기"
              placeholderTextColor={colors.muted}
              className="bg-surface border border-border rounded-xl px-4 py-3 text-foreground"
              maxLength={200}
            />
          </View>

          {/* Description */}
          <View className="mb-5">
            <Text className="text-foreground font-medium mb-2">설명 (선택)</Text>
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="챌린지에 대한 설명을 입력하세요"
              placeholderTextColor={colors.muted}
              className="bg-surface border border-border rounded-xl px-4 py-3 text-foreground"
              multiline
              numberOfLines={3}
              textAlignVertical="top"
              style={{ minHeight: 80 }}
              maxLength={1000}
            />
          </View>

          {/* Type */}
          <View className="mb-5">
            <Text className="text-foreground font-medium mb-2">챌린지 유형 *</Text>
            <View className="flex-row">
              {(["distance", "rides", "duration"] as ChallengeType[]).map((t) => (
                <Pressable
                  key={t}
                  onPress={() => setType(t)}
                  style={({ pressed }) => [
                    {
                      opacity: pressed ? 0.7 : 1,
                      backgroundColor: type === t ? colors.primary : colors.surface,
                      borderColor: type === t ? colors.primary : colors.border,
                    },
                  ]}
                  className="flex-1 py-3 rounded-xl border items-center mx-1"
                >
                  <MaterialIcons
                    name={t === "distance" ? "straighten" : t === "rides" ? "repeat" : "timer"}
                    size={20}
                    color={type === t ? "#FFFFFF" : colors.muted}
                  />
                  <Text
                    className="text-xs mt-1 font-medium"
                    style={{ color: type === t ? "#FFFFFF" : colors.muted }}
                  >
                    {t === "distance" ? "거리" : t === "rides" ? "횟수" : "시간"}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Target Value */}
          <View className="mb-5">
            <Text className="text-foreground font-medium mb-2">{getTypeLabel(type)} *</Text>
            <TextInput
              value={targetValue}
              onChangeText={setTargetValue}
              placeholder={getTypePlaceholder(type)}
              placeholderTextColor={colors.muted}
              className="bg-surface border border-border rounded-xl px-4 py-3 text-foreground"
              keyboardType="numeric"
            />
          </View>

          {/* Duration */}
          <View className="mb-5">
            <Text className="text-foreground font-medium mb-2">기간 *</Text>
            <View className="flex-row">
              {([7, 14, 30] as const).map((d) => (
                <Pressable
                  key={d}
                  onPress={() => setDuration(d)}
                  style={({ pressed }) => [
                    {
                      opacity: pressed ? 0.7 : 1,
                      backgroundColor: duration === d ? colors.primary : colors.surface,
                      borderColor: duration === d ? colors.primary : colors.border,
                    },
                  ]}
                  className="flex-1 py-3 rounded-xl border items-center mx-1"
                >
                  <Text
                    className="font-medium"
                    style={{ color: duration === d ? "#FFFFFF" : colors.foreground }}
                  >
                    {d}일
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Public Toggle */}
          <View className="mb-5">
            <Pressable
              onPress={() => setIsPublic(!isPublic)}
              className="flex-row items-center justify-between bg-surface border border-border rounded-xl px-4 py-3"
            >
              <View className="flex-row items-center">
                <MaterialIcons
                  name={isPublic ? "public" : "lock"}
                  size={24}
                  color={colors.primary}
                />
                <View className="ml-3">
                  <Text className="text-foreground font-medium">
                    {isPublic ? "공개 챌린지" : "비공개 챌린지"}
                  </Text>
                  <Text className="text-muted text-sm">
                    {isPublic
                      ? "모든 사용자가 참여할 수 있습니다"
                      : "초대된 사용자만 참여할 수 있습니다"}
                  </Text>
                </View>
              </View>
              <View
                className="w-12 h-7 rounded-full justify-center"
                style={{
                  backgroundColor: isPublic ? colors.primary : colors.border,
                }}
              >
                <View
                  className="w-5 h-5 rounded-full bg-white"
                  style={{
                    marginLeft: isPublic ? 24 : 4,
                  }}
                />
              </View>
            </Pressable>
          </View>

          {/* Info */}
          <View className="bg-surface border border-border rounded-xl p-4 mb-5">
            <View className="flex-row items-start">
              <MaterialIcons name="info" size={20} color={colors.primary} />
              <Text className="text-muted text-sm ml-2 flex-1">
                챌린지를 생성하면 자동으로 참여됩니다. 주행 기록이 자동으로 진행도에 반영됩니다.
              </Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}
