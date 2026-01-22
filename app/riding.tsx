import { useEffect, useState, useRef } from "react";
import { Text, View, Pressable, Alert, BackHandler, Platform, Dimensions } from "react-native";
import { useRouter } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";

import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { RideMap } from "@/components/ride-map";
import { trpc } from "@/lib/trpc";
import {
  saveRidingRecord,
  formatDuration,
  generateId,
} from "@/lib/riding-store";
import { notifyRideCompleted } from "@/lib/notifications";
import {
  GpsPoint,
  GPS_CONSTANTS,
  requestLocationPermission,
  isLocationEnabled,
  calculateDistance,
  msToKmh,
  calculateTotalDistance,
  calculateAverageSpeed,
  getMaxSpeed,
  validateGpsPoint,
  calculateBearing,
} from "@/lib/gps-utils";
import {
  startBackgroundLocationTracking,
  stopBackgroundLocationTracking,
  requestBackgroundLocationPermission,
} from "@/lib/background-location";
import { getSelectedScooter, type SelectedScooter } from "@/app/select-scooter";
import {
  getVoiceSettings,
  announceRidingStatus,
  announceStart,
  announceEnd,
  resetAnnouncementTimer,
  stopSpeech,
  VoiceSettings,
} from "@/lib/voice-guidance";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");

export default function RidingScreen() {
  const router = useRouter();
  const colors = useColors();

  // Live location mutation for friends tracking
  const updateLiveLocation = trpc.liveLocation.update.useMutation();
  const stopLiveLocation = trpc.liveLocation.stop.useMutation();
  
  // Server sync mutation for ranking
  const syncToServer = trpc.rides.create.useMutation();

  const [isRunning, setIsRunning] = useState(true);
  const [duration, setDuration] = useState(0);
  const [distance, setDistance] = useState(0);
  const [currentSpeed, setCurrentSpeed] = useState(0);
  const [maxSpeed, setMaxSpeed] = useState(0);
  const [avgSpeed, setAvgSpeed] = useState(0);
  const [gpsStatus, setGpsStatus] = useState<"waiting" | "active" | "error">("waiting");
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [gpsPointCount, setGpsPointCount] = useState(0);
  const [currentLocation, setCurrentLocation] = useState<{ latitude: number; longitude: number; heading?: number } | null>(null);
  const [gpsPoints, setGpsPoints] = useState<GpsPoint[]>([]);
  const [showMap, setShowMap] = useState(true);
  const [isBackgroundEnabled, setIsBackgroundEnabled] = useState(false);
  const [selectedScooter, setSelectedScooter] = useState<SelectedScooter | null>(null);
  const [voiceSettings, setVoiceSettings] = useState<VoiceSettings | null>(null);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const locationSubscriptionRef = useRef<Location.LocationSubscription | null>(null);
  const startTimeRef = useRef<Date>(new Date());
  const gpsPointsRef = useRef<GpsPoint[]>([]);
  const lastValidPointRef = useRef<GpsPoint | null>(null);
  const lastBearingRef = useRef<number | null>(null);
  const isRunningRef = useRef(true);
  
  const speedHistoryRef = useRef<number[]>([]);
  const isFirstLocationRef = useRef(true);
  const SPEED_SMOOTHING_SAMPLES = 3;

  useEffect(() => {
    isRunningRef.current = isRunning;
  }, [isRunning]);

  // Load selected scooter on mount
  useEffect(() => {
    getSelectedScooter().then(setSelectedScooter);
  }, []);

  // Load voice settings and announce start
  useEffect(() => {
    const loadVoiceSettings = async () => {
      const settings = await getVoiceSettings();
      setVoiceSettings(settings);
      resetAnnouncementTimer();
      if (settings.enabled) {
        announceStart();
      }
    };
    loadVoiceSettings();

    return () => {
      stopSpeech();
    };
  }, []);

  useEffect(() => {
    if (Platform.OS !== "web") {
      activateKeepAwakeAsync();
      return () => {
        deactivateKeepAwake();
      };
    }
  }, []);

  useEffect(() => {
    startTimeRef.current = new Date();
    initializeGps();

    return () => {
      stopLocationTracking();
      if (Platform.OS !== "web") {
        stopBackgroundLocationTracking();
      }
    };
  }, []);

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      if (isRunningRef.current) {
        setDuration((prev) => {
          const newDuration = prev + 1;
          // Voice announcement check (every second, let the function handle interval)
          if (voiceSettings) {
            announceRidingStatus(
              voiceSettings,
              currentSpeed,
              distance,
              newDuration
            );
          }
          return newDuration;
        });
      }
    }, 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [voiceSettings, currentSpeed, distance]);

  const initializeGps = async () => {
    try {
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

      // Request background location permission on native
      if (Platform.OS !== "web") {
        const hasBackgroundPermission = await requestBackgroundLocationPermission();
        if (hasBackgroundPermission) {
          setIsBackgroundEnabled(true);
          // Start background tracking
          await startBackgroundLocationTracking(handleLocationUpdate);
        }
      }

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
          timeInterval: 1000,
          distanceInterval: 1,
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

  const smoothSpeed = (rawSpeedKmh: number): number => {
    if (rawSpeedKmh < GPS_CONSTANTS.MIN_SPEED_THRESHOLD) {
      speedHistoryRef.current = [];
      return 0;
    }

    speedHistoryRef.current.push(rawSpeedKmh);
    
    if (speedHistoryRef.current.length > SPEED_SMOOTHING_SAMPLES) {
      speedHistoryRef.current.shift();
    }

    return speedHistoryRef.current.reduce((a, b) => a + b, 0) / speedHistoryRef.current.length;
  };

  const handleLocationUpdate = (location: Location.LocationObject) => {
    if (!isRunningRef.current) return;

    const { latitude, longitude, altitude, speed, accuracy: locAccuracy } = location.coords;
    const timestamp = location.timestamp;

    setAccuracy(locAccuracy);
    
    // Calculate heading from bearing if available
    const heading = lastBearingRef.current ?? (location.coords.heading ?? 0);
    setCurrentLocation({ latitude, longitude, heading });

    const gpsPoint: GpsPoint = {
      latitude,
      longitude,
      altitude: altitude ?? null,
      timestamp,
      speed: speed ?? null,
      accuracy: locAccuracy ?? null,
    };

    const rawSpeedKmh = speed !== null && speed >= 0 ? msToKmh(speed) : 0;
    const displaySpeed = smoothSpeed(rawSpeedKmh);
    setCurrentSpeed(displaySpeed);

    const validation = validateGpsPoint(gpsPoint, lastValidPointRef.current, lastBearingRef.current);

    if (validation.isValid) {
      gpsPointsRef.current.push(gpsPoint);
      setGpsPoints([...gpsPointsRef.current]);
      setGpsPointCount(gpsPointsRef.current.length);

      // Update live location for friends to see
      const isStarting = isFirstLocationRef.current;
      isFirstLocationRef.current = false;
      updateLiveLocation.mutate({
        latitude,
        longitude,
        heading: heading ?? null,
        speed: speed ?? null,
        isRiding: true,
        isStarting,
      });

      if (rawSpeedKmh >= GPS_CONSTANTS.MIN_SPEED_THRESHOLD) {
        setMaxSpeed((prev) => Math.max(prev, rawSpeedKmh));
      }

      if (lastValidPointRef.current) {
        const dist = calculateDistance(
          lastValidPointRef.current.latitude,
          lastValidPointRef.current.longitude,
          latitude,
          longitude
        );
        setDistance((prev) => prev + dist);
      }

      if (lastValidPointRef.current) {
        lastBearingRef.current = calculateBearing(
          lastValidPointRef.current.latitude,
          lastValidPointRef.current.longitude,
          latitude,
          longitude
        );
      }
      lastValidPointRef.current = gpsPoint;

      const validPoints = gpsPointsRef.current.filter(
        (p) => p.speed !== null && msToKmh(p.speed) >= GPS_CONSTANTS.MIN_SPEED_THRESHOLD
      );
      if (validPoints.length > 0) {
        const avgSpd = validPoints.reduce((sum, p) => sum + msToKmh(p.speed!), 0) / validPoints.length;
        setAvgSpeed(avgSpd);
      }
    }
  };

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
      if (Platform.OS !== "web") {
        stopBackgroundLocationTracking();
      }
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
            if (Platform.OS !== "web") {
              await stopBackgroundLocationTracking();
            }

            // Stop sharing live location
            stopLiveLocation.mutate();

            const finalDistance = calculateTotalDistance(gpsPointsRef.current);
            const finalAvgSpeed = calculateAverageSpeed(gpsPointsRef.current);
            const finalMaxSpeed = getMaxSpeed(gpsPointsRef.current);

            const finalDist = finalDistance > 0 ? finalDistance : distance;
            const finalAvg = finalAvgSpeed > 0 ? finalAvgSpeed : avgSpeed;
            const finalMax = finalMaxSpeed > 0 ? finalMaxSpeed : maxSpeed;

            const record = {
              id: generateId(),
              date: new Date().toLocaleDateString("ko-KR"),
              duration,
              distance: finalDist,
              avgSpeed: finalAvg,
              maxSpeed: finalMax,
              startTime: startTimeRef.current.toISOString(),
              endTime: new Date().toISOString(),
              gpsPoints: gpsPointsRef.current,
              scooterId: selectedScooter?.id,
              scooterName: selectedScooter?.name,
            };
            await saveRidingRecord(record);

            // Voice announcement for ride completion
            try {
              await announceEnd(finalDist, duration, finalAvg);
            } catch (e) {
              console.log("[Riding] Voice announcement error:", e);
            }

            // Send ride completion notification
            try {
              await notifyRideCompleted(finalDist, duration, finalAvg);
            } catch (e) {
              console.log("[Riding] Notification error:", e);
            }

            // Sync to server for ranking
            try {
              await syncToServer.mutateAsync({
                recordId: record.id,
                date: record.date,
                duration: record.duration,
                distance: record.distance,
                avgSpeed: record.avgSpeed,
                maxSpeed: record.maxSpeed,
                startTime: record.startTime,
                endTime: record.endTime,
                gpsPointsJson: JSON.stringify(record.gpsPoints),
              });
              console.log("[Riding] Record synced to server");
            } catch (e) {
              console.log("[Riding] Server sync error:", e);
            }

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
        if (accuracy < 10) return "#4CAF50";
        if (accuracy < 20) return "#8BC34A";
        if (accuracy < 30) return "#FFC107";
        return "#FF9800";
      case "error":
        return "#F44336";
      default:
        return "#9E9E9E";
    }
  };

  const getGpsStatusText = () => {
    switch (gpsStatus) {
      case "active":
        const bgText = isBackgroundEnabled ? " (BG)" : "";
        return accuracy !== null ? `GPS ${accuracy.toFixed(0)}m${bgText}` : `GPS 활성${bgText}`;
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
      <View className="flex-1">
        {/* Header */}
        <View className="flex-row justify-between items-center px-4 py-2">
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
          <Pressable
            onPress={() => setShowMap(!showMap)}
            style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
            className="p-2"
          >
            <MaterialIcons 
              name={showMap ? "map" : "speed"} 
              size={24} 
              color="#FFFFFF" 
            />
          </Pressable>
        </View>

        {/* Map or Speed Display */}
        {showMap ? (
          <View className="flex-1 mx-4 mb-4 rounded-2xl overflow-hidden">
            <RideMap
              gpsPoints={gpsPoints}
              currentLocation={currentLocation}
              isLive={true}
              showCurrentLocation={false}
            />
            {/* Speed overlay on map */}
            <View className="absolute bottom-4 left-4 bg-black/70 rounded-xl px-4 py-2">
              <Text className="text-4xl font-bold text-white">
                {currentSpeed.toFixed(1)}
              </Text>
              <Text className="text-xs text-gray-300">km/h</Text>
            </View>
          </View>
        ) : (
          <View className="items-center py-8">
            <Text className="text-8xl font-bold text-white">
              {currentSpeed.toFixed(1)}
            </Text>
            <Text className="text-xl text-gray-400 mt-1">km/h</Text>
          </View>
        )}

        {/* Time Display */}
        <View className="items-center mb-4">
          <Text className="text-4xl font-bold text-white">
            {formatDuration(duration)}
          </Text>
          <Text className="text-sm text-gray-400 mt-1">주행 시간</Text>
        </View>

        {/* Stats Row */}
        <View className="flex-row justify-around mx-4 mb-4 bg-[#2A2A2A] rounded-2xl p-4">
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
        <View className="items-center mb-2">
          <Text className="text-gray-500 text-xs">
            GPS 포인트: {gpsPointCount}개 기록됨
          </Text>
        </View>

        {/* Control Buttons */}
        <View className="flex-row justify-center items-center py-4 mb-4">
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

          <View className="w-16 h-16 ml-8" />
        </View>
      </View>
    </ScreenContainer>
  );
}
