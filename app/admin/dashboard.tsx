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
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useAuth } from "@/hooks/use-auth";
import { trpc } from "@/lib/trpc";

export default function AdminDashboardScreen() {
  const router = useRouter();
  const colors = useColors();
  const { user } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<"survey" | "bugs">("survey");

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
  const { data: surveyResponses, refetch: refetchSurveyResponses, isLoading: loadingSurveyResponses } = 
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

  const handleUpdateBugStatus = async (bugId: number, newStatus: string, adminNotes?: string) => {
    try {
      await updateBugStatusMutation.mutateAsync({
        id: bugId,
        status: newStatus as any,
        adminNotes,
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

  if (user?.role !== "admin") {
    return (
      <ScreenContainer className="items-center justify-center">
        <ActivityIndicator size="large" color={colors.primary} />
      </ScreenContainer>
    );
  }

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

      {/* Tab Selector */}
      <View className="flex-row border-b border-border">
        <TouchableOpacity
          className={`flex-1 py-3 items-center ${activeTab === "survey" ? "border-b-2 border-primary" : ""}`}
          onPress={() => setActiveTab("survey")}
        >
          <Text className={`font-semibold ${activeTab === "survey" ? "text-primary" : "text-muted"}`}>
            설문 통계
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          className={`flex-1 py-3 items-center ${activeTab === "bugs" ? "border-b-2 border-primary" : ""}`}
          onPress={() => setActiveTab("bugs")}
        >
          <View className="flex-row items-center">
            <Text className={`font-semibold ${activeTab === "bugs" ? "text-primary" : "text-muted"}`}>
              버그 리포트
            </Text>
            {bugReports && bugReports.openCount > 0 && (
              <View className="ml-2 bg-error rounded-full px-2 py-0.5">
                <Text className="text-white text-xs font-bold">{bugReports.openCount}</Text>
              </View>
            )}
          </View>
        </TouchableOpacity>
      </View>

      <ScrollView
        className="flex-1"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        {activeTab === "survey" ? (
          <View className="p-4">
            {/* Survey Statistics Cards */}
            {loadingSurveyStats ? (
              <ActivityIndicator size="large" color={colors.primary} />
            ) : surveyStats ? (
              <>
                {/* Overview Cards */}
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

                {/* Rating Cards */}
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

                {/* Feature Usage */}
                <View className="bg-surface rounded-xl p-4 border border-border mb-4">
                  <Text className="text-base font-semibold text-foreground mb-3">가장 많이 사용한 기능</Text>
                  {surveyStats.featureUsage.map((item, index) => (
                    <View key={item.feature} className="flex-row items-center justify-between py-2">
                      <View className="flex-row items-center">
                        <Text className="text-muted w-6">{index + 1}.</Text>
                        <Text className="text-foreground">{getFeatureLabel(item.feature)}</Text>
                      </View>
                      <Text className="text-primary font-semibold">{item.count}명</Text>
                    </View>
                  ))}
                </View>

                {/* Recent Responses */}
                <Text className="text-base font-semibold text-foreground mb-3">최근 응답</Text>
                {surveyResponses?.responses.map((response) => (
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
        ) : (
          <View className="p-4">
            {/* Bug Report Stats */}
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

                {/* Bug List */}
                {bugReports.reports.map((bug) => (
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
        )}

        <View className="h-8" />
      </ScrollView>
    </ScreenContainer>
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
