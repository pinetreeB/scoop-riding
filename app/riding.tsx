import { useEffect, useState, useRef, useCallback } from "react";
import { Text, View, Pressable, Alert, BackHandler, Platform } from "react-native";
import { useRouter } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";

import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import {
  saveRidingRecord,
  formatDuration,
  generateId,
} from "@/lib/riding-store";
import {
  GpsPoint,
  requestLocationPermission,
  isLocationEnabled,
  calculateDistance,
  msToKmh,
  calculateTotalDistance,
  calculateAverageSpeed,
  getMaxSpeed,
} from "@/lib/gps-utils";

// Speed filtering constants
const MIN_ACCURACY_FOR_SPEED = 15; // Minimum GPS accuracy (meters) to trust speed reading
const MIN_SPEED_THRESHOLD = 1.5; // Minimum speed in km/h to consider as moving (below this = stationary)
const SPEED_SMOOTHING_SAMPLES = 3; // Number of samples for moving average
const MAX_SPEED_JUMP = 30; // Maximum speed change in km/h between readings (filter spikes)

export default function RidingScreen() {
  const router = useRouter();
  const colors = useColors();

  const [isRunning, setIsRunning] = useState(false);
  const [duration, setDuration] = useState(0);
  const [distance, setDistance] = useState(0);
  const [currentSpeed, setCurrentSpeed] = useState(0);
  const [maxSpeed, setMaxSpeed] = useState(0);
  const [avgSpeed, setAvgSpeed] = useState(0);
  const [gpsStatus, setGpsStatus] = useState<"waiting" | "active" | "error">("waiting");
  const [accuracy, setAccuracy] = useState<number | null>(null);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const locationSubscriptionRef = useRef<Location.LocationSubscription | null>(null);
  const startTimeRef = useRef<Date>(new Date());
  const gpsPointsRef = useRef<GpsPoint[]>([]);
  const lastLocationRef = useRef<Location.LocationObject | null>(null);
  
  // Speed filtering refs
  const speedHistoryRef = useRef<number[]>([]);
  const lastValidSpeedRef = useRef<number>(0);

  // Keep screen awake on native platforms
  useEffect(() => {
    if (Platform.OS !== "web") {
      activateKeepAwakeAsync();
      return () => {
        deactivateKeepAwake();
      };
    }
  }, []);

  // Initialize GPS
  useEffect(() => {
    initializeGps();

    return () => {
      stopLocationTracking();
    };
  }, []);

  const initializeGps = async () => {
    try {
      // Check if location services are enabled
      const locationEnabled = await isLocationEnabled();
      if (!locationEnabled) {
        setGpsStatus("error");
        Alert.alert(
          "위치 서비스 비활성화",
          "GPS를 사용하려면 기기의 위치 서비스를 활성화해주세요.",
          [{ text: "확인", onPress: () => router.back() }]
        );
        return;
      }

      // Request permission
      const hasPermission = await requestLocationPermission();
      if (!hasPermission) {
        setGpsStatus("error");
        Alert.alert(
          "위치 권한 필요",
          "주행 기록을 위해 위치 권한이 필요합니다.",
          [{ text: "확인", onPress: () => router.back() }]
        );
        return;
      }

      // Start location tracking
      await startLocationTracking();
      setGpsStatus("active");
      setIsRunning(true);
      startTimeRef.current = new Date();
    } catch (error) {
      console.error("GPS initialization error:", error);
      setGpsStatus("error");
      Alert.alert("GPS 오류", "GPS를 초기화하는 중 오류가 발생했습니다.");
    }
  };

  const startLocationTracking = async () => {
    try {
      locationSubscriptionRef.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation,
          timeInterval: 1000, // Update every 1 second
          distanceInterval: 1, // Update every 1 meter
        },
        (location) => {
          handleLocationUpdate(location);
        }
      );
    } catch (error) {
      console.error("Error starting location tracking:", error);
      setGpsStatus("error");
    }
  };

  const stopLocationTracking = () => {
    if (locationSubscriptionRef.current) {
      locationSubscriptionRef.current.remove();
      locationSubscriptionRef.current = null;
    }
  };

  /**
   * Filter and smooth GPS speed to remove noise and spikes
   */
  const filterSpeed = (rawSpeedKmh: number, accuracy: number | null): number => {
    // If GPS accuracy is poor, don't trust the speed reading
    if (accuracy !== null && accuracy > MIN_ACCURACY_FOR_SPEED) {
      return lastValidSpeedRef.current;
    }

    // If speed is below threshold, consider as stationary
    if (rawSpeedKmh < MIN_SPEED_THRESHOLD) {
      speedHistoryRef.current = []; // Reset history when stationary
      lastValidSpeedRef.current = 0;
      return 0;
    }

    // Filter out unrealistic speed jumps
    const lastSpeed = lastValidSpeedRef.current;
    if (lastSpeed > 0 && Math.abs(rawSpeedKmh - lastSpeed) > MAX_SPEED_JUMP) {
      // Speed jump too large, likely GPS error - use smoothed value
      return lastValidSpeedRef.current;
    }

    // Add to history for smoothing
    speedHistoryRef.current.push(rawSpeedKmh);
    
    // Keep only recent samples
    if (speedHistoryRef.current.length > SPEED_SMOOTHING_SAMPLES) {
      speedHistoryRef.current.shift();
    }

    // Calculate moving average
    const smoothedSpeed = speedHistoryRef.current.reduce((a, b) => a + b, 0) / 
                          speedHistoryRef.current.length;

    lastValidSpeedRef.current = smoothedSpeed;
    return smoothedSpeed;
  };

  const handleLocationUpdate = (location: Location.LocationObject) => {
    if (!isRunning) return;

    const { latitude, longitude, altitude, speed, accuracy: locAccuracy } = location.coords;
    const timestamp = location.timestamp;

    // Update accuracy indicator
    setAccuracy(locAccuracy);

    // Convert raw speed to km/h and apply filtering
    const rawSpeedKmh = speed !== null && speed >= 0 ? msToKmh(speed) : 0;
    const filteredSpeedKmh = filterSpeed(rawSpeedKmh, locAccuracy);

    // Create GPS point with filtered speed for storage
    const gpsPoint: GpsPoint = {
      latitude,
      longitude,
      altitude: altitude ?? null,
      timestamp,
      speed: filteredSpeedKmh > 0 ? filteredSpeedKmh / 3.6 : 0, // Store as m/s
      accuracy: locAccuracy ?? null,
    };

    // Only add point if accuracy is reasonable
    if (locAccuracy === null || locAccuracy < 30) {
      gpsPointsRef.current.push(gpsPoint);
    }

    // Update current speed display
    setCurrentSpeed(filteredSpeedKmh);
    
    // Only update max speed if we're actually moving
    if (filteredSpeedKmh > MIN_SPEED_THRESHOLD) {
      setMaxSpeed((prev) => Math.max(prev, filteredSpeedKmh));
    }

    // Calculate distance from last point
    if (lastLocationRef.current) {
      const lastCoords = lastLocationRef.current.coords;
      const dist = calculateDistance(
        lastCoords.latitude,
        lastCoords.longitude,
        latitude,
        longitude
      );
      
      // Only add distance if:
      // 1. GPS accuracy is reasonable (< 20m)
      // 2. Distance is reasonable (< 100m per second)
      // 3. We're actually moving (filtered speed > threshold)
      if ((locAccuracy === null || locAccuracy < 20) && 
          dist < 100 && 
          filteredSpeedKmh > MIN_SPEED_THRESHOLD) {
        setDistance((prev) => prev + dist);
      }
    }

    lastLocationRef.current = location;

    // Update average speed (only from valid points)
    const validPoints = gpsPointsRef.current.filter(
      (p) => p.speed !== null && msToKmh(p.speed) > MIN_SPEED_THRESHOLD
    );
    if (validPoints.length > 0) {
      const avgSpd = validPoints.reduce((sum, p) => sum + msToKmh(p.speed!), 0) / validPoints.length;
      setAvgSpeed(avgSpd);
    }
  };

  // Timer for duration
  useEffect(() => {
    if (isRunning) {
      intervalRef.current = setInterval(() => {
        setDuration((prev) => prev + 1);
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
  }, [isRunning]);

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
      stopLocationTracking();
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
            stopLocationTracking();

            // Calculate final stats from GPS data (using filtered points)
            const finalDistance = calculateTotalDistance(gpsPointsRef.current);
            const finalAvgSpeed = calculateAverageSpeed(gpsPointsRef.current);
            const finalMaxSpeed = getMaxSpeed(gpsPointsRef.current);

            const record = {
              id: generateId(),
              date: new Date().toLocaleDateString("ko-KR"),
              duration,
              distance: finalDistance > 0 ? finalDistance : distance,
              avgSpeed: finalAvgSpeed > 0 ? finalAvgSpeed : avgSpeed,
              maxSpeed: finalMaxSpeed > 0 ? finalMaxSpeed : maxSpeed,
              startTime: startTimeRef.current.toISOString(),
              endTime: new Date().toISOString(),
              gpsPoints: gpsPointsRef.current,
            };
            await saveRidingRecord(record);
            router.back();
          },
        },
      ]
    );
  };

  const getGpsStatusColor = () => {
    switch (gpsStatus) {
      case "active":
        return accuracy !== null && accuracy < 10 ? "#4CAF50" : "#FFC107";
      case "error":
        return "#F44336";
      default:
        return "#9E9E9E";
    }
  };

  const getGpsStatusText = () => {
    switch (gpsStatus) {
      case "active":
        return accuracy !== null ? `GPS ${accuracy.toFixed(0)}m` : "GPS 활성";
      case "error":
        return "GPS 오류";
      default:
        return "GPS 대기중";
    }
  };

  return (
    <ScreenContainer
      containerClassName="bg-[#1A1A1A]"
      edges={["top", "bottom", "left", "right"]}
    >
      <View className="flex-1 p-4">
        {/* Header */}
        <View className="flex-row justify-between items-center mb-4">
          <Pressable
            onPress={handleStop}
            style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
            className="p-2"
          >
            <MaterialIcons name="close" size={28} color="#FFFFFF" />
          </Pressable>
          <View className="flex-row items-center">
            <View
              className="w-3 h-3 rounded-full mr-2"
              style={{ backgroundColor: getGpsStatusColor() }}
            />
            <Text className="text-gray-400 text-sm">{getGpsStatusText()}</Text>
          </View>
          <View className="w-10" />
        </View>

        {/* Speed Display */}
        <View className="items-center mb-6">
          <Text className="text-8xl font-bold text-white">
            {currentSpeed.toFixed(1)}
          </Text>
          <Text className="text-xl text-gray-400 mt-1">km/h</Text>
        </View>

        {/* Time Display */}
        <View className="items-center mb-6">
          <Text className="text-5xl font-bold text-white">
            {formatDuration(duration)}
          </Text>
          <Text className="text-sm text-gray-400 mt-1">주행 시간</Text>
        </View>

        {/* Stats Row */}
        <View className="flex-row justify-around mb-6 bg-[#2A2A2A] rounded-2xl p-4">
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

        {/* GPS Points Counter */}
        <View className="items-center mb-4">
          <Text className="text-gray-500 text-xs">
            GPS 포인트: {gpsPointsRef.current.length}개 기록됨
          </Text>
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
