import { useState, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  FlatList,
  Alert,
  Platform,
  TextInput,
  Modal,
  Share,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { MaterialIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Clipboard from "expo-clipboard";
import { Image } from "expo-image";
import { SafeAreaView } from "react-native-safe-area-context";

import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useAuth } from "@/hooks/use-auth";
import { trpc } from "@/lib/trpc";

interface GroupMember {
  userId: number;
  name: string | null;
  profileImageUrl: string | null;
  isHost: boolean;
  isRiding: boolean;
  distance: number;
  duration: number;
  currentSpeed: number;
  latitude: number | null;
  longitude: number | null;
}

interface GroupSession {
  id: number;
  code: string;
  name: string;
  hostId: number;
  hostName: string | null;
  isActive: boolean;
  isRiding: boolean;
  members: GroupMember[];
}

export default function GroupRidingScreen() {
  const router = useRouter();
  const colors = useColors();
  const { user } = useAuth();
  const utils = trpc.useUtils();
  
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [joinCode, setJoinCode] = useState("");

  // 서버에서 그룹 목록 가져오기
  const { data: groups = [], isLoading, refetch } = trpc.groups.mine.useQuery();

  // 그룹 생성 mutation
  const createGroupMutation = trpc.groups.create.useMutation({
    onSuccess: (data) => {
      setNewGroupName("");
      setShowCreateModal(false);
      utils.groups.mine.invalidate();
      
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }

      Alert.alert(
        "그룹 생성 완료",
        `그룹 코드: ${data.code}\n\n친구들에게 이 코드를 공유하세요!`,
        [
          {
            text: "코드 복사",
            onPress: async () => {
              await Clipboard.setStringAsync(data.code);
              Alert.alert("복사됨", "그룹 코드가 클립보드에 복사되었습니다.");
            },
          },
          { text: "확인" },
        ]
      );
    },
    onError: (error) => {
      Alert.alert("오류", error.message || "그룹 생성에 실패했습니다.");
    },
  });

  // 그룹 참가 mutation
  const joinGroupMutation = trpc.groups.join.useMutation({
    onSuccess: (data) => {
      setJoinCode("");
      setShowJoinModal(false);
      utils.groups.mine.invalidate();
      
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }

      Alert.alert("참가 완료", `"${data.groupName}" 그룹에 참가했습니다.`);
    },
    onError: (error) => {
      Alert.alert("오류", error.message || "그룹 참가에 실패했습니다.");
    },
  });

  // 그룹 나가기 mutation
  const leaveGroupMutation = trpc.groups.leave.useMutation({
    onSuccess: () => {
      utils.groups.mine.invalidate();
      if (Platform.OS !== "web") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
    },
    onError: (error) => {
      Alert.alert("오류", error.message || "그룹 나가기에 실패했습니다.");
    },
  });

  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch])
  );

  // 그룹 생성
  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) {
      Alert.alert("오류", "그룹 이름을 입력해주세요.");
      return;
    }
    createGroupMutation.mutate({ name: newGroupName.trim() });
  };

  // 그룹 참가
  const handleJoinGroup = async () => {
    if (!joinCode.trim() || joinCode.length !== 6) {
      Alert.alert("오류", "6자리 그룹 코드를 입력해주세요.");
      return;
    }
    joinGroupMutation.mutate({ code: joinCode.toUpperCase() });
  };

  // 그룹 삭제/나가기
  const handleLeaveGroup = (group: GroupSession) => {
    const isHost = group.hostId === user?.id;
    const message = isHost
      ? "그룹을 삭제하시겠습니까? 모든 멤버가 나가게 됩니다."
      : "그룹에서 나가시겠습니까?";

    Alert.alert(
      isHost ? "그룹 삭제" : "그룹 나가기",
      message,
      [
        { text: "취소", style: "cancel" },
        {
          text: isHost ? "삭제" : "나가기",
          style: "destructive",
          onPress: () => leaveGroupMutation.mutate({ groupId: group.id }),
        },
      ]
    );
  };

  // 그룹 코드 공유
  const handleShareCode = async (group: GroupSession) => {
    try {
      await Share.share({
        message: `SCOOP 그룹 라이딩에 참가하세요!\n\n그룹명: ${group.name}\n참가 코드: ${group.code}`,
      });
    } catch (error) {
      console.error("Share error:", error);
    }
  };

  // 그룹 라이딩 시작
  const handleStartGroupRiding = (group: GroupSession) => {
    router.push(`/riding?groupId=${group.id}`);
  };

  const renderGroupItem = ({ item }: { item: GroupSession }) => (
    <View className="bg-surface rounded-xl p-4 mb-3 border border-border">
      <View className="flex-row items-start justify-between">
        <View className="flex-1">
          <View className="flex-row items-center">
            <Text className="text-lg font-bold text-foreground" numberOfLines={1}>
              {item.name}
            </Text>
            {item.hostId === user?.id && (
              <View className="bg-primary/20 px-2 py-0.5 rounded-full ml-2">
                <Text className="text-xs text-primary font-medium">호스트</Text>
              </View>
            )}
            {item.isRiding && (
              <View className="bg-success/20 px-2 py-0.5 rounded-full ml-2">
                <Text className="text-xs text-success font-medium">주행중</Text>
              </View>
            )}
          </View>
          <View className="flex-row items-center mt-1">
            <MaterialIcons name="vpn-key" size={14} color={colors.muted} />
            <Text className="text-sm text-muted ml-1">{item.code}</Text>
            <Pressable
              onPress={() => handleShareCode(item)}
              style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
              className="ml-2"
            >
              <MaterialIcons name="share" size={16} color={colors.primary} />
            </Pressable>
          </View>
        </View>
        <Pressable
          onPress={() => handleLeaveGroup(item)}
          style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
          className="p-2"
        >
          <MaterialIcons 
            name={item.hostId === user?.id ? "delete-outline" : "logout"} 
            size={22} 
            color={colors.error} 
          />
        </Pressable>
      </View>

      {/* Members */}
      <View className="mt-3">
        <Text className="text-sm font-medium text-foreground mb-2">
          멤버 ({item.members.length}명)
        </Text>
        <View className="flex-row flex-wrap gap-2">
          {item.members.map((member) => (
            <View
              key={member.userId}
              className="flex-row items-center bg-background rounded-full px-3 py-1.5"
            >
              {member.profileImageUrl ? (
                <Image
                  source={{ uri: member.profileImageUrl }}
                  style={{ width: 20, height: 20, borderRadius: 10 }}
                />
              ) : (
                <View
                  style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: colors.primary }}
                  className="items-center justify-center"
                >
                  <Text className="text-white text-xs font-bold">
                    {(member.name || "?").charAt(0)}
                  </Text>
                </View>
              )}
              <Text className="text-sm text-foreground ml-1.5">{member.name || "익명"}</Text>
              {member.isHost && (
                <MaterialIcons name="star" size={12} color={colors.warning} style={{ marginLeft: 2 }} />
              )}
              {member.isRiding && (
                <MaterialIcons name="electric-scooter" size={12} color={colors.success} style={{ marginLeft: 2 }} />
              )}
            </View>
          ))}
        </View>
      </View>

      {/* Start Button */}
      <Pressable
        onPress={() => handleStartGroupRiding(item)}
        style={({ pressed }) => [
          { opacity: pressed ? 0.8 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] },
        ]}
        className="bg-primary mt-4 py-3 rounded-lg flex-row items-center justify-center"
      >
        <MaterialIcons name="play-arrow" size={20} color="#FFFFFF" />
        <Text className="text-white font-semibold ml-2">그룹 라이딩 시작</Text>
      </Pressable>
    </View>
  );

  return (
    <ScreenContainer className="flex-1">
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-border">
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
        >
          <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
        </Pressable>
        <Text className="text-lg font-bold text-foreground">그룹 라이딩</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Action Buttons */}
      <View className="flex-row px-4 py-3 gap-3">
        <Pressable
          onPress={() => setShowCreateModal(true)}
          style={({ pressed }) => [
            { opacity: pressed ? 0.8 : 1, flex: 1 },
          ]}
          className="bg-primary py-3 rounded-lg flex-row items-center justify-center"
        >
          <MaterialIcons name="add" size={20} color="#FFFFFF" />
          <Text className="text-white font-semibold ml-2">그룹 만들기</Text>
        </Pressable>
        <Pressable
          onPress={() => setShowJoinModal(true)}
          style={({ pressed }) => [
            { opacity: pressed ? 0.8 : 1, flex: 1 },
          ]}
          className="bg-surface border border-primary py-3 rounded-lg flex-row items-center justify-center"
        >
          <MaterialIcons name="group-add" size={20} color={colors.primary} />
          <Text className="text-primary font-semibold ml-2">참가하기</Text>
        </Pressable>
      </View>

      {/* Groups List */}
      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : groups.length === 0 ? (
        <View className="flex-1 items-center justify-center px-8">
          <MaterialIcons name="groups" size={64} color={colors.muted} />
          <Text className="text-lg font-medium text-foreground mt-4 text-center">
            참가 중인 그룹이 없습니다
          </Text>
          <Text className="text-sm text-muted mt-2 text-center">
            새 그룹을 만들거나 친구의 그룹 코드로 참가하세요
          </Text>
        </View>
      ) : (
        <FlatList
          data={groups}
          renderItem={renderGroupItem}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={{ padding: 16 }}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Create Group Modal */}
      <Modal
        visible={showCreateModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowCreateModal(false)}
      >
        <View className="flex-1 justify-end bg-black/50">
          <SafeAreaView edges={["bottom"]} style={{ backgroundColor: colors.background }}>
            <View className="bg-background rounded-t-3xl p-6">
              <View className="flex-row items-center justify-between mb-6">
                <Text className="text-xl font-bold text-foreground">새 그룹 만들기</Text>
                <Pressable onPress={() => setShowCreateModal(false)}>
                  <MaterialIcons name="close" size={24} color={colors.foreground} />
                </Pressable>
              </View>

              <Text className="text-sm text-muted mb-2">그룹 이름</Text>
              <TextInput
                value={newGroupName}
                onChangeText={setNewGroupName}
                placeholder="그룹 이름을 입력하세요"
                placeholderTextColor={colors.muted}
                className="bg-surface border border-border rounded-lg px-4 py-3 text-foreground mb-6"
                maxLength={50}
                returnKeyType="done"
              />

              <Pressable
                onPress={handleCreateGroup}
                disabled={createGroupMutation.isPending}
                style={({ pressed }) => [
                  { opacity: pressed ? 0.8 : 1 },
                ]}
                className="bg-primary py-4 rounded-lg items-center"
              >
                {createGroupMutation.isPending ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text className="text-white font-bold text-base">그룹 만들기</Text>
                )}
              </Pressable>
            </View>
          </SafeAreaView>
        </View>
      </Modal>

      {/* Join Group Modal */}
      <Modal
        visible={showJoinModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowJoinModal(false)}
      >
        <View className="flex-1 justify-end bg-black/50">
          <SafeAreaView edges={["bottom"]} style={{ backgroundColor: colors.background }}>
            <View className="bg-background rounded-t-3xl p-6">
              <View className="flex-row items-center justify-between mb-6">
                <Text className="text-xl font-bold text-foreground">그룹 참가하기</Text>
                <Pressable onPress={() => setShowJoinModal(false)}>
                  <MaterialIcons name="close" size={24} color={colors.foreground} />
                </Pressable>
              </View>

              <Text className="text-sm text-muted mb-2">그룹 코드 (6자리)</Text>
              <TextInput
                value={joinCode}
                onChangeText={(text) => setJoinCode(text.toUpperCase())}
                placeholder="ABCD12"
                placeholderTextColor={colors.muted}
                className="bg-surface border border-border rounded-lg px-4 py-3 text-foreground mb-6 text-center text-xl tracking-widest"
                maxLength={6}
                autoCapitalize="characters"
                returnKeyType="done"
              />

              <Pressable
                onPress={handleJoinGroup}
                disabled={joinGroupMutation.isPending}
                style={({ pressed }) => [
                  { opacity: pressed ? 0.8 : 1 },
                ]}
                className="bg-primary py-4 rounded-lg items-center"
              >
                {joinGroupMutation.isPending ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text className="text-white font-bold text-base">참가하기</Text>
                )}
              </Pressable>
            </View>
          </SafeAreaView>
        </View>
      </Modal>
    </ScreenContainer>
  );
}
