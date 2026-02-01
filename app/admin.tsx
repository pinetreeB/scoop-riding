import { useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  Alert,
  Modal,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useRouter } from "expo-router";
import { MaterialIcons } from "@expo/vector-icons";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useAuth } from "@/hooks/use-auth";
import { trpc } from "@/lib/trpc";

type TabType = "announcements" | "users" | "posts" | "banned";

export default function AdminScreen() {
  const router = useRouter();
  const colors = useColors();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>("announcements");
  const [refreshing, setRefreshing] = useState(false);

  // Check if user is admin
  if ((user as any)?.role !== "admin") {
    return (
      <ScreenContainer className="flex-1 items-center justify-center p-6">
        <MaterialIcons name="lock" size={64} color={colors.muted} />
        <Text className="text-xl font-bold text-foreground mt-4">접근 권한 없음</Text>
        <Text className="text-muted text-center mt-2">
          관리자 권한이 필요합니다.
        </Text>
        <Pressable
          onPress={() => router.back()}
          className="mt-6 bg-primary px-6 py-3 rounded-full"
        >
          <Text className="text-white font-semibold">돌아가기</Text>
        </Pressable>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      {/* Header */}
      <View className="flex-row items-center px-4 py-3 border-b border-border">
        <Pressable onPress={() => router.back()} className="p-2 -ml-2">
          <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
        </Pressable>
        <Text className="text-xl font-bold text-foreground ml-2">관리자 대시보드</Text>
      </View>

      {/* Tabs */}
      <View className="flex-row border-b border-border">
        {[
          { key: "announcements", label: "공지사항", icon: "campaign" },
          { key: "users", label: "사용자", icon: "people" },
          { key: "posts", label: "게시글", icon: "article" },
          { key: "banned", label: "차단", icon: "block" },
        ].map((tab) => (
          <Pressable
            key={tab.key}
            onPress={() => setActiveTab(tab.key as TabType)}
            className={`flex-1 py-3 items-center ${
              activeTab === tab.key ? "border-b-2 border-primary" : ""
            }`}
          >
            <MaterialIcons
              name={tab.icon as any}
              size={20}
              color={activeTab === tab.key ? colors.primary : colors.muted}
            />
            <Text
              className={`text-xs mt-1 ${
                activeTab === tab.key ? "text-primary font-semibold" : "text-muted"
              }`}
            >
              {tab.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Tab Content */}
      {activeTab === "announcements" && <AnnouncementsTab />}
      {activeTab === "users" && <UsersTab />}
      {activeTab === "posts" && <PostsTab />}
      {activeTab === "banned" && <BannedTab />}
    </ScreenContainer>
  );
}

// Announcements Tab
function AnnouncementsTab() {
  const colors = useColors();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingAnnouncement, setEditingAnnouncement] = useState<any>(null);

  const { data: announcements, refetch, isLoading } = trpc.admin.getAnnouncements.useQuery();
  const createMutation = trpc.admin.createAnnouncement.useMutation({
    onSuccess: () => {
      refetch();
      setShowCreateModal(false);
    },
  });
  const updateMutation = trpc.admin.updateAnnouncement.useMutation({
    onSuccess: () => {
      refetch();
      setEditingAnnouncement(null);
    },
  });
  const deleteMutation = trpc.admin.deleteAnnouncement.useMutation({
    onSuccess: () => refetch(),
  });

  const handleDelete = (id: number) => {
    Alert.alert("공지사항 삭제", "정말 삭제하시겠습니까?", [
      { text: "취소", style: "cancel" },
      {
        text: "삭제",
        style: "destructive",
        onPress: () => deleteMutation.mutate({ id }),
      },
    ]);
  };

  return (
    <View className="flex-1">
      <ScrollView className="flex-1 p-4">
        {isLoading ? (
          <ActivityIndicator size="large" color={colors.primary} />
        ) : (
          <>
            {announcements?.map((announcement) => (
              <View
                key={announcement.id}
                className="bg-surface rounded-xl p-4 mb-3 border border-border"
              >
                <View className="flex-row items-start justify-between">
                  <View className="flex-1">
                    <View className="flex-row items-center gap-2 mb-1">
                      <View
                        className={`px-2 py-0.5 rounded ${
                          announcement.type === "update"
                            ? "bg-blue-100"
                            : announcement.type === "notice"
                            ? "bg-green-100"
                            : announcement.type === "event"
                            ? "bg-purple-100"
                            : "bg-red-100"
                        }`}
                      >
                        <Text
                          className={`text-xs font-medium ${
                            announcement.type === "update"
                              ? "text-blue-600"
                              : announcement.type === "notice"
                              ? "text-green-600"
                              : announcement.type === "event"
                              ? "text-purple-600"
                              : "text-red-600"
                          }`}
                        >
                          {announcement.type === "update"
                            ? "업데이트"
                            : announcement.type === "notice"
                            ? "공지"
                            : announcement.type === "event"
                            ? "이벤트"
                            : "점검"}
                        </Text>
                      </View>
                      {!announcement.isActive && (
                        <View className="bg-gray-100 px-2 py-0.5 rounded">
                          <Text className="text-xs text-gray-600">비활성</Text>
                        </View>
                      )}
                      {announcement.showPopup && (
                        <View className="bg-orange-100 px-2 py-0.5 rounded">
                          <Text className="text-xs text-orange-600">팝업</Text>
                        </View>
                      )}
                    </View>
                    <Text className="text-base font-semibold text-foreground">
                      {announcement.title}
                    </Text>
                    <Text className="text-sm text-muted mt-1" numberOfLines={2}>
                      {announcement.content}
                    </Text>
                    <Text className="text-xs text-muted mt-2">
                      {new Date(announcement.createdAt).toLocaleDateString("ko-KR")}
                    </Text>
                  </View>
                  <View className="flex-row gap-2">
                    <Pressable
                      onPress={() => setEditingAnnouncement(announcement)}
                      className="p-2"
                    >
                      <MaterialIcons name="edit" size={20} color={colors.primary} />
                    </Pressable>
                    <Pressable
                      onPress={() => handleDelete(announcement.id)}
                      className="p-2"
                    >
                      <MaterialIcons name="delete" size={20} color={colors.error} />
                    </Pressable>
                  </View>
                </View>
              </View>
            ))}
          </>
        )}
      </ScrollView>

      {/* Create Button */}
      <Pressable
        onPress={() => setShowCreateModal(true)}
        className="absolute bottom-6 right-6 bg-primary w-14 h-14 rounded-full items-center justify-center shadow-lg"
      >
        <MaterialIcons name="add" size={28} color="white" />
      </Pressable>

      {/* Create/Edit Modal */}
      <AnnouncementModal
        visible={showCreateModal || !!editingAnnouncement}
        announcement={editingAnnouncement}
        onClose={() => {
          setShowCreateModal(false);
          setEditingAnnouncement(null);
        }}
        onSave={(data) => {
          if (editingAnnouncement) {
            updateMutation.mutate({ id: editingAnnouncement.id, ...data });
          } else {
            createMutation.mutate(data);
          }
        }}
        isLoading={createMutation.isPending || updateMutation.isPending}
      />
    </View>
  );
}

// Announcement Create/Edit Modal
function AnnouncementModal({
  visible,
  announcement,
  onClose,
  onSave,
  isLoading,
}: {
  visible: boolean;
  announcement?: any;
  onClose: () => void;
  onSave: (data: any) => void;
  isLoading: boolean;
}) {
  const colors = useColors();
  const [title, setTitle] = useState(announcement?.title || "");
  const [content, setContent] = useState(announcement?.content || "");
  const [type, setType] = useState<"update" | "notice" | "event" | "maintenance">(
    announcement?.type || "notice"
  );
  const [showPopup, setShowPopup] = useState(announcement?.showPopup ?? true);
  const [isActive, setIsActive] = useState(announcement?.isActive ?? true);

  const handleSave = () => {
    if (!title.trim() || !content.trim()) {
      Alert.alert("오류", "제목과 내용을 입력해주세요.");
      return;
    }
    onSave({ title, content, type, showPopup, isActive });
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View className="flex-1 bg-black/50 justify-end">
        <View className="bg-background rounded-t-3xl max-h-[90%]">
          <View className="flex-row items-center justify-between p-4 border-b border-border">
            <Pressable onPress={onClose}>
              <Text className="text-muted">취소</Text>
            </Pressable>
            <Text className="text-lg font-bold text-foreground">
              {announcement ? "공지사항 수정" : "새 공지사항"}
            </Text>
            <Pressable onPress={handleSave} disabled={isLoading}>
              {isLoading ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Text className="text-primary font-semibold">저장</Text>
              )}
            </Pressable>
          </View>

          <ScrollView className="p-4">
            {/* Type Selection */}
            <Text className="text-sm font-medium text-foreground mb-2">유형</Text>
            <View className="flex-row gap-2 mb-4">
              {[
                { key: "notice", label: "공지" },
                { key: "update", label: "업데이트" },
                { key: "event", label: "이벤트" },
                { key: "maintenance", label: "점검" },
              ].map((t) => (
                <Pressable
                  key={t.key}
                  onPress={() => setType(t.key as any)}
                  className={`px-4 py-2 rounded-full ${
                    type === t.key ? "bg-primary" : "bg-surface border border-border"
                  }`}
                >
                  <Text
                    className={type === t.key ? "text-white font-medium" : "text-muted"}
                  >
                    {t.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* Title */}
            <Text className="text-sm font-medium text-foreground mb-2">제목</Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="공지사항 제목"
              placeholderTextColor={colors.muted}
              className="bg-surface border border-border rounded-xl px-4 py-3 text-foreground mb-4"
            />

            {/* Content */}
            <Text className="text-sm font-medium text-foreground mb-2">내용</Text>
            <TextInput
              value={content}
              onChangeText={setContent}
              placeholder="공지사항 내용"
              placeholderTextColor={colors.muted}
              multiline
              numberOfLines={6}
              textAlignVertical="top"
              className="bg-surface border border-border rounded-xl px-4 py-3 text-foreground mb-4 min-h-[150px]"
            />

            {/* Options */}
            <View className="flex-row items-center justify-between py-3 border-t border-border">
              <Text className="text-foreground">팝업으로 표시</Text>
              <Pressable
                onPress={() => setShowPopup(!showPopup)}
                className={`w-12 h-7 rounded-full ${
                  showPopup ? "bg-primary" : "bg-gray-300"
                } justify-center`}
              >
                <View
                  className={`w-5 h-5 rounded-full bg-white shadow ${
                    showPopup ? "ml-6" : "ml-1"
                  }`}
                />
              </Pressable>
            </View>

            <View className="flex-row items-center justify-between py-3 border-t border-border mb-10">
              <Text className="text-foreground">활성화</Text>
              <Pressable
                onPress={() => setIsActive(!isActive)}
                className={`w-12 h-7 rounded-full ${
                  isActive ? "bg-primary" : "bg-gray-300"
                } justify-center`}
              >
                <View
                  className={`w-5 h-5 rounded-full bg-white shadow ${
                    isActive ? "ml-6" : "ml-1"
                  }`}
                />
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// Users Tab
function UsersTab() {
  const colors = useColors();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedUser, setSelectedUser] = useState<number | null>(null);

  const { data, refetch, isLoading } = trpc.admin.getUsers.useQuery({ page: 1, limit: 50 });
  const { data: userDetails, isLoading: detailsLoading } = trpc.admin.getUserDetails.useQuery(
    { userId: selectedUser! },
    { enabled: !!selectedUser }
  );
  const banMutation = trpc.admin.banUser.useMutation({
    onSuccess: () => {
      refetch();
      setSelectedUser(null);
    },
  });

  const filteredUsers = data?.users.filter(
    (u) =>
      u.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleBan = (userId: number, userName: string) => {
    Alert.alert(
      "사용자 차단",
      `${userName}님을 차단하시겠습니까?`,
      [
        { text: "취소", style: "cancel" },
        {
          text: "차단",
          style: "destructive",
          onPress: () => banMutation.mutate({ userId, banType: "permanent" }),
        },
      ]
    );
  };

  return (
    <View className="flex-1">
      {/* Search */}
      <View className="p-4">
        <View className="flex-row items-center bg-surface border border-border rounded-xl px-4">
          <MaterialIcons name="search" size={20} color={colors.muted} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="사용자 검색..."
            placeholderTextColor={colors.muted}
            className="flex-1 py-3 ml-2 text-foreground"
          />
        </View>
      </View>

      <ScrollView className="flex-1 px-4">
        {isLoading ? (
          <ActivityIndicator size="large" color={colors.primary} />
        ) : (
          <>
            <Text className="text-sm text-muted mb-2">
              총 {data?.total || 0}명의 사용자
            </Text>
            {filteredUsers?.map((user) => (
              <Pressable
                key={user.id}
                onPress={() => setSelectedUser(user.id)}
                className="bg-surface rounded-xl p-4 mb-3 border border-border"
              >
                <View className="flex-row items-center">
                  <View className="w-12 h-12 rounded-full bg-primary/10 items-center justify-center">
                    {user.profileImageUrl ? (
                      <MaterialIcons name="person" size={24} color={colors.primary} />
                    ) : (
                      <Text className="text-lg font-bold text-primary">
                        {user.name?.[0] || "?"}
                      </Text>
                    )}
                  </View>
                  <View className="flex-1 ml-3">
                    <View className="flex-row items-center gap-2">
                      <Text className="text-base font-semibold text-foreground">
                        {user.name || "이름 없음"}
                      </Text>
                      {user.role === "admin" && (
                        <View className="bg-primary/10 px-2 py-0.5 rounded">
                          <Text className="text-xs text-primary">관리자</Text>
                        </View>
                      )}
                      {user.isBanned && (
                        <View className="bg-red-100 px-2 py-0.5 rounded">
                          <Text className="text-xs text-red-600">차단됨</Text>
                        </View>
                      )}
                    </View>
                    <Text className="text-sm text-muted">{user.email}</Text>
                    <Text className="text-xs text-muted mt-1">
                      주행 {user.totalRides}회 · {(user.totalDistance / 1000).toFixed(1)}km
                    </Text>
                  </View>
                  <MaterialIcons name="chevron-right" size={24} color={colors.muted} />
                </View>
              </Pressable>
            ))}
          </>
        )}
      </ScrollView>

      {/* User Detail Modal */}
      <Modal visible={!!selectedUser} animationType="slide" transparent>
        <View className="flex-1 bg-black/50 justify-end">
          <View className="bg-background rounded-t-3xl max-h-[80%]">
            <View className="flex-row items-center justify-between p-4 border-b border-border">
              <Pressable onPress={() => setSelectedUser(null)}>
                <MaterialIcons name="close" size={24} color={colors.foreground} />
              </Pressable>
              <Text className="text-lg font-bold text-foreground">사용자 상세</Text>
              <View style={{ width: 24 }} />
            </View>

            {detailsLoading ? (
              <View className="p-8 items-center">
                <ActivityIndicator size="large" color={colors.primary} />
              </View>
            ) : userDetails?.user ? (
              <ScrollView className="p-4">
                {/* User Info */}
                <View className="items-center mb-6">
                  <View className="w-20 h-20 rounded-full bg-primary/10 items-center justify-center mb-3">
                    <Text className="text-2xl font-bold text-primary">
                      {userDetails.user.name?.[0] || "?"}
                    </Text>
                  </View>
                  <Text className="text-xl font-bold text-foreground">
                    {userDetails.user.name || "이름 없음"}
                  </Text>
                  <Text className="text-muted">{userDetails.user.email}</Text>
                  <Text className="text-xs text-muted mt-1">
                    가입일: {new Date(userDetails.user.createdAt).toLocaleDateString("ko-KR")}
                  </Text>
                </View>

                {/* Stats */}
                <View className="bg-surface rounded-xl p-4 mb-4">
                  <Text className="text-sm font-semibold text-foreground mb-3">주행 통계</Text>
                  <View className="flex-row justify-between">
                    <View className="items-center">
                      <Text className="text-lg font-bold text-primary">
                        {userDetails.stats.totalRides}
                      </Text>
                      <Text className="text-xs text-muted">총 주행</Text>
                    </View>
                    <View className="items-center">
                      <Text className="text-lg font-bold text-primary">
                        {(userDetails.stats.totalDistance / 1000).toFixed(1)}km
                      </Text>
                      <Text className="text-xs text-muted">총 거리</Text>
                    </View>
                    <View className="items-center">
                      <Text className="text-lg font-bold text-primary">
                        {userDetails.stats.avgSpeed.toFixed(1)}
                      </Text>
                      <Text className="text-xs text-muted">평균 속도</Text>
                    </View>
                    <View className="items-center">
                      <Text className="text-lg font-bold text-primary">
                        {userDetails.stats.maxSpeed.toFixed(1)}
                      </Text>
                      <Text className="text-xs text-muted">최고 속도</Text>
                    </View>
                  </View>
                </View>

                {/* Ban Status */}
                {userDetails.banStatus.banned && (
                  <View className="bg-red-50 rounded-xl p-4 mb-4">
                    <Text className="text-red-600 font-semibold">차단된 사용자</Text>
                    {userDetails.banStatus.reason && (
                      <Text className="text-red-500 text-sm mt-1">
                        사유: {userDetails.banStatus.reason}
                      </Text>
                    )}
                  </View>
                )}

                {/* Actions */}
                <View className="flex-row gap-3 mb-10">
                  {userDetails.banStatus.banned ? (
                    <Pressable
                      onPress={() => {
                        // Unban logic
                      }}
                      className="flex-1 bg-green-500 py-3 rounded-xl items-center"
                    >
                      <Text className="text-white font-semibold">차단 해제</Text>
                    </Pressable>
                  ) : (
                    <Pressable
                      onPress={() =>
                        handleBan(userDetails.user!.id, userDetails.user!.name || "사용자")
                      }
                      className="flex-1 bg-red-500 py-3 rounded-xl items-center"
                    >
                      <Text className="text-white font-semibold">사용자 차단</Text>
                    </Pressable>
                  )}
                </View>
              </ScrollView>
            ) : (
              <View className="p-8 items-center">
                <Text className="text-muted">사용자 정보를 불러올 수 없습니다.</Text>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

// Posts Tab
function PostsTab() {
  const colors = useColors();
  const { data: posts, refetch, isLoading } = trpc.community.getPosts.useQuery({ limit: 50 });
  const deleteMutation = trpc.admin.deletePost.useMutation({
    onSuccess: () => refetch(),
  });

  const handleDelete = (postId: number) => {
    Alert.alert("게시글 삭제", "정말 삭제하시겠습니까?", [
      { text: "취소", style: "cancel" },
      {
        text: "삭제",
        style: "destructive",
        onPress: () => deleteMutation.mutate({ postId }),
      },
    ]);
  };

  return (
    <ScrollView className="flex-1 p-4">
      {isLoading ? (
        <ActivityIndicator size="large" color={colors.primary} />
      ) : (
        <>
          {posts?.map((post: any) => (
            <View
              key={post.id}
              className="bg-surface rounded-xl p-4 mb-3 border border-border"
            >
              <View className="flex-row items-start justify-between">
                <View className="flex-1">
                  <Text className="text-sm text-muted mb-1">
                    {post.author?.name || "익명"} · {new Date(post.createdAt).toLocaleDateString("ko-KR")}
                  </Text>
                  <Text className="text-base text-foreground" numberOfLines={2}>
                    {post.content}
                  </Text>
                  <View className="flex-row items-center gap-4 mt-2">
                    <Text className="text-xs text-muted">
                      ❤️ {post.likeCount} · 💬 {post.commentCount} · 👁 {post.viewCount}
                    </Text>
                  </View>
                </View>
                <Pressable onPress={() => handleDelete(post.id)} className="p-2">
                  <MaterialIcons name="delete" size={20} color={colors.error} />
                </Pressable>
              </View>
            </View>
          ))}
        </>
      )}
    </ScrollView>
  );
}

// Banned Users Tab
function BannedTab() {
  const colors = useColors();
  const { data: bannedUsers, refetch, isLoading } = trpc.admin.getBannedUsers.useQuery();
  const unbanMutation = trpc.admin.unbanUser.useMutation({
    onSuccess: () => refetch(),
  });

  const handleUnban = (userId: number, userName: string) => {
    Alert.alert(
      "차단 해제",
      `${userName}님의 차단을 해제하시겠습니까?`,
      [
        { text: "취소", style: "cancel" },
        {
          text: "해제",
          onPress: () => unbanMutation.mutate({ userId }),
        },
      ]
    );
  };

  return (
    <ScrollView className="flex-1 p-4">
      {isLoading ? (
        <ActivityIndicator size="large" color={colors.primary} />
      ) : bannedUsers?.length === 0 ? (
        <View className="items-center py-10">
          <MaterialIcons name="check-circle" size={48} color={colors.success} />
          <Text className="text-muted mt-4">차단된 사용자가 없습니다.</Text>
        </View>
      ) : (
        <>
          {bannedUsers?.map((ban) => (
            <View
              key={ban.id}
              className="bg-surface rounded-xl p-4 mb-3 border border-border"
            >
              <View className="flex-row items-center justify-between">
                <View className="flex-1">
                  <Text className="text-base font-semibold text-foreground">
                    {ban.userName || "이름 없음"}
                  </Text>
                  {ban.reason && (
                    <Text className="text-sm text-red-500 mt-1">사유: {ban.reason}</Text>
                  )}
                  <Text className="text-xs text-muted mt-1">
                    차단일: {new Date(ban.createdAt).toLocaleDateString("ko-KR")}
                  </Text>
                </View>
                <Pressable
                  onPress={() => handleUnban(ban.userId, ban.userName || "사용자")}
                  className="bg-green-500 px-4 py-2 rounded-full"
                >
                  <Text className="text-white font-medium">해제</Text>
                </Pressable>
              </View>
            </View>
          ))}
        </>
      )}
    </ScrollView>
  );
}
