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
  RefreshControl,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Haptics from "expo-haptics";

import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useAuth } from "@/hooks/use-auth";
import { trpc } from "@/lib/trpc";

type TabType = "friends" | "requests" | "search";

export default function FriendsScreen() {
  const colors = useColors();
  const router = useRouter();
  const { isAuthenticated } = useAuth();

  const [activeTab, setActiveTab] = useState<TabType>("friends");
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const trpcUtils = trpc.useUtils();

  // Queries
  const friendsQuery = trpc.friends.getFriends.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const pendingRequestsQuery = trpc.friends.getPendingRequests.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const sentRequestsQuery = trpc.friends.getSentRequests.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const searchQuery_ = trpc.friends.searchUsers.useQuery(
    { query: searchQuery },
    { enabled: isAuthenticated && searchQuery.length >= 2 && isSearching }
  );

  // Mutations
  const sendRequestMutation = trpc.friends.sendRequest.useMutation({
    onSuccess: () => {
      trpcUtils.friends.searchUsers.invalidate();
      sentRequestsQuery.refetch();
      Alert.alert("성공", "친구 요청을 보냈습니다.");
    },
    onError: (error) => {
      Alert.alert("오류", error.message || "친구 요청에 실패했습니다.");
    },
  });

  const acceptRequestMutation = trpc.friends.acceptRequest.useMutation({
    onSuccess: () => {
      pendingRequestsQuery.refetch();
      friendsQuery.refetch();
      Alert.alert("성공", "친구 요청을 수락했습니다.");
    },
  });

  const rejectRequestMutation = trpc.friends.rejectRequest.useMutation({
    onSuccess: () => {
      pendingRequestsQuery.refetch();
      Alert.alert("알림", "친구 요청을 거절했습니다.");
    },
  });

  const removeFriendMutation = trpc.friends.removeFriend.useMutation({
    onSuccess: () => {
      friendsQuery.refetch();
      Alert.alert("알림", "친구를 삭제했습니다.");
    },
  });

  useFocusEffect(
    useCallback(() => {
      friendsQuery.refetch();
      pendingRequestsQuery.refetch();
    }, [])
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      friendsQuery.refetch(),
      pendingRequestsQuery.refetch(),
      sentRequestsQuery.refetch(),
    ]);
    setRefreshing(false);
  };

  const handleSearch = () => {
    if (searchQuery.length >= 2) {
      setIsSearching(true);
    }
  };

  const handleSendRequest = (userId: number) => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    sendRequestMutation.mutate({ receiverId: userId });
  };

  const handleAcceptRequest = (requestId: number) => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    acceptRequestMutation.mutate({ requestId });
  };

  const handleRejectRequest = (requestId: number) => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    rejectRequestMutation.mutate({ requestId });
  };

  const handleRemoveFriend = (friendId: number, name: string) => {
    Alert.alert(
      "친구 삭제",
      `${name}님을 친구 목록에서 삭제하시겠습니까?`,
      [
        { text: "취소", style: "cancel" },
        {
          text: "삭제",
          style: "destructive",
          onPress: () => removeFriendMutation.mutate({ friendId }),
        },
      ]
    );
  };

  const getUserName = (user: { name: string | null; email: string | null }) => {
    return user.name || user.email?.split("@")[0] || "익명";
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

  const pendingCount = pendingRequestsQuery.data?.length || 0;

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
        <Text className="flex-1 text-xl font-bold text-foreground">친구</Text>
        <Pressable
          onPress={() => router.push("/compare-records")}
          style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
          className="p-2"
        >
          <MaterialIcons name="compare-arrows" size={24} color={colors.primary} />
        </Pressable>
      </View>

      {/* Tabs */}
      <View className="flex-row border-b border-border">
        <Pressable
          onPress={() => setActiveTab("friends")}
          style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
          className={`flex-1 py-3 items-center ${activeTab === "friends" ? "border-b-2 border-primary" : ""}`}
        >
          <Text className={activeTab === "friends" ? "text-primary font-bold" : "text-muted"}>
            친구 목록
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setActiveTab("requests")}
          style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
          className={`flex-1 py-3 items-center ${activeTab === "requests" ? "border-b-2 border-primary" : ""}`}
        >
          <View className="flex-row items-center">
            <Text className={activeTab === "requests" ? "text-primary font-bold" : "text-muted"}>
              요청
            </Text>
            {pendingCount > 0 && (
              <View className="ml-1 bg-error rounded-full w-5 h-5 items-center justify-center">
                <Text className="text-white text-xs font-bold">{pendingCount}</Text>
              </View>
            )}
          </View>
        </Pressable>
        <Pressable
          onPress={() => setActiveTab("search")}
          style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
          className={`flex-1 py-3 items-center ${activeTab === "search" ? "border-b-2 border-primary" : ""}`}
        >
          <Text className={activeTab === "search" ? "text-primary font-bold" : "text-muted"}>
            검색
          </Text>
        </Pressable>
      </View>

      <ScrollView
        className="flex-1"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        {/* Friends List */}
        {activeTab === "friends" && (
          <View className="p-4">
            {friendsQuery.isLoading ? (
              <ActivityIndicator size="large" color={colors.primary} />
            ) : friendsQuery.data?.length === 0 ? (
              <View className="items-center py-12">
                <MaterialIcons name="people-outline" size={64} color={colors.muted} />
                <Text className="text-muted mt-4 text-center">
                  아직 친구가 없습니다.{"\n"}검색 탭에서 친구를 찾아보세요!
                </Text>
              </View>
            ) : (
              friendsQuery.data?.map((friend) => (
                <View
                  key={friend.id}
                  className="flex-row items-center bg-surface rounded-xl p-4 mb-3"
                >
                  <View className="w-12 h-12 rounded-full bg-primary/20 items-center justify-center mr-3">
                    <MaterialIcons name="person" size={24} color={colors.primary} />
                  </View>
                  <View className="flex-1">
                    <Text className="text-foreground font-medium">{getUserName(friend)}</Text>
                    {friend.email && (
                      <Text className="text-muted text-sm">{friend.email}</Text>
                    )}
                  </View>
                  <Pressable
                    onPress={() => handleRemoveFriend(friend.id, getUserName(friend))}
                    style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
                    className="p-2"
                  >
                    <MaterialIcons name="person-remove" size={24} color={colors.error} />
                  </Pressable>
                </View>
              ))
            )}
          </View>
        )}

        {/* Requests */}
        {activeTab === "requests" && (
          <View className="p-4">
            {/* Received Requests */}
            <Text className="text-lg font-bold text-foreground mb-3">받은 요청</Text>
            {pendingRequestsQuery.isLoading ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : pendingRequestsQuery.data?.length === 0 ? (
              <View className="items-center py-6 bg-surface rounded-xl mb-6">
                <Text className="text-muted">받은 친구 요청이 없습니다.</Text>
              </View>
            ) : (
              pendingRequestsQuery.data?.map((request) => (
                <View
                  key={request.id}
                  className="bg-surface rounded-xl p-4 mb-3"
                >
                  <View className="flex-row items-center">
                    <View className="w-12 h-12 rounded-full bg-primary/20 items-center justify-center mr-3">
                      <MaterialIcons name="person" size={24} color={colors.primary} />
                    </View>
                    <View className="flex-1">
                      <Text className="text-foreground font-medium">
                        {request.senderName || request.senderEmail?.split("@")[0] || "익명"}
                      </Text>
                      <Text className="text-muted text-xs">
                        {new Date(request.createdAt).toLocaleDateString("ko-KR")}
                      </Text>
                    </View>
                  </View>
                  {/* Message from sender */}
                  {request.message && (
                    <View className="mt-3 bg-background rounded-lg p-3">
                      <Text className="text-foreground text-sm">"{request.message}"</Text>
                    </View>
                  )}
                  <View className="flex-row gap-2 mt-3 justify-end">
                    <Pressable
                      onPress={() => handleRejectRequest(request.id)}
                      style={({ pressed }) => [
                        { backgroundColor: colors.error, opacity: pressed ? 0.8 : 1 },
                      ]}
                      className="px-4 py-2 rounded-lg"
                    >
                      <Text className="text-white font-medium">거절</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => handleAcceptRequest(request.id)}
                      style={({ pressed }) => [
                        { backgroundColor: colors.success, opacity: pressed ? 0.8 : 1 },
                      ]}
                      className="px-4 py-2 rounded-lg"
                    >
                      <Text className="text-white font-medium">수락</Text>
                    </Pressable>
                  </View>
                </View>
              ))
            )}

            {/* Sent Requests */}
            <Text className="text-lg font-bold text-foreground mb-3 mt-6">보낸 요청</Text>
            {sentRequestsQuery.isLoading ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : sentRequestsQuery.data?.length === 0 ? (
              <View className="items-center py-6 bg-surface rounded-xl">
                <Text className="text-muted">보낸 친구 요청이 없습니다.</Text>
              </View>
            ) : (
              sentRequestsQuery.data?.map((request) => (
                <View
                  key={request.id}
                  className="flex-row items-center bg-surface rounded-xl p-4 mb-3"
                >
                  <View className="w-12 h-12 rounded-full bg-muted/20 items-center justify-center mr-3">
                    <MaterialIcons name="person" size={24} color={colors.muted} />
                  </View>
                  <View className="flex-1">
                    <Text className="text-foreground font-medium">
                      {request.receiverName || request.receiverEmail?.split("@")[0] || "익명"}
                    </Text>
                    <Text className="text-muted text-xs">대기 중</Text>
                  </View>
                  <MaterialIcons name="hourglass-empty" size={20} color={colors.muted} />
                </View>
              ))
            )}
          </View>
        )}

        {/* Search */}
        {activeTab === "search" && (
          <View className="p-4">
            {/* Search Input */}
            <View className="flex-row items-center bg-surface rounded-xl px-4 py-2 mb-4">
              <MaterialIcons name="search" size={24} color={colors.muted} />
              <TextInput
                value={searchQuery}
                onChangeText={(text) => {
                  setSearchQuery(text);
                  setIsSearching(false);
                }}
                placeholder="닉네임 또는 이메일로 검색"
                placeholderTextColor={colors.muted}
                className="flex-1 ml-2 text-foreground py-2"
                style={{ color: colors.foreground }}
                returnKeyType="search"
                onSubmitEditing={handleSearch}
              />
              {searchQuery.length > 0 && (
                <Pressable
                  onPress={() => {
                    setSearchQuery("");
                    setIsSearching(false);
                  }}
                  style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
                >
                  <MaterialIcons name="close" size={20} color={colors.muted} />
                </Pressable>
              )}
            </View>

            <Pressable
              onPress={handleSearch}
              disabled={searchQuery.length < 2}
              style={({ pressed }) => [
                {
                  backgroundColor: colors.primary,
                  opacity: searchQuery.length < 2 ? 0.5 : pressed ? 0.8 : 1,
                },
              ]}
              className="py-3 rounded-xl items-center mb-4"
            >
              <Text className="text-white font-bold">검색</Text>
            </Pressable>

            {/* Search Results */}
            {isSearching && searchQuery_.isLoading ? (
              <ActivityIndicator size="large" color={colors.primary} />
            ) : isSearching && searchQuery_.data?.length === 0 ? (
              <View className="items-center py-12">
                <MaterialIcons name="search-off" size={64} color={colors.muted} />
                <Text className="text-muted mt-4">검색 결과가 없습니다.</Text>
              </View>
            ) : isSearching ? (
              searchQuery_.data?.map((user) => (
                <View
                  key={user.id}
                  className="flex-row items-center bg-surface rounded-xl p-4 mb-3"
                >
                  <View className="w-12 h-12 rounded-full bg-primary/20 items-center justify-center mr-3">
                    <MaterialIcons name="person" size={24} color={colors.primary} />
                  </View>
                  <View className="flex-1">
                    <Text className="text-foreground font-medium">{getUserName(user)}</Text>
                    {user.email && (
                      <Text className="text-muted text-sm">{user.email}</Text>
                    )}
                  </View>
                  {user.isFriend ? (
                    <View className="bg-success/20 px-3 py-1 rounded-full">
                      <Text className="text-success text-sm">친구</Text>
                    </View>
                  ) : user.hasPendingRequest ? (
                    <View className="bg-muted/20 px-3 py-1 rounded-full">
                      <Text className="text-muted text-sm">요청됨</Text>
                    </View>
                  ) : user.hasReceivedRequest ? (
                    <Pressable
                      onPress={() => {
                        setActiveTab("requests");
                      }}
                      style={({ pressed }) => [
                        { backgroundColor: colors.warning, opacity: pressed ? 0.8 : 1 },
                      ]}
                      className="px-3 py-2 rounded-lg"
                    >
                      <Text className="text-white text-sm font-medium">요청 확인</Text>
                    </Pressable>
                  ) : (
                    <Pressable
                      onPress={() => handleSendRequest(user.id)}
                      disabled={sendRequestMutation.isPending}
                      style={({ pressed }) => [
                        { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 },
                      ]}
                      className="px-3 py-2 rounded-lg"
                    >
                      {sendRequestMutation.isPending ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                        <Text className="text-white text-sm font-medium">친구 요청</Text>
                      )}
                    </Pressable>
                  )}
                </View>
              ))
            ) : (
              <View className="items-center py-12">
                <MaterialIcons name="person-search" size={64} color={colors.muted} />
                <Text className="text-muted mt-4 text-center">
                  닉네임이나 이메일로{"\n"}친구를 검색해보세요!
                </Text>
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}
