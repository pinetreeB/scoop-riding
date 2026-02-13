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
import { formatDateFull } from "@/lib/date-utils";
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
import { BatteryOptimizationGuide, useBatteryOptimizationGuide } from "@/components/battery-optimization-guide";
import { useTranslation } from "@/hooks/use-translation";
import { useLanguage, type LanguagePreference } from "@/lib/i18n-provider";

export default function ProfileScreen() {
  const colors = useColors();
  const router = useRouter();
  const trpcUtils = trpc.useUtils();
  const { user, logout, isAuthenticated, loading: authLoading } = useAuth();
  const { themeMode, setThemeMode, isDarkMode } = useThemeContext();
  const { t } = useTranslation();
  const { languagePreference, setLanguage } = useLanguage();
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
  const [showDeleteAccountModal, setShowDeleteAccountModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleteReason, setDeleteReason] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [appUpdateInfo, setAppUpdateInfo] = useState<{
    hasUpdate: boolean;
    latestVersion: string | null;
    downloadUrl: string | null;
    releaseNotes: string | null;
  }>({ hasUpdate: false, latestVersion: null, downloadUrl: null, releaseNotes: null });

  // Battery optimization guide
  const batteryGuide = useBatteryOptimizationGuide();

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
    setSyncStatus(t('profile.syncing'));

    try {
      console.log("[Profile] Starting full sync...");
      const result = await fullSync(trpcUtils);
      console.log("[Profile] Sync result:", result);
      
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }

      let statusMsg = t('profile.syncComplete');
      if (result.uploaded > 0 || result.downloaded > 0) {
        statusMsg = t('profile.syncCompleteDetail', { uploaded: result.uploaded, downloaded: result.downloaded });
      } else if (result.failed > 0) {
        statusMsg = t('profile.syncCompleteFailed', { failed: result.failed });
      } else {
        statusMsg = t('profile.syncCompleteUpToDate');
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
      let errorMsg = error?.message || t('profile.syncErrorUnknown');
      const errorCode = error?.data?.code || error?.code || '';
      
      if (errorMsg.includes('UNAUTHORIZED') || errorMsg.includes('Invalid session') || errorCode === 'UNAUTHORIZED') {
        errorMsg = t('profile.syncErrorAuth');
      } else if (errorMsg.includes('Network') || errorMsg.includes('fetch') || errorMsg.includes('Failed to fetch')) {
        errorMsg = t('profile.syncErrorNetwork');
      } else if (errorMsg.includes('timeout') || errorMsg.includes('Timeout')) {
        errorMsg = t('profile.syncErrorTimeout');
      } else if (errorMsg.includes('Duplicate') || errorMsg.includes('duplicate')) {
        errorMsg = t('profile.syncErrorDuplicate');
      } else if (errorMsg.includes('500') || errorMsg.includes('Internal')) {
        errorMsg = t('profile.syncErrorServer');
      }
      
      setSyncStatus(t('profile.syncFailed', { error: errorMsg }));
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
      t('profile.logout'),
      t('profile.logoutConfirm'),
      [
        { text: t('profile.cancel'), style: "cancel" },
        {
          text: t('profile.logout'),
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
              Alert.alert(t('profile.error'), t('profile.logoutError'));
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
      t('profile.dataReset'),
      t('profile.dataResetConfirm'),
      [
        { text: t('profile.cancel'), style: "cancel" },
        {
          text: t('common.delete'),
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
      Alert.alert(t('profile.notice'), t('profile.screenshotNotAvailableWeb'));
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
      Alert.alert(t('profile.error'), t('profile.screenshotError'));    } finally {
      setIsCapturingScreen(false);
    }
  };

  // Bug Report Email Handler
  const handleSendBugReport = async () => {
    if (!bugReportText.trim()) {
      Alert.alert(t('profile.error'), t('profile.bugReportEmpty'));
      return;
    }

    const deviceInfo = [
      `${t('profile.emailAppVersion')}: v${CURRENT_APP_VERSION}`,
      `${t('profile.emailPlatform')}: ${Platform.OS} ${Platform.Version}`,
      `${t('profile.emailUserId')}: ${user?.id || t('profile.emailNotLoggedIn')}`,
      `${t('profile.emailUserEmail')}: ${user?.email || t('profile.emailNone')}`,
      `${t('profile.emailTime')}: ${new Date().toISOString()}`,
      `${t('profile.emailScreenshot')}: ${capturedScreenshot ? t('common.yes') : t('common.no')}`,
    ].join("\n");

    const emailBody = `[${t('profile.bugReport')}]\n\n${bugReportText}\n\n--- ${t('profile.emailDeviceInfo')} ---\n${deviceInfo}${capturedScreenshot ? `\n\n[${t('profile.emailScreenshotAttached')}]` : ""}`;
    const emailSubject = `[SCOOP ${t('profile.bugReport')}] v${CURRENT_APP_VERSION}`;
    const supportEmail = "scoop@scoopmotor.com";

    // If screenshot exists, use sharing API to include it
    if (capturedScreenshot && Platform.OS !== "web") {
      try {
        const isAvailable = await Sharing.isAvailableAsync();
        if (isAvailable) {
          await Sharing.shareAsync(capturedScreenshot, {
            mimeType: "image/jpeg",
            dialogTitle: `SCOOP ${t('profile.bugReport')} - ${t('profile.emailScreenshotShare')}`,
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
        Alert.alert(t('profile.error'), t('profile.emailAppNotFound'));
      }
    } catch (error) {
      console.error("Bug report email error:", error);
      Alert.alert(t('profile.error'), t('profile.emailSendError'));
    }
  };

  // Feature Request Email Handler
  const handleSendFeatureRequest = async () => {
    if (!featureRequestText.trim()) {
      Alert.alert(t('profile.error'), t('profile.featureRequestEmpty'));
      return;
    }

    const deviceInfo = [
      `${t('profile.emailAppVersion')}: v${CURRENT_APP_VERSION}`,
      `${t('profile.emailPlatform')}: ${Platform.OS} ${Platform.Version}`,
      `${t('profile.emailUserId')}: ${user?.id || t('profile.emailNotLoggedIn')}`,
      `${t('profile.emailUserEmail')}: ${user?.email || t('profile.emailNone')}`,
      `${t('profile.emailTime')}: ${new Date().toISOString()}`,
    ].join("\n");

    const emailBody = `[${t('profile.featureRequest')}]\n\n${featureRequestText}\n\n--- ${t('profile.emailUserInfo')} ---\n${deviceInfo}`;
    const emailSubject = `[SCOOP ${t('profile.featureRequest')}] v${CURRENT_APP_VERSION}`;
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
        Alert.alert(t('profile.error'), t('profile.emailAppNotFound'));
      }
    } catch (error) {
      console.error("Feature request email error:", error);
      Alert.alert(t('profile.error'), t('profile.emailSendError'));
    }
  };

  const getUserDisplayName = () => {
    if (user?.name) return user.name;
    if (user?.email) return user.email.split("@")[0];
    return t('profile.defaultRiderName');
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
          <Text className="text-2xl font-bold text-foreground">{t('profile.myInfo')}</Text>
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
              <Text className="text-muted text-xs">{t('profile.levelProgress')}</Text>
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
                {t('profile.currentDistance', { distance: (stats.totalDistance / 1000).toFixed(1) })}
              </Text>
              {stats.level < 7 && (
                <Text className="text-muted text-xs">
                  {t('profile.nextLevel', { distance: calculateLevel(stats.totalDistance / 1000).nextLevelDistance.toLocaleString() })}
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
              <Text className="text-lg font-bold text-foreground ml-2">{t('profile.cloudSync')}</Text>
            </View>
            {stats.unsyncedCount > 0 && (
              <View className="bg-warning px-2 py-1 rounded-full">
                <Text className="text-white text-xs font-bold">{t('profile.unsyncedCount', { count: stats.unsyncedCount })}</Text>
              </View>
            )}
          </View>
          
          <Text className="text-muted text-sm mb-4">
            {t('profile.loginForSync')}
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
                <Text className="text-white font-bold ml-2">{t('profile.syncNow')}</Text>
              </>
            )}
          </Pressable>
        </View>

        {/* Stats Grid */}
        <View className="mx-5 mb-6">
          <Text className="text-lg font-bold text-foreground mb-3">{t('profile.cumulativeRecord')}</Text>
          
          <View className="flex-row flex-wrap">
            {/* Total Distance */}
            <View className="w-1/2 pr-2 mb-3">
              <View className="bg-surface rounded-xl p-4 border border-border">
                <View className="flex-row items-center mb-2">
                  <MaterialIcons name="straighten" size={20} color={colors.primary} />
                  <Text className="text-muted text-xs ml-2">{t('profile.totalDistance')}</Text>
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
                  <Text className="text-muted text-xs ml-2">{t('profile.totalTime')}</Text>
                </View>
                <Text className="text-2xl font-bold text-foreground">
                  {formatDuration(stats.totalDuration)}
                </Text>
                <Text className="text-muted text-xs">{t('profile.hours')}</Text>
              </View>
            </View>

            {/* Total Rides */}
            <View className="w-1/2 pr-2 mb-3">
              <View className="bg-surface rounded-xl p-4 border border-border">
                <View className="flex-row items-center mb-2">
                  <MaterialIcons name="electric-scooter" size={20} color={colors.primary} />
                  <Text className="text-muted text-xs ml-2">{t('profile.rideCount')}</Text>
                </View>
                <Text className="text-2xl font-bold text-foreground">
                  {stats.totalRides}
                </Text>
                <Text className="text-muted text-xs">{t('profile.rides')}</Text>
              </View>
            </View>

            {/* Average Speed */}
            <View className="w-1/2 pl-2 mb-3">
              <View className="bg-surface rounded-xl p-4 border border-border">
                <View className="flex-row items-center mb-2">
                  <MaterialIcons name="speed" size={20} color={colors.primary} />
                  <Text className="text-muted text-xs ml-2">{t('profile.avgSpeed')}</Text>
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
                    <Text className="text-muted text-xs ml-2">{t('profile.maxSpeed')}</Text>
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
          <Text className="text-lg font-bold text-foreground mb-3">{t('profile.account')}</Text>
          
          <View className="bg-surface rounded-2xl border border-border overflow-hidden">
            {/* Account Info */}
            <View className="flex-row items-center p-4 border-b border-border">
              <MaterialIcons name="account-circle" size={24} color={colors.primary} />
              <View className="flex-1 ml-3">
                <Text className="text-foreground font-medium">{t('profile.loginInfo')}</Text>
                <Text className="text-muted text-xs">
                  {user?.loginMethod === "google" ? t('profile.googleAccount') : t('profile.emailLogin')}
                </Text>
              </View>
            </View>

            {/* Logout Button */}
            <Pressable
              onPress={handleLogout}
              disabled={isLoggingOut}
              style={({ pressed }) => [{ opacity: pressed || isLoggingOut ? 0.7 : 1 }]}
              className="flex-row items-center p-4 border-b border-border"
            >
              <MaterialIcons name="logout" size={24} color={colors.error} />
              <View className="flex-1 ml-3">
                <Text className="text-error font-medium">{t('profile.logout')}</Text>
                <Text className="text-muted text-xs">{t('profile.logoutDesc')}</Text>
              </View>
              {isLoggingOut ? (
                <ActivityIndicator size="small" color={colors.error} />
              ) : (
                <MaterialIcons name="chevron-right" size={24} color={colors.muted} />
              )}
            </Pressable>

            {/* Delete Account Button */}
            <Pressable
              onPress={() => {
                if (Platform.OS !== "web") {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }
                setShowDeleteAccountModal(true);
              }}
              style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
              className="flex-row items-center p-4"
            >
              <MaterialIcons name="person-remove" size={24} color={colors.error} />
              <View className="flex-1 ml-3">
                <Text className="text-error font-medium">{t('profile.deleteAccount')}</Text>
                <Text className="text-muted text-xs">{t('profile.deleteAccountDesc')}</Text>
              </View>
              <MaterialIcons name="chevron-right" size={24} color={colors.muted} />
            </Pressable>
          </View>
        </View>

        {/* Social */}
        <View className="mx-5 mb-6">
          <Text className="text-lg font-bold text-foreground mb-3">{t('profile.social')}</Text>
          
          <View className="bg-surface rounded-2xl border border-border overflow-hidden">
            {/* Friends */}
            <Pressable
              onPress={() => router.push("/friends" as any)}
              style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
              className="flex-row items-center p-4 border-b border-border"
            >
              <MaterialIcons name="people" size={24} color={colors.primary} />
              <View className="flex-1 ml-3">
                <Text className="text-foreground font-medium">{t('profile.friends')}</Text>
                <Text className="text-muted text-xs">{t('profile.friendsDesc')}</Text>
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
                <Text className="text-foreground font-medium">{t('profile.ranking')}</Text>
                <Text className="text-muted text-xs">{t('profile.rankingDesc')}</Text>
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
                <Text className="text-foreground font-medium">{t('profile.challenges')}</Text>
                <Text className="text-muted text-xs">{t('profile.challengesDesc')}</Text>
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
                <Text className="text-foreground font-medium">{t('profile.notifications')}</Text>
                <Text className="text-muted text-xs">{t('profile.notificationsDesc')}</Text>
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
                <Text className="text-foreground font-medium">{t('profile.badges')}</Text>
                <Text className="text-muted text-xs">{t('profile.badgesDesc')}</Text>
              </View>
              <MaterialIcons name="chevron-right" size={24} color={colors.muted} />
            </Pressable>
          </View>
        </View>

        {/* My Scooters */}
        <View className="mx-5 mb-6">
          <Text className="text-lg font-bold text-foreground mb-3">{t('profile.myScooter')}</Text>
          
          <View className="bg-surface rounded-2xl border border-border overflow-hidden">
            <Pressable
              onPress={() => router.push("/scooters")}
              style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
              className="flex-row items-center p-4"
            >
              <MaterialIcons name="electric-scooter" size={24} color={colors.primary} />
              <View className="flex-1 ml-3">
                <Text className="text-foreground font-medium">{t('profile.scooterManage')}</Text>
                <Text className="text-muted text-xs">{t('profile.scooterManageDesc')}</Text>
              </View>
              <MaterialIcons name="chevron-right" size={24} color={colors.muted} />
            </Pressable>
          </View>
        </View>

        {/* Goals */}
        <View className="mx-5 mb-6">
          <Text className="text-lg font-bold text-foreground mb-3">{t('profile.goals')}</Text>
          
          <View className="bg-surface rounded-2xl border border-border overflow-hidden">
            <Pressable
              onPress={() => router.push("/goals" as any)}
              style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
              className="flex-row items-center p-4"
            >
              <MaterialIcons name="flag" size={24} color={colors.success} />
              <View className="flex-1 ml-3">
                <Text className="text-foreground font-medium">{t('profile.goalSetting')}</Text>
                <Text className="text-muted text-xs">{t('profile.goalSettingDesc')}</Text>
              </View>
              <MaterialIcons name="chevron-right" size={24} color={colors.muted} />
            </Pressable>
          </View>
        </View>

        {/* Settings */}
        <View className="mx-5 mb-6">
          <Text className="text-lg font-bold text-foreground mb-3">{t('profile.settings')}</Text>
          
          <View className="bg-surface rounded-2xl border border-border overflow-hidden">
            {/* Dark Mode Toggle */}
            <View className="flex-row items-center p-4 border-b border-border">
              <MaterialIcons 
                name={isDarkMode ? "dark-mode" : "light-mode"} 
                size={24} 
                color={colors.primary} 
              />
              <View className="flex-1 ml-3">
                <Text className="text-foreground font-medium">{t('profile.theme')}</Text>
                <Text className="text-muted text-xs">
                  {themeMode === "system" ? t('profile.themeSystem') : themeMode === "light" ? t('profile.themeLight') : t('profile.themeDark')}
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
                    <Text style={{ color: themeMode === "system" ? '#FFFFFF' : colors.muted, fontSize: 11 }}>{t('profile.auto')}</Text>
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
                    <Text style={{ color: themeMode === "light" ? '#FFFFFF' : colors.muted, fontSize: 11 }}>{t('profile.light')}</Text>
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
                    <Text style={{ color: themeMode === "dark" ? '#FFFFFF' : colors.muted, fontSize: 11 }}>{t('profile.dark')}</Text>
                  </View>
                </Pressable>
              </View>
            </View>

            {/* Language Setting */}
            <View className="flex-row items-center p-4 border-b border-border">
              <MaterialIcons 
                name="language" 
                size={24} 
                color={colors.primary} 
              />
              <View className="flex-1 ml-3">
                <Text className="text-foreground font-medium">{t('settings.language.title')}</Text>
                <Text className="text-muted text-xs">
                  {languagePreference === "system" ? t('settings.language.systemDefault') : languagePreference === "ko" ? t('settings.language.korean') : t('settings.language.english')}
                </Text>
              </View>
              <View className="flex-row items-center gap-1">
                <Pressable 
                  onPress={() => {
                    if (Platform.OS !== "web") {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }
                    setLanguage("system");
                  }}
                  style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
                  className="px-3 py-1 rounded-full"
                >
                  <View style={{ backgroundColor: languagePreference === "system" ? colors.primary : colors.border, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 999 }}>
                    <Text style={{ color: languagePreference === "system" ? '#FFFFFF' : colors.muted, fontSize: 11 }}>{t('settings.language.auto')}</Text>
                  </View>
                </Pressable>
                <Pressable 
                  onPress={() => {
                    if (Platform.OS !== "web") {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }
                    setLanguage("ko");
                  }}
                  style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
                  className="px-3 py-1 rounded-full"
                >
                  <View style={{ backgroundColor: languagePreference === "ko" ? colors.primary : colors.border, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 999 }}>
                    <Text style={{ color: languagePreference === "ko" ? '#FFFFFF' : colors.muted, fontSize: 11 }}>{t('settings.language.korean')}</Text>
                  </View>
                </Pressable>
                <Pressable 
                  onPress={() => {
                    if (Platform.OS !== "web") {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }
                    setLanguage("en");
                  }}
                  style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
                  className="px-3 py-1 rounded-full"
                >
                  <View style={{ backgroundColor: languagePreference === "en" ? colors.primary : colors.border, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 999 }}>
                    <Text style={{ color: languagePreference === "en" ? '#FFFFFF' : colors.muted, fontSize: 11 }}>English</Text>
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
                <Text className="text-foreground font-medium">{t('profile.announcements')}</Text>
                <Text className="text-muted text-xs">{t('profile.announcementsDesc')}</Text>
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
                <Text className="text-foreground font-medium">{t('profile.locationSharing')}</Text>
                <Text className="text-muted text-xs">{t('profile.locationSharingDesc')}</Text>
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
                <Text className="text-foreground font-medium">{t('profile.voiceGuidance')}</Text>
                <Text className="text-muted text-xs">{t('profile.voiceGuidanceDesc')}</Text>
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
                <Text className="text-foreground font-medium">{t('profile.savedRoutes')}</Text>
                <Text className="text-muted text-xs">{t('profile.savedRoutesDesc')}</Text>
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
                <Text className="text-foreground font-medium">{t('profile.rideHeatmap')}</Text>
                <Text className="text-muted text-xs">{t('profile.rideHeatmapDesc')}</Text>
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
                <Text className="text-foreground font-medium">{t('profile.groupRiding')}</Text>
                <Text className="text-muted text-xs">{t('profile.groupRidingDesc')}</Text>
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
                <Text className="text-foreground font-medium">{t('profile.notificationSettings')}</Text>
                <Text className="text-muted text-xs">{t('profile.notificationSettingsDesc')}</Text>
              </View>
              <MaterialIcons name="chevron-right" size={24} color={colors.muted} />
            </Pressable>

            {/* Battery Optimization Guide - Android only */}
            {Platform.OS === "android" && (
              <Pressable
                onPress={() => {
                  if (Platform.OS !== "web") {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }
                  batteryGuide.showGuide();
                }}
                style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
                className="flex-row items-center p-4 border-b border-border"
              >
                <MaterialIcons name="battery-alert" size={24} color={colors.warning} />
                <View className="flex-1 ml-3">
                  <Text className="text-foreground font-medium">{t('profile.backgroundGuide')}</Text>
                  <Text className="text-muted text-xs">{t('profile.backgroundGuideDesc')}</Text>
                </View>
                <MaterialIcons name="chevron-right" size={24} color={colors.muted} />
              </Pressable>
            )}

            {/* Admin Dashboard - only for admins */}
            {user?.role === "admin" && (
              <Pressable
                onPress={() => router.push("/admin/dashboard")}
                style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
                className="flex-row items-center p-4 border-b border-border"
              >
                <MaterialIcons name="admin-panel-settings" size={24} color={colors.primary} />
                <View className="flex-1 ml-3">
                  <Text className="text-foreground font-medium">{t('profile.adminDashboard')}</Text>
                  <Text className="text-muted text-xs">{t('profile.adminDashboardDesc')}</Text>
                </View>
                <MaterialIcons name="chevron-right" size={24} color={colors.muted} />
              </Pressable>
            )}

            {/* App Version */}
            <Pressable
              onPress={() => {
                if (appUpdateInfo.hasUpdate && appUpdateInfo.downloadUrl) {
                  Alert.alert(
                    t('profile.newVersionAvailable'),
                    `v${appUpdateInfo.latestVersion} ${t('profile.versionReleased')}\n\n${appUpdateInfo.releaseNotes || t('profile.newFeaturesIncluded')}`,
                    [
                      { text: t('profile.later'), style: "cancel" },
                      { 
                        text: t('profile.download'), 
                        onPress: async () => {
                          const { Linking } = await import("react-native");
                          Linking.openURL(appUpdateInfo.downloadUrl!);
                        }
                      },
                    ]
                  );
                } else {
                  Alert.alert(t('profile.appInfo'), `SCOOP Riding v${CURRENT_APP_VERSION}\n\n${t('profile.latestVersion')}`);
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
                <Text className="text-foreground font-medium">{t('profile.appVersion')}</Text>
                <Text className={appUpdateInfo.hasUpdate ? "text-primary text-xs font-medium" : "text-muted text-xs"}>
                  {appUpdateInfo.hasUpdate 
                    ? `${t('profile.newVersionCheck')} (v${appUpdateInfo.latestVersion})` 
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
                <Text className="text-foreground font-medium">{t('profile.bugReport')}</Text>
                <Text className="text-muted text-xs">{t('profile.bugReportDesc')}</Text>
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
                <Text className="text-foreground font-medium">{t('profile.featureRequest')}</Text>
                <Text className="text-muted text-xs">{t('profile.featureRequestDesc')}</Text>
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
                <Text className="text-error font-medium">{t('profile.dataReset')}</Text>
                <Text className="text-muted text-xs">{t('profile.dataResetDesc')}</Text>
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
                {t('profile.maxSpeedRecord')}
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
                  <Text className="text-muted text-sm ml-2">{t('profile.recordDate')}</Text>
                </View>
                <Text className="text-foreground font-medium">
                  {formatDateFull(stats.maxSpeedRecordDate)}
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
              <Text className="text-background font-semibold">{t('profile.viewRideRecord')}</Text>
            </Pressable>

            <Pressable
              onPress={() => setShowMaxSpeedModal(false)}
              className="py-3 items-center"
              style={({ pressed }) => [{ opacity: pressed ? 0.8 : 1 }]}
            >
              <Text className="text-muted font-medium">{t('profile.close')}</Text>
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
                {t('profile.bugReport')}
              </Text>
            </View>

            <Text className="text-muted text-sm mb-4">
              {t('profile.bugReportModalDesc')}
            </Text>

            <View className="bg-surface rounded-xl border border-border mb-4">
              <TextInput
                value={bugReportText}
                onChangeText={setBugReportText}
                placeholder={t('profile.bugReportPlaceholder')}
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
                  <Text className="text-foreground font-medium text-sm">{t('profile.attachedScreenshot')}</Text>
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
                    {capturedScreenshot ? t('profile.recaptureScreenshot') : t('profile.attachScreenshot')}
                  </Text>
                </View>
              </Pressable>
            )}

            <View className="bg-surface/50 rounded-xl p-3 mb-4 border border-border">
              <Text className="text-muted text-xs">
                {t('profile.includedInfo')}: v{CURRENT_APP_VERSION}, {Platform.OS} {Platform.Version}
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
                  {capturedScreenshot ? t('profile.sendWithScreenshot') : t('profile.sendByEmail')}
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
              <Text className="text-muted font-medium">{t('profile.cancel')}</Text>
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
                {t('profile.featureRequest')}
              </Text>
            </View>

            <Text className="text-muted text-sm mb-4">
              {t('profile.featureRequestModalDesc')}
            </Text>

            <View className="bg-surface rounded-xl border border-border mb-4">
              <TextInput
                value={featureRequestText}
                onChangeText={setFeatureRequestText}
                placeholder={t('profile.featureRequestPlaceholder')}
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
                <Text className="text-white font-semibold ml-2">{t('profile.sendByEmail')}</Text>
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
              <Text className="text-muted font-medium">{t('profile.cancel')}</Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
      {/* Delete Account Modal */}
      <Modal
        visible={showDeleteAccountModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDeleteAccountModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          className="flex-1"
        >
          <Pressable
            className="flex-1 bg-black/50 justify-center items-center p-6"
            onPress={() => setShowDeleteAccountModal(false)}
          >
            <Pressable
              className="bg-background rounded-2xl p-6 w-full max-w-sm"
              onPress={(e) => e.stopPropagation()}
            >
              <View className="flex-row items-center mb-4">
                <MaterialIcons name="warning" size={28} color={colors.error} />
                <Text className="text-xl font-bold text-foreground ml-2">
                  {t('profile.deleteAccount')}
                </Text>
              </View>

              <Text className="text-foreground mb-4">
                {t('profile.deleteAccountWarning')}
              </Text>

              <View className="bg-surface rounded-xl p-4 border border-border mb-4">
                <Text className="text-muted text-sm mb-2">{t('profile.dataToBeDeleted')}</Text>
                <Text className="text-foreground text-sm">{t('profile.deleteItem1')}</Text>
                <Text className="text-foreground text-sm">{t('profile.deleteItem2')}</Text>
                <Text className="text-foreground text-sm">{t('profile.deleteItem3')}</Text>
                <Text className="text-foreground text-sm">{t('profile.deleteItem4')}</Text>
                <Text className="text-foreground text-sm">{t('profile.deleteItem5')}</Text>
              </View>

              <Text className="text-muted text-sm mb-2">{t('profile.deleteReason')}</Text>
              <View className="bg-surface rounded-xl border border-border mb-4">
                <TextInput
                  value={deleteReason}
                  onChangeText={setDeleteReason}
                  placeholder={t('profile.deleteReasonPlaceholder')}
                  placeholderTextColor={colors.muted}
                  multiline
                  numberOfLines={2}
                  textAlignVertical="top"
                  style={{
                    padding: 12,
                    color: colors.foreground,
                    minHeight: 60,
                    fontSize: 14,
                  }}
                />
              </View>

              <Text className="text-muted text-sm mb-2">
                {t('profile.deleteConfirmInstruction')}
              </Text>
              <View className="bg-surface rounded-xl border border-border mb-4">
                <TextInput
                  value={deleteConfirmText}
                  onChangeText={setDeleteConfirmText}
                  placeholder={t('profile.deleteAccount')}
                  placeholderTextColor={colors.muted}
                  style={{
                    padding: 12,
                    color: colors.foreground,
                    fontSize: 14,
                  }}
                />
              </View>

              <Pressable
                onPress={async () => {
                  if (deleteConfirmText !== t('profile.deleteAccount')) {
                    Alert.alert(t('profile.error'), t('profile.deleteConfirmError'));
                    return;
                  }

                  Alert.alert(
                    t('profile.finalConfirm'),
                    t('profile.finalConfirmMessage'),
                    [
                      { text: t('profile.cancel'), style: "cancel" },
                      {
                        text: t('profile.withdraw'),
                        style: "destructive",
                        onPress: async () => {
                          setIsDeleting(true);
                          try {
                            const result = await trpcUtils.client.auth.deleteAccount.mutate({
                              confirmText: deleteConfirmText,
                              reason: deleteReason || undefined,
                            });

                            if (result.success) {
                              if (Platform.OS !== "web") {
                                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                              }
                              Alert.alert(
                                t('profile.deleteComplete'),
                                t('profile.deleteCompleteMessage'),
                                [
                                  {
                                    text: t('profile.confirm'),
                                    onPress: () => {
                                      setShowDeleteAccountModal(false);
                                      logout();
                                    },
                                  },
                                ]
                              );
                            } else {
                              Alert.alert(t('profile.error'), result.error || t('profile.deleteError'));
                            }
                          } catch (error: any) {
                            console.error("Delete account error:", error);
                            Alert.alert(t('profile.error'), error.message || t('profile.deleteError'));
                          } finally {
                            setIsDeleting(false);
                          }
                        },
                      },
                    ]
                  );
                }}
                disabled={isDeleting || deleteConfirmText !== t('profile.deleteAccount')}
                className="rounded-xl py-3 items-center mb-3"
                style={({ pressed }) => [{
                  backgroundColor: deleteConfirmText === t('profile.deleteAccount') ? colors.error : colors.border,
                  opacity: pressed || isDeleting ? 0.8 : 1,
                }]}
              >
                {isDeleting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text className="text-white font-semibold">{t('profile.proceedDelete')}</Text>
                )}
              </Pressable>

              <Pressable
                onPress={() => {
                  setShowDeleteAccountModal(false);
                  setDeleteConfirmText("");
                  setDeleteReason("");
                }}
                className="py-3 items-center"
                style={({ pressed }) => [{ opacity: pressed ? 0.8 : 1 }]}
              >
                <Text className="text-muted font-medium">{t('profile.cancel')}</Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* Battery Optimization Guide Modal */}
      <BatteryOptimizationGuide
        visible={batteryGuide.isVisible}
        onClose={batteryGuide.hideGuide}
      />
    </ScreenContainer>
  );
}
