import { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Platform,
  TextInput,
  Modal,
  Pressable,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useAuth } from "@/hooks/use-auth";
import { trpc } from "@/lib/trpc";

type TabType = "survey" | "bugs" | "announcements" | "users" | "posts" | "rides";

export default function AdminDashboardScreen() {
  const router = useRouter();
  const colors = useColors();
  const { user, loading: authLoading } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>("survey");

  // Check admin access
  useEffect(() => {
    if (user && user.role !== "admin") {
      Alert.alert("접근 불가", "관리자 권한이 필요합니다.", [
        { text: "확인", onPress: () => router.back() }
      ]);
    }
  }, [user]);

  // Survey statistics
  const { data: surveyStats, refetch: refetchSurveyStats, isLoading: loadingSurveyStats } = 
    trpc.survey.getStats.useQuery(undefined, { enabled: user?.role === "admin" });

  // Survey responses
  const { data: surveyResponses, refetch: refetchSurveyResponses } = 
    trpc.survey.getAll.useQuery({ page: 1, limit: 50 }, { enabled: user?.role === "admin" });

  // Bug reports
  const { data: bugReports, refetch: refetchBugReports, isLoading: loadingBugReports } = 
    trpc.bugReports.getAll.useQuery({ page: 1, limit: 50 }, { enabled: user?.role === "admin" });

  const updateBugStatusMutation = trpc.bugReports.updateStatus.useMutation();

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      refetchSurveyStats(),
      refetchSurveyResponses(),
      refetchBugReports(),
    ]);
    setRefreshing(false);
  };

  const handleUpdateBugStatus = async (bugId: number, newStatus: string) => {
    try {
      await updateBugStatusMutation.mutateAsync({
        id: bugId,
        status: newStatus as any,
      });
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      refetchBugReports();
    } catch (error) {
      Alert.alert("오류", "상태 업데이트에 실패했습니다.");
    }
  };

  const showStatusOptions = (bugId: number, currentStatus: string) => {
    const statusOptions = [
      { label: "열림", value: "open" },
      { label: "진행 중", value: "in_progress" },
      { label: "해결됨", value: "resolved" },
      { label: "종료", value: "closed" },
      { label: "수정 안함", value: "wont_fix" },
    ];

    Alert.alert(
      "상태 변경",
      "새로운 상태를 선택하세요",
      [
        ...statusOptions
          .filter(opt => opt.value !== currentStatus)
          .map(opt => ({
            text: opt.label,
            onPress: () => handleUpdateBugStatus(bugId, opt.value),
          })),
        { text: "취소", style: "cancel" },
      ]
    );
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "open": return "#EF4444";
      case "in_progress": return "#F59E0B";
      case "resolved": return "#22C55E";
      case "closed": return "#6B7280";
      case "wont_fix": return "#9CA3AF";
      default: return colors.muted;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "open": return "열림";
      case "in_progress": return "진행 중";
      case "resolved": return "해결됨";
      case "closed": return "종료";
      case "wont_fix": return "수정 안함";
      default: return status;
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "low": return "#22C55E";
      case "medium": return "#F59E0B";
      case "high": return "#EF4444";
      case "critical": return "#DC2626";
      default: return colors.muted;
    }
  };

  const getSeverityLabel = (severity: string) => {
    switch (severity) {
      case "low": return "낮음";
      case "medium": return "보통";
      case "high": return "높음";
      case "critical": return "심각";
      default: return severity;
    }
  };

  const renderStars = (rating: number) => (
    <View className="flex-row">
      {[1, 2, 3, 4, 5].map((star) => (
        <Ionicons
          key={star}
          name={star <= rating ? "star" : "star-outline"}
          size={14}
          color={star <= rating ? "#F59E0B" : "#9CA3AF"}
        />
      ))}
    </View>
  );

  // Show loading while auth is loading
  if (authLoading) {
    return (
      <ScreenContainer className="items-center justify-center">
        <ActivityIndicator size="large" color={colors.primary} />
        <Text className="text-muted mt-4">로딩 중...</Text>
      </ScreenContainer>
    );
  }

  // Show access denied if not admin
  if (!user || user.role !== "admin") {
    return (
      <ScreenContainer className="items-center justify-center p-6">
        <MaterialIcons name="admin-panel-settings" size={64} color={colors.muted} />
        <Text className="text-xl font-bold text-foreground mt-4">접근 불가</Text>
        <Text className="text-muted text-center mt-2">관리자 권한이 필요합니다.</Text>
        <TouchableOpacity 
          className="mt-6 bg-primary px-6 py-3 rounded-xl"
          onPress={() => router.back()}
        >
          <Text className="text-white font-semibold">돌아가기</Text>
        </TouchableOpacity>
      </ScreenContainer>
    );
  }

  const tabs = [
    { key: "survey", label: "설문", icon: "analytics" },
    { key: "bugs", label: "버그", icon: "bug-report", badge: bugReports?.openCount },
    { key: "announcements", label: "공지", icon: "campaign" },
    { key: "users", label: "사용자", icon: "people" },
    { key: "posts", label: "게시글", icon: "article" },
    { key: "rides", label: "주행기록", icon: "directions-bike" },
  ];

  return (
    <ScreenContainer>
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-border">
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.foreground} />
        </TouchableOpacity>
        <Text className="text-lg font-bold text-foreground">관리자 대시보드</Text>
        <TouchableOpacity onPress={handleRefresh}>
          <Ionicons name="refresh" size={24} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Tab Selector - Scrollable */}
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        className="border-b border-border"
        contentContainerStyle={{ paddingHorizontal: 8 }}
      >
        {tabs.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            className={`px-4 py-3 items-center ${activeTab === tab.key ? "border-b-2 border-primary" : ""}`}
            onPress={() => setActiveTab(tab.key as TabType)}
          >
            <View className="flex-row items-center">
              <MaterialIcons
                name={tab.icon as any}
                size={18}
                color={activeTab === tab.key ? colors.primary : colors.muted}
              />
              <Text className={`ml-1 text-sm font-medium ${activeTab === tab.key ? "text-primary" : "text-muted"}`}>
                {tab.label}
              </Text>
              {tab.badge && tab.badge > 0 && (
                <View className="ml-1 bg-error rounded-full px-1.5 py-0.5 min-w-[18px] items-center">
                  <Text className="text-white text-xs font-bold">{tab.badge}</Text>
                </View>
              )}
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView
        className="flex-1"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        {activeTab === "survey" && (
          <SurveyTab
            surveyStats={surveyStats}
            surveyResponses={surveyResponses}
            loadingSurveyStats={loadingSurveyStats}
            renderStars={renderStars}
            colors={colors}
          />
        )}

        {activeTab === "bugs" && (
          <BugsTab
            bugReports={bugReports}
            loadingBugReports={loadingBugReports}
            showStatusOptions={showStatusOptions}
            getStatusColor={getStatusColor}
            getStatusLabel={getStatusLabel}
            getSeverityColor={getSeverityColor}
            getSeverityLabel={getSeverityLabel}
            colors={colors}
          />
        )}

        {activeTab === "announcements" && <AnnouncementsTab colors={colors} />}
        {activeTab === "users" && <UsersTab colors={colors} />}
        {activeTab === "posts" && <PostsTab colors={colors} />}
        {activeTab === "rides" && <RidesTab colors={colors} />}

        <View className="h-8" />
      </ScrollView>
    </ScreenContainer>
  );
}

// Survey Tab Component
function SurveyTab({ surveyStats, surveyResponses, loadingSurveyStats, renderStars, colors }: any) {
  return (
    <View className="p-4">
      {loadingSurveyStats ? (
        <ActivityIndicator size="large" color={colors.primary} />
      ) : surveyStats ? (
        <>
          <View className="flex-row gap-3 mb-4">
            <View className="flex-1 bg-surface rounded-xl p-4 border border-border">
              <Text className="text-muted text-sm">총 응답</Text>
              <Text className="text-2xl font-bold text-foreground">{surveyStats.totalResponses}</Text>
            </View>
            <View className="flex-1 bg-surface rounded-xl p-4 border border-border">
              <Text className="text-muted text-sm">추천율</Text>
              <Text className="text-2xl font-bold text-success">{surveyStats.recommendRate.toFixed(0)}%</Text>
            </View>
          </View>

          <View className="bg-surface rounded-xl p-4 border border-border mb-4">
            <Text className="text-base font-semibold text-foreground mb-3">평균 평점</Text>
            <View className="gap-3">
              <View className="flex-row items-center justify-between">
                <Text className="text-muted">전반적 만족도</Text>
                <View className="flex-row items-center">
                  {renderStars(Math.round(surveyStats.avgOverall))}
                  <Text className="text-foreground font-semibold ml-2">{surveyStats.avgOverall.toFixed(1)}</Text>
                </View>
              </View>
              <View className="flex-row items-center justify-between">
                <Text className="text-muted">사용 편의성</Text>
                <View className="flex-row items-center">
                  {renderStars(Math.round(surveyStats.avgUsability))}
                  <Text className="text-foreground font-semibold ml-2">{surveyStats.avgUsability.toFixed(1)}</Text>
                </View>
              </View>
              <View className="flex-row items-center justify-between">
                <Text className="text-muted">기능 완성도</Text>
                <View className="flex-row items-center">
                  {renderStars(Math.round(surveyStats.avgFeature))}
                  <Text className="text-foreground font-semibold ml-2">{surveyStats.avgFeature.toFixed(1)}</Text>
                </View>
              </View>
            </View>
          </View>

          <View className="bg-surface rounded-xl p-4 border border-border mb-4">
            <Text className="text-base font-semibold text-foreground mb-3">가장 많이 사용한 기능</Text>
            {surveyStats.featureUsage.map((item: any, index: number) => (
              <View key={item.feature} className="flex-row items-center justify-between py-2">
                <View className="flex-row items-center">
                  <Text className="text-muted w-6">{index + 1}.</Text>
                  <Text className="text-foreground">{getFeatureLabel(item.feature)}</Text>
                </View>
                <Text className="text-primary font-semibold">{item.count}명</Text>
              </View>
            ))}
          </View>

          <Text className="text-base font-semibold text-foreground mb-3">최근 응답</Text>
          {surveyResponses?.responses.map((response: any) => (
            <View key={response.id} className="bg-surface rounded-xl p-4 border border-border mb-3">
              <View className="flex-row items-center justify-between mb-2">
                <Text className="text-foreground font-medium">{response.userName || "익명"}</Text>
                <Text className="text-muted text-xs">
                  {new Date(response.createdAt).toLocaleDateString("ko-KR")}
                </Text>
              </View>
              <View className="flex-row items-center gap-4 mb-2">
                <View className="flex-row items-center">
                  <Text className="text-muted text-xs mr-1">만족도</Text>
                  {renderStars(response.overallRating)}
                </View>
              </View>
              {response.improvementSuggestion && (
                <View className="bg-background rounded-lg p-3 mt-2">
                  <Text className="text-xs text-muted mb-1">개선 제안</Text>
                  <Text className="text-foreground text-sm">{response.improvementSuggestion}</Text>
                </View>
              )}
              {response.bugReport && (
                <View className="bg-error/10 rounded-lg p-3 mt-2">
                  <Text className="text-xs text-error mb-1">버그 리포트</Text>
                  <Text className="text-foreground text-sm">{response.bugReport}</Text>
                </View>
              )}
            </View>
          ))}
        </>
      ) : (
        <Text className="text-muted text-center py-8">데이터를 불러올 수 없습니다.</Text>
      )}
    </View>
  );
}

// Bugs Tab Component
function BugsTab({ bugReports, loadingBugReports, showStatusOptions, getStatusColor, getStatusLabel, getSeverityColor, getSeverityLabel, colors }: any) {
  return (
    <View className="p-4">
      {loadingBugReports ? (
        <ActivityIndicator size="large" color={colors.primary} />
      ) : bugReports ? (
        <>
          <View className="flex-row gap-3 mb-4">
            <View className="flex-1 bg-error/10 rounded-xl p-3 border border-error/30">
              <Text className="text-error text-xs">열림</Text>
              <Text className="text-xl font-bold text-error">{bugReports.openCount}</Text>
            </View>
            <View className="flex-1 bg-warning/10 rounded-xl p-3 border border-warning/30">
              <Text className="text-warning text-xs">진행 중</Text>
              <Text className="text-xl font-bold text-warning">{bugReports.inProgressCount}</Text>
            </View>
            <View className="flex-1 bg-success/10 rounded-xl p-3 border border-success/30">
              <Text className="text-success text-xs">해결됨</Text>
              <Text className="text-xl font-bold text-success">{bugReports.resolvedCount}</Text>
            </View>
          </View>

          {bugReports.reports.map((bug: any) => (
            <TouchableOpacity
              key={bug.id}
              className="bg-surface rounded-xl p-4 border border-border mb-3"
              onPress={() => showStatusOptions(bug.id, bug.status)}
            >
              <View className="flex-row items-start justify-between mb-2">
                <View className="flex-1 mr-3">
                  <Text className="text-foreground font-semibold" numberOfLines={2}>
                    {bug.title}
                  </Text>
                  <Text className="text-muted text-xs mt-1">
                    {bug.userName || bug.userEmail || "익명"} • {new Date(bug.createdAt).toLocaleDateString("ko-KR")}
                  </Text>
                </View>
                <View className="items-end">
                  <View 
                    className="px-2 py-1 rounded-full"
                    style={{ backgroundColor: `${getStatusColor(bug.status)}20` }}
                  >
                    <Text style={{ color: getStatusColor(bug.status), fontSize: 11, fontWeight: "600" }}>
                      {getStatusLabel(bug.status)}
                    </Text>
                  </View>
                  <View 
                    className="px-2 py-0.5 rounded mt-1"
                    style={{ backgroundColor: `${getSeverityColor(bug.severity)}20` }}
                  >
                    <Text style={{ color: getSeverityColor(bug.severity), fontSize: 10 }}>
                      {getSeverityLabel(bug.severity)}
                    </Text>
                  </View>
                </View>
              </View>
              <Text className="text-muted text-sm" numberOfLines={3}>
                {bug.description}
              </Text>
              {bug.screenshotUrls && (
                <View className="flex-row items-center mt-2">
                  <Ionicons name="images-outline" size={14} color={colors.muted} />
                  <Text className="text-muted text-xs ml-1">
                    스크린샷 {JSON.parse(bug.screenshotUrls).length}장
                  </Text>
                </View>
              )}
              {bug.appVersion && (
                <Text className="text-muted text-xs mt-1">v{bug.appVersion} • {bug.deviceInfo}</Text>
              )}
            </TouchableOpacity>
          ))}

          {bugReports.reports.length === 0 && (
            <View className="items-center py-12">
              <Ionicons name="checkmark-circle" size={48} color={colors.success} />
              <Text className="text-muted mt-2">버그 리포트가 없습니다</Text>
            </View>
          )}
        </>
      ) : (
        <Text className="text-muted text-center py-8">데이터를 불러올 수 없습니다.</Text>
      )}
    </View>
  );
}

// Announcements Tab Component
function AnnouncementsTab({ colors }: { colors: any }) {
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
    <View className="flex-1 p-4">
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
                  <View className="flex-row items-center gap-2 mb-1 flex-wrap">
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

          {(!announcements || announcements.length === 0) && (
            <View className="items-center py-12">
              <MaterialIcons name="campaign" size={48} color={colors.muted} />
              <Text className="text-muted mt-2">공지사항이 없습니다</Text>
            </View>
          )}
        </>
      )}

      {/* Create Button */}
      <TouchableOpacity
        onPress={() => setShowCreateModal(true)}
        className="absolute bottom-6 right-6 bg-primary w-14 h-14 rounded-full items-center justify-center shadow-lg"
        style={{ position: "absolute", bottom: 24, right: 24 }}
      >
        <MaterialIcons name="add" size={28} color="white" />
      </TouchableOpacity>

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
        colors={colors}
      />
    </View>
  );
}

// Announcement Modal Component
function AnnouncementModal({
  visible,
  announcement,
  onClose,
  onSave,
  isLoading,
  colors,
}: {
  visible: boolean;
  announcement?: any;
  onClose: () => void;
  onSave: (data: any) => void;
  isLoading: boolean;
  colors: any;
}) {
  const [title, setTitle] = useState(announcement?.title || "");
  const [content, setContent] = useState(announcement?.content || "");
  const [type, setType] = useState<"update" | "notice" | "event" | "maintenance">(
    announcement?.type || "notice"
  );
  const [showPopup, setShowPopup] = useState(announcement?.showPopup ?? true);
  const [isActive, setIsActive] = useState(announcement?.isActive ?? true);

  useEffect(() => {
    if (announcement) {
      setTitle(announcement.title || "");
      setContent(announcement.content || "");
      setType(announcement.type || "notice");
      setShowPopup(announcement.showPopup ?? true);
      setIsActive(announcement.isActive ?? true);
    } else {
      setTitle("");
      setContent("");
      setType("notice");
      setShowPopup(true);
      setIsActive(true);
    }
  }, [announcement]);

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
            <Text className="text-sm font-medium text-foreground mb-2">유형</Text>
            <View className="flex-row gap-2 mb-4 flex-wrap">
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

            <Text className="text-sm font-medium text-foreground mb-2">제목</Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="공지사항 제목"
              placeholderTextColor={colors.muted}
              className="bg-surface border border-border rounded-xl px-4 py-3 text-foreground mb-4"
            />

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

// Users Tab Component
function UsersTab({ colors }: { colors: any }) {
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
    <View className="flex-1 p-4">
      <View className="flex-row items-center bg-surface border border-border rounded-xl px-4 mb-4">
        <MaterialIcons name="search" size={20} color={colors.muted} />
        <TextInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="사용자 검색..."
          placeholderTextColor={colors.muted}
          className="flex-1 py-3 ml-2 text-foreground"
        />
      </View>

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
                  <Text className="text-lg font-bold text-primary">
                    {user.name?.[0] || "?"}
                  </Text>
                </View>
                <View className="flex-1 ml-3">
                  <View className="flex-row items-center gap-2 flex-wrap">
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

          {(!filteredUsers || filteredUsers.length === 0) && (
            <View className="items-center py-12">
              <MaterialIcons name="people" size={48} color={colors.muted} />
              <Text className="text-muted mt-2">사용자가 없습니다</Text>
            </View>
          )}
        </>
      )}

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

                <View className="flex-row gap-3 mb-10">
                  {!userDetails.banStatus.banned && (
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

// Posts Tab Component
function PostsTab({ colors }: { colors: any }) {
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
    <View className="flex-1 p-4">
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

          {(!posts || posts.length === 0) && (
            <View className="items-center py-12">
              <MaterialIcons name="article" size={48} color={colors.muted} />
              <Text className="text-muted mt-2">게시글이 없습니다</Text>
            </View>
          )}
        </>
      )}
    </View>
  );
}

// Rides Tab Component - 모든 유저 주행 기록
function RidesTab({ colors }: { colors: any }) {
  const [page, setPage] = useState(1);
  const { data, refetch, isLoading } = trpc.admin.getAllRidingRecords.useQuery(
    { page, limit: 50 }
  );

  const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    }
    return `${minutes}:${secs.toString().padStart(2, "0")}`;
  };

  const formatDate = (date: Date | string): string => {
    const d = new Date(date);
    return d.toLocaleDateString("ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const totalPages = data ? Math.ceil(data.total / 50) : 1;

  return (
    <View className="flex-1 p-4">
      {/* Summary */}
      <View className="bg-surface rounded-xl p-4 mb-4 border border-border">
        <Text className="text-muted text-sm">전체 주행 기록</Text>
        <Text className="text-2xl font-bold text-foreground">
          {data?.total?.toLocaleString() || 0}건
        </Text>
      </View>

      {isLoading ? (
        <ActivityIndicator size="large" color={colors.primary} />
      ) : (
        <>
          {data?.records?.map((record: any) => (
            <View
              key={record.id}
              className="bg-surface rounded-xl p-4 mb-3 border border-border"
            >
              {/* User Info */}
              <View className="flex-row items-center justify-between mb-2">
                <View className="flex-row items-center gap-2">
                  <MaterialIcons name="person" size={18} color={colors.primary} />
                  <Text className="text-sm font-semibold text-foreground">
                    {record.userName || "이름 없음"}
                  </Text>
                </View>
                <Text className="text-xs text-muted">
                  {formatDate(record.createdAt)}
                </Text>
              </View>

              {/* Email */}
              <Text className="text-xs text-muted mb-2">
                {record.userEmail || "이메일 없음"}
              </Text>

              {/* Ride Stats */}
              <View className="flex-row justify-between bg-background rounded-lg p-3">
                <View className="items-center">
                  <Text className="text-base font-bold text-primary">
                    {(record.distance / 1000).toFixed(2)}km
                  </Text>
                  <Text className="text-xs text-muted">거리</Text>
                </View>
                <View className="items-center">
                  <Text className="text-base font-bold text-foreground">
                    {formatDuration(record.duration)}
                  </Text>
                  <Text className="text-xs text-muted">시간</Text>
                </View>
                <View className="items-center">
                  <Text className="text-base font-bold text-foreground">
                    {(record.avgSpeed / 10).toFixed(1)}
                  </Text>
                  <Text className="text-xs text-muted">평균(km/h)</Text>
                </View>
                <View className="items-center">
                  <Text className="text-base font-bold text-warning">
                    {(record.maxSpeed / 10).toFixed(1)}
                  </Text>
                  <Text className="text-xs text-muted">최고(km/h)</Text>
                </View>
              </View>

              {/* Scooter Info */}
              {record.scooterName && (
                <View className="flex-row items-center gap-1 mt-2">
                  <MaterialIcons name="electric-scooter" size={14} color={colors.muted} />
                  <Text className="text-xs text-muted">{record.scooterName}</Text>
                </View>
              )}
            </View>
          ))}

          {(!data?.records || data.records.length === 0) && (
            <View className="items-center py-12">
              <MaterialIcons name="directions-bike" size={48} color={colors.muted} />
              <Text className="text-muted mt-2">주행 기록이 없습니다</Text>
            </View>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <View className="flex-row items-center justify-center gap-4 mt-4 mb-8">
              <Pressable
                onPress={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className={`px-4 py-2 rounded-lg ${page === 1 ? "bg-gray-200" : "bg-primary"}`}
              >
                <Text className={page === 1 ? "text-gray-500" : "text-white"}>이전</Text>
              </Pressable>
              <Text className="text-foreground">
                {page} / {totalPages}
              </Text>
              <Pressable
                onPress={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className={`px-4 py-2 rounded-lg ${page === totalPages ? "bg-gray-200" : "bg-primary"}`}
              >
                <Text className={page === totalPages ? "text-gray-500" : "text-white"}>다음</Text>
              </Pressable>
            </View>
          )}
        </>
      )}
    </View>
  );
}

function getFeatureLabel(feature: string): string {
  switch (feature) {
    case "riding": return "주행 기록";
    case "group": return "그룹 라이딩";
    case "community": return "커뮤니티";
    case "scooter": return "기체 관리";
    case "stats": return "통계 확인";
    default: return feature;
  }
}
