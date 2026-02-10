import { useState, useCallback } from "react";
import {
  Text,
  View,
  FlatList,
  Pressable,
  RefreshControl,
  Platform,
  Modal,
  ScrollView,
} from "react-native";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Haptics from "expo-haptics";

import { ScreenContainer } from "@/components/screen-container";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";

export default function ChallengeDetailScreen() {
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const challengeId = parseInt(id || "0");
  const utils = trpc.useUtils();
  const [refreshing, setRefreshing] = useState(false);

  const { data: challenges } = trpc.challenges.list.useQuery();
  const { data: myChallenges } = trpc.challenges.mine.useQuery();
  const { data: leaderboard, refetch: refetchLeaderboard } = trpc.challenges.leaderboard.useQuery(
    { challengeId },
    { enabled: challengeId > 0 }
  );

  const joinMutation = trpc.challenges.join.useMutation({
    onSuccess: () => {
      utils.challenges.list.invalidate();
      utils.challenges.mine.invalidate();
      refetchLeaderboard();
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    },
  });

  const inviteMutation = trpc.challenges.invite.useMutation({
    onSuccess: () => {
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      setShowInviteModal(false);
    },
  });

  // Get friends list for invitation
  const { data: friendsList } = trpc.friends.getFriends.useQuery();
  const [showInviteModal, setShowInviteModal] = useState(false);

  useFocusEffect(
    useCallback(() => {
      refetchLeaderboard();
    }, [refetchLeaderboard])
  );

  const challenge = challenges?.find((c) => c.id === challengeId) ||
    myChallenges?.find((c) => c.id === challengeId);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refetchLeaderboard();
    setRefreshing(false);
  };

  const handleJoin = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    joinMutation.mutate({ challengeId });
  };

  if (!challenge) {
    return (
      <ScreenContainer>
        <View className="flex-1 items-center justify-center">
          <MaterialIcons name="error" size={64} color={colors.muted} />
          <Text className="text-muted text-lg mt-4">챌린지를 찾을 수 없습니다</Text>
        </View>
      </ScreenContainer>
    );
  }

  const targetValue = parseFloat(challenge.targetValue);
  const progress = challenge.userProgress || 0;
  const progressPercent = Math.min((progress / targetValue) * 100, 100);
  const isJoined = challenge.userProgress !== undefined;

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
      year: "numeric",
      month: "long",
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

  const renderLeaderboardItem = ({
    item,
    index,
  }: {
    item: { userId: number; name: string | null; progress: number; isCompleted: boolean; rank: number };
    index: number;
  }) => {
    const getMedalColor = (rank: number) => {
      switch (rank) {
        case 1:
          return "#FFD700";
        case 2:
          return "#C0C0C0";
        case 3:
          return "#CD7F32";
        default:
          return colors.muted;
      }
    };

    return (
      <View className="flex-row items-center py-3 border-b border-border">
        {/* Rank */}
        <View className="w-10 items-center">
          {item.rank <= 3 ? (
            <MaterialIcons name="emoji-events" size={24} color={getMedalColor(item.rank)} />
          ) : (
            <Text className="text-muted font-bold">{item.rank}</Text>
          )}
        </View>

        {/* Name */}
        <View className="flex-1 ml-3">
          <Text className="text-foreground font-medium">
            {item.name || "익명 라이더"}
          </Text>
          {item.isCompleted && (
            <View className="flex-row items-center mt-1">
              <MaterialIcons name="check-circle" size={14} color={colors.success} />
              <Text className="text-success text-xs ml-1">완료!</Text>
            </View>
          )}
        </View>

        {/* Progress */}
        <Text className="text-foreground font-bold">
          {item.progress.toFixed(1)} {getTypeUnit(challenge.type)}
        </Text>
      </View>
    );
  };

  return (
    <ScreenContainer>
      {/* Header */}
      <View className="flex-row items-center px-5 py-4 border-b border-border">
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
        >
          <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
        </Pressable>
        <Text className="text-lg font-bold text-foreground ml-4 flex-1" numberOfLines={1}>
          {challenge.title}
        </Text>
      </View>

      <FlatList
        data={leaderboard || []}
        renderItem={renderLeaderboardItem}
        keyExtractor={(item) => item.userId.toString()}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
          />
        }
        ListHeaderComponent={
          <View className="px-5 py-4">
            {/* Challenge Info Card */}
            <View className="bg-surface rounded-2xl p-5 border border-border mb-4">
              {/* Type Badge */}
              <View className="flex-row items-center justify-between mb-3">
                <View
                  className="px-3 py-1 rounded-full"
                  style={{ backgroundColor: colors.primary + "20" }}
                >
                  <Text className="text-primary text-sm font-medium">
                    {getTypeLabel(challenge.type)}
                  </Text>
                </View>
                <Text
                  className="font-medium"
                  style={{
                    color:
                      getDaysRemaining(challenge.endDate) === "종료됨"
                        ? colors.muted
                        : colors.primary,
                  }}
                >
                  {getDaysRemaining(challenge.endDate)}
                </Text>
              </View>

              {/* Description */}
              {challenge.description && (
                <Text className="text-muted mb-4">{challenge.description}</Text>
              )}

              {/* Target */}
              <View className="flex-row items-center mb-4">
                <MaterialIcons name="flag" size={20} color={colors.primary} />
                <Text className="text-foreground font-medium ml-2">
                  목표: {targetValue.toLocaleString()} {getTypeUnit(challenge.type)}
                </Text>
              </View>

              {/* Progress (if joined) */}
              {isJoined && (
                <View className="mb-4">
                  <View className="flex-row justify-between mb-2">
                    <Text className="text-foreground font-medium">내 진행도</Text>
                    <Text className="text-primary font-bold">{progressPercent.toFixed(0)}%</Text>
                  </View>
                  <View className="h-3 bg-border rounded-full overflow-hidden">
                    <View
                      className="h-full rounded-full"
                      style={{
                        backgroundColor: challenge.userCompleted ? colors.success : colors.primary,
                        width: `${progressPercent}%`,
                      }}
                    />
                  </View>
                  <Text className="text-muted text-sm mt-2">
                    {progress.toFixed(1)} / {targetValue.toLocaleString()} {getTypeUnit(challenge.type)}
                  </Text>
                </View>
              )}

              {/* Period */}
              <View className="flex-row items-center">
                <MaterialIcons name="date-range" size={18} color={colors.muted} />
                <Text className="text-muted text-sm ml-2">
                  {formatDate(challenge.startDate)} ~ {formatDate(challenge.endDate)}
                </Text>
              </View>

              {/* Creator */}
              {challenge.creatorName && (
                <View className="flex-row items-center mt-2">
                  <MaterialIcons name="person" size={18} color={colors.muted} />
                  <Text className="text-muted text-sm ml-2">
                    주최: {challenge.creatorName}
                  </Text>
                </View>
              )}
            </View>

            {/* Join Button */}
            {!isJoined && (
              <Pressable
                onPress={handleJoin}
                disabled={joinMutation.isPending}
                style={({ pressed }) => [
                  {
                    opacity: pressed || joinMutation.isPending ? 0.8 : 1,
                    backgroundColor: colors.primary,
                  },
                ]}
                className="py-4 rounded-xl items-center mb-4"
              >
                <Text className="text-white font-bold text-lg">
                  {joinMutation.isPending ? "참여 중..." : "챌린지 참여하기"}
                </Text>
              </Pressable>
            )}

            {/* Invite Friends Button */}
            {isJoined && (
              <Pressable
                onPress={() => setShowInviteModal(true)}
                style={({ pressed }) => [
                  {
                    opacity: pressed ? 0.8 : 1,
                    backgroundColor: colors.surface,
                    borderWidth: 1,
                    borderColor: colors.primary,
                  },
                ]}
                className="py-4 rounded-xl items-center mb-4 flex-row justify-center"
              >
                <MaterialIcons name="person-add" size={20} color={colors.primary} />
                <Text className="text-primary font-bold text-lg ml-2">
                  친구 초대하기
                </Text>
              </Pressable>
            )}

            {/* Completed Badge */}
            {challenge.userCompleted && (
              <View
                className="flex-row items-center justify-center py-4 rounded-xl mb-4"
                style={{ backgroundColor: colors.success + "20" }}
              >
                <MaterialIcons name="emoji-events" size={24} color={colors.success} />
                <Text className="text-success font-bold text-lg ml-2">챌린지 완료!</Text>
              </View>
            )}

            {/* Leaderboard Header */}
            <View className="flex-row items-center mt-2 mb-2">
              <MaterialIcons name="leaderboard" size={20} color={colors.foreground} />
              <Text className="text-foreground font-bold text-lg ml-2">리더보드</Text>
            </View>
          </View>
        }
        ListEmptyComponent={
          <View className="items-center py-10">
            <MaterialIcons name="people" size={48} color={colors.muted} />
            <Text className="text-muted mt-2">아직 참여자가 없습니다</Text>
          </View>
        }
        contentContainerStyle={{ paddingBottom: 100 }}
      />

      {/* Invite Friends Modal */}
      <Modal
        visible={showInviteModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowInviteModal(false)}
      >
        <View className="flex-1 justify-end" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
          <View
            className="rounded-t-3xl p-5"
            style={{ backgroundColor: colors.background, maxHeight: "70%", paddingBottom: Math.max(20, insets.bottom + 16) }}
          >
            {/* Modal Header */}
            <View className="flex-row items-center justify-between mb-4">
              <Text className="text-xl font-bold text-foreground">친구 초대</Text>
              <Pressable
                onPress={() => setShowInviteModal(false)}
                style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
              >
                <MaterialIcons name="close" size={24} color={colors.foreground} />
              </Pressable>
            </View>

            <Text className="text-muted mb-4">
              친구를 선택하여 이 챌린지에 초대하세요
            </Text>

            {/* Friends List */}
            <ScrollView style={{ maxHeight: 400 }}>
              {friendsList && friendsList.length > 0 ? (
                friendsList.map((friend) => (
                  <View
                    key={friend.id}
                    className="flex-row items-center py-3 border-b border-border"
                  >
                    {/* Avatar */}
                    <View
                      className="w-10 h-10 rounded-full items-center justify-center mr-3"
                      style={{ backgroundColor: colors.primary }}
                    >
                      <Text className="text-white font-bold">
                        {(friend.name || "?")[0].toUpperCase()}
                      </Text>
                    </View>

                    {/* Name */}
                    <Text className="text-foreground font-medium flex-1">
                      {friend.name || "익명"}
                    </Text>

                    {/* Invite Button */}
                    <Pressable
                      onPress={() => {
                        if (Platform.OS !== "web") {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        }
                        inviteMutation.mutate({
                          challengeId,
                          inviteeId: friend.id,
                        });
                      }}
                      disabled={inviteMutation.isPending}
                      style={({ pressed }) => [
                        {
                          opacity: pressed || inviteMutation.isPending ? 0.7 : 1,
                          backgroundColor: colors.primary,
                        },
                      ]}
                      className="px-4 py-2 rounded-full"
                    >
                      <Text className="text-white font-medium">초대</Text>
                    </Pressable>
                  </View>
                ))
              ) : (
                <View className="items-center py-10">
                  <MaterialIcons name="people" size={48} color={colors.muted} />
                  <Text className="text-muted mt-2">친구가 없습니다</Text>
                  <Text className="text-muted text-sm mt-1">
                    먼저 친구를 추가해보세요
                  </Text>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}
