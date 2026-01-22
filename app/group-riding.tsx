import { useState, useEffect, useCallback, useRef } from "react";
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
} from "react-native";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { MaterialIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Clipboard from "expo-clipboard";
import { Image } from "expo-image";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useAuth } from "@/hooks/use-auth";
import { trpc } from "@/lib/trpc";

interface GroupSession {
  id: string;
  name: string;
  code: string;
  createdAt: string;
  hostId: string;
  hostName: string;
  members: GroupMember[];
  isActive: boolean;
}

interface GroupMember {
  id: string;
  name: string;
  profileImageUrl?: string;
  isHost: boolean;
  isRiding: boolean;
  distance: number;
  duration: number;
  currentSpeed: number;
  latitude?: number;
  longitude?: number;
}

const GROUPS_STORAGE_KEY = "@group_sessions";

export default function GroupRidingScreen() {
  const router = useRouter();
  const colors = useColors();
  const { user } = useAuth();
  
  const [groups, setGroups] = useState<GroupSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [joinCode, setJoinCode] = useState("");

  // 그룹 목록 로드
  const loadGroups = async () => {
    try {
      const groupsJson = await AsyncStorage.getItem(GROUPS_STORAGE_KEY);
      if (groupsJson) {
        setGroups(JSON.parse(groupsJson));
      }
    } catch (error) {
      console.error("Failed to load groups:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadGroups();
    }, [])
  );

  // 그룹 코드 생성
  const generateGroupCode = (): string => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let code = "";
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  };

  // 그룹 생성
  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) {
      Alert.alert("오류", "그룹 이름을 입력해주세요.");
      return;
    }

    const newGroup: GroupSession = {
      id: Date.now().toString(),
      name: newGroupName.trim(),
      code: generateGroupCode(),
      createdAt: new Date().toISOString(),
      hostId: String(user?.id || "unknown"),
      hostName: user?.name || "익명",
      members: [
        {
          id: String(user?.id || "unknown"),
          name: user?.name || "익명",
          profileImageUrl: user?.profileImageUrl || undefined,
          isHost: true,
          isRiding: false,
          distance: 0,
          duration: 0,
          currentSpeed: 0,
        },
      ],
      isActive: true,
    };

    const updatedGroups = [...groups, newGroup];
    await AsyncStorage.setItem(GROUPS_STORAGE_KEY, JSON.stringify(updatedGroups));
    setGroups(updatedGroups);
    setNewGroupName("");
    setShowCreateModal(false);

    if (Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }

    Alert.alert(
      "그룹 생성 완료",
      `그룹 코드: ${newGroup.code}\n\n친구들에게 이 코드를 공유하세요!`,
      [
        {
          text: "코드 복사",
          onPress: async () => {
            await Clipboard.setStringAsync(newGroup.code);
            Alert.alert("복사됨", "그룹 코드가 클립보드에 복사되었습니다.");
          },
        },
        { text: "확인" },
      ]
    );
  };

  // 그룹 참가
  const handleJoinGroup = async () => {
    if (!joinCode.trim() || joinCode.length !== 6) {
      Alert.alert("오류", "6자리 그룹 코드를 입력해주세요.");
      return;
    }

    // 실제 구현에서는 서버에서 그룹 정보를 가져와야 함
    // 여기서는 데모용으로 로컬에서 처리
    const existingGroup = groups.find(g => g.code === joinCode.toUpperCase());
    
    if (existingGroup) {
      // 이미 참가한 그룹인지 확인
      const alreadyMember = existingGroup.members.some(m => m.id === String(user?.id));
      if (alreadyMember) {
        Alert.alert("알림", "이미 참가한 그룹입니다.");
        setShowJoinModal(false);
        return;
      }

      // 멤버 추가
      existingGroup.members.push({
        id: String(user?.id || "unknown"),
        name: user?.name || "익명",
        profileImageUrl: user?.profileImageUrl || undefined,
        isHost: false,
        isRiding: false,
        distance: 0,
        duration: 0,
        currentSpeed: 0,
      });

      await AsyncStorage.setItem(GROUPS_STORAGE_KEY, JSON.stringify(groups));
      setGroups([...groups]);
      setJoinCode("");
      setShowJoinModal(false);

      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }

      Alert.alert("참가 완료", `"${existingGroup.name}" 그룹에 참가했습니다.`);
    } else {
      Alert.alert("오류", "해당 코드의 그룹을 찾을 수 없습니다.");
    }
  };

  // 그룹 삭제/나가기
  const handleLeaveGroup = (groupId: string) => {
    const group = groups.find(g => g.id === groupId);
    if (!group) return;

    const isHost = group.hostId === String(user?.id);
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
          onPress: async () => {
            let updatedGroups: GroupSession[];
            if (isHost) {
              updatedGroups = groups.filter(g => g.id !== groupId);
            } else {
              updatedGroups = groups.map(g => {
                if (g.id === groupId) {
                  return {
                    ...g,
                    members: g.members.filter(m => m.id !== String(user?.id)),
                  };
                }
                return g;
              });
            }
            await AsyncStorage.setItem(GROUPS_STORAGE_KEY, JSON.stringify(updatedGroups));
            setGroups(updatedGroups);
            if (Platform.OS !== "web") {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            }
          },
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
            {item.hostId === String(user?.id) && (
              <View className="bg-primary/20 px-2 py-0.5 rounded-full ml-2">
                <Text className="text-xs text-primary font-medium">호스트</Text>
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
          onPress={() => handleLeaveGroup(item.id)}
          style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
          className="p-2"
        >
          <MaterialIcons 
            name={item.hostId === String(user?.id) ? "delete-outline" : "logout"} 
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
              key={member.id}
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
                    {member.name.charAt(0)}
                  </Text>
                </View>
              )}
              <Text className="text-sm text-foreground ml-1.5">{member.name}</Text>
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
        <View className="flex-row items-center">
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
          >
            <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
          </Pressable>
          <Text className="text-xl font-bold text-foreground ml-4">그룹 라이딩</Text>
        </View>
        <View className="flex-row gap-2">
          <Pressable
            onPress={() => setShowJoinModal(true)}
            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
            className="bg-surface border border-border px-3 py-2 rounded-lg flex-row items-center"
          >
            <MaterialIcons name="group-add" size={18} color={colors.foreground} />
            <Text className="text-foreground font-medium ml-1 text-sm">참가</Text>
          </Pressable>
          <Pressable
            onPress={() => setShowCreateModal(true)}
            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
            className="bg-primary px-3 py-2 rounded-lg flex-row items-center"
          >
            <MaterialIcons name="add" size={18} color="#FFFFFF" />
            <Text className="text-white font-medium ml-1 text-sm">생성</Text>
          </Pressable>
        </View>
      </View>

      {/* Content */}
      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <Text className="text-muted">로딩 중...</Text>
        </View>
      ) : groups.length === 0 ? (
        <View className="flex-1 items-center justify-center px-8">
          <MaterialIcons name="groups" size={64} color={colors.muted} />
          <Text className="text-lg font-semibold text-foreground mt-4 text-center">
            그룹이 없습니다
          </Text>
          <Text className="text-muted text-center mt-2">
            그룹을 생성하거나 친구의 그룹에 참가하세요
          </Text>
          <View className="flex-row gap-3 mt-6">
            <Pressable
              onPress={() => setShowJoinModal(true)}
              style={({ pressed }) => [
                { opacity: pressed ? 0.8 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] },
              ]}
              className="bg-surface border border-border px-5 py-3 rounded-lg flex-row items-center"
            >
              <MaterialIcons name="group-add" size={20} color={colors.foreground} />
              <Text className="text-foreground font-semibold ml-2">참가하기</Text>
            </Pressable>
            <Pressable
              onPress={() => setShowCreateModal(true)}
              style={({ pressed }) => [
                { opacity: pressed ? 0.8 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] },
              ]}
              className="bg-primary px-5 py-3 rounded-lg flex-row items-center"
            >
              <MaterialIcons name="add" size={20} color="#FFFFFF" />
              <Text className="text-white font-semibold ml-2">생성하기</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <FlatList
          data={groups}
          renderItem={renderGroupItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16 }}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Create Group Modal */}
      <Modal
        visible={showCreateModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCreateModal(false)}
      >
        <View className="flex-1 bg-black/50 items-center justify-center px-6">
          <View className="bg-surface rounded-2xl p-6 w-full max-w-sm">
            <Text className="text-xl font-bold text-foreground text-center mb-4">
              그룹 생성
            </Text>
            <TextInput
              value={newGroupName}
              onChangeText={setNewGroupName}
              placeholder="그룹 이름"
              placeholderTextColor={colors.muted}
              className="bg-background border border-border rounded-lg px-4 py-3 text-foreground mb-4"
              maxLength={20}
            />
            <View className="flex-row gap-3">
              <Pressable
                onPress={() => {
                  setShowCreateModal(false);
                  setNewGroupName("");
                }}
                style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
                className="flex-1 bg-background border border-border py-3 rounded-lg"
              >
                <Text className="text-foreground font-medium text-center">취소</Text>
              </Pressable>
              <Pressable
                onPress={handleCreateGroup}
                style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
                className="flex-1 bg-primary py-3 rounded-lg"
              >
                <Text className="text-white font-medium text-center">생성</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Join Group Modal */}
      <Modal
        visible={showJoinModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowJoinModal(false)}
      >
        <View className="flex-1 bg-black/50 items-center justify-center px-6">
          <View className="bg-surface rounded-2xl p-6 w-full max-w-sm">
            <Text className="text-xl font-bold text-foreground text-center mb-4">
              그룹 참가
            </Text>
            <TextInput
              value={joinCode}
              onChangeText={(text) => setJoinCode(text.toUpperCase())}
              placeholder="6자리 그룹 코드"
              placeholderTextColor={colors.muted}
              className="bg-background border border-border rounded-lg px-4 py-3 text-foreground mb-4 text-center text-lg tracking-widest"
              maxLength={6}
              autoCapitalize="characters"
            />
            <View className="flex-row gap-3">
              <Pressable
                onPress={() => {
                  setShowJoinModal(false);
                  setJoinCode("");
                }}
                style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
                className="flex-1 bg-background border border-border py-3 rounded-lg"
              >
                <Text className="text-foreground font-medium text-center">취소</Text>
              </Pressable>
              <Pressable
                onPress={handleJoinGroup}
                style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
                className="flex-1 bg-primary py-3 rounded-lg"
              >
                <Text className="text-white font-medium text-center">참가</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}
