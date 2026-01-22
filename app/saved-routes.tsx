import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  FlatList,
  Alert,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { MaterialIcons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { GpxRoute, parseGpxContent } from "@/lib/gpx-parser";

const ROUTES_STORAGE_KEY = "@saved_gpx_routes";

export default function SavedRoutesScreen() {
  const router = useRouter();
  const colors = useColors();
  const [routes, setRoutes] = useState<GpxRoute[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadRoutes = async () => {
    try {
      const routesJson = await AsyncStorage.getItem(ROUTES_STORAGE_KEY);
      if (routesJson) {
        setRoutes(JSON.parse(routesJson));
      }
    } catch (error) {
      console.error("Failed to load routes:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadRoutes();
    }, [])
  );

  const handleImportGpx = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["application/gpx+xml", "text/xml", "application/xml", "*/*"],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        return;
      }

      const file = result.assets[0];
      
      // GPX 파일 읽기
      const content = await FileSystem.readAsStringAsync(file.uri);
      
      // GPX 파싱
      const parsedRoute = parseGpxContent(content);
      
      if (!parsedRoute || parsedRoute.points.length === 0) {
        Alert.alert("오류", "유효한 GPX 파일이 아닙니다.");
        return;
      }

      // 경로 저장
      const updatedRoutes = [...routes, parsedRoute];
      await AsyncStorage.setItem(ROUTES_STORAGE_KEY, JSON.stringify(updatedRoutes));
      setRoutes(updatedRoutes);

      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }

      Alert.alert(
        "가져오기 완료",
        `"${parsedRoute.name}" 경로가 추가되었습니다.\n${parsedRoute.points.length}개 포인트, ${(parsedRoute.totalDistance / 1000).toFixed(1)}km`
      );
    } catch (error) {
      console.error("GPX import error:", error);
      Alert.alert("오류", "GPX 파일을 가져오는데 실패했습니다.");
    }
  };

  const handleDeleteRoute = (index: number) => {
    Alert.alert(
      "경로 삭제",
      `"${routes[index].name}" 경로를 삭제하시겠습니까?`,
      [
        { text: "취소", style: "cancel" },
        {
          text: "삭제",
          style: "destructive",
          onPress: async () => {
            const updatedRoutes = routes.filter((_, i) => i !== index);
            await AsyncStorage.setItem(ROUTES_STORAGE_KEY, JSON.stringify(updatedRoutes));
            setRoutes(updatedRoutes);
            if (Platform.OS !== "web") {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            }
          },
        },
      ]
    );
  };

  const handleFollowRoute = (index: number) => {
    router.push(`/follow-route?routeId=${index}`);
  };

  const formatDistance = (meters: number): string => {
    if (meters >= 1000) {
      return `${(meters / 1000).toFixed(1)} km`;
    }
    return `${Math.round(meters)} m`;
  };

  const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `약 ${hours}시간 ${minutes}분`;
    }
    return `약 ${minutes}분`;
  };

  const renderRouteItem = ({ item, index }: { item: GpxRoute; index: number }) => (
    <View className="bg-surface rounded-xl p-4 mb-3 border border-border">
      <View className="flex-row items-start justify-between">
        <View className="flex-1">
          <Text className="text-lg font-bold text-foreground" numberOfLines={1}>
            {item.name}
          </Text>
          {item.description && (
            <Text className="text-sm text-muted mt-1" numberOfLines={2}>
              {item.description}
            </Text>
          )}
          <View className="flex-row mt-2 gap-4">
            <View className="flex-row items-center">
              <MaterialIcons name="straighten" size={16} color={colors.muted} />
              <Text className="text-sm text-muted ml-1">
                {formatDistance(item.totalDistance)}
              </Text>
            </View>
            <View className="flex-row items-center">
              <MaterialIcons name="schedule" size={16} color={colors.muted} />
              <Text className="text-sm text-muted ml-1">
                {formatDuration(item.estimatedDuration)}
              </Text>
            </View>
            <View className="flex-row items-center">
              <MaterialIcons name="place" size={16} color={colors.muted} />
              <Text className="text-sm text-muted ml-1">
                {item.points.length}개 포인트
              </Text>
            </View>
          </View>
        </View>
        <Pressable
          onPress={() => handleDeleteRoute(index)}
          style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
          className="p-2"
        >
          <MaterialIcons name="delete-outline" size={22} color={colors.error} />
        </Pressable>
      </View>

      <Pressable
        onPress={() => handleFollowRoute(index)}
        style={({ pressed }) => [
          { opacity: pressed ? 0.8 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] },
        ]}
        className="bg-primary mt-3 py-3 rounded-lg flex-row items-center justify-center"
      >
        <MaterialIcons name="navigation" size={20} color="#FFFFFF" />
        <Text className="text-white font-semibold ml-2">경로 따라가기</Text>
      </Pressable>
    </View>
  );

  return (
    <ScreenContainer className="flex-1">
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-border">
        <View className="flex-row items-center">
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
          >
            <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
          </Pressable>
          <Text className="text-xl font-bold text-foreground ml-4">저장된 경로</Text>
        </View>
        <Pressable
          onPress={handleImportGpx}
          style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
          className="bg-primary px-4 py-2 rounded-lg flex-row items-center"
        >
          <MaterialIcons name="add" size={20} color="#FFFFFF" />
          <Text className="text-white font-medium ml-1">GPX 가져오기</Text>
        </Pressable>
      </View>

      {/* Content */}
      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <Text className="text-muted">로딩 중...</Text>
        </View>
      ) : routes.length === 0 ? (
        <View className="flex-1 items-center justify-center px-8">
          <MaterialIcons name="map" size={64} color={colors.muted} />
          <Text className="text-lg font-semibold text-foreground mt-4 text-center">
            저장된 경로가 없습니다
          </Text>
          <Text className="text-muted text-center mt-2">
            GPX 파일을 가져와서 경로를 따라 주행해보세요
          </Text>
          <Pressable
            onPress={handleImportGpx}
            style={({ pressed }) => [
              { opacity: pressed ? 0.8 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] },
            ]}
            className="bg-primary mt-6 px-6 py-3 rounded-lg flex-row items-center"
          >
            <MaterialIcons name="file-upload" size={20} color="#FFFFFF" />
            <Text className="text-white font-semibold ml-2">GPX 파일 가져오기</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={routes}
          renderItem={renderRouteItem}
          keyExtractor={(_, index) => String(index)}
          contentContainerStyle={{ padding: 16 }}
          showsVerticalScrollIndicator={false}
        />
      )}
    </ScreenContainer>
  );
}
