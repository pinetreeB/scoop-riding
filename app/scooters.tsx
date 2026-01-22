import { useCallback, useState } from "react";
import {
  Text,
  View,
  ScrollView,
  Pressable,
  Alert,
  Platform,
  TextInput,
  Modal,
  ActivityIndicator,
} from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Haptics from "expo-haptics";
import { useRouter, useFocusEffect } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useAuth } from "@/hooks/use-auth";
import { trpc } from "@/lib/trpc";

// Predefined colors for scooter
const SCOOTER_COLORS = [
  "#FF6D00", // Orange (default)
  "#2196F3", // Blue
  "#4CAF50", // Green
  "#9C27B0", // Purple
  "#F44336", // Red
  "#00BCD4", // Cyan
  "#FF9800", // Amber
  "#607D8B", // Blue Grey
];

interface ScooterFormData {
  name: string;
  brand: string;
  model: string;
  serialNumber: string;
  initialOdometer: string;
  color: string;
  notes: string;
}

const initialFormData: ScooterFormData = {
  name: "",
  brand: "",
  model: "",
  serialNumber: "",
  initialOdometer: "0",
  color: "#FF6D00",
  notes: "",
};

export default function ScootersScreen() {
  const colors = useColors();
  const router = useRouter();
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState<ScooterFormData>(initialFormData);
  const [isSaving, setIsSaving] = useState(false);

  const trpcUtils = trpc.useUtils();
  const scootersQuery = trpc.scooters.list.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const createMutation = trpc.scooters.create.useMutation();
  const updateMutation = trpc.scooters.update.useMutation();
  const deleteMutation = trpc.scooters.delete.useMutation();
  const setDefaultMutation = trpc.scooters.setDefault.useMutation();

  useFocusEffect(
    useCallback(() => {
      if (isAuthenticated) {
        scootersQuery.refetch();
      }
    }, [isAuthenticated])
  );

  const handleAddScooter = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setEditingId(null);
    setFormData(initialFormData);
    setIsModalVisible(true);
  };

  const handleEditScooter = (scooter: any) => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setEditingId(scooter.id);
    setFormData({
      name: scooter.name || "",
      brand: scooter.brand || "",
      model: scooter.model || "",
      serialNumber: scooter.serialNumber || "",
      initialOdometer: String(scooter.initialOdometer || 0),
      color: scooter.color || "#FF6D00",
      notes: scooter.notes || "",
    });
    setIsModalVisible(true);
  };

  const handleSaveScooter = async () => {
    if (!formData.name.trim()) {
      Alert.alert("오류", "기체 이름을 입력해주세요.");
      return;
    }

    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }

    setIsSaving(true);
    try {
      if (editingId) {
        await updateMutation.mutateAsync({
          id: editingId,
          name: formData.name.trim(),
          brand: formData.brand.trim() || undefined,
          model: formData.model.trim() || undefined,
          serialNumber: formData.serialNumber.trim() || undefined,
          initialOdometer: parseInt(formData.initialOdometer) || 0,
          color: formData.color,
          notes: formData.notes.trim() || undefined,
        });
      } else {
        await createMutation.mutateAsync({
          name: formData.name.trim(),
          brand: formData.brand.trim() || undefined,
          model: formData.model.trim() || undefined,
          serialNumber: formData.serialNumber.trim() || undefined,
          initialOdometer: parseInt(formData.initialOdometer) || 0,
          color: formData.color,
          notes: formData.notes.trim() || undefined,
        });
      }

      await trpcUtils.scooters.list.invalidate();
      setIsModalVisible(false);

      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (error) {
      console.error("Save scooter error:", error);
      Alert.alert("오류", "기체 저장 중 오류가 발생했습니다.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteScooter = (scooter: any) => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    Alert.alert(
      "기체 삭제",
      `"${scooter.name}"을(를) 삭제하시겠습니까?`,
      [
        { text: "취소", style: "cancel" },
        {
          text: "삭제",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteMutation.mutateAsync({ id: scooter.id });
              await trpcUtils.scooters.list.invalidate();
              if (Platform.OS !== "web") {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              }
            } catch (error) {
              console.error("Delete scooter error:", error);
              Alert.alert("오류", "기체 삭제 중 오류가 발생했습니다.");
            }
          },
        },
      ]
    );
  };

  const handleSetDefault = async (scooter: any) => {
    if (scooter.isDefault) return;

    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    try {
      await setDefaultMutation.mutateAsync({ id: scooter.id });
      await trpcUtils.scooters.list.invalidate();
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (error) {
      console.error("Set default error:", error);
      Alert.alert("오류", "기본 기체 설정 중 오류가 발생했습니다.");
    }
  };

  const formatDistance = (meters: number) => {
    if (meters >= 1000) {
      return `${(meters / 1000).toFixed(1)} km`;
    }
    return `${meters} m`;
  };

  if (authLoading) {
    return (
      <ScreenContainer>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </ScreenContainer>
    );
  }

  if (!isAuthenticated) {
    return (
      <ScreenContainer>
        <View className="flex-1 items-center justify-center p-6">
          <MaterialIcons name="lock" size={64} color={colors.muted} />
          <Text className="text-xl font-bold text-foreground mt-4">로그인이 필요합니다</Text>
          <Text className="text-muted text-center mt-2">
            기체 관리 기능을 사용하려면 로그인해주세요.
          </Text>
          <Pressable
            onPress={() => router.push("/login")}
            style={({ pressed }) => [
              { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 },
            ]}
            className="mt-6 px-8 py-3 rounded-xl"
          >
            <Text className="text-white font-bold">로그인</Text>
          </Pressable>
        </View>
      </ScreenContainer>
    );
  }

  const scooters = scootersQuery.data || [];

  return (
    <ScreenContainer>
      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 100 }}
      >
        {/* Header */}
        <View className="flex-row items-center justify-between px-5 pt-4 pb-4">
          <View className="flex-row items-center">
            <Pressable
              onPress={() => router.back()}
              style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
              className="mr-3 p-1"
            >
              <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
            </Pressable>
            <Text className="text-2xl font-bold text-foreground">내 기체</Text>
          </View>
          <Pressable
            onPress={handleAddScooter}
            style={({ pressed }) => [
              { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 },
            ]}
            className="flex-row items-center px-4 py-2 rounded-xl"
          >
            <MaterialIcons name="add" size={20} color="#FFFFFF" />
            <Text className="text-white font-bold ml-1">추가</Text>
          </Pressable>
        </View>

        {/* Scooter List */}
        {scootersQuery.isLoading ? (
          <View className="items-center py-12">
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : scooters.length === 0 ? (
          <View className="items-center py-12 px-6">
            <MaterialIcons name="electric-scooter" size={80} color={colors.muted} />
            <Text className="text-xl font-bold text-foreground mt-4">등록된 기체가 없습니다</Text>
            <Text className="text-muted text-center mt-2">
              전동킥보드를 등록하고 주행 기록을 관리해보세요.
            </Text>
          </View>
        ) : (
          <View className="px-5">
            {scooters.map((scooter: any) => (
              <Pressable
                key={scooter.id}
                onPress={() => router.push(`/scooter-stats?id=${scooter.id}`)}
                onLongPress={() => handleEditScooter(scooter)}
                style={({ pressed }) => [{ opacity: pressed ? 0.9 : 1 }]}
                className="bg-surface rounded-2xl p-4 mb-3 border border-border"
              >
                <View className="flex-row items-start">
                  {/* Color indicator */}
                  <View
                    className="w-12 h-12 rounded-xl items-center justify-center mr-4"
                    style={{ backgroundColor: scooter.color || colors.primary }}
                  >
                    <MaterialIcons name="electric-scooter" size={24} color="#FFFFFF" />
                  </View>

                  {/* Info */}
                  <View className="flex-1">
                    <View className="flex-row items-center">
                      <Text className="text-lg font-bold text-foreground">{scooter.name}</Text>
                      {scooter.isDefault && (
                        <View
                          className="ml-2 px-2 py-0.5 rounded-full"
                          style={{ backgroundColor: colors.primary }}
                        >
                          <Text className="text-white text-xs font-bold">기본</Text>
                        </View>
                      )}
                    </View>
                    {(scooter.brand || scooter.model) && (
                      <Text className="text-muted text-sm mt-0.5">
                        {[scooter.brand, scooter.model].filter(Boolean).join(" ")}
                      </Text>
                    )}
                    <View className="flex-row mt-2">
                      <View className="flex-row items-center mr-4">
                        <MaterialIcons name="straighten" size={14} color={colors.muted} />
                        <Text className="text-muted text-xs ml-1">
                          {formatDistance((scooter.initialOdometer || 0) + (scooter.totalDistance || 0))}
                        </Text>
                      </View>
                      <View className="flex-row items-center">
                        <MaterialIcons name="electric-scooter" size={14} color={colors.muted} />
                        <Text className="text-muted text-xs ml-1">{scooter.totalRides || 0}회</Text>
                      </View>
                    </View>
                  </View>

                  {/* Actions */}
                  <Pressable
                    onPress={() => handleDeleteScooter(scooter)}
                    style={({ pressed }) => [{ opacity: pressed ? 0.5 : 1 }]}
                    className="p-2"
                  >
                    <MaterialIcons name="delete-outline" size={22} color={colors.error} />
                  </Pressable>
                </View>
              </Pressable>
            ))}

            <Text className="text-muted text-xs text-center mt-2 mb-4">
              탭하여 통계 보기 • 길게 눌러서 수정
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Add/Edit Modal */}
      <Modal
        visible={isModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setIsModalVisible(false)}
      >
        <View className="flex-1 bg-background">
          {/* Modal Header */}
          <View className="flex-row items-center justify-between px-5 py-4 border-b border-border">
            <Pressable
              onPress={() => setIsModalVisible(false)}
              style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
            >
              <Text style={{ color: colors.primary }} className="text-base">취소</Text>
            </Pressable>
            <Text className="text-lg font-bold text-foreground">
              {editingId ? "기체 수정" : "기체 추가"}
            </Text>
            <Pressable
              onPress={handleSaveScooter}
              disabled={isSaving}
              style={({ pressed }) => [{ opacity: pressed || isSaving ? 0.5 : 1 }]}
            >
              {isSaving ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Text style={{ color: colors.primary }} className="text-base font-bold">저장</Text>
              )}
            </Pressable>
          </View>

          <ScrollView className="flex-1 px-5 py-4">
            {/* Name */}
            <View className="mb-4">
              <Text className="text-sm font-medium text-foreground mb-2">기체 이름 *</Text>
              <TextInput
                value={formData.name}
                onChangeText={(text) => setFormData({ ...formData, name: text })}
                placeholder="예: 내 킥보드"
                placeholderTextColor={colors.muted}
                className="bg-surface border border-border rounded-xl px-4 py-3 text-foreground"
                style={{ fontSize: 16 }}
              />
            </View>

            {/* Brand */}
            <View className="mb-4">
              <Text className="text-sm font-medium text-foreground mb-2">제조사</Text>
              <TextInput
                value={formData.brand}
                onChangeText={(text) => setFormData({ ...formData, brand: text })}
                placeholder="예: Segway, Xiaomi, Ninebot"
                placeholderTextColor={colors.muted}
                className="bg-surface border border-border rounded-xl px-4 py-3 text-foreground"
                style={{ fontSize: 16 }}
              />
            </View>

            {/* Model */}
            <View className="mb-4">
              <Text className="text-sm font-medium text-foreground mb-2">모델명</Text>
              <TextInput
                value={formData.model}
                onChangeText={(text) => setFormData({ ...formData, model: text })}
                placeholder="예: Ninebot Max G30"
                placeholderTextColor={colors.muted}
                className="bg-surface border border-border rounded-xl px-4 py-3 text-foreground"
                style={{ fontSize: 16 }}
              />
            </View>

            {/* Serial Number */}
            <View className="mb-4">
              <Text className="text-sm font-medium text-foreground mb-2">시리얼 번호</Text>
              <TextInput
                value={formData.serialNumber}
                onChangeText={(text) => setFormData({ ...formData, serialNumber: text })}
                placeholder="선택 사항"
                placeholderTextColor={colors.muted}
                className="bg-surface border border-border rounded-xl px-4 py-3 text-foreground"
                style={{ fontSize: 16 }}
              />
            </View>

            {/* Initial Odometer */}
            <View className="mb-4">
              <Text className="text-sm font-medium text-foreground mb-2">초기 주행거리 (km)</Text>
              <TextInput
                value={formData.initialOdometer}
                onChangeText={(text) => {
                  const numericText = text.replace(/[^0-9]/g, "");
                  setFormData({ ...formData, initialOdometer: numericText });
                }}
                placeholder="0"
                placeholderTextColor={colors.muted}
                keyboardType="numeric"
                className="bg-surface border border-border rounded-xl px-4 py-3 text-foreground"
                style={{ fontSize: 16 }}
              />
              <Text className="text-muted text-xs mt-1">
                기존 주행거리가 있다면 입력해주세요 (미터 단위로 저장됨)
              </Text>
            </View>

            {/* Color */}
            <View className="mb-4">
              <Text className="text-sm font-medium text-foreground mb-2">색상</Text>
              <View className="flex-row flex-wrap">
                {SCOOTER_COLORS.map((color) => (
                  <Pressable
                    key={color}
                    onPress={() => setFormData({ ...formData, color })}
                    style={({ pressed }) => [
                      {
                        backgroundColor: color,
                        opacity: pressed ? 0.8 : 1,
                        borderWidth: formData.color === color ? 3 : 0,
                        borderColor: colors.foreground,
                      },
                    ]}
                    className="w-10 h-10 rounded-full mr-3 mb-3"
                  />
                ))}
              </View>
            </View>

            {/* Notes */}
            <View className="mb-6">
              <Text className="text-sm font-medium text-foreground mb-2">메모</Text>
              <TextInput
                value={formData.notes}
                onChangeText={(text) => setFormData({ ...formData, notes: text })}
                placeholder="선택 사항"
                placeholderTextColor={colors.muted}
                multiline
                numberOfLines={3}
                className="bg-surface border border-border rounded-xl px-4 py-3 text-foreground"
                style={{ fontSize: 16, minHeight: 80, textAlignVertical: "top" }}
              />
            </View>
          </ScrollView>
        </View>
      </Modal>
    </ScreenContainer>
  );
}
