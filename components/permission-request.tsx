import { useEffect, useState } from "react";
import { Platform, Alert } from "react-native";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import AsyncStorage from "@react-native-async-storage/async-storage";

const PERMISSION_REQUESTED_KEY = "@scoop_permission_requested";

/**
 * 앱 시작 시 필요한 권한을 요청하는 컴포넌트
 * - 위치 권한 (foreground + background)
 * - 알림 권한
 */
export function PermissionRequest() {
  const [hasRequested, setHasRequested] = useState(true); // 기본값 true로 설정하여 초기 렌더링 시 요청하지 않음

  useEffect(() => {
    checkAndRequestPermissions();
  }, []);

  const checkAndRequestPermissions = async () => {
    if (Platform.OS === "web") return;

    try {
      // 이미 권한 요청을 했는지 확인
      const requested = await AsyncStorage.getItem(PERMISSION_REQUESTED_KEY);
      if (requested === "true") {
        setHasRequested(true);
        return;
      }

      setHasRequested(false);
      
      // 권한 요청 시작
      await requestAllPermissions();
      
      // 권한 요청 완료 표시
      await AsyncStorage.setItem(PERMISSION_REQUESTED_KEY, "true");
      setHasRequested(true);
    } catch (error) {
      console.error("Permission check error:", error);
    }
  };

  const requestAllPermissions = async () => {
    // 1. 위치 권한 요청
    const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
    
    if (foregroundStatus === "granted") {
      // 백그라운드 위치 권한 요청
      const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();
      
      if (backgroundStatus !== "granted") {
        Alert.alert(
          "백그라운드 위치 권한",
          "주행 기록을 위해 백그라운드 위치 권한이 필요합니다. 설정에서 '항상 허용'으로 변경해주세요.",
          [{ text: "확인" }]
        );
      }
    } else {
      Alert.alert(
        "위치 권한 필요",
        "SCOOP은 주행 기록을 위해 위치 권한이 필요합니다. 설정에서 위치 권한을 허용해주세요.",
        [{ text: "확인" }]
      );
    }

    // 2. 알림 권한 요청
    const { status: notificationStatus } = await Notifications.requestPermissionsAsync();
    
    if (notificationStatus !== "granted") {
      // 알림 권한은 선택사항이므로 경고만 표시
      console.log("Notification permission not granted");
    }
  };

  // 이 컴포넌트는 UI를 렌더링하지 않음
  return null;
}
