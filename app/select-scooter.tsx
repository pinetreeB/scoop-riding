import { useCallback, useState } from "react";
import {
  Text,
  View,
  ScrollView,
  Pressable,
  Platform,
  ActivityIndicator,
} from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Haptics from "expo-haptics";
import { useRouter, useFocusEffect } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useAuth } from "@/hooks/use-auth";
import { trpc } from "@/lib/trpc";

const SELECTED_SCOOTER_KEY = "@scoop_selected_scooter";

export interface SelectedScooter {
  id: number;
  name: string;
  color: string;
}

// Helper functions for scooter selection
export async function getSelectedScooter(): Promise<SelectedScooter | null> {
  try {
    const data = await AsyncStorage.getItem(SELECTED_SCOOTER_KEY);
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
}

export async function setSelectedScooter(scooter: SelectedScooter | null): Promise<void> {
  try {
    if (scooter) {
      await AsyncStorage.setItem(SELECTED_SCOOTER_KEY, JSON.stringify(scooter));
    } else {
      await AsyncStorage.removeItem(SELECTED_SCOOTER_KEY);
    }
  } catch (e) {
    console.error("Failed to save selected scooter:", e);
  }
}

export default function SelectScooterScreen() {
  const colors = useColors();
  const router = useRouter();
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const scootersQuery = trpc.scooters.list.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  useFocusEffect(
    useCallback(() => {
      // Load previously selected scooter
      getSelectedScooter().then((scooter) => {
        if (scooter) {
          setSelectedId(scooter.id);
        }
      });

      if (isAuthenticated) {
        scootersQuery.refetch();
      }
    }, [isAuthenticated])
  );

  const handleSelectScooter = async (scooter: any) => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    setSelectedId(scooter.id);
    await setSelectedScooter({
      id: scooter.id,
      name: scooter.name,
      color: scooter.color || "#FF6D00",
    });
  };

  const handleStartRiding = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    router.push("/riding");
  };

  const handleSkip = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setSelectedScooter(null);
    router.push("/riding");
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

  // If not authenticated, go directly to riding
  if (!isAuthenticated) {
    return (
      <ScreenContainer>
        <View className="flex-1 items-center justify-center p-6">
          <MaterialIcons name="electric-scooter" size={80} color={colors.muted} />
          <Text className="text-xl font-bold text-foreground mt-4">기체 선택</Text>
          <Text className="text-muted text-center mt-2 mb-6">
            로그인하면 등록된 기체를 선택하여 주행 기록을 관리할 수 있습니다.
          </Text>
          <Pressable
            onPress={handleSkip}
            style={({ pressed }) => [
              { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 },
            ]}
            className="px-8 py-4 rounded-xl"
          >
            <Text className="text-white font-bold text-lg">기체 선택 없이 시작</Text>
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
        contentContainerStyle={{ paddingBottom: 120 }}
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
          <Text className="text-2xl font-bold text-foreground">기체 선택</Text>
        </View>

        {/* Description */}
        <View className="px-5 mb-4">
          <Text className="text-muted">
            주행에 사용할 기체를 선택하세요. 선택한 기체에 주행 기록이 연결됩니다.
          </Text>
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
              프로필 → 내 기체에서 기체를 등록해보세요.
            </Text>
            <Pressable
              onPress={() => router.push("/scooters")}
              style={({ pressed }) => [
                { backgroundColor: colors.surface, opacity: pressed ? 0.8 : 1 },
              ]}
              className="mt-4 px-6 py-3 rounded-xl border border-border"
            >
              <Text className="text-foreground font-medium">기체 등록하기</Text>
            </Pressable>
          </View>
        ) : (
          <View className="px-5">
            {scooters.map((scooter: any) => {
              const isSelected = selectedId === scooter.id;
              return (
                <Pressable
                  key={scooter.id}
                  onPress={() => handleSelectScooter(scooter)}
                  style={({ pressed }) => [{ opacity: pressed ? 0.9 : 1 }]}
                  className={`rounded-2xl p-4 mb-3 border-2 ${
                    isSelected ? "border-primary bg-primary/5" : "border-border bg-surface"
                  }`}
                >
                  <View className="flex-row items-center">
                    {/* Color indicator */}
                    <View
                      className="w-14 h-14 rounded-xl items-center justify-center mr-4"
                      style={{ backgroundColor: scooter.color || colors.primary }}
                    >
                      <MaterialIcons name="electric-scooter" size={28} color="#FFFFFF" />
                    </View>

                    {/* Info */}
                    <View className="flex-1">
                      <View className="flex-row items-center">
                        <Text className="text-lg font-bold text-foreground">{scooter.name}</Text>
                        {scooter.isDefault && (
                          <View
                            className="ml-2 px-2 py-0.5 rounded-full"
                            style={{ backgroundColor: colors.primary + "20" }}
                          >
                            <Text className="text-primary text-xs font-medium">기본</Text>
                          </View>
                        )}
                      </View>
                      {(scooter.brand || scooter.model) && (
                        <Text className="text-muted text-sm mt-0.5">
                          {[scooter.brand, scooter.model].filter(Boolean).join(" ")}
                        </Text>
                      )}
                      <Text className="text-muted text-xs mt-1">
                        총 {((scooter.totalDistance || 0) / 1000).toFixed(1)}km • {scooter.totalRides || 0}회 주행
                      </Text>
                    </View>

                    {/* Selection indicator */}
                    <View
                      className={`w-6 h-6 rounded-full items-center justify-center ${
                        isSelected ? "bg-primary" : "border-2 border-border"
                      }`}
                    >
                      {isSelected && (
                        <MaterialIcons name="check" size={16} color="#FFFFFF" />
                      )}
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* Bottom Action Buttons */}
      <View className="absolute bottom-0 left-0 right-0 px-5 pb-8 pt-4 bg-background border-t border-border">
        <View className="flex-row">
          <Pressable
            onPress={handleSkip}
            style={({ pressed }) => [
              { opacity: pressed ? 0.8 : 1 },
            ]}
            className="flex-1 mr-2 py-4 rounded-xl bg-surface border border-border items-center"
          >
            <Text className="text-foreground font-medium">선택 안함</Text>
          </Pressable>
          <Pressable
            onPress={handleStartRiding}
            style={({ pressed }) => [
              { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 },
            ]}
            className="flex-1 ml-2 py-4 rounded-xl items-center"
          >
            <Text className="text-white font-bold">주행 시작</Text>
          </Pressable>
        </View>
      </View>
    </ScreenContainer>
  );
}
