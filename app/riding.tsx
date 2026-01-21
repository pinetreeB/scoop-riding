import { useEffect, useState, useRef, useCallback } from "react";
import { Text, View, Pressable, Alert, BackHandler, Platform } from "react-native";
import { useRouter } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Haptics from "expo-haptics";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";

import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import {
  saveRidingRecord,
  formatDuration,
  generateId,
} from "@/lib/riding-store";

export default function RidingScreen() {
  const router = useRouter();
  const colors = useColors();

  const [isRunning, setIsRunning] = useState(true);
  const [duration, setDuration] = useState(0);
  const [distance, setDistance] = useState(0);
  const [currentSpeed, setCurrentSpeed] = useState(0);
  const [maxSpeed, setMaxSpeed] = useState(0);
  const [avgSpeed, setAvgSpeed] = useState(0);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<Date>(new Date());
  const speedHistoryRef = useRef<number[]>([]);

  // Keep screen awake on native platforms
  useEffect(() => {
    if (Platform.OS !== "web") {
      activateKeepAwakeAsync();
      return () => {
        deactivateKeepAwake();
      };
    }
  }, []);

  // Simulate speed changes for demo (in real app, use GPS)
  const simulateSpeed = useCallback(() => {
    const baseSpeed = 15 + Math.random() * 10;
    const variation = (Math.random() - 0.5) * 5;
    return Math.max(0, baseSpeed + variation);
  }, []);

  useEffect(() => {
    if (isRunning) {
      intervalRef.current = setInterval(() => {
        setDuration((prev) => prev + 1);

        // Simulate speed and distance
        const speed = simulateSpeed();
        setCurrentSpeed(speed);
        speedHistoryRef.current.push(speed);

        setMaxSpeed((prev) => Math.max(prev, speed));

        // Calculate average speed
        const avg =
          speedHistoryRef.current.reduce((a, b) => a + b, 0) /
          speedHistoryRef.current.length;
        setAvgSpeed(avg);

        // Calculate distance (speed in km/h, time in seconds)
        setDistance((prev) => prev + (speed * 1000) / 3600);
      }, 1000);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isRunning, simulateSpeed]);

  // Handle back button
  useEffect(() => {
    const backHandler = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        handleStop();
        return true;
      }
    );

    return () => backHandler.remove();
  }, [duration, distance, avgSpeed, maxSpeed]);

  const handlePauseResume = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setIsRunning((prev) => !prev);
  };

  const handleStop = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }

    if (duration < 5) {
      router.back();
      return;
    }

    Alert.alert(
      "주행 종료",
      "주행을 종료하고 기록을 저장하시겠습니까?",
      [
        {
          text: "취소",
          style: "cancel",
        },
        {
          text: "저장",
          onPress: async () => {
            const record = {
              id: generateId(),
              date: new Date().toLocaleDateString("ko-KR"),
              duration,
              distance,
              avgSpeed,
              maxSpeed,
              startTime: startTimeRef.current.toISOString(),
              endTime: new Date().toISOString(),
            };
            await saveRidingRecord(record);
            router.back();
          },
        },
      ]
    );
  };

  return (
    <ScreenContainer
      containerClassName="bg-[#1A1A1A]"
      edges={["top", "bottom", "left", "right"]}
    >
      <View className="flex-1 p-4">
        {/* Header */}
        <View className="flex-row justify-between items-center mb-8">
          <Pressable
            onPress={handleStop}
            style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
            className="p-2"
          >
            <MaterialIcons name="close" size={28} color="#FFFFFF" />
          </Pressable>
          <Text className="text-white text-lg font-semibold">주행 중</Text>
          <View className="w-10" />
        </View>

        {/* Speed Display */}
        <View className="items-center mb-8">
          <Text className="text-7xl font-bold text-white">
            {currentSpeed.toFixed(1)}
          </Text>
          <Text className="text-lg text-gray-400 mt-1">km/h</Text>
        </View>

        {/* Time Display */}
        <View className="items-center mb-8">
          <Text className="text-4xl font-bold text-white">
            {formatDuration(duration)}
          </Text>
          <Text className="text-sm text-gray-400 mt-1">주행 시간</Text>
        </View>

        {/* Stats Row */}
        <View className="flex-row justify-around mb-8 bg-[#2A2A2A] rounded-2xl p-4">
          <View className="items-center">
            <Text className="text-2xl font-bold text-white">
              {(distance / 1000).toFixed(2)}
            </Text>
            <Text className="text-xs text-gray-400 mt-1">거리 (km)</Text>
          </View>
          <View className="w-px bg-gray-600" />
          <View className="items-center">
            <Text className="text-2xl font-bold text-white">
              {avgSpeed.toFixed(1)}
            </Text>
            <Text className="text-xs text-gray-400 mt-1">평균 (km/h)</Text>
          </View>
          <View className="w-px bg-gray-600" />
          <View className="items-center">
            <Text className="text-2xl font-bold text-white">
              {maxSpeed.toFixed(1)}
            </Text>
            <Text className="text-xs text-gray-400 mt-1">최고 (km/h)</Text>
          </View>
        </View>

        {/* Control Buttons */}
        <View className="flex-row justify-center items-center mt-auto mb-8">
          {/* Stop Button */}
          <Pressable
            onPress={handleStop}
            style={({ pressed }) => [
              {
                backgroundColor: "#333333",
                transform: [{ scale: pressed ? 0.95 : 1 }],
              },
            ]}
            className="w-16 h-16 rounded-full items-center justify-center mr-8"
          >
            <MaterialIcons name="stop" size={28} color="#FFFFFF" />
          </Pressable>

          {/* Pause/Resume Button */}
          <Pressable
            onPress={handlePauseResume}
            style={({ pressed }) => [
              {
                backgroundColor: colors.primary,
                transform: [{ scale: pressed ? 0.95 : 1 }],
                opacity: pressed ? 0.9 : 1,
              },
            ]}
            className="w-20 h-20 rounded-full items-center justify-center"
          >
            <MaterialIcons
              name={isRunning ? "pause" : "play-arrow"}
              size={40}
              color="#FFFFFF"
            />
          </Pressable>

          {/* Placeholder for symmetry */}
          <View className="w-16 h-16 ml-8" />
        </View>
      </View>
    </ScreenContainer>
  );
}
