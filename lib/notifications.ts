import { Platform } from "react-native";
import Constants from "expo-constants";

// Lazy load expo-notifications to avoid Expo Go errors
let Notifications: typeof import("expo-notifications") | null = null;
let Device: typeof import("expo-device") | null = null;

// Check if we're in Expo Go
const isExpoGo = Constants.appOwnership === "expo";

// Initialize notifications module only if not in Expo Go or on web
async function getNotificationsModule() {
  if (Notifications) return Notifications;
  
  // Skip on web or in Expo Go (push notifications not supported)
  if (Platform.OS === "web" || isExpoGo) {
    console.log("[Notifications] Skipping - not supported in this environment");
    return null;
  }
  
  try {
    Notifications = await import("expo-notifications");
    Device = await import("expo-device");
    
    // Configure notification handler
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
    
    return Notifications;
  } catch (error) {
    console.log("[Notifications] Failed to load module:", error);
    return null;
  }
}

// Register for push notifications
export async function registerForPushNotificationsAsync(): Promise<string | null> {
  const notif = await getNotificationsModule();
  if (!notif || !Device) {
    console.log("[Notifications] Module not available");
    return null;
  }

  let token: string | null = null;

  if (Platform.OS === "android") {
    try {
      await notif.setNotificationChannelAsync("default", {
        name: "SCOOP 알림",
        importance: notif.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#FF6D00",
      });

      await notif.setNotificationChannelAsync("riding", {
        name: "주행 알림",
        importance: notif.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#FF6D00",
      });
    } catch (e) {
      console.log("[Notifications] Channel setup error:", e);
    }
  }

  if (Device.isDevice) {
    const { status: existingStatus } = await notif.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== "granted") {
      const { status } = await notif.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== "granted") {
      console.log("[Notifications] Permission not granted");
      return null;
    }

    try {
      const projectId = Constants.expoConfig?.extra?.eas?.projectId;
      if (projectId) {
        const pushToken = await notif.getExpoPushTokenAsync({ projectId });
        token = pushToken.data;
      }
    } catch (error) {
      console.log("[Notifications] Error getting push token:", error);
    }
  } else {
    console.log("[Notifications] Must use physical device for Push Notifications");
  }

  return token;
}

// Schedule a local notification
export async function scheduleLocalNotification(
  title: string,
  body: string,
  data?: Record<string, unknown>,
  trigger?: any
): Promise<string> {
  const notif = await getNotificationsModule();
  if (!notif) {
    console.log("[Notifications] Local notification skipped - module not available");
    return "";
  }

  try {
    const identifier = await notif.scheduleNotificationAsync({
      content: {
        title,
        body,
        data,
        sound: true,
      },
      trigger: trigger || null, // null means immediate
    });
    return identifier;
  } catch (error) {
    console.log("[Notifications] Schedule error:", error);
    return "";
  }
}

// Cancel a scheduled notification
export async function cancelNotification(identifier: string): Promise<void> {
  const notif = await getNotificationsModule();
  if (!notif || !identifier) return;
  
  try {
    await notif.cancelScheduledNotificationAsync(identifier);
  } catch (error) {
    console.log("[Notifications] Cancel error:", error);
  }
}

// Cancel all scheduled notifications
export async function cancelAllNotifications(): Promise<void> {
  const notif = await getNotificationsModule();
  if (!notif) return;
  
  try {
    await notif.cancelAllScheduledNotificationsAsync();
  } catch (error) {
    console.log("[Notifications] Cancel all error:", error);
  }
}

// Get all scheduled notifications
export async function getScheduledNotifications(): Promise<any[]> {
  const notif = await getNotificationsModule();
  if (!notif) return [];
  
  try {
    return await notif.getAllScheduledNotificationsAsync();
  } catch (error) {
    console.log("[Notifications] Get scheduled error:", error);
    return [];
  }
}

// Riding-specific notifications

export async function notifyRideStarted(): Promise<string> {
  return scheduleLocalNotification(
    "주행 시작 🛴",
    "안전한 주행 되세요! 주행 중 기록이 저장됩니다.",
    { type: "ride_started" }
  );
}

export async function notifyRideCompleted(
  distance: number,
  duration: number,
  avgSpeed: number
): Promise<string> {
  const distanceKm = (distance / 1000).toFixed(2);
  const durationMin = Math.floor(duration / 60);
  const durationSec = duration % 60;
  const durationStr = durationMin > 0 
    ? `${durationMin}분 ${durationSec}초` 
    : `${durationSec}초`;

  return scheduleLocalNotification(
    "주행 완료 🎉",
    `${distanceKm}km를 ${durationStr}에 완주했습니다! 평균 속도: ${avgSpeed.toFixed(1)}km/h`,
    { 
      type: "ride_completed",
      distance,
      duration,
      avgSpeed,
    }
  );
}

export async function notifyWeeklyReport(
  totalDistance: number,
  totalRides: number,
  totalDuration: number
): Promise<string> {
  const distanceKm = (totalDistance / 1000).toFixed(1);
  const durationHours = (totalDuration / 3600).toFixed(1);

  return scheduleLocalNotification(
    "주간 리포트 📊",
    `이번 주 ${totalRides}회 주행, 총 ${distanceKm}km, ${durationHours}시간 라이딩!`,
    {
      type: "weekly_report",
      totalDistance,
      totalRides,
      totalDuration,
    }
  );
}

export async function notifyNewRecord(recordType: "distance" | "speed" | "duration", value: number): Promise<string> {
  let title = "";
  let body = "";

  switch (recordType) {
    case "distance":
      title = "새로운 거리 기록! 🏆";
      body = `최장 거리 ${(value / 1000).toFixed(2)}km를 달성했습니다!`;
      break;
    case "speed":
      title = "새로운 속도 기록! 🚀";
      body = `최고 속도 ${value.toFixed(1)}km/h를 달성했습니다!`;
      break;
    case "duration":
      title = "새로운 시간 기록! ⏱️";
      body = `최장 주행 시간 ${Math.floor(value / 60)}분을 달성했습니다!`;
      break;
  }

  return scheduleLocalNotification(title, body, { type: "new_record", recordType, value });
}

export async function notifyLevelUp(newLevel: number, title: string): Promise<string> {
  return scheduleLocalNotification(
    "레벨 업! 🎊",
    `축하합니다! Lv.${newLevel} "${title}"로 승급했습니다!`,
    { type: "level_up", newLevel, title }
  );
}

// Schedule reminder notification
export async function scheduleRideReminder(
  hour: number,
  minute: number,
  weekdays: number[] = [1, 2, 3, 4, 5] // Mon-Fri by default
): Promise<string[]> {
  const notif = await getNotificationsModule();
  if (!notif) return [];

  const identifiers: string[] = [];

  for (const weekday of weekdays) {
    try {
      const identifier = await notif.scheduleNotificationAsync({
        content: {
          title: "오늘도 라이딩 어때요? 🛴",
          body: "좋은 날씨에 전동킥보드 타고 나가보세요!",
          data: { type: "ride_reminder" },
          sound: true,
        },
        trigger: {
          type: notif.SchedulableTriggerInputTypes.WEEKLY,
          weekday,
          hour,
          minute,
        },
      });
      identifiers.push(identifier);
    } catch (error) {
      console.log("[Notifications] Schedule reminder error:", error);
    }
  }

  return identifiers;
}
