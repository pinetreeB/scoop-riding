import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { Platform } from "react-native";
import Constants from "expo-constants";

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

// Register for push notifications
export async function registerForPushNotificationsAsync(): Promise<string | null> {
  let token: string | null = null;

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "SCOOP 알림",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#FF6D00",
    });

    await Notifications.setNotificationChannelAsync("riding", {
      name: "주행 알림",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#FF6D00",
    });
  }

  if (Device.isDevice) {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== "granted") {
      console.log("[Notifications] Permission not granted");
      return null;
    }

    try {
      const projectId = Constants.expoConfig?.extra?.eas?.projectId;
      if (projectId) {
        const pushToken = await Notifications.getExpoPushTokenAsync({ projectId });
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
  trigger?: Notifications.NotificationTriggerInput
): Promise<string> {
  const identifier = await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      data,
      sound: true,
    },
    trigger: trigger || null, // null means immediate
  });

  return identifier;
}

// Cancel a scheduled notification
export async function cancelNotification(identifier: string): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(identifier);
}

// Cancel all scheduled notifications
export async function cancelAllNotifications(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}

// Get all scheduled notifications
export async function getScheduledNotifications(): Promise<Notifications.NotificationRequest[]> {
  return Notifications.getAllScheduledNotificationsAsync();
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
  const identifiers: string[] = [];

  for (const weekday of weekdays) {
    const identifier = await Notifications.scheduleNotificationAsync({
      content: {
        title: "오늘도 라이딩 어때요? 🛴",
        body: "좋은 날씨에 전동킥보드 타고 나가보세요!",
        data: { type: "ride_reminder" },
        sound: true,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
        weekday,
        hour,
        minute,
      },
    });
    identifiers.push(identifier);
  }

  return identifiers;
}
