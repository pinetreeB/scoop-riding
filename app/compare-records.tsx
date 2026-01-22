import { useState, useEffect } from "react";
import {
  Text,
  View,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";

import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";

interface FriendStats {
  userId: number;
  name: string | null;
  profileImageUrl: string | null;
  totalDistance: number;
  totalRides: number;
  totalDuration: number;
  avgSpeed: number;
}

export default function CompareRecordsScreen() {
  const colors = useColors();
  const router = useRouter();
  
  const [selectedFriendId, setSelectedFriendId] = useState<number | null>(null);

  // Get friends list
  const friendsQuery = trpc.friends.getFriends.useQuery();
  
  // Get my stats from server
  const myStatsQuery = trpc.friends.getMyStats.useQuery();
  
  // Get selected friend's stats from server
  const friendStatsQuery = trpc.friends.getFriendStats.useQuery(
    { friendId: selectedFriendId! },
    { enabled: selectedFriendId !== null }
  );

  const selectFriend = (friendId: number) => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setSelectedFriendId(friendId);
  };

  const formatDistance = (meters: number) => {
    const km = meters / 1000;
    return km >= 1 ? `${km.toFixed(1)} km` : `${Math.round(meters)} m`;
  };

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}시간 ${minutes}분`;
    }
    return `${minutes}분`;
  };

  const getComparisonColor = (myValue: number, friendValue: number) => {
    if (myValue > friendValue) return colors.success;
    if (myValue < friendValue) return colors.error;
    return colors.foreground;
  };

  const getComparisonIcon = (myValue: number, friendValue: number): "arrow-upward" | "arrow-downward" | "remove" => {
    if (myValue > friendValue) return "arrow-upward";
    if (myValue < friendValue) return "arrow-downward";
    return "remove";
  };

  const myStats = myStatsQuery.data;
  const friendStats = friendStatsQuery.data;

  if (myStatsQuery.isLoading) {
    return (
      <ScreenContainer>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      {/* Header */}
      <View className="flex-row items-center px-5 py-4 border-b border-border">
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
          className="mr-4"
        >
          <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
        </Pressable>
        <Text className="text-xl font-bold text-foreground">주행 기록 비교</Text>
      </View>

      <ScrollView className="flex-1 p-5">
        {/* Friend Selection */}
        <Text className="text-lg font-bold text-foreground mb-3">비교할 친구 선택</Text>
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
          className="mb-6"
        >
          <View className="flex-row gap-3">
            {friendsQuery.isLoading ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : friendsQuery.data?.length === 0 ? (
              <View className="bg-surface rounded-xl p-4">
                <Text className="text-muted">친구가 없습니다</Text>
              </View>
            ) : (
              friendsQuery.data?.map((friend) => (
                <Pressable
                  key={friend.id}
                  onPress={() => selectFriend(friend.id)}
                  style={({ pressed }) => [
                    { 
                      opacity: pressed ? 0.7 : 1,
                      backgroundColor: selectedFriendId === friend.id ? colors.primary : colors.surface,
                    }
                  ]}
                  className="rounded-xl p-3 min-w-[100px] items-center"
                >
                  {friend.profileImageUrl ? (
                    <Image
                      source={{ uri: friend.profileImageUrl }}
                      style={{ width: 48, height: 48, borderRadius: 24 }}
                    />
                  ) : (
                    <View 
                      className="w-12 h-12 rounded-full items-center justify-center"
                      style={{ backgroundColor: selectedFriendId === friend.id ? 'rgba(255,255,255,0.2)' : colors.border }}
                    >
                      <MaterialIcons 
                        name="person" 
                        size={24} 
                        color={selectedFriendId === friend.id ? "white" : colors.muted} 
                      />
                    </View>
                  )}
                  <Text 
                    className="mt-2 text-sm font-medium"
                    style={{ color: selectedFriendId === friend.id ? "white" : colors.foreground }}
                  >
                    {friend.name || friend.email?.split("@")[0] || "친구"}
                  </Text>
                </Pressable>
              ))
            )}
          </View>
        </ScrollView>

        {/* Comparison Stats */}
        {myStats && friendStats ? (
          <View className="gap-4">
            {/* Header Row */}
            <View className="flex-row items-center mb-2">
              <View className="flex-1" />
              <View className="w-24 items-center">
                <Text className="text-sm font-bold text-primary">나</Text>
              </View>
              <View className="w-8" />
              <View className="w-24 items-center">
                <Text className="text-sm font-bold text-muted">
                  {friendStats.name || "친구"}
                </Text>
              </View>
            </View>

            {/* Total Distance */}
            <View className="bg-surface rounded-xl p-4">
              <View className="flex-row items-center">
                <View className="flex-1">
                  <Text className="text-muted text-sm">총 주행거리</Text>
                </View>
                <View className="w-24 items-center">
                  <Text 
                    className="text-lg font-bold"
                    style={{ color: getComparisonColor(myStats.totalDistance, friendStats.totalDistance) }}
                  >
                    {formatDistance(myStats.totalDistance)}
                  </Text>
                </View>
                <View className="w-8 items-center">
                  <MaterialIcons 
                    name={getComparisonIcon(myStats.totalDistance, friendStats.totalDistance)} 
                    size={20} 
                    color={getComparisonColor(myStats.totalDistance, friendStats.totalDistance)} 
                  />
                </View>
                <View className="w-24 items-center">
                  <Text className="text-lg font-bold text-foreground">
                    {formatDistance(friendStats.totalDistance)}
                  </Text>
                </View>
              </View>
            </View>

            {/* Total Rides */}
            <View className="bg-surface rounded-xl p-4">
              <View className="flex-row items-center">
                <View className="flex-1">
                  <Text className="text-muted text-sm">총 주행횟수</Text>
                </View>
                <View className="w-24 items-center">
                  <Text 
                    className="text-lg font-bold"
                    style={{ color: getComparisonColor(myStats.totalRides, friendStats.totalRides) }}
                  >
                    {myStats.totalRides}회
                  </Text>
                </View>
                <View className="w-8 items-center">
                  <MaterialIcons 
                    name={getComparisonIcon(myStats.totalRides, friendStats.totalRides)} 
                    size={20} 
                    color={getComparisonColor(myStats.totalRides, friendStats.totalRides)} 
                  />
                </View>
                <View className="w-24 items-center">
                  <Text className="text-lg font-bold text-foreground">
                    {friendStats.totalRides}회
                  </Text>
                </View>
              </View>
            </View>

            {/* Average Speed */}
            <View className="bg-surface rounded-xl p-4">
              <View className="flex-row items-center">
                <View className="flex-1">
                  <Text className="text-muted text-sm">평균 속도</Text>
                </View>
                <View className="w-24 items-center">
                  <Text 
                    className="text-lg font-bold"
                    style={{ color: getComparisonColor(myStats.avgSpeed, friendStats.avgSpeed) }}
                  >
                    {myStats.avgSpeed.toFixed(1)} km/h
                  </Text>
                </View>
                <View className="w-8 items-center">
                  <MaterialIcons 
                    name={getComparisonIcon(myStats.avgSpeed, friendStats.avgSpeed)} 
                    size={20} 
                    color={getComparisonColor(myStats.avgSpeed, friendStats.avgSpeed)} 
                  />
                </View>
                <View className="w-24 items-center">
                  <Text className="text-lg font-bold text-foreground">
                    {friendStats.avgSpeed.toFixed(1)} km/h
                  </Text>
                </View>
              </View>
            </View>

            {/* Total Duration */}
            <View className="bg-surface rounded-xl p-4">
              <View className="flex-row items-center">
                <View className="flex-1">
                  <Text className="text-muted text-sm">총 주행시간</Text>
                </View>
                <View className="w-24 items-center">
                  <Text 
                    className="text-lg font-bold"
                    style={{ color: getComparisonColor(myStats.totalDuration, friendStats.totalDuration) }}
                  >
                    {formatDuration(myStats.totalDuration)}
                  </Text>
                </View>
                <View className="w-8 items-center">
                  <MaterialIcons 
                    name={getComparisonIcon(myStats.totalDuration, friendStats.totalDuration)} 
                    size={20} 
                    color={getComparisonColor(myStats.totalDuration, friendStats.totalDuration)} 
                  />
                </View>
                <View className="w-24 items-center">
                  <Text className="text-lg font-bold text-foreground">
                    {formatDuration(friendStats.totalDuration)}
                  </Text>
                </View>
              </View>
            </View>

            {/* Summary */}
            <View className="bg-primary/10 rounded-xl p-4 mt-4">
              <Text className="text-center text-foreground">
                {myStats.totalDistance > friendStats.totalDistance ? (
                  <>
                    <Text className="font-bold text-primary">축하합니다! </Text>
                    <Text>총 주행거리에서 {formatDistance(myStats.totalDistance - friendStats.totalDistance)} 앞서고 있습니다!</Text>
                  </>
                ) : myStats.totalDistance < friendStats.totalDistance ? (
                  <>
                    <Text className="font-bold text-primary">{friendStats.name || "친구"}님</Text>
                    <Text>이 {formatDistance(friendStats.totalDistance - myStats.totalDistance)} 더 많이 주행했습니다. 화이팅!</Text>
                  </>
                ) : (
                  <Text>두 분의 주행거리가 동일합니다!</Text>
                )}
              </Text>
            </View>
          </View>
        ) : selectedFriendId && friendStatsQuery.isLoading ? (
          <View className="items-center py-10">
            <ActivityIndicator size="large" color={colors.primary} />
            <Text className="text-muted mt-4">친구 통계 불러오는 중...</Text>
          </View>
        ) : (
          <View className="bg-surface rounded-xl p-8 items-center">
            <MaterialIcons name="compare-arrows" size={48} color={colors.muted} />
            <Text className="text-muted text-center mt-4">
              위에서 비교할 친구를 선택하세요
            </Text>
          </View>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}
