import { useState, useEffect } from "react";
import {
  Text,
  View,
  Modal,
  Pressable,
  TextInput,
  Platform,
  KeyboardAvoidingView,
  ScrollView,
} from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Haptics from "expo-haptics";
import { SafeAreaView } from "react-native-safe-area-context";
import { useColors } from "@/hooks/use-colors";

interface ScooterBatteryInfo {
  id: number;
  name: string;
  batteryVoltage?: number | null;
  batteryCapacity?: string | null;
  batteryType?: string | null;
  batteryCellCount?: number | null;
  batteryFullVoltage?: string | null;
  batteryEmptyVoltage?: string | null;
}

interface VoltageInputModalProps {
  visible: boolean;
  scooter: ScooterBatteryInfo | null;
  mode: "start" | "end";
  onSubmit: (voltage: number, soc: number) => void;
  onSkip: () => void;
  onCancel?: () => void;
  /** For end mode: show ride summary */
  rideSummary?: {
    distance: number; // meters
    duration: number; // seconds
    avgSpeed: number; // km/h
  };
  /** For end mode: start voltage for comparison */
  startVoltage?: number;
}

// Calculate SOC from voltage using linear interpolation
function calculateSoc(
  voltage: number,
  fullVoltage: number,
  emptyVoltage: number
): number {
  if (voltage >= fullVoltage) return 100;
  if (voltage <= emptyVoltage) return 0;
  
  const range = fullVoltage - emptyVoltage;
  const current = voltage - emptyVoltage;
  return Math.round((current / range) * 100);
}

// Common voltage quick-select options relative to full voltage
function getQuickVoltages(fullVoltage: number, emptyVoltage: number): number[] {
  const range = fullVoltage - emptyVoltage;
  return [
    fullVoltage, // 100%
    Math.round((emptyVoltage + range * 0.9) * 10) / 10, // 90%
    Math.round((emptyVoltage + range * 0.75) * 10) / 10, // 75%
    Math.round((emptyVoltage + range * 0.5) * 10) / 10, // 50%
    Math.round((emptyVoltage + range * 0.25) * 10) / 10, // 25%
    emptyVoltage, // 0%
  ];
}

export function VoltageInputModal({
  visible,
  scooter,
  mode,
  onSubmit,
  onSkip,
  onCancel,
  rideSummary,
  startVoltage,
}: VoltageInputModalProps) {
  const colors = useColors();
  const [voltageInput, setVoltageInput] = useState("");
  const [calculatedSoc, setCalculatedSoc] = useState<number | null>(null);

  // Get battery specs from scooter
  const fullVoltage = scooter?.batteryFullVoltage 
    ? parseFloat(scooter.batteryFullVoltage) 
    : (scooter?.batteryVoltage ? scooter.batteryVoltage * 1.12 : 67.2); // Default 60V Li-ion
  const emptyVoltage = scooter?.batteryEmptyVoltage 
    ? parseFloat(scooter.batteryEmptyVoltage) 
    : (scooter?.batteryVoltage ? scooter.batteryVoltage * 0.8 : 48.0);
  const batteryCapacity = scooter?.batteryCapacity 
    ? parseFloat(scooter.batteryCapacity) 
    : 30;
  const nominalVoltage = scooter?.batteryVoltage || 60;

  // Calculate total Wh capacity
  const totalCapacityWh = nominalVoltage * batteryCapacity;

  // Quick voltage options
  const quickVoltages = getQuickVoltages(fullVoltage, emptyVoltage);

  // Reset state when modal opens
  useEffect(() => {
    if (visible) {
      setVoltageInput("");
      setCalculatedSoc(null);
    }
  }, [visible]);

  // Calculate SOC when voltage changes
  useEffect(() => {
    const voltage = parseFloat(voltageInput);
    if (!isNaN(voltage) && voltage > 0) {
      const soc = calculateSoc(voltage, fullVoltage, emptyVoltage);
      setCalculatedSoc(soc);
    } else {
      setCalculatedSoc(null);
    }
  }, [voltageInput, fullVoltage, emptyVoltage]);

  const handleQuickSelect = (voltage: number) => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setVoltageInput(voltage.toFixed(1));
  };

  const handleSubmit = () => {
    const voltage = parseFloat(voltageInput);
    if (isNaN(voltage) || voltage <= 0) {
      return;
    }

    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }

    const soc = calculateSoc(voltage, fullVoltage, emptyVoltage);
    onSubmit(voltage, soc);
  };

  const handleSkip = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onSkip();
  };

  // Calculate energy consumed if we have both start and end voltages
  const energyConsumed = mode === "end" && startVoltage && calculatedSoc !== null
    ? (() => {
        const startSoc = calculateSoc(startVoltage, fullVoltage, emptyVoltage);
        const socDiff = startSoc - calculatedSoc;
        return (totalCapacityWh * socDiff) / 100;
      })()
    : null;

  // Calculate efficiency (Wh/km)
  const efficiency = energyConsumed && rideSummary && rideSummary.distance > 0
    ? energyConsumed / (rideSummary.distance / 1000)
    : null;

  if (!scooter) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onCancel || onSkip}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <SafeAreaView 
          style={{ flex: 1, backgroundColor: colors.background }} 
          edges={["top", "left", "right"]}
        >
          {/* Header */}
          <View className="flex-row items-center justify-between px-5 py-4 border-b border-border">
            <Pressable
              onPress={onCancel || onSkip}
              style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
            >
              <Text style={{ color: colors.muted }} className="text-base">취소</Text>
            </Pressable>
            <Text className="text-lg font-bold text-foreground">
              {mode === "start" ? "출발 전압 입력" : "도착 전압 입력"}
            </Text>
            <View style={{ width: 40 }} />
          </View>

          <ScrollView className="flex-1 px-5 py-4">
            {/* Scooter Info */}
            <View className="bg-surface rounded-xl p-4 mb-4 border border-border">
              <View className="flex-row items-center">
                <MaterialIcons name="electric-scooter" size={24} color={colors.primary} />
                <Text className="text-foreground font-bold ml-2">{scooter.name}</Text>
              </View>
              <View className="flex-row mt-2">
                <Text className="text-muted text-sm">
                  {nominalVoltage}V {batteryCapacity}Ah ({totalCapacityWh.toFixed(0)}Wh)
                </Text>
              </View>
              <View className="flex-row mt-1">
                <Text className="text-muted text-xs">
                  전압 범위: {emptyVoltage.toFixed(1)}V (방전) ~ {fullVoltage.toFixed(1)}V (만충)
                </Text>
              </View>
            </View>

            {/* Ride Summary (for end mode) */}
            {mode === "end" && rideSummary && (
              <View className="bg-surface rounded-xl p-4 mb-4 border border-border">
                <Text className="text-foreground font-bold mb-2">주행 요약</Text>
                <View className="flex-row justify-between">
                  <View className="items-center flex-1">
                    <Text className="text-2xl font-bold text-foreground">
                      {(rideSummary.distance / 1000).toFixed(2)}
                    </Text>
                    <Text className="text-muted text-xs">km</Text>
                  </View>
                  <View className="items-center flex-1">
                    <Text className="text-2xl font-bold text-foreground">
                      {Math.floor(rideSummary.duration / 60)}:{String(rideSummary.duration % 60).padStart(2, "0")}
                    </Text>
                    <Text className="text-muted text-xs">시간</Text>
                  </View>
                  <View className="items-center flex-1">
                    <Text className="text-2xl font-bold text-foreground">
                      {rideSummary.avgSpeed.toFixed(1)}
                    </Text>
                    <Text className="text-muted text-xs">km/h</Text>
                  </View>
                </View>
                {startVoltage && (
                  <View className="mt-3 pt-3 border-t border-border">
                    <Text className="text-muted text-sm">
                      출발 전압: <Text className="text-foreground font-medium">{startVoltage.toFixed(1)}V</Text>
                      {" "}({calculateSoc(startVoltage, fullVoltage, emptyVoltage)}%)
                    </Text>
                  </View>
                )}
              </View>
            )}

            {/* Voltage Input */}
            <View className="mb-4">
              <Text className="text-sm font-medium text-foreground mb-2">
                {mode === "start" ? "현재 배터리 전압을 입력하세요" : "주행 후 배터리 전압을 입력하세요"}
              </Text>
              <View className="flex-row items-center">
                <TextInput
                  value={voltageInput}
                  onChangeText={setVoltageInput}
                  placeholder={`예: ${(fullVoltage * 0.8).toFixed(1)}`}
                  placeholderTextColor={colors.muted}
                  keyboardType="decimal-pad"
                  className="flex-1 bg-surface border border-border rounded-xl px-4 py-4 text-foreground text-xl font-bold"
                  style={{ fontSize: 24 }}
                />
                <Text className="text-foreground text-xl font-bold ml-2">V</Text>
              </View>
            </View>

            {/* SOC Display */}
            {calculatedSoc !== null && (
              <View className="bg-surface rounded-xl p-4 mb-4 border border-border">
                <View className="flex-row items-center justify-between">
                  <Text className="text-foreground font-medium">예상 잔량 (SOC)</Text>
                  <View className="flex-row items-center">
                    <MaterialIcons 
                      name={calculatedSoc > 50 ? "battery-full" : calculatedSoc > 20 ? "battery-std" : "battery-alert"} 
                      size={24} 
                      color={calculatedSoc > 50 ? colors.success : calculatedSoc > 20 ? colors.warning : colors.error} 
                    />
                    <Text 
                      className="text-2xl font-bold ml-2"
                      style={{ 
                        color: calculatedSoc > 50 ? colors.success : calculatedSoc > 20 ? colors.warning : colors.error 
                      }}
                    >
                      {calculatedSoc}%
                    </Text>
                  </View>
                </View>
                {/* SOC Bar */}
                <View className="mt-3 h-3 bg-background rounded-full overflow-hidden">
                  <View 
                    className="h-full rounded-full"
                    style={{ 
                      width: `${calculatedSoc}%`,
                      backgroundColor: calculatedSoc > 50 ? colors.success : calculatedSoc > 20 ? colors.warning : colors.error,
                    }} 
                  />
                </View>
                {/* Remaining Wh */}
                <Text className="text-muted text-sm mt-2">
                  남은 용량: 약 {((totalCapacityWh * calculatedSoc) / 100).toFixed(0)}Wh
                </Text>
              </View>
            )}

            {/* Energy Consumption (for end mode) */}
            {mode === "end" && energyConsumed !== null && energyConsumed > 0 && (
              <View className="bg-primary/10 rounded-xl p-4 mb-4 border border-primary/30">
                <Text className="text-foreground font-bold mb-2">에너지 소비 분석</Text>
                <View className="flex-row justify-between mb-2">
                  <Text className="text-muted">소비 에너지</Text>
                  <Text className="text-foreground font-medium">{energyConsumed.toFixed(1)} Wh</Text>
                </View>
                {efficiency !== null && (
                  <View className="flex-row justify-between">
                    <Text className="text-muted">평균 연비</Text>
                    <Text className="text-primary font-bold">{efficiency.toFixed(1)} Wh/km</Text>
                  </View>
                )}
              </View>
            )}

            {/* Quick Select Voltages */}
            <View className="mb-4">
              <Text className="text-sm font-medium text-foreground mb-2">빠른 선택</Text>
              <View className="flex-row flex-wrap">
                {quickVoltages.map((voltage, index) => {
                  const soc = calculateSoc(voltage, fullVoltage, emptyVoltage);
                  const isSelected = voltageInput === voltage.toFixed(1);
                  return (
                    <Pressable
                      key={voltage}
                      onPress={() => handleQuickSelect(voltage)}
                      style={({ pressed }) => [
                        { 
                          backgroundColor: isSelected ? colors.primary : colors.surface,
                          opacity: pressed ? 0.8 : 1,
                        },
                      ]}
                      className="px-3 py-2 rounded-lg mr-2 mb-2 border border-border"
                    >
                      <Text 
                        className="text-sm font-medium"
                        style={{ color: isSelected ? "#FFFFFF" : colors.foreground }}
                      >
                        {voltage.toFixed(1)}V ({soc}%)
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Info */}
            <View className="bg-surface rounded-xl p-4 mb-6 border border-border">
              <View className="flex-row items-start">
                <MaterialIcons name="info-outline" size={20} color={colors.muted} />
                <Text className="text-muted text-sm ml-2 flex-1">
                  {mode === "start" 
                    ? "전압은 기체의 계기판이나 BMS 앱에서 확인할 수 있습니다. 정확한 연비 분석을 위해 가능하면 입력해주세요."
                    : "주행 직후 전압을 입력하면 이번 주행의 연비를 계산할 수 있습니다. 데이터가 쌓이면 AI가 더 정확한 분석을 제공합니다."
                  }
                </Text>
              </View>
            </View>
          </ScrollView>

          {/* Bottom Buttons */}
          <View className="px-5 pb-8 pt-4 border-t border-border">
            <View className="flex-row">
              <Pressable
                onPress={handleSkip}
                style={({ pressed }) => [{ opacity: pressed ? 0.8 : 1 }]}
                className="flex-1 mr-2 py-4 rounded-xl bg-surface border border-border items-center"
              >
                <Text className="text-foreground font-medium">건너뛰기</Text>
              </Pressable>
              <Pressable
                onPress={handleSubmit}
                disabled={calculatedSoc === null}
                style={({ pressed }) => [
                  { 
                    backgroundColor: calculatedSoc !== null ? colors.primary : colors.muted,
                    opacity: pressed ? 0.8 : 1,
                  },
                ]}
                className="flex-1 ml-2 py-4 rounded-xl items-center"
              >
                <Text className="text-white font-bold">
                  {mode === "start" ? "주행 시작" : "기록 저장"}
                </Text>
              </Pressable>
            </View>
          </View>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// Export utility functions for use in other components
export { calculateSoc, getQuickVoltages };
