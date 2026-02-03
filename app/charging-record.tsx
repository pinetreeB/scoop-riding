import { useState, useEffect } from "react";
import {
  Text,
  View,
  Pressable,
  ScrollView,
  TextInput,
  Alert,
  Platform,
  ActivityIndicator,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Haptics from "expo-haptics";

import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import { calculateSoc, createBatterySpec } from "@/lib/battery-analysis";

type ChargeType = "full" | "partial" | "top-up";

export default function ChargingRecordScreen() {
  const router = useRouter();
  const colors = useColors();
  const { scooterId, scooterName } = useLocalSearchParams<{
    scooterId: string;
    scooterName: string;
  }>();

  const [voltageBefore, setVoltageBefore] = useState("");
  const [voltageAfter, setVoltageAfter] = useState("");
  const [chargingDuration, setChargingDuration] = useState("");
  const [chargeType, setChargeType] = useState<ChargeType>("full");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Get scooter info for battery specs
  const { data: scooterData } = trpc.scooters.list.useQuery();
  const scooter = scooterData?.find((s) => s.id === Number(scooterId));

  const createChargingRecord = trpc.charging.create.useMutation();

  // Calculate SOC from voltage using battery spec
  const batterySpec = scooter?.batteryVoltage && scooter?.batteryCellCount
    ? createBatterySpec(
        Number(scooter.batteryVoltage),
        Number(scooter.batteryCapacity) || 30,
        (scooter.batteryType === "lifepo4" ? "lfp" : scooter.batteryType === "lipo" ? "li-po" : "li-ion") as "li-ion" | "li-po" | "lfp"
      )
    : null;

  const socBefore =
    voltageBefore && batterySpec
      ? calculateSoc(parseFloat(voltageBefore), batterySpec)
      : null;

  const socAfter =
    voltageAfter && batterySpec
      ? calculateSoc(parseFloat(voltageAfter), batterySpec)
      : null;

  const handleSubmit = async () => {
    if (!voltageBefore || !voltageAfter) {
      Alert.alert("입력 오류", "충전 전/후 전압을 입력해주세요.");
      return;
    }

    const beforeV = parseFloat(voltageBefore);
    const afterV = parseFloat(voltageAfter);

    if (afterV <= beforeV) {
      Alert.alert("입력 오류", "충전 후 전압이 충전 전보다 높아야 합니다.");
      return;
    }

    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    setIsSubmitting(true);

    try {
      await createChargingRecord.mutateAsync({
        scooterId: Number(scooterId),
        voltageBefore: beforeV,
        voltageAfter: afterV,
        socBefore: socBefore ?? undefined,
        socAfter: socAfter ?? undefined,
        chargingDuration: chargingDuration ? parseInt(chargingDuration) : undefined,
        chargeType,
        notes: notes || undefined,
      });

      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }

      Alert.alert("완료", "충전 기록이 저장되었습니다.", [
        { text: "확인", onPress: () => router.back() },
      ]);
    } catch (error) {
      console.error("Failed to save charging record:", error);
      Alert.alert("오류", "충전 기록 저장에 실패했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const chargeTypes: { type: ChargeType; label: string; icon: string }[] = [
    { type: "full", label: "완충", icon: "battery-full" },
    { type: "partial", label: "부분 충전", icon: "battery-std" },
    { type: "top-up", label: "보충 충전", icon: "battery-charging-full" },
  ];

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]}>
      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View className="flex-row justify-between items-center px-4 py-3 border-b border-border">
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
            className="p-2 -ml-2"
          >
            <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
          </Pressable>
          <Text className="text-lg font-semibold text-foreground">충전 기록</Text>
          <View className="w-10" />
        </View>

        {/* Scooter Info */}
        <View className="px-4 py-3 bg-surface mx-4 mt-4 rounded-xl">
          <View className="flex-row items-center">
            <MaterialIcons name="electric-scooter" size={24} color={colors.primary} />
            <Text className="text-foreground font-semibold ml-2">
              {decodeURIComponent(scooterName || "")}
            </Text>
          </View>
          {scooter && (
            <Text className="text-muted text-sm mt-1">
              {scooter.batteryVoltage}V {scooter.batteryCapacity}Ah •{" "}
              {scooter.batteryCellCount}S
            </Text>
          )}
        </View>

        {/* Voltage Input */}
        <View className="px-4 mt-6">
          <Text className="text-foreground font-semibold mb-4">전압 입력</Text>

          {/* Before Charging */}
          <View className="mb-4">
            <Text className="text-muted text-sm mb-2">충전 전 전압 (V)</Text>
            <View className="flex-row items-center bg-surface rounded-xl px-4 py-3">
              <MaterialIcons name="battery-alert" size={20} color={colors.warning} />
              <TextInput
                className="flex-1 text-foreground text-lg ml-3"
                placeholder="예: 58.8"
                placeholderTextColor={colors.muted}
                keyboardType="decimal-pad"
                value={voltageBefore}
                onChangeText={setVoltageBefore}
              />
              {socBefore !== null && (
                <Text className="text-warning font-semibold">
                  {socBefore.toFixed(0)}%
                </Text>
              )}
            </View>
          </View>

          {/* After Charging */}
          <View className="mb-4">
            <Text className="text-muted text-sm mb-2">충전 후 전압 (V)</Text>
            <View className="flex-row items-center bg-surface rounded-xl px-4 py-3">
              <MaterialIcons name="battery-full" size={20} color={colors.success} />
              <TextInput
                className="flex-1 text-foreground text-lg ml-3"
                placeholder="예: 67.2"
                placeholderTextColor={colors.muted}
                keyboardType="decimal-pad"
                value={voltageAfter}
                onChangeText={setVoltageAfter}
              />
              {socAfter !== null && (
                <Text className="text-success font-semibold">
                  {socAfter.toFixed(0)}%
                </Text>
              )}
            </View>
          </View>

          {/* Charging Duration */}
          <View className="mb-4">
            <Text className="text-muted text-sm mb-2">충전 시간 (분) - 선택</Text>
            <View className="flex-row items-center bg-surface rounded-xl px-4 py-3">
              <MaterialIcons name="timer" size={20} color={colors.muted} />
              <TextInput
                className="flex-1 text-foreground text-lg ml-3"
                placeholder="예: 180"
                placeholderTextColor={colors.muted}
                keyboardType="number-pad"
                value={chargingDuration}
                onChangeText={setChargingDuration}
              />
              {chargingDuration && (
                <Text className="text-muted">
                  {Math.floor(parseInt(chargingDuration) / 60)}시간{" "}
                  {parseInt(chargingDuration) % 60}분
                </Text>
              )}
            </View>
          </View>
        </View>

        {/* Charge Type */}
        <View className="px-4 mt-4">
          <Text className="text-foreground font-semibold mb-4">충전 유형</Text>
          <View className="flex-row gap-3">
            {chargeTypes.map((ct) => (
              <Pressable
                key={ct.type}
                onPress={() => {
                  setChargeType(ct.type);
                  if (Platform.OS !== "web") {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }
                }}
                style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
                className={`flex-1 items-center py-3 rounded-xl border ${
                  chargeType === ct.type
                    ? "bg-primary/10 border-primary"
                    : "bg-surface border-border"
                }`}
              >
                <MaterialIcons
                  name={ct.icon as any}
                  size={24}
                  color={chargeType === ct.type ? colors.primary : colors.muted}
                />
                <Text
                  className={`text-sm mt-1 ${
                    chargeType === ct.type ? "text-primary font-semibold" : "text-muted"
                  }`}
                >
                  {ct.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Notes */}
        <View className="px-4 mt-6">
          <Text className="text-foreground font-semibold mb-2">메모 (선택)</Text>
          <TextInput
            className="bg-surface rounded-xl px-4 py-3 text-foreground min-h-[80px]"
            placeholder="충전 관련 메모를 입력하세요..."
            placeholderTextColor={colors.muted}
            multiline
            textAlignVertical="top"
            value={notes}
            onChangeText={setNotes}
          />
        </View>

        {/* Submit Button */}
        <View className="px-4 mt-8 mb-6">
          <Pressable
            onPress={handleSubmit}
            disabled={isSubmitting || !voltageBefore || !voltageAfter}
            style={({ pressed }) => [
              {
                backgroundColor: colors.primary,
                opacity: pressed || isSubmitting || !voltageBefore || !voltageAfter ? 0.7 : 1,
              },
            ]}
            className="flex-row items-center justify-center py-4 rounded-xl"
          >
            {isSubmitting ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <MaterialIcons name="save" size={20} color="#FFFFFF" />
                <Text className="text-white font-semibold ml-2">충전 기록 저장</Text>
              </>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
