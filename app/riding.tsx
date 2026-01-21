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

// Speed filtering constants - relaxed for better recording
const MIN_ACCURACY_FOR_SPEED = 50; // Increased from 15m to 50m - more lenient
const MIN_SPEED_THRESHOLD = 0.5; // Lowered from 1.5 to 0.5 km/h - detect slower movement
const SPEED_SMOOTHING_SAMPLES = 3; // Number of samples for moving average
const MAX_SPEED_JUMP = 50; // Increased from 30 to 50 km/h - allow faster acceleration

export default function RidingScreen() {
  const router = useRouter();
  const colors = useColors();

  const [isRunning, setIsRunning] = useState(true); // Start as true immediately
  const [duration, setDuration] = useState(0);
  const [distance, setDistance] = useState(0);
  const [currentSpeed, setCurrentSpeed] = useState(0);
  const [maxSpeed, setMaxSpeed] = useState(0);
  const [avgSpeed, setAvgSpeed] = useState(0);
  const [gpsStatus, setGpsStatus] = useState<"waiting" | "active" | "error">("waiting");
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [gpsPointCount, setGpsPointCount] = useState(0);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const locationSubscriptionRef = useRef<Location.LocationSubscription | null>(null);
  const startTimeRef = useRef<Date>(new Date());
  const gpsPointsRef = useRef<GpsPoint[]>([]);
  const lastLocationRef = useRef<Location.LocationObject | null>(null);
  const isRunningRef = useRef(true); // Use ref to avoid stale closure
  
  // Speed filtering refs
  const speedHistoryRef = useRef<number[]>([]);
  const lastValidSpeedRef = useRef<number>(0);

  // Keep isRunningRef in sync with isRunning state
  useEffect(() => {
    isRunningRef.current = isRunning;
  }, [isRunning]);

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
    startTimeRef.current = new Date();
    initializeGps();

    return () => {
      stopLocationTracking();
    };
  }, []);

  // Timer for duration - start immediately
  useEffect(() => {
    intervalRef.current = setInterval(() => {
      if (isRunningRef.current) {
        setDuration((prev) => prev + 1);
      }
    }, 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
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
          distanceInterval: 0, // Update regardless of distance (was 1m)
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
  const filterSpeed = (rawSpeedKmh: number, locAccuracy: number | null): number => {
    // If GPS accuracy is very poor (> 50m), use last valid speed
    if (locAccuracy !== null && locAccuracy > MIN_ACCURACY_FOR_SPEED) {
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
    // Use ref instead of state to avoid stale closure
    if (!isRunningRef.current) return;

    const { latitude, longitude, altitude, speed, accuracy: locAccuracy } = location.coords;
    const timestamp = location.timestamp;

    // Update accuracy indicator
    setAccuracy(locAccuracy);

    // Convert raw speed to km/h and apply filtering
    const rawSpeedKmh = speed !== null && speed >= 0 ? msToKmh(speed) : 0;
    const filteredSpeedKmh = filterSpeed(rawSpeedKmh, locAccuracy);

    // Create GPS point - store raw data for accurate GPX export
    const gpsPoint: GpsPoint = {
      latitude,
      longitude,
      altitude: altitude ?? null,
      timestamp,
      speed: speed ?? null, // Store raw speed in m/s
      accuracy: locAccuracy ?? null,
    };

    // Add point with more lenient accuracy check (< 100m instead of 30m)
    if (locAccuracy === null || locAccuracy < 100) {
      gpsPointsRef.current.push(gpsPoint);
      setGpsPointCount(gpsPointsRef.current.length);
    }

    // Update current speed display
    setCurrentSpeed(filteredSpeedKmh);
    
    // Update max speed if we're moving
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
      
      // More lenient distance calculation:
      // 1. GPS accuracy < 50m (was 20m)
      // 2. Distance < 200m per update (was 100m)
      // 3. Either moving OR distance > 2m (to catch slow movement)
      if ((locAccuracy === null || locAccuracy < 50) && 
          dist < 200 && 
          (filteredSpeedKmh > MIN_SPEED_THRESHOLD || dist > 2)) {
        setDistance((prev) => prev + dist);
      }
    }

    lastLocationRef.current = location;

    // Update average speed (from all points with valid speed)
    const validPoints = gpsPointsRef.current.filter(
      (p) => p.speed !== null && p.speed > 0
    );
    if (validPoints.length > 0) {
      const avgSpd = validPoints.reduce((sum, p) => sum + msToKmh(p.speed!), 0) / validPoints.length;
      setAvgSpeed(avgSpd);
    }
  };

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

            // Calculate final stats from GPS data
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
        if (accuracy === null) return "#4CAF50";
        if (accuracy < 10) return "#4CAF50"; // Excellent
        if (accuracy < 30) return "#8BC34A"; // Good
        if (accuracy < 50) return "#FFC107"; // Fair
        return "#FF9800"; // Poor but usable
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
            GPS 포인트: {gpsPointCount}개 기록됨
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
