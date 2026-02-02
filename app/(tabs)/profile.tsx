import { useCallback, useState, useRef } from "react";
import {
  Text,
  View,
  ScrollView,
  Pressable,
  Alert,
  Platform,
  Image,
  ActivityIndicator,
  Modal,
  Linking,
  TextInput,
  KeyboardAvoidingView,
} from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Haptics from "expo-haptics";
import { useFocusEffect, useRouter } from "expo-router";
import { useEffect } from "react";

import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useAuth } from "@/hooks/use-auth";
import { useThemeContext } from "@/lib/theme-provider";
import { trpc } from "@/lib/trpc";
import {
  getRidingRecords,
  clearAllRecords,
  formatDuration,
  fullSync,
  type RidingRecord,
} from "@/lib/riding-store";
import { calculateLevel, getLevelTitle, getLevelColor, LEVEL_DEFINITIONS } from "@/lib/level-system";
import Constants from "expo-constants";
import * as Sharing from "expo-sharing";
import { captureScreen } from "react-native-view-shot";

export default function ProfileScreen() {
  const colors = useColors();
  const router = useRouter();
  const trpcUtils = trpc.useUtils();
  const { user, logout, isAuthenticated, loading: authLoading } = useAuth();
  const { themeMode, setThemeMode, isDarkMode } = useThemeContext();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const [locationSharingEnabled, setLocationSharingEnabled] = useState(true);
  const [stats, setStats] = useState({
    totalDistance: 0,
    totalDuration: 0,
    totalRides: 0,
    avgSpeed: 0,
    maxSpeed: 0,
    maxSpeedRecordId: null as string | null,
    maxSpeedRecordDate: null as string | null,
    level: 1,
    levelProgress: 0,
    unsyncedCount: 0,
  });
  const [showMaxSpeedModal, setShowMaxSpeedModal] = useState(false);
  const [showBugReportModal, setShowBugReportModal] = useState(false);
  const [bugReportText, setBugReportText] = useState("");
  const [showFeatureRequestModal, setShowFeatureRequestModal] = useState(false);
  const [featureRequestText, setFeatureRequestText] = useState("");
  const [isCapturingScreen, setIsCapturingScreen] = useState(false);
  const [capturedScreenshot, setCapturedScreenshot] = useState<string | null>(null);
  const [appUpdateInfo, setAppUpdateInfo] = useState<{
    hasUpdate: boolean;
    latestVersion: string | null;
    downloadUrl: string | null;
    releaseNotes: string | null;
  }>({ hasUpdate: false, latestVersion: null, downloadUrl: null, releaseNotes: null });

  const CURRENT_APP_VERSION = Constants.expoConfig?.version || "0.0.12";

  // Check for app updates
  const { data: updateData } = trpc.appVersion.checkUpdate.useQuery(
    { currentVersion: CURRENT_APP_VERSION, platform: "android" },
    { staleTime: 1000 * 60 * 60 } // Cache for 1 hour
  );

  useEffect(() => {
    if (updateData) {
      setAppUpdateInfo({
        hasUpdate: updateData.hasUpdate,
        latestVersion: updateData.latestVersion?.version || null,
        downloadUrl: updateData.latestVersion?.downloadUrl || null,
        releaseNotes: updateData.latestVersion?.releaseNotes || null,
      });
    }
  }, [updateData]);

  // Level calculation now uses centralized level-system module

  const loadStats = useCallback(async () => {
    const records = await getRidingRecords();
    
    const totalDistance = records.reduce((sum, r) => sum + r.distance, 0);
    const totalDuration = records.reduce((sum, r) => sum + r.duration, 0);
    const avgSpeed = records.length > 0
      ? records.reduce((sum, r) => sum + r.avgSpeed, 0) / records.length
      : 0;
    
    // Find max speed and the record it came from
    let maxSpeed = 0;
    let maxSpeedRecordId: string | null = null;
    let maxSpeedRecordDate: string | null = null;
    for (const r of records) {
      if (r.maxSpeed > maxSpeed) {
        maxSpeed = r.maxSpeed;
        maxSpeedRecordId = r.id;
        maxSpeedRecordDate = r.date;
      }
    }
    
    const unsyncedCount = records.filter((r) => !r.synced).length;

    const { level, progress } = calculateLevel(totalDistance / 1000);

    setStats({
      totalDistance,
      totalDuration,
      totalRides: records.length,
      avgSpeed,
      maxSpeed,
      maxSpeedRecordId,
      maxSpeedRecordDate,
      level,
      levelProgress: progress,
      unsyncedCount,
    });
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadStats();
    }, [loadStats])
  );

  const handleSync = async () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    setIsSyncing(true);
    setSyncStatus("동기화 중...");

    try {
      console.log("[Profile] Starting full sync...");
      const result = await fullSync(trpcUtils);
      console.log("[Profile] Sync result:", result);
      
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }

      let statusMsg = "동기화 완료";
      if (result.uploaded > 0 || result.downloaded > 0) {
        statusMsg = `동기화 완료: ${result.uploaded}개 업로드, ${result.downloaded}개 다운로드`;
      } else if (result.failed > 0) {
        statusMsg = `동기화 완료: ${result.failed}개 실패`;
      } else {
        statusMsg = "동기화 완료: 모든 데이터가 최신 상태입니다";
      }
      setSyncStatus(statusMsg);
      await loadStats();

      // Clear status after 3 seconds
      setTimeout(() => setSyncStatus(null), 3000);
    } catch (error: any) {
      console.error("[Profile] Sync error:", {
        message: error?.message || String(error),
        code: error?.data?.code || error?.code,
        stack: error?.stack?.substring(0, 300),
      });
      
      // Provide more helpful error messages based on error type
      let errorMsg = error?.message || "알 수 없는 오류";
      const errorCode = error?.data?.code || error?.code || '';
      
      if (errorMsg.includes('UNAUTHORIZED') || errorMsg.includes('Invalid session') || errorCode === 'UNAUTHORIZED') {
        errorMsg = "인증이 만료되었습니다. 다시 로그인해주세요.";
      } else if (errorMsg.includes('Network') || errorMsg.includes('fetch') || errorMsg.includes('Failed to fetch')) {
        errorMsg = "네트워크 연결을 확인해주세요.";
      } else if (errorMsg.includes('timeout') || errorMsg.includes('Timeout')) {
        errorMsg = "서버 응답 시간 초과. 잠시 후 다시 시도해주세요.";
      } else if (errorMsg.includes('Duplicate') || errorMsg.includes('duplicate')) {
        errorMsg = "이미 동기화된 기록입니다.";
      } else if (errorMsg.includes('500') || errorMsg.includes('Internal')) {
        errorMsg = "서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.";
      }
      
      setSyncStatus(`동기화 실패: ${errorMsg}`);
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
      setTimeout(() => setSyncStatus(null), 5000);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleLogout = async () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    Alert.alert(
      "로그아웃",
      "정말 로그아웃 하시겠습니까?",
      [
        { text: "취소", style: "cancel" },
        {
          text: "로그아웃",
          style: "destructive",
          onPress: async () => {
            setIsLoggingOut(true);
            try {
              await logout();
              if (Platform.OS !== "web") {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              }
              // AuthGuard will handle navigation automatically
            } catch (error) {
              console.error("Logout error:", error);
              Alert.alert("오류", "로그아웃 중 오류가 발생했습니다.");
            } finally {
              setIsLoggingOut(false);
            }
          },
        },
      ]
    );
  };

  const handleClearData = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    Alert.alert(
      "데이터 초기화",
      "모든 주행 기록이 삭제됩니다. 계속하시겠습니까?",
      [
        { text: "취소", style: "cancel" },
        {
          text: "삭제",
          style: "destructive",
          onPress: async () => {
            await clearAllRecords();
            await loadStats();
            if (Platform.OS !== "web") {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            }
          },
        },
      ]
    );
  };

  // getLevelTitle is now imported from @/lib/level-system

  // Capture screenshot for bug report
  const handleCaptureScreenshot = async () => {
    if (Platform.OS === "web") {
      Alert.alert("알림", "웹에서는 스크린샷 기능을 사용할 수 없습니다.");
      return;
    }

    try {
      setIsCapturingScreen(true);
      // Close modal temporarily to capture the actual screen
      setShowBugReportModal(false);
      
      // Wait for modal to close
      await new Promise(resolve => setTimeout(resolve, 300));
      
      const uri = await captureScreen({
        format: "jpg",
        quality: 0.8,
      });
      
      setCapturedScreenshot(uri);
      setShowBugReportModal(true);
      
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      console.error("Screenshot capture error:", error);
      setShowBugReportModal(true);
      Alert.alert("오류", "스크린샷을 캡처하는 중 오류가 발생했습니다.");
    } finally {
      setIsCapturingScreen(false);
    }
  };

  // Bug Report Email Handler
  const handleSendBugReport = async () => {
    if (!bugReportText.trim()) {
      Alert.alert("오류", "버그 내용을 입력해주세요.");
      return;
    }

    const deviceInfo = [
      `앱 버전: v${CURRENT_APP_VERSION}`,
      `플랫폼: ${Platform.OS} ${Platform.Version}`,
      `사용자 ID: ${user?.id || "비로그인"}`,
      `사용자 이메일: ${user?.email || "없음"}`,
      `시간: ${new Date().toISOString()}`,
      `스크린샷 첨부: ${capturedScreenshot ? "예" : "아니오"}`,
    ].join("\n");

    const emailBody = `[버그 리포트]\n\n${bugReportText}\n\n--- 기기 정보 ---\n${deviceInfo}${capturedScreenshot ? "\n\n[스크린샷이 첨부되어 있습니다]" : ""}`;
    const emailSubject = `[SCOOP 버그 리포트] v${CURRENT_APP_VERSION}`;
    const supportEmail = "scoop@scoopmotor.com";

    // If screenshot exists, use sharing API to include it
    if (capturedScreenshot && Platform.OS !== "web") {
      try {
        const isAvailable = await Sharing.isAvailableAsync();
        if (isAvailable) {
          await Sharing.shareAsync(capturedScreenshot, {
            mimeType: "image/jpeg",
            dialogTitle: "SCOOP 버그 리포트 - 스크린샷 공유",
            UTI: "public.jpeg",
          });
          // After sharing screenshot, open email
          const mailtoUrl = `mailto:${supportEmail}?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`;
          await Linking.openURL(mailtoUrl);
          
          setShowBugReportModal(false);
          setBugReportText("");
          setCapturedScreenshot(null);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          return;
        }
      } catch (error) {
        console.error("Sharing error:", error);
        // Fall through to email-only approach
      }
    }
    
    // Fallback: email only without screenshot
    const mailtoUrl = `mailto:${supportEmail}?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`;
    
    try {
      const canOpen = await Linking.canOpenURL(mailtoUrl);
      if (canOpen) {
        await Linking.openURL(mailtoUrl);
        setShowBugReportModal(false);
        setBugReportText("");
        setCapturedScreenshot(null);
        if (Platform.OS !== "web") {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
      } else {
        Alert.alert("오류", "이메일 앱을 열 수 없습니다. 이메일 앱이 설치되어 있는지 확인해주세요.");
      }
    } catch (error) {
      console.error("Bug report email error:", error);
      Alert.alert("오류", "이메일을 보내는 중 오류가 발생했습니다.");
    }
  };

  // Feature Request Email Handler
  const handleSendFeatureRequest = async () => {
    if (!featureRequestText.trim()) {
      Alert.alert("오류", "기능 제안 내용을 입력해주세요.");
      return;
    }

    const deviceInfo = [
      `앱 버전: v${CURRENT_APP_VERSION}`,
      `플랫폼: ${Platform.OS} ${Platform.Version}`,
      `사용자 ID: ${user?.id || "비로그인"}`,
      `사용자 이메일: ${user?.email || "없음"}`,
      `시간: ${new Date().toISOString()}`,
    ].join("\n");

    const emailBody = `[기능 제안]\n\n${featureRequestText}\n\n--- 사용자 정보 ---\n${deviceInfo}`;
    const emailSubject = `[SCOOP 기능 제안] v${CURRENT_APP_VERSION}`;
    const supportEmail = "scoop@scoopmotor.com";
    
    const mailtoUrl = `mailto:${supportEmail}?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`;
    
    try {
      const canOpen = await Linking.canOpenURL(mailtoUrl);
      if (canOpen) {
        await Linking.openURL(mailtoUrl);
        setShowFeatureRequestModal(false);
        setFeatureRequestText("");
        if (Platform.OS !== "web") {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
      } else {
        Alert.alert("오류", "이메일 앱을 열 수 없습니다. 이메일 앱이 설치되어 있는지 확인해주세요.");
      }
    } catch (error) {
      console.error("Feature request email error:", error);
      Alert.alert("오류", "이메일을 보내는 중 오류가 발생했습니다.");
    }
  };

  const getUserDisplayName = () => {
    if (user?.name) return user.name;
    if (user?.email) return user.email.split("@")[0];
    return "SCOOP 라이더";
  };

  const getLoginMethodIcon = () => {
    switch (user?.loginMethod) {
      case "google":
        return "account-circle";
      case "email":
        return "email";
      default:
        return "person";
    }
  };

  return (
    <ScreenContainer>
      <ScrollView 
        className="flex-1" 
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 100 }}
      >
        {/* Header */}
        <View className="px-5 pt-4 pb-6">
          <Text className="text-2xl font-bold text-foreground">내 정보</Text>
        </View>

        {/* Profile Card */}
        <View className="mx-5 mb-6 bg-surface rounded-2xl p-5 border border-border">
          <View className="flex-row items-center mb-4">
            <Pressable
              onPress={() => router.push("/edit-profile" as never)}
              style={({ pressed }) => [{ opacity: pressed ? 0.8 : 1 }]}
            >
              {user?.profileImageUrl ? (
                <Image
                  source={{ uri: user.profileImageUrl }}
                  style={{ width: 64, height: 64, borderRadius: 32, marginRight: 16 }}
                />
              ) : (
                <View 
                  className="w-16 h-16 rounded-full items-center justify-center mr-4"
                  style={{ backgroundColor: colors.primary }}
                >
                  <Text className="text-white text-2xl font-bold">
                    {getUserDisplayName().charAt(0).toUpperCase()}
                  </Text>
                </View>
              )}
            </Pressable>
            <View className="flex-1">
              <View className="flex-row items-center justify-between">
                <Text className="text-xl font-bold text-foreground">{getUserDisplayName()}</Text>
                <Pressable
                  onPress={() => router.push("/edit-profile" as never)}
                  style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
                >
                  <MaterialIcons name="edit" size={20} color={colors.muted} />
                </Pressable>
              </View>
              {user?.email && (
                <Text className="text-muted text-sm mt-0.5">{user.email}</Text>
              )}
              <View className="flex-row items-center mt-1">
                <View 
                  className="px-2 py-1 rounded-full mr-2"
                  style={{ backgroundColor: colors.primary }}
                >
                  <Text className="text-white text-xs font-bold">Lv.{stats.level}</Text>
                </View>
                <Text className="text-muted text-sm">{getLevelTitle(stats.level)}</Text>
              </View>
            </View>
          </View>

          {/* Level Progress */}
          <View className="mb-2">
            <View className="flex-row justify-between mb-1">
              <Text className="text-muted text-xs">레벨 진행도</Text>
              <Text className="text-muted text-xs">{(stats.levelProgress * 100).toFixed(0)}%</Text>
            </View>
            <View className="h-2 bg-border rounded-full overflow-hidden">
              <View
                className="h-full rounded-full"
                style={{
                  backgroundColor: colors.primary,
                  width: `${stats.levelProgress * 100}%`,
                }}
              />
            </View>
            <View className="flex-row justify-between mt-1">
              <Text className="text-muted text-xs">
                현재: {(stats.totalDistance / 1000).toFixed(1)}km
              </Text>
              {stats.level < 7 && (
                <Text className="text-muted text-xs">
                  다음 레벨까지 {calculateLevel(stats.totalDistance / 1000).nextLevelDistance.toLocaleString()}km
                </Text>
              )}
            </View>
          </View>
        </View>

        {/* Cloud Sync Card */}
        <View className="mx-5 mb-6 bg-surface rounded-2xl p-5 border border-border">
          <View className="flex-row items-center justify-between mb-3">
            <View className="flex-row items-center">
              <MaterialIcons name="cloud-sync" size={24} color={colors.primary} />
              <Text className="text-lg font-bold text-foreground ml-2">클라우드 동기화</Text>
            </View>
            {stats.unsyncedCount > 0 && (
              <View className="bg-warning px-2 py-1 rounded-full">
                <Text className="text-white text-xs font-bold">{stats.unsyncedCount}개 미동기화</Text>
              </View>
            )}
          </View>
          
          <Text className="text-muted text-sm mb-4">
            주행 기록을 클라우드에 저장하여 다른 기기에서도 확인할 수 있습니다.
          </Text>

          {syncStatus && (
            <View className="bg-background rounded-lg p-3 mb-3">
              <Text className="text-foreground text-sm text-center">{syncStatus}</Text>
            </View>
          )}

          <Pressable
            onPress={handleSync}
            disabled={isSyncing}
            style={({ pressed }) => [
              { 
                opacity: pressed || isSyncing ? 0.7 : 1,
                backgroundColor: colors.primary,
              }
            ]}
            className="flex-row items-center justify-center py-3 rounded-xl"
          >
            {isSyncing ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <MaterialIcons name="sync" size={20} color="#FFFFFF" />
                <Text className="text-white font-bold ml-2">지금 동기화</Text>
              </>
            )}
          </Pressable>
        </View>

        {/* Stats Grid */}
        <View className="mx-5 mb-6">
          <Text className="text-lg font-bold text-foreground mb-3">누적 기록</Text>
          
          <View className="flex-row flex-wrap">
            {/* Total Distance */}
            <View className="w-1/2 pr-2 mb-3">
              <View className="bg-surface rounded-xl p-4 border border-border">
                <View className="flex-row items-center mb-2">
                  <MaterialIcons name="straighten" size={20} color={colors.primary} />
                  <Text className="text-muted text-xs ml-2">총 거리</Text>
                </View>
                <Text className="text-2xl font-bold text-foreground">
                  {(stats.totalDistance / 1000).toFixed(1)}
                </Text>
                <Text className="text-muted text-xs">km</Text>
              </View>
            </View>

            {/* Total Duration */}
            <View className="w-1/2 pl-2 mb-3">
              <View className="bg-surface rounded-xl p-4 border border-border">
                <View className="flex-row items-center mb-2">
                  <MaterialIcons name="schedule" size={20} color={colors.primary} />
                  <Text className="text-muted text-xs ml-2">총 시간</Text>
                </View>
                <Text className="text-2xl font-bold text-foreground">
                  {formatDuration(stats.totalDuration)}
                </Text>
                <Text className="text-muted text-xs">시간</Text>
              </View>
            </View>

            {/* Total Rides */}
            <View className="w-1/2 pr-2 mb-3">
              <View className="bg-surface rounded-xl p-4 border border-border">
                <View className="flex-row items-center mb-2">
                  <MaterialIcons name="electric-scooter" size={20} color={colors.primary} />
                  <Text className="text-muted text-xs ml-2">주행 횟수</Text>
                </View>
                <Text className="text-2xl font-bold text-foreground">
                  {stats.totalRides}
                </Text>
                <Text className="text-muted text-xs">회</Text>
              </View>
            </View>

            {/* Average Speed */}
            <View className="w-1/2 pl-2 mb-3">
              <View className="bg-surface rounded-xl p-4 border border-border">
                <View className="flex-row items-center mb-2">
                  <MaterialIcons name="speed" size={20} color={colors.primary} />
                  <Text className="text-muted text-xs ml-2">평균 속도</Text>
                </View>
                <Text className="text-2xl font-bold text-foreground">
                  {stats.avgSpeed.toFixed(1)}
                </Text>
                <Text className="text-muted text-xs">km/h</Text>
              </View>
            </View>

            {/* Max Speed - Clickable */}
            <Pressable
              className="w-full mb-3"
              onPress={() => {
                if (stats.maxSpeedRecordId) {
                  if (Platform.OS !== "web") {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }
                  setShowMaxSpeedModal(true);
                }
              }}
              style={({ pressed }) => [{ opacity: pressed && stats.maxSpeedRecordId ? 0.8 : 1 }]}
            >
              <View className="bg-surface rounded-xl p-4 border border-border flex-row items-center">
                <View className="flex-1">
                  <View className="flex-row items-center mb-2">
                    <MaterialIcons name="bolt" size={20} color={colors.warning} />
                    <Text className="text-muted text-xs ml-2">최고 속도</Text>
                    {stats.maxSpeedRecordId && (
                      <MaterialIcons name="chevron-right" size={16} color={colors.muted} style={{ marginLeft: 4 }} />
                    )}
                  </View>
                  <Text className="text-3xl font-bold text-foreground">
                    {stats.maxSpeed.toFixed(1)} <Text className="text-lg text-muted">km/h</Text>
                  </Text>
                </View>
                <MaterialIcons name="emoji-events" size={40} color={colors.warning} />
              </View>
            </Pressable>
          </View>
        </View>

        {/* Account Settings */}
        <View className="mx-5 mb-6">
          <Text className="text-lg font-bold text-foreground mb-3">계정</Text>
          
          <View className="bg-surface rounded-2xl border border-border overflow-hidden">
            {/* Account Info */}
            <View className="flex-row items-center p-4 border-b border-border">
              <MaterialIcons name="account-circle" size={24} color={colors.primary} />
              <View className="flex-1 ml-3">
                <Text className="text-foreground font-medium">로그인 정보</Text>
                <Text className="text-muted text-xs">
                  {user?.loginMethod === "google" ? "Google 계정" : "이메일"} 로그인
                </Text>
              </View>
            </View>

            {/* Logout Button */}
            <Pressable
              onPress={handleLogout}
              disabled={isLoggingOut}
              style={({ pressed }) => [{ opacity: pressed || isLoggingOut ? 0.7 : 1 }]}
              className="flex-row items-center p-4"
            >
              <MaterialIcons name="logout" size={24} color={colors.error} />
              <View className="flex-1 ml-3">
                <Text className="text-error font-medium">로그아웃</Text>
                <Text className="text-muted text-xs">계정에서 로그아웃합니다</Text>
              </View>
              {isLoggingOut ? (
                <ActivityIndicator size="small" color={colors.error} />
              ) : (
                <MaterialIcons name="chevron-right" size={24} color={colors.muted} />
              )}
            </Pressable>
          </View>
        </View>

        {/* Social */}
        <View className="mx-5 mb-6">
          <Text className="text-lg font-bold text-foreground mb-3">소셜</Text>
          
          <View className="bg-surface rounded-2xl border border-border overflow-hidden">
            {/* Friends */}
            <Pressable
              onPress={() => router.push("/friends" as any)}
              style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
              className="flex-row items-center p-4 border-b border-border"
            >
              <MaterialIcons name="people" size={24} color={colors.primary} />
              <View className="flex-1 ml-3">
                <Text className="text-foreground font-medium">친구</Text>
                <Text className="text-muted text-xs">친구 검색 및 관리</Text>
              </View>
              <MaterialIcons name="chevron-right" size={24} color={colors.muted} />
            </Pressable>

            {/* Ranking */}
            <Pressable
              onPress={() => router.push("/ranking" as any)}
              style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
              className="flex-row items-center p-4 border-b border-border"
            >
              <MaterialIcons name="leaderboard" size={24} color={colors.warning} />
              <View className="flex-1 ml-3">
                <Text className="text-foreground font-medium">랭킹</Text>
                <Text className="text-muted text-xs">주간/월간 주행 랭킹</Text>
              </View>
              <MaterialIcons name="chevron-right" size={24} color={colors.muted} />
            </Pressable>

            {/* Challenges */}
            <Pressable
              onPress={() => router.push("/challenges" as any)}
              style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
              className="flex-row items-center p-4 border-b border-border"
            >
              <MaterialIcons name="emoji-events" size={24} color={colors.success} />
              <View className="flex-1 ml-3">
                <Text className="text-foreground font-medium">챌린지</Text>
                <Text className="text-muted text-xs">친구들과 함께하는 주행 챌린지</Text>
              </View>
              <MaterialIcons name="chevron-right" size={24} color={colors.muted} />
            </Pressable>

            {/* Notifications */}
            <Pressable
              onPress={() => router.push("/notifications-center" as any)}
              style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
              className="flex-row items-center p-4 border-b border-border"
            >
              <MaterialIcons name="notifications" size={24} color={colors.primary} />
              <View className="flex-1 ml-3">
                <Text className="text-foreground font-medium">알림</Text>
                <Text className="text-muted text-xs">친구 요청, 댓글, 좋아요 알림</Text>
              </View>
              <MaterialIcons name="chevron-right" size={24} color={colors.muted} />
            </Pressable>

            {/* Badges */}
            <Pressable
              onPress={() => router.push("/badges" as any)}
              style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
              className="flex-row items-center p-4"
            >
              <MaterialIcons name="military-tech" size={24} color={colors.warning} />
              <View className="flex-1 ml-3">
                <Text className="text-foreground font-medium">업적 / 배지</Text>
                <Text className="text-muted text-xs">획득한 배지 확인</Text>
              </View>
              <MaterialIcons name="chevron-right" size={24} color={colors.muted} />
            </Pressable>
          </View>
        </View>

        {/* My Scooters */}
        <View className="mx-5 mb-6">
          <Text className="text-lg font-bold text-foreground mb-3">내 기체</Text>
          
          <View className="bg-surface rounded-2xl border border-border overflow-hidden">
            <Pressable
              onPress={() => router.push("/scooters")}
              style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
              className="flex-row items-center p-4"
            >
              <MaterialIcons name="electric-scooter" size={24} color={colors.primary} />
              <View className="flex-1 ml-3">
                <Text className="text-foreground font-medium">기체 관리</Text>
                <Text className="text-muted text-xs">전동킥보드 등록 및 관리</Text>
              </View>
              <MaterialIcons name="chevron-right" size={24} color={colors.muted} />
            </Pressable>
          </View>
        </View>

        {/* Goals */}
        <View className="mx-5 mb-6">
          <Text className="text-lg font-bold text-foreground mb-3">목표</Text>
          
          <View className="bg-surface rounded-2xl border border-border overflow-hidden">
            <Pressable
              onPress={() => router.push("/goals" as any)}
              style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
              className="flex-row items-center p-4"
            >
              <MaterialIcons name="flag" size={24} color={colors.success} />
              <View className="flex-1 ml-3">
                <Text className="text-foreground font-medium">목표 설정</Text>
                <Text className="text-muted text-xs">일일/주간 주행 목표 설정</Text>
              </View>
              <MaterialIcons name="chevron-right" size={24} color={colors.muted} />
            </Pressable>
          </View>
        </View>

        {/* Settings */}
        <View className="mx-5 mb-6">
          <Text className="text-lg font-bold text-foreground mb-3">설정</Text>
          
          <View className="bg-surface rounded-2xl border border-border overflow-hidden">
            {/* Dark Mode Toggle */}
            <View className="flex-row items-center p-4 border-b border-border">
              <MaterialIcons 
                name={isDarkMode ? "dark-mode" : "light-mode"} 
                size={24} 
                color={colors.primary} 
              />
              <View className="flex-1 ml-3">
                <Text className="text-foreground font-medium">테마</Text>
                <Text className="text-muted text-xs">
                  {themeMode === "system" ? "시스템 설정 따름" : themeMode === "light" ? "라이트 모드" : "다크 모드"}
                </Text>
              </View>
              <View className="flex-row items-center gap-1">
                <Pressable 
                  onPress={() => {
                    if (Platform.OS !== "web") {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }
                    setThemeMode("system");
                  }}
                  style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
                  className="px-3 py-1 rounded-full"
                >
                  <View style={{ backgroundColor: themeMode === "system" ? colors.primary : colors.border, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 999 }}>
                    <Text style={{ color: themeMode === "system" ? '#FFFFFF' : colors.muted, fontSize: 11 }}>자동</Text>
                  </View>
                </Pressable>
                <Pressable 
                  onPress={() => {
                    if (Platform.OS !== "web") {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }
                    setThemeMode("light");
                  }}
                  style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
                  className="px-3 py-1 rounded-full"
                >
                  <View style={{ backgroundColor: themeMode === "light" ? colors.primary : colors.border, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 999 }}>
                    <Text style={{ color: themeMode === "light" ? '#FFFFFF' : colors.muted, fontSize: 11 }}>라이트</Text>
                  </View>
                </Pressable>
                <Pressable 
                  onPress={() => {
                    if (Platform.OS !== "web") {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }
                    setThemeMode("dark");
                  }}
                  style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
                  className="px-3 py-1 rounded-full"
                >
                  <View style={{ backgroundColor: themeMode === "dark" ? colors.primary : colors.border, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 999 }}>
                    <Text style={{ color: themeMode === "dark" ? '#FFFFFF' : colors.muted, fontSize: 11 }}>다크</Text>
                  </View>
                </Pressable>
              </View>
            </View>

            {/* Announcements */}
            <Pressable
              onPress={() => router.push("/announcements" as any)}
              style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
              className="flex-row items-center p-4 border-b border-border"
            >
              <MaterialIcons name="campaign" size={24} color={colors.warning} />
              <View className="flex-1 ml-3">
                <Text className="text-foreground font-medium">공지사항</Text>
                <Text className="text-muted text-xs">업데이트 및 공지 확인</Text>
              </View>
              <MaterialIcons name="chevron-right" size={24} color={colors.muted} />
            </Pressable>

            {/* Location Sharing */}
            <Pressable
              onPress={() => {
                if (Platform.OS !== "web") {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }
                setLocationSharingEnabled(!locationSharingEnabled);
              }}
              style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
              className="flex-row items-center p-4 border-b border-border"
            >
              <MaterialIcons 
                name={locationSharingEnabled ? "location-on" : "location-off"} 
                size={24} 
                color={locationSharingEnabled ? colors.primary : colors.muted} 
              />
              <View className="flex-1 ml-3">
                <Text className="text-foreground font-medium">위치 공유</Text>
                <Text className="text-muted text-xs">주행 중 친구에게 내 위치 공유</Text>
              </View>
              <View 
                className="w-12 h-7 rounded-full items-center justify-center"
                style={{ 
                  backgroundColor: locationSharingEnabled ? colors.primary : colors.border,
                  flexDirection: 'row',
                  justifyContent: locationSharingEnabled ? 'flex-end' : 'flex-start',
                  padding: 2,
                }}
              >
                <View 
                  className="w-6 h-6 rounded-full bg-white"
                  style={{ backgroundColor: '#FFFFFF' }}
                />
              </View>
            </Pressable>

            {/* Voice Guidance */}
            <Pressable
              onPress={() => router.push("/voice-settings")}
              style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
              className="flex-row items-center p-4 border-b border-border"
            >
              <MaterialIcons name="record-voice-over" size={24} color={colors.primary} />
              <View className="flex-1 ml-3">
                <Text className="text-foreground font-medium">음성 안내</Text>
                <Text className="text-muted text-xs">주행 중 속도, 거리, 시간 음성 안내</Text>
              </View>
              <MaterialIcons name="chevron-right" size={24} color={colors.muted} />
            </Pressable>

            {/* Saved Routes */}
            <Pressable
              onPress={() => router.push("/saved-routes")}
              style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
              className="flex-row items-center p-4 border-b border-border"
            >
              <MaterialIcons name="map" size={24} color={colors.primary} />
              <View className="flex-1 ml-3">
                <Text className="text-foreground font-medium">저장된 경로</Text>
                <Text className="text-muted text-xs">GPX 파일 가져오기 및 경로 따라가기</Text>
              </View>
              <MaterialIcons name="chevron-right" size={24} color={colors.muted} />
            </Pressable>

            {/* Route Heatmap */}
            <Pressable
              onPress={() => router.push("/route-heatmap")}
              style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
              className="flex-row items-center p-4 border-b border-border"
            >
              <MaterialIcons name="whatshot" size={24} color={colors.primary} />
              <View className="flex-1 ml-3">
                <Text className="text-foreground font-medium">주행 히트맵</Text>
                <Text className="text-muted text-xs">자주 다니는 경로를 시각화</Text>
              </View>
              <MaterialIcons name="chevron-right" size={24} color={colors.muted} />
            </Pressable>

            {/* Group Riding */}
            <Pressable
              onPress={() => router.push("/group-riding")}
              style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
              className="flex-row items-center p-4 border-b border-border"
            >
              <MaterialIcons name="groups" size={24} color={colors.primary} />
              <View className="flex-1 ml-3">
                <Text className="text-foreground font-medium">그룹 라이딩</Text>
                <Text className="text-muted text-xs">친구들과 함께 실시간 그룹 주행</Text>
              </View>
              <MaterialIcons name="chevron-right" size={24} color={colors.muted} />
            </Pressable>

            {/* Notifications */}
            <Pressable
              onPress={() => router.push("/notifications")}
              style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
              className="flex-row items-center p-4 border-b border-border"
            >
              <MaterialIcons name="notifications-none" size={24} color={colors.primary} />
              <View className="flex-1 ml-3">
                <Text className="text-foreground font-medium">알림 설정</Text>
                <Text className="text-muted text-xs">주행 완료, 기록 달성 알림</Text>
              </View>
              <MaterialIcons name="chevron-right" size={24} color={colors.muted} />
            </Pressable>

            {/* Admin Dashboard - only for admins */}
            {user?.role === "admin" && (
              <Pressable
                onPress={() => router.push("/admin/dashboard")}
                style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
                className="flex-row items-center p-4 border-b border-border"
              >
                <MaterialIcons name="admin-panel-settings" size={24} color={colors.primary} />
                <View className="flex-1 ml-3">
                  <Text className="text-foreground font-medium">관리자 대시보드</Text>
                  <Text className="text-muted text-xs">설문 통계, 버그 리포트 관리</Text>
                </View>
                <MaterialIcons name="chevron-right" size={24} color={colors.muted} />
              </Pressable>
            )}

            {/* App Version */}
            <Pressable
              onPress={() => {
                if (appUpdateInfo.hasUpdate && appUpdateInfo.downloadUrl) {
                  Alert.alert(
                    "새 버전 사용 가능",
                    `v${appUpdateInfo.latestVersion} 버전이 출시되었습니다.\n\n${appUpdateInfo.releaseNotes || "새로운 기능과 버그 수정이 포함되어 있습니다."}`,
                    [
                      { text: "나중에", style: "cancel" },
                      { 
                        text: "다운로드", 
                        onPress: async () => {
                          const { Linking } = await import("react-native");
                          Linking.openURL(appUpdateInfo.downloadUrl!);
                        }
                      },
                    ]
                  );
                } else {
                  Alert.alert("앱 정보", `SCOOP Riding v${CURRENT_APP_VERSION}\n\n최신 버전을 사용 중입니다.`);
                }
              }}
              style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
              className="flex-row items-center p-4 border-b border-border"
            >
              <MaterialIcons 
                name={appUpdateInfo.hasUpdate ? "system-update" : "info-outline"} 
                size={24} 
                color={appUpdateInfo.hasUpdate ? colors.primary : colors.muted} 
              />
              <View className="flex-1 ml-3">
                <Text className="text-foreground font-medium">앱 버전</Text>
                <Text className={appUpdateInfo.hasUpdate ? "text-primary text-xs font-medium" : "text-muted text-xs"}>
                  {appUpdateInfo.hasUpdate 
                    ? `새 버전 확인 (v${appUpdateInfo.latestVersion})` 
                    : `SCOOP Riding v${CURRENT_APP_VERSION}`}
                </Text>
              </View>
              {appUpdateInfo.hasUpdate && (
                <View className="bg-primary rounded-full px-2 py-0.5 mr-2">
                  <Text className="text-white text-xs font-medium">NEW</Text>
                </View>
              )}
              <MaterialIcons name="chevron-right" size={24} color={colors.muted} />
            </Pressable>

            {/* Bug Report */}
            <Pressable
              onPress={() => {
                if (Platform.OS !== "web") {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }
                // Navigate to new bug report screen with screenshot support
                router.push("/bug-report");
              }}
              style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
              className="flex-row items-center p-4 border-b border-border"
            >
              <MaterialIcons name="bug-report" size={24} color={colors.primary} />
              <View className="flex-1 ml-3">
                <Text className="text-foreground font-medium">버그 리포트</Text>
                <Text className="text-muted text-xs">스크린샷 첨부 가능! 문제점을 알려주세요</Text>
              </View>
              <MaterialIcons name="chevron-right" size={24} color={colors.muted} />
            </Pressable>

            {/* Feature Request */}
            <Pressable
              onPress={() => {
                if (Platform.OS !== "web") {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }
                setShowFeatureRequestModal(true);
              }}
              style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
              className="flex-row items-center p-4 border-b border-border"
            >
              <MaterialIcons name="lightbulb" size={24} color={colors.warning} />
              <View className="flex-1 ml-3">
                <Text className="text-foreground font-medium">기능 제안</Text>
                <Text className="text-muted text-xs">원하는 기능이나 아이디어를 알려주세요</Text>
              </View>
              <MaterialIcons name="chevron-right" size={24} color={colors.muted} />
            </Pressable>

            {/* Data Management */}
            <Pressable
              onPress={handleClearData}
              style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
              className="flex-row items-center p-4"
            >
              <MaterialIcons name="delete-outline" size={24} color={colors.error} />
              <View className="flex-1 ml-3">
                <Text className="text-error font-medium">데이터 초기화</Text>
                <Text className="text-muted text-xs">모든 주행 기록 삭제</Text>
              </View>
              <MaterialIcons name="chevron-right" size={24} color={colors.muted} />
            </Pressable>
          </View>
        </View>

        {/* Footer */}
        <View className="items-center py-6">
          <Image
            source={require("@/assets/images/icon.png")}
            style={{ width: 48, height: 48, borderRadius: 12, marginBottom: 8 }}
          />
          <Text className="text-muted text-sm">SCOOP MOBILITY</Text>
          <Text className="text-muted text-xs mt-1">© 2024 SCOOP. All rights reserved.</Text>
        </View>
      </ScrollView>

      {/* Max Speed Detail Modal */}
      <Modal
        visible={showMaxSpeedModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowMaxSpeedModal(false)}
      >
        <Pressable
          className="flex-1 bg-black/50 justify-center items-center p-6"
          onPress={() => setShowMaxSpeedModal(false)}
        >
          <Pressable
            className="bg-background rounded-2xl p-6 w-full max-w-sm"
            onPress={(e) => e.stopPropagation()}
          >
            <View className="items-center mb-4">
              <MaterialIcons name="emoji-events" size={48} color={colors.warning} />
              <Text className="text-2xl font-bold text-foreground mt-2">
                최고 속도 기록
              </Text>
            </View>

            <View className="bg-surface rounded-xl p-4 border border-border mb-4">
              <View className="items-center">
                <Text className="text-4xl font-bold text-warning">
                  {stats.maxSpeed.toFixed(1)}
                  <Text className="text-xl text-muted"> km/h</Text>
                </Text>
              </View>
            </View>

            {stats.maxSpeedRecordDate && (
              <View className="bg-surface rounded-xl p-4 border border-border mb-4">
                <View className="flex-row items-center mb-2">
                  <MaterialIcons name="calendar-today" size={18} color={colors.primary} />
                  <Text className="text-muted text-sm ml-2">기록 날짜</Text>
                </View>
                <Text className="text-foreground font-medium">
                  {new Date(stats.maxSpeedRecordDate).toLocaleDateString("ko-KR", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                    weekday: "long",
                  })}
                </Text>
              </View>
            )}

            <Pressable
              onPress={() => {
                setShowMaxSpeedModal(false);
                if (stats.maxSpeedRecordId) {
                  router.push(`/ride-detail?id=${stats.maxSpeedRecordId}`);
                }
              }}
              className="bg-primary rounded-xl py-3 items-center mb-3"
              style={({ pressed }) => [{ opacity: pressed ? 0.8 : 1 }]}
            >
              <Text className="text-background font-semibold">해당 주행 기록 보기</Text>
            </Pressable>

            <Pressable
              onPress={() => setShowMaxSpeedModal(false)}
              className="py-3 items-center"
              style={({ pressed }) => [{ opacity: pressed ? 0.8 : 1 }]}
            >
              <Text className="text-muted font-medium">닫기</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Bug Report Modal */}
      <Modal
        visible={showBugReportModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowBugReportModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          className="flex-1"
        >
          <Pressable
            className="flex-1 bg-black/50 justify-center items-center p-6"
            onPress={() => setShowBugReportModal(false)}
          >
            <Pressable
              className="bg-background rounded-2xl p-6 w-full max-w-sm"
              onPress={(e) => e.stopPropagation()}
            >
            <View className="flex-row items-center mb-4">
              <MaterialIcons name="bug-report" size={28} color={colors.primary} />
              <Text className="text-xl font-bold text-foreground ml-2">
                버그 리포트
              </Text>
            </View>

            <Text className="text-muted text-sm mb-4">
              발견한 문제점이나 개선 사항을 알려주세요.{"\n"}
              기기 정보와 앱 버전이 자동으로 포함됩니다.
            </Text>

            <View className="bg-surface rounded-xl border border-border mb-4">
              <TextInput
                value={bugReportText}
                onChangeText={setBugReportText}
                placeholder="어떤 문제가 있나요? 자세히 설명해주세요..."
                placeholderTextColor={colors.muted}
                multiline
                numberOfLines={5}
                textAlignVertical="top"
                style={{
                  padding: 16,
                  color: colors.foreground,
                  minHeight: 120,
                  fontSize: 14,
                }}
              />
            </View>

            {/* Screenshot Preview */}
            {capturedScreenshot && (
              <View className="mb-4">
                <View className="flex-row items-center justify-between mb-2">
                  <Text className="text-foreground font-medium text-sm">첨부된 스크린샷</Text>
                  <Pressable
                    onPress={() => setCapturedScreenshot(null)}
                    style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
                  >
                    <MaterialIcons name="close" size={20} color={colors.muted} />
                  </Pressable>
                </View>
                <Image
                  source={{ uri: capturedScreenshot }}
                  style={{ width: "100%", height: 150, borderRadius: 8 }}
                  resizeMode="cover"
                />
              </View>
            )}

            {/* Screenshot Capture Button */}
            {Platform.OS !== "web" && (
              <Pressable
                onPress={handleCaptureScreenshot}
                disabled={isCapturingScreen}
                className="border border-border rounded-xl py-3 items-center mb-3"
                style={({ pressed }) => [{ opacity: pressed || isCapturingScreen ? 0.7 : 1 }]}
              >
                <View className="flex-row items-center">
                  {isCapturingScreen ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <MaterialIcons name="screenshot" size={20} color={colors.primary} />
                  )}
                  <Text className="text-primary font-medium ml-2">
                    {capturedScreenshot ? "스크린샷 다시 캡처" : "현재 화면 스크린샷 첨부"}
                  </Text>
                </View>
              </Pressable>
            )}

            <View className="bg-surface/50 rounded-xl p-3 mb-4 border border-border">
              <Text className="text-muted text-xs">
                포함되는 정보: 앱 버전 v{CURRENT_APP_VERSION}, {Platform.OS} {Platform.Version}
              </Text>
            </View>

            <Pressable
              onPress={handleSendBugReport}
              className="bg-primary rounded-xl py-3 items-center mb-3"
              style={({ pressed }) => [{ opacity: pressed ? 0.8 : 1 }]}
            >
              <View className="flex-row items-center">
                <MaterialIcons name="email" size={20} color="#FFFFFF" />
                <Text className="text-background font-semibold ml-2">
                  {capturedScreenshot ? "스크린샷과 함께 보내기" : "이메일로 보내기"}
                </Text>
              </View>
            </Pressable>

            <Pressable
              onPress={() => {
                setShowBugReportModal(false);
                setBugReportText("");
                setCapturedScreenshot(null);
              }}
              className="py-3 items-center"
              style={({ pressed }) => [{ opacity: pressed ? 0.8 : 1 }]}
            >
              <Text className="text-muted font-medium">취소</Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* Feature Request Modal */}
      <Modal
        visible={showFeatureRequestModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowFeatureRequestModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          className="flex-1"
        >
          <Pressable
            className="flex-1 bg-black/50 justify-center items-center p-6"
            onPress={() => setShowFeatureRequestModal(false)}
          >
            <Pressable
              className="bg-background rounded-2xl p-6 w-full max-w-sm"
              onPress={(e) => e.stopPropagation()}
            >
            <View className="flex-row items-center mb-4">
              <MaterialIcons name="lightbulb" size={28} color={colors.warning} />
              <Text className="text-xl font-bold text-foreground ml-2">
                기능 제안
              </Text>
            </View>

            <Text className="text-muted text-sm mb-4">
              원하는 기능이나 아이디어를 알려주세요.{"\n"}
              여러분의 의견이 SCOOP을 더 좋게 만듭니다.
            </Text>

            <View className="bg-surface rounded-xl border border-border mb-4">
              <TextInput
                value={featureRequestText}
                onChangeText={setFeatureRequestText}
                placeholder="어떤 기능이 있으면 좋겠나요? 자세히 설명해주세요..."
                placeholderTextColor={colors.muted}
                multiline
                numberOfLines={5}
                textAlignVertical="top"
                style={{
                  padding: 16,
                  color: colors.foreground,
                  minHeight: 120,
                  fontSize: 14,
                }}
              />
            </View>

            <Pressable
              onPress={handleSendFeatureRequest}
              className="rounded-xl py-3 items-center mb-3"
              style={({ pressed }) => [{ backgroundColor: colors.warning, opacity: pressed ? 0.8 : 1 }]}
            >
              <View className="flex-row items-center">
                <MaterialIcons name="email" size={20} color="#FFFFFF" />
                <Text className="text-white font-semibold ml-2">이메일로 보내기</Text>
              </View>
            </Pressable>

            <Pressable
              onPress={() => {
                setShowFeatureRequestModal(false);
                setFeatureRequestText("");
              }}
              className="py-3 items-center"
              style={({ pressed }) => [{ opacity: pressed ? 0.8 : 1 }]}
            >
              <Text className="text-muted font-medium">취소</Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </ScreenContainer>
  );
}
