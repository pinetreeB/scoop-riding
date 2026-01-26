import { useState, useEffect } from "react";
import {
  View,
  Text,
  Modal,
  Pressable,
  Platform,
  Linking,
  Alert,
  ScrollView,
} from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as IntentLauncher from "expo-intent-launcher";
import { useColors } from "@/hooks/use-colors";

const BATTERY_GUIDE_SHOWN_KEY = "scoop_battery_guide_shown";
const BATTERY_GUIDE_DISMISSED_KEY = "scoop_battery_guide_dismissed";

interface BatteryOptimizationGuideProps {
  visible: boolean;
  onClose: () => void;
}

export function BatteryOptimizationGuide({
  visible,
  onClose,
}: BatteryOptimizationGuideProps) {
  const colors = useColors();

  const openBatterySettings = async () => {
    if (Platform.OS !== "android") {
      Alert.alert("알림", "이 기능은 Android에서만 사용 가능합니다.");
      return;
    }

    try {
      // Try to open battery optimization settings directly
      await IntentLauncher.startActivityAsync(
        IntentLauncher.ActivityAction.IGNORE_BATTERY_OPTIMIZATION_SETTINGS
      );
    } catch (error) {
      console.log("[BatteryGuide] Failed to open battery settings:", error);
      try {
        // Fallback to general battery settings
        await IntentLauncher.startActivityAsync(
          IntentLauncher.ActivityAction.BATTERY_SAVER_SETTINGS
        );
      } catch (fallbackError) {
        console.log("[BatteryGuide] Fallback also failed:", fallbackError);
        // Last resort: open app settings
        Linking.openSettings();
      }
    }
  };

  const handleDontShowAgain = async () => {
    try {
      await AsyncStorage.setItem(BATTERY_GUIDE_DISMISSED_KEY, "true");
    } catch (error) {
      console.log("[BatteryGuide] Failed to save preference:", error);
    }
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.5)",
          justifyContent: "flex-end",
        }}
      >
        <View
          style={{
            backgroundColor: colors.background,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            paddingTop: 16,
            paddingBottom: 40,
            paddingHorizontal: 20,
            maxHeight: "80%",
          }}
        >
          {/* Handle bar */}
          <View
            style={{
              width: 40,
              height: 4,
              backgroundColor: colors.border,
              borderRadius: 2,
              alignSelf: "center",
              marginBottom: 16,
            }}
          />

          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Header */}
            <View style={{ alignItems: "center", marginBottom: 20 }}>
              <View
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 32,
                  backgroundColor: colors.warning + "20",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: 12,
                }}
              >
                <MaterialIcons
                  name="battery-alert"
                  size={32}
                  color={colors.warning}
                />
              </View>
              <Text
                style={{
                  fontSize: 20,
                  fontWeight: "bold",
                  color: colors.foreground,
                  textAlign: "center",
                }}
              >
                백그라운드 추적을 위한 설정
              </Text>
              <Text
                style={{
                  fontSize: 14,
                  color: colors.muted,
                  textAlign: "center",
                  marginTop: 8,
                }}
              >
                화면을 끄거나 다른 앱 사용 시에도{"\n"}주행 기록이 정확하게
                저장됩니다
              </Text>
            </View>

            {/* Steps */}
            <View style={{ gap: 16, marginBottom: 24 }}>
              <StepItem
                number={1}
                title="배터리 최적화 해제"
                description="SCOOP 앱이 백그라운드에서 계속 실행될 수 있도록 배터리 최적화에서 제외해주세요."
                colors={colors}
              />
              <StepItem
                number={2}
                title="위치 권한 '항상 허용'"
                description="앱 설정에서 위치 권한을 '항상 허용'으로 변경해주세요."
                colors={colors}
              />
              <StepItem
                number={3}
                title="절전 모드 확인"
                description="절전 모드가 켜져 있으면 백그라운드 추적이 제한될 수 있습니다."
                colors={colors}
              />
            </View>

            {/* Device-specific tips */}
            <View
              style={{
                backgroundColor: colors.surface,
                borderRadius: 12,
                padding: 16,
                marginBottom: 24,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
                <MaterialIcons
                  name="info-outline"
                  size={18}
                  color={colors.primary}
                />
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: "600",
                    color: colors.foreground,
                    marginLeft: 8,
                  }}
                >
                  제조사별 추가 설정
                </Text>
              </View>
              <Text style={{ fontSize: 13, color: colors.muted, lineHeight: 20 }}>
                • Samsung: 설정 → 배터리 → 백그라운드 사용 제한 → SCOOP 해제{"\n"}
                • Xiaomi: 설정 → 앱 → SCOOP → 배터리 절약 → 제한 없음{"\n"}
                • Huawei: 설정 → 배터리 → 앱 시작 → SCOOP → 수동 관리{"\n"}
                • OnePlus: 설정 → 배터리 → 배터리 최적화 → SCOOP → 최적화 안 함
              </Text>
            </View>

            {/* Buttons */}
            <View style={{ gap: 12 }}>
              <Pressable
                onPress={openBatterySettings}
                style={({ pressed }) => ({
                  backgroundColor: colors.primary,
                  paddingVertical: 14,
                  borderRadius: 12,
                  alignItems: "center",
                  opacity: pressed ? 0.8 : 1,
                })}
              >
                <Text
                  style={{ color: "#fff", fontSize: 16, fontWeight: "600" }}
                >
                  배터리 설정 열기
                </Text>
              </Pressable>

              <Pressable
                onPress={onClose}
                style={({ pressed }) => ({
                  backgroundColor: colors.surface,
                  paddingVertical: 14,
                  borderRadius: 12,
                  alignItems: "center",
                  opacity: pressed ? 0.8 : 1,
                })}
              >
                <Text
                  style={{
                    color: colors.foreground,
                    fontSize: 16,
                    fontWeight: "500",
                  }}
                >
                  나중에 하기
                </Text>
              </Pressable>

              <Pressable
                onPress={handleDontShowAgain}
                style={({ pressed }) => ({
                  paddingVertical: 8,
                  alignItems: "center",
                  opacity: pressed ? 0.6 : 1,
                })}
              >
                <Text style={{ color: colors.muted, fontSize: 13 }}>
                  다시 보지 않기
                </Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function StepItem({
  number,
  title,
  description,
  colors,
}: {
  number: number;
  title: string;
  description: string;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={{ flexDirection: "row", gap: 12 }}>
      <View
        style={{
          width: 28,
          height: 28,
          borderRadius: 14,
          backgroundColor: colors.primary,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text style={{ color: "#fff", fontSize: 14, fontWeight: "bold" }}>
          {number}
        </Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text
          style={{
            fontSize: 15,
            fontWeight: "600",
            color: colors.foreground,
            marginBottom: 4,
          }}
        >
          {title}
        </Text>
        <Text style={{ fontSize: 13, color: colors.muted, lineHeight: 18 }}>
          {description}
        </Text>
      </View>
    </View>
  );
}

/**
 * Hook to check if battery optimization guide should be shown
 */
export function useBatteryOptimizationGuide() {
  const [shouldShow, setShouldShow] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    checkIfShouldShow();
  }, []);

  const checkIfShouldShow = async () => {
    if (Platform.OS !== "android") {
      setShouldShow(false);
      return;
    }

    try {
      const dismissed = await AsyncStorage.getItem(BATTERY_GUIDE_DISMISSED_KEY);
      if (dismissed === "true") {
        setShouldShow(false);
        return;
      }

      // Show guide if not dismissed
      setShouldShow(true);
    } catch (error) {
      console.log("[BatteryGuide] Error checking status:", error);
      setShouldShow(false);
    }
  };

  const showGuide = () => {
    if (shouldShow) {
      setIsVisible(true);
    }
  };

  const hideGuide = () => {
    setIsVisible(false);
  };

  const markAsShown = async () => {
    try {
      await AsyncStorage.setItem(BATTERY_GUIDE_SHOWN_KEY, "true");
    } catch (error) {
      console.log("[BatteryGuide] Error marking as shown:", error);
    }
  };

  return {
    shouldShow,
    isVisible,
    showGuide,
    hideGuide,
    markAsShown,
  };
}
