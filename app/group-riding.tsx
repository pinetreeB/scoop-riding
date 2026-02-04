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
  KeyboardAvoidingView,
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
import { useTranslation } from "@/hooks/use-translation";

interface GroupMember {
  userId: number;
  name: string | null;
  profileImageUrl: string | null;
  isHost: boolean;
  isRiding: boolean;
  status?: "pending" | "approved" | "rejected" | null;
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
  const { t } = useTranslation();
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
        t("groupRiding.alerts.createSuccess"),
        t("groupRiding.alerts.createSuccessMessage", { code: data.code }),
        [
          {
            text: t("groupRiding.alerts.copyCode"),
            onPress: async () => {
              await Clipboard.setStringAsync(data.code);
              Alert.alert(t("groupRiding.alerts.copied"), t("groupRiding.alerts.copiedMessage"));
            },
          },
          { text: t("common.confirm") },
        ]
      );
    },
    onError: (error) => {
      Alert.alert(t("common.error"), error.message || t("groupRiding.alerts.createError"));
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

      if (data.status === "pending") {
        Alert.alert(t("groupRiding.alerts.joinPending"), t("groupRiding.alerts.joinPendingMessage", { name: data.groupName }));
      } else {
        Alert.alert(t("groupRiding.alerts.joinSuccess"), t("groupRiding.alerts.joinSuccessMessage", { name: data.groupName }));
      }
    },
    onError: (error) => {
      Alert.alert(t("common.error"), error.message || t("groupRiding.alerts.joinError"));
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
      Alert.alert(t("common.error"), error.message || t("groupRiding.alerts.leaveError"));
    },
  });

  // 멤버 승인 mutation
  const approveMemberMutation = trpc.groups.approveMember.useMutation({
    onSuccess: () => {
      utils.groups.mine.invalidate();
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      Alert.alert(t("groupRiding.alerts.approveSuccess"), t("groupRiding.alerts.approveSuccessMessage"));
    },
    onError: (error) => {
      Alert.alert(t("common.error"), error.message || t("groupRiding.alerts.approveError"));
    },
  });

  // 멤버 거절 mutation
  const rejectMemberMutation = trpc.groups.rejectMember.useMutation({
    onSuccess: () => {
      utils.groups.mine.invalidate();
      if (Platform.OS !== "web") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
    },
    onError: (error) => {
      Alert.alert(t("common.error"), error.message || t("groupRiding.alerts.rejectError"));
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
      Alert.alert(t("common.error"), t("groupRiding.alerts.nameRequired"));
      return;
    }
    createGroupMutation.mutate({ name: newGroupName.trim() });
  };

  // 그룹 참가
  const handleJoinGroup = async () => {
    if (!joinCode.trim() || joinCode.length !== 6) {
      Alert.alert(t("common.error"), t("groupRiding.alerts.codeRequired"));
      return;
    }
    joinGroupMutation.mutate({ code: joinCode.toUpperCase() });
  };

  // 그룹 삭제/나가기
  const handleLeaveGroup = (group: GroupSession) => {
    const isHost = group.hostId === user?.id;
    const message = isHost
      ? t("groupRiding.alerts.deleteGroupMessage")
      : t("groupRiding.alerts.leaveGroupConfirm");

    Alert.alert(
      isHost ? t("groupRiding.alerts.deleteGroup") : t("groupRiding.leaveGroup"),
      message,
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: isHost ? t("common.delete") : t("groupRiding.leaveGroup"),
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
        message: t("groupRiding.shareMessage", { name: group.name, code: group.code }),
      });
    } catch (error) {
      console.error("Share error:", error);
    }
  };

  // 그룹 라이딩 시작
  const handleStartGroupRiding = (group: GroupSession) => {
    router.push(`/riding?groupId=${group.id}`);
  };

  // 멤버 승인
  const handleApproveMember = (groupId: number, memberId: number) => {
    approveMemberMutation.mutate({ groupId, memberId });
  };

  // 멤버 거절
  const handleRejectMember = (groupId: number, memberId: number) => {
    Alert.alert(
      t("groupRiding.alerts.rejectMember"),
      t("groupRiding.alerts.rejectMemberConfirm"),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("groupRiding.reject"),
          style: "destructive",
          onPress: () => rejectMemberMutation.mutate({ groupId, memberId }),
        },
      ]
    );
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
                <Text className="text-xs text-primary font-medium">{t("groupRiding.host")}</Text>
              </View>
            )}
            {item.isRiding && (
              <View className="bg-success/20 px-2 py-0.5 rounded-full ml-2">
                <Text className="text-xs text-success font-medium">{t("groupRiding.riding")}</Text>
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
          {t("groupRiding.members")} ({item.members.filter(m => m.status !== "pending").length})
        </Text>
        <View className="flex-row flex-wrap gap-2">
          {item.members.filter(m => m.status !== "pending").map((member) => (
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
              <Text className="text-sm text-foreground ml-1.5">{member.name || t("groupRiding.anonymous")}</Text>
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

      {/* Pending Members (Host Only) */}
      {item.hostId === user?.id && item.members.filter(m => m.status === "pending").length > 0 && (
        <View className="mt-3 p-3 bg-warning/10 rounded-lg border border-warning/30">
          <Text className="text-sm font-medium text-warning mb-2">
            {t("groupRiding.pendingApproval")} ({item.members.filter(m => m.status === "pending").length})
          </Text>
          {item.members.filter(m => m.status === "pending").map((member) => (
            <View
              key={member.userId}
              className="flex-row items-center justify-between py-2 border-b border-border/50"
            >
              <View className="flex-row items-center flex-1">
                {member.profileImageUrl ? (
                  <Image
                    source={{ uri: member.profileImageUrl }}
                    style={{ width: 28, height: 28, borderRadius: 14 }}
                  />
                ) : (
                  <View
                    style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: colors.muted }}
                    className="items-center justify-center"
                  >
                    <Text className="text-white text-xs font-bold">
                      {(member.name || "?").charAt(0)}
                    </Text>
                  </View>
                )}
                <Text className="text-sm text-foreground ml-2">{member.name || t("groupRiding.anonymous")}</Text>
              </View>
              <View className="flex-row gap-2">
                <Pressable
                  onPress={() => handleApproveMember(item.id, member.userId)}
                  style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
                  className="bg-success px-3 py-1.5 rounded-full"
                >
                  <Text className="text-white text-xs font-medium">{t("groupRiding.approve")}</Text>
                </Pressable>
                <Pressable
                  onPress={() => handleRejectMember(item.id, member.userId)}
                  style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
                  className="bg-error px-3 py-1.5 rounded-full"
                >
                  <Text className="text-white text-xs font-medium">{t("groupRiding.reject")}</Text>
                </Pressable>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Start Button - 현재 사용자가 pending 상태면 비활성화 */}
      {(() => {
        const currentUserMember = item.members.find(m => m.userId === user?.id);
        const isPending = currentUserMember?.status === "pending";
        return (
          <>
            {isPending && (
              <View className="mt-4 p-3 bg-warning/10 rounded-lg border border-warning/30">
                <Text className="text-sm text-warning text-center">
                  {t("groupRiding.waitingForHost")}
                </Text>
              </View>
            )}
            <Pressable
              onPress={() => !isPending && handleStartGroupRiding(item)}
              disabled={isPending}
              style={({ pressed }) => [
                { opacity: isPending ? 0.5 : (pressed ? 0.8 : 1), transform: [{ scale: pressed && !isPending ? 0.98 : 1 }] },
              ]}
              className={`mt-4 py-3 rounded-lg flex-row items-center justify-center ${isPending ? 'bg-muted' : 'bg-primary'}`}
            >
              <MaterialIcons name="play-arrow" size={20} color="#FFFFFF" />
              <Text className="text-white font-semibold ml-2">
                {isPending ? t("groupRiding.waitingPending") : t("groupRiding.startGroupRide")}
              </Text>
            </Pressable>
          </>
        );
      })()}
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
        <Text className="text-lg font-bold text-foreground">{t("groupRiding.title")}</Text>
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
          <Text className="text-white font-semibold ml-2">{t("groupRiding.createGroup")}</Text>
        </Pressable>
        <Pressable
          onPress={() => setShowJoinModal(true)}
          style={({ pressed }) => [
            { opacity: pressed ? 0.8 : 1, flex: 1 },
          ]}
          className="bg-surface border border-primary py-3 rounded-lg flex-row items-center justify-center"
        >
          <MaterialIcons name="group-add" size={20} color={colors.primary} />
          <Text className="text-primary font-semibold ml-2">{t("groupRiding.join")}</Text>
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
            {t("groupRiding.noGroups")}
          </Text>
          <Text className="text-sm text-muted mt-2 text-center">
            {t("groupRiding.noGroupsDesc")}
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
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          className="flex-1 justify-end"
        >
          <View className="flex-1 justify-end bg-black/50">
            <SafeAreaView edges={["bottom"]} style={{ backgroundColor: colors.background }}>
              <View className="bg-background rounded-t-3xl p-6">
              <View className="flex-row items-center justify-between mb-6">
                <Text className="text-xl font-bold text-foreground">{t("groupRiding.createNew")}</Text>
                <Pressable onPress={() => setShowCreateModal(false)}>
                  <MaterialIcons name="close" size={24} color={colors.foreground} />
                </Pressable>
              </View>

              <Text className="text-sm text-muted mb-2">{t("groupRiding.groupName")}</Text>
              <TextInput
                value={newGroupName}
                onChangeText={setNewGroupName}
                placeholder={t("groupRiding.enterGroupName")}
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
                  <Text className="text-white font-bold text-base">{t("groupRiding.createGroup")}</Text>
                )}
              </Pressable>
              </View>
            </SafeAreaView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Join Group Modal */}
      <Modal
        visible={showJoinModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowJoinModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          className="flex-1 justify-end"
        >
          <View className="flex-1 justify-end bg-black/50">
            <SafeAreaView edges={["bottom"]} style={{ backgroundColor: colors.background }}>
              <View className="bg-background rounded-t-3xl p-6">
              <View className="flex-row items-center justify-between mb-6">
                <Text className="text-xl font-bold text-foreground">{t("groupRiding.joinExisting")}</Text>
                <Pressable onPress={() => setShowJoinModal(false)}>
                  <MaterialIcons name="close" size={24} color={colors.foreground} />
                </Pressable>
              </View>

              <Text className="text-sm text-muted mb-2">{t("groupRiding.groupCode")}</Text>
              <TextInput
                value={joinCode}
                onChangeText={(text) => setJoinCode(text.toUpperCase())}
                placeholder={t("groupRiding.groupCodePlaceholder")}
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
                  <Text className="text-white font-bold text-base">{t("groupRiding.join")}</Text>
                )}
              </Pressable>
              </View>
            </SafeAreaView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </ScreenContainer>
  );
}
