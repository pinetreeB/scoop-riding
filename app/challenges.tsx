import { useState, useCallback } from "react";
import {
  Text,
  View,
  FlatList,
  Pressable,
  RefreshControl,
  Platform,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Haptics from "expo-haptics";

import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";

interface ChallengeItem {
  id: number;
  title: string;
  description: string | null;
  type: string;
  targetValue: string;
  startDate: Date;
  endDate: Date;
  isPublic: boolean;
  creatorName: string | null;
  participantCount: number;
  userProgress?: number;
  userCompleted?: boolean;
}

export default function ChallengesScreen() {
  const router = useRouter();
  const colors = useColors();
  const utils = trpc.useUtils();
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<"all" | "mine">("all");

  const { data: publicChallenges, refetch: refetchPublic } = trpc.challenges.list.useQuery();
  const { data: myChallenges, refetch: refetchMine } = trpc.challenges.mine.useQuery();

  const joinMutation = trpc.challenges.join.useMutation({
    onSuccess: () => {
      utils.challenges.list.invalidate();
      utils.challenges.mine.invalidate();
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    },
  });

  useFocusEffect(
    useCallback(() => {
      refetchPublic();
      refetchMine();
    }, [refetchPublic, refetchMine])
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refetchPublic(), refetchMine()]);
    setRefreshing(false);
  };

  const handleJoin = (challengeId: number) => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    joinMutation.mutate({ challengeId });
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case "distance":
        return "거리";
      case "rides":
        return "주행 횟수";
      case "duration":
        return "시간";
      default:
        return type;
    }
  };

  const getTypeUnit = (type: string) => {
    switch (type) {
      case "distance":
        return "km";
      case "rides":
        return "회";
      case "duration":
        return "분";
      default:
        return "";
    }
  };

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString("ko-KR", {
      month: "short",
      day: "numeric",
    });
  };

  const getDaysRemaining = (endDate: Date) => {
    const now = new Date();
    const end = new Date(endDate);
    const diff = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (diff < 0) return "종료됨";
    if (diff === 0) return "오늘 마감";
    return `${diff}일 남음`;
  };

  const renderChallenge = ({ item }: { item: ChallengeItem }) => {
    const targetValue = parseFloat(item.targetValue);
    const progress = item.userProgress || 0;
    const progressPercent = Math.min((progress / targetValue) * 100, 100);
    const isJoined = item.userProgress !== undefined;

    return (
      <Pressable
        onPress={() => router.push(`/challenge-detail?id=${item.id}` as never)}
        style={({ pressed }) => [{ opacity: pressed ? 0.8 : 1 }]}
        className="mx-4 mb-4 bg-surface rounded-2xl p-4 border border-border"
      >
        {/* Header */}
        <View className="flex-row items-start justify-between mb-3">
          <View className="flex-1 mr-3">
            <Text className="text-lg font-bold text-foreground" numberOfLines={2}>
              {item.title}
            </Text>
            {item.creatorName && (
              <Text className="text-muted text-sm mt-1">
                by {item.creatorName}
              </Text>
            )}
          </View>
          <View
            className="px-3 py-1 rounded-full"
            style={{ backgroundColor: colors.primary + "20" }}
          >
            <Text className="text-primary text-xs font-medium">
              {getTypeLabel(item.type)}
            </Text>
          </View>
        </View>

        {/* Description */}
        {item.description && (
          <Text className="text-muted text-sm mb-3" numberOfLines={2}>
            {item.description}
          </Text>
        )}

        {/* Target */}
        <View className="flex-row items-center mb-3">
          <MaterialIcons name="flag" size={18} color={colors.primary} />
          <Text className="text-foreground font-medium ml-2">
            목표: {targetValue.toLocaleString()} {getTypeUnit(item.type)}
          </Text>
        </View>

        {/* Progress (if joined) */}
        {isJoined && (
          <View className="mb-3">
            <View className="flex-row justify-between mb-1">
              <Text className="text-muted text-xs">
                {progress.toFixed(1)} / {targetValue.toLocaleString()} {getTypeUnit(item.type)}
              </Text>
              <Text className="text-muted text-xs">{progressPercent.toFixed(0)}%</Text>
            </View>
            <View className="h-2 bg-border rounded-full overflow-hidden">
              <View
                className="h-full rounded-full"
                style={{
                  backgroundColor: item.userCompleted ? colors.success : colors.primary,
                  width: `${progressPercent}%`,
                }}
              />
            </View>
          </View>
        )}

        {/* Footer */}
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center">
            <MaterialIcons name="people" size={16} color={colors.muted} />
            <Text className="text-muted text-sm ml-1">{item.participantCount}명 참여</Text>
            <Text className="text-muted text-sm mx-2">•</Text>
            <Text className="text-muted text-sm">
              {formatDate(item.startDate)} ~ {formatDate(item.endDate)}
            </Text>
          </View>
          <Text
            className="text-sm font-medium"
            style={{
              color: getDaysRemaining(item.endDate) === "종료됨" ? colors.muted : colors.primary,
            }}
          >
            {getDaysRemaining(item.endDate)}
          </Text>
        </View>

        {/* Join Button (if not joined) */}
        {!isJoined && activeTab === "all" && (
          <Pressable
            onPress={() => handleJoin(item.id)}
            style={({ pressed }) => [
              {
                opacity: pressed ? 0.8 : 1,
                backgroundColor: colors.primary,
              },
            ]}
            className="mt-3 py-3 rounded-xl items-center"
          >
            <Text className="text-white font-bold">참여하기</Text>
          </Pressable>
        )}

        {/* Completed Badge */}
        {item.userCompleted && (
          <View className="absolute top-4 right-4 flex-row items-center">
            <MaterialIcons name="check-circle" size={20} color={colors.success} />
          </View>
        )}
      </Pressable>
    );
  };

  const challenges = activeTab === "all" ? publicChallenges : myChallenges;

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
        <Text className="text-lg font-bold text-foreground">챌린지</Text>
        <Pressable
          onPress={() => router.push("/create-challenge" as never)}
          style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
        >
          <MaterialIcons name="add" size={24} color={colors.primary} />
        </Pressable>
      </View>

      {/* Tabs */}
      <View className="flex-row px-4 py-3 border-b border-border">
        <Pressable
          onPress={() => setActiveTab("all")}
          style={({ pressed }) => [
            {
              opacity: pressed ? 0.7 : 1,
              backgroundColor: activeTab === "all" ? colors.primary : "transparent",
            },
          ]}
          className="flex-1 py-2 rounded-lg mr-2 items-center"
        >
          <Text
            className="font-medium"
            style={{ color: activeTab === "all" ? "#FFFFFF" : colors.muted }}
          >
            전체 챌린지
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setActiveTab("mine")}
          style={({ pressed }) => [
            {
              opacity: pressed ? 0.7 : 1,
              backgroundColor: activeTab === "mine" ? colors.primary : "transparent",
            },
          ]}
          className="flex-1 py-2 rounded-lg ml-2 items-center"
        >
          <Text
            className="font-medium"
            style={{ color: activeTab === "mine" ? "#FFFFFF" : colors.muted }}
          >
            내 챌린지
          </Text>
        </Pressable>
      </View>

      {/* Challenges List */}
      <FlatList
        data={challenges || []}
        renderItem={renderChallenge}
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
            <MaterialIcons name="emoji-events" size={64} color={colors.muted} />
            <Text className="text-muted text-lg mt-4">
              {activeTab === "all" ? "진행 중인 챌린지가 없습니다" : "참여 중인 챌린지가 없습니다"}
            </Text>
            {activeTab === "all" && (
              <Pressable
                onPress={() => router.push("/create-challenge" as never)}
                style={({ pressed }) => [
                  {
                    opacity: pressed ? 0.8 : 1,
                    backgroundColor: colors.primary,
                  },
                ]}
                className="mt-4 px-6 py-3 rounded-xl"
              >
                <Text className="text-white font-bold">새 챌린지 만들기</Text>
              </Pressable>
            )}
          </View>
        }
        contentContainerStyle={{ flexGrow: 1, paddingTop: 16 }}
      />
    </ScreenContainer>
  );
}
