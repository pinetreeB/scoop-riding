import { useCallback, useEffect, useState } from "react";
import {
  Text,
  View,
  ScrollView,
  Pressable,
  Alert,
  Platform,
  Switch,
  ActivityIndicator,
} from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";

import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import {
  registerForPushNotificationsAsync,
  cancelAllNotifications,
  scheduleRideReminder,
  getScheduledNotifications,
} from "@/lib/notifications";

const NOTIFICATION_SETTINGS_KEY = "@scoop_notification_settings";

interface NotificationSettings {
  enabled: boolean;
  rideComplete: boolean;
  weeklyReport: boolean;
  newRecord: boolean;
  levelUp: boolean;
  rideReminder: boolean;
  reminderHour: number;
  reminderMinute: number;
}

const defaultSettings: NotificationSettings = {
  enabled: true,
  rideComplete: true,
  weeklyReport: true,
  newRecord: true,
  levelUp: true,
  rideReminder: false,
  reminderHour: 18,
  reminderMinute: 0,
};

export default function NotificationsScreen() {
  const colors = useColors();
  const router = useRouter();
  const [settings, setSettings] = useState<NotificationSettings>(defaultSettings);
  const [isLoading, setIsLoading] = useState(true);
  const [permissionStatus, setPermissionStatus] = useState<string | null>(null);

  const loadSettings = useCallback(async () => {
    try {
      const stored = await AsyncStorage.getItem(NOTIFICATION_SETTINGS_KEY);
      if (stored) {
        setSettings({ ...defaultSettings, ...JSON.parse(stored) });
      }

      // Check permission status
      const { status } = await Notifications.getPermissionsAsync();
      setPermissionStatus(status);
    } catch (error) {
      console.error("Failed to load notification settings:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const saveSettings = async (newSettings: NotificationSettings) => {
    try {
      await AsyncStorage.setItem(NOTIFICATION_SETTINGS_KEY, JSON.stringify(newSettings));
      setSettings(newSettings);

      // Update scheduled notifications
      if (newSettings.rideReminder && newSettings.enabled) {
        await cancelAllNotifications();
        await scheduleRideReminder(newSettings.reminderHour, newSettings.reminderMinute);
      } else if (!newSettings.rideReminder) {
        // Cancel ride reminders
        const scheduled = await getScheduledNotifications();
        for (const notification of scheduled) {
          if (notification.content.data?.type === "ride_reminder") {
            await Notifications.cancelScheduledNotificationAsync(notification.identifier);
          }
        }
      }
    } catch (error) {
      console.error("Failed to save notification settings:", error);
      Alert.alert("오류", "설정 저장 중 오류가 발생했습니다.");
    }
  };

  const handleToggle = (key: keyof NotificationSettings) => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    const newSettings = { ...settings, [key]: !settings[key] };
    saveSettings(newSettings);
  };

  const handleEnableNotifications = async () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    const token = await registerForPushNotificationsAsync();
    if (token) {
      const { status } = await Notifications.getPermissionsAsync();
      setPermissionStatus(status);
      
      if (status === "granted") {
        const newSettings = { ...settings, enabled: true };
        saveSettings(newSettings);
        
        if (Platform.OS !== "web") {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
      }
    } else {
      Alert.alert(
        "알림 권한 필요",
        "알림을 받으려면 설정에서 알림 권한을 허용해주세요.",
        [
          { text: "취소", style: "cancel" },
          { text: "설정으로 이동", onPress: () => {
            // On iOS, this would open settings
            // For now, just show a message
            Alert.alert("안내", "기기 설정 > 앱 > SCOOP > 알림에서 권한을 허용해주세요.");
          }},
        ]
      );
    }
  };

  if (isLoading) {
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
      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 100 }}
      >
        {/* Header */}
        <View className="flex-row items-center px-5 pt-4 pb-4">
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
            className="mr-3 p-1"
          >
            <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
          </Pressable>
          <Text className="text-2xl font-bold text-foreground">알림 설정</Text>
        </View>

        {/* Permission Status */}
        {permissionStatus !== "granted" && (
          <View className="mx-5 mb-4 p-4 rounded-2xl" style={{ backgroundColor: colors.warning + "20" }}>
            <View className="flex-row items-center mb-2">
              <MaterialIcons name="warning" size={20} color={colors.warning} />
              <Text className="text-foreground font-medium ml-2">알림 권한이 필요합니다</Text>
            </View>
            <Text className="text-muted text-sm mb-3">
              주행 완료, 기록 달성 등의 알림을 받으려면 알림 권한을 허용해주세요.
            </Text>
            <Pressable
              onPress={handleEnableNotifications}
              style={({ pressed }) => [
                { backgroundColor: colors.warning, opacity: pressed ? 0.8 : 1 },
              ]}
              className="py-2 px-4 rounded-xl self-start"
            >
              <Text className="text-white font-bold">알림 권한 허용</Text>
            </Pressable>
          </View>
        )}

        {/* Main Toggle */}
        <View className="mx-5 mb-6">
          <View className="bg-surface rounded-2xl border border-border overflow-hidden">
            <View className="flex-row items-center justify-between p-4">
              <View className="flex-row items-center flex-1">
                <MaterialIcons name="notifications" size={24} color={colors.primary} />
                <View className="ml-3 flex-1">
                  <Text className="text-foreground font-medium">알림 받기</Text>
                  <Text className="text-muted text-xs">모든 알림을 켜거나 끕니다</Text>
                </View>
              </View>
              <Switch
                value={settings.enabled}
                onValueChange={() => handleToggle("enabled")}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor="#FFFFFF"
              />
            </View>
          </View>
        </View>

        {/* Notification Types */}
        <View className="mx-5 mb-6">
          <Text className="text-lg font-bold text-foreground mb-3">알림 종류</Text>
          
          <View className="bg-surface rounded-2xl border border-border overflow-hidden">
            {/* Ride Complete */}
            <View className="flex-row items-center justify-between p-4 border-b border-border">
              <View className="flex-row items-center flex-1">
                <MaterialIcons name="flag" size={22} color={colors.success} />
                <View className="ml-3 flex-1">
                  <Text className="text-foreground font-medium">주행 완료</Text>
                  <Text className="text-muted text-xs">주행이 완료되면 알림을 받습니다</Text>
                </View>
              </View>
              <Switch
                value={settings.rideComplete && settings.enabled}
                onValueChange={() => handleToggle("rideComplete")}
                disabled={!settings.enabled}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor="#FFFFFF"
              />
            </View>

            {/* Weekly Report */}
            <View className="flex-row items-center justify-between p-4 border-b border-border">
              <View className="flex-row items-center flex-1">
                <MaterialIcons name="bar-chart" size={22} color={colors.primary} />
                <View className="ml-3 flex-1">
                  <Text className="text-foreground font-medium">주간 리포트</Text>
                  <Text className="text-muted text-xs">매주 주행 통계를 알려드립니다</Text>
                </View>
              </View>
              <Switch
                value={settings.weeklyReport && settings.enabled}
                onValueChange={() => handleToggle("weeklyReport")}
                disabled={!settings.enabled}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor="#FFFFFF"
              />
            </View>

            {/* New Record */}
            <View className="flex-row items-center justify-between p-4 border-b border-border">
              <View className="flex-row items-center flex-1">
                <MaterialIcons name="emoji-events" size={22} color={colors.warning} />
                <View className="ml-3 flex-1">
                  <Text className="text-foreground font-medium">신기록 달성</Text>
                  <Text className="text-muted text-xs">새로운 기록을 세우면 알려드립니다</Text>
                </View>
              </View>
              <Switch
                value={settings.newRecord && settings.enabled}
                onValueChange={() => handleToggle("newRecord")}
                disabled={!settings.enabled}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor="#FFFFFF"
              />
            </View>

            {/* Level Up */}
            <View className="flex-row items-center justify-between p-4">
              <View className="flex-row items-center flex-1">
                <MaterialIcons name="upgrade" size={22} color={colors.success} />
                <View className="ml-3 flex-1">
                  <Text className="text-foreground font-medium">레벨 업</Text>
                  <Text className="text-muted text-xs">레벨이 올라가면 알려드립니다</Text>
                </View>
              </View>
              <Switch
                value={settings.levelUp && settings.enabled}
                onValueChange={() => handleToggle("levelUp")}
                disabled={!settings.enabled}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor="#FFFFFF"
              />
            </View>
          </View>
        </View>

        {/* Ride Reminder */}
        <View className="mx-5 mb-6">
          <Text className="text-lg font-bold text-foreground mb-3">라이딩 리마인더</Text>
          
          <View className="bg-surface rounded-2xl border border-border overflow-hidden">
            <View className="flex-row items-center justify-between p-4">
              <View className="flex-row items-center flex-1">
                <MaterialIcons name="alarm" size={22} color={colors.primary} />
                <View className="ml-3 flex-1">
                  <Text className="text-foreground font-medium">매일 알림</Text>
                  <Text className="text-muted text-xs">
                    {settings.rideReminder 
                      ? `매일 ${settings.reminderHour}:${settings.reminderMinute.toString().padStart(2, "0")}에 알림`
                      : "라이딩 리마인더를 받습니다"}
                  </Text>
                </View>
              </View>
              <Switch
                value={settings.rideReminder && settings.enabled}
                onValueChange={() => handleToggle("rideReminder")}
                disabled={!settings.enabled}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor="#FFFFFF"
              />
            </View>
          </View>
        </View>

        {/* Info */}
        <View className="mx-5 p-4 rounded-2xl" style={{ backgroundColor: colors.surface }}>
          <View className="flex-row items-start">
            <MaterialIcons name="info-outline" size={20} color={colors.muted} />
            <Text className="text-muted text-sm ml-2 flex-1">
              알림은 앱이 백그라운드에 있거나 종료된 상태에서도 받을 수 있습니다. 
              기기 설정에서 SCOOP 앱의 알림이 허용되어 있어야 합니다.
            </Text>
          </View>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
