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
import { GoogleRideMap } from "@/components/google-ride-map";
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
  updateForegroundNotification,
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
import { useLocalSearchParams } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { GpxRoute, GpxPoint as GpxRoutePoint } from "@/lib/gpx-parser";
import { GroupChat } from "@/components/group-chat";
import { BatteryOptimizationGuide, useBatteryOptimizationGuide } from "@/components/battery-optimization-guide";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");

export default function RidingScreen() {
  const router = useRouter();
  const colors = useColors();
  const params = useLocalSearchParams<{ 
    withRoute?: string; 
    groupId?: string;
    withNavigation?: string;
    destinationName?: string;
    destinationLat?: string;
    destinationLng?: string;
    routePolyline?: string;
    routeSteps?: string;
  }>();

  // Group riding state
  const [groupId, setGroupId] = useState<number | null>(null);
  const [groupMembers, setGroupMembers] = useState<{
    userId: number;
    name: string | null;
    latitude: number | null;
    longitude: number | null;
    distance: number;
    currentSpeed: number;
    isRiding: boolean;
  }[]>([]);

  // Group riding mutations
  const updateGroupLocation = trpc.groups.updateLocation.useMutation();
  const { data: groupMembersData, refetch: refetchGroupMembers } = trpc.groups.getMembersLocations.useQuery(
    { groupId: groupId ?? 0 },
    { enabled: !!groupId, refetchInterval: 3000 }
  );

  // Live location mutation for friends tracking
  const updateLiveLocation = trpc.liveLocation.update.useMutation();
  const stopLiveLocation = trpc.liveLocation.stop.useMutation();
  
  // Server sync mutation for ranking
  const syncToServer = trpc.rides.create.useMutation();
  const trpcUtils = trpc.useUtils();

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
  
  // Auto-pause when stationary
  const [isAutoPaused, setIsAutoPaused] = useState(false);
  const isAutoPausedRef = useRef(false); // ref로도 추적하여 클로저 문제 해결
  const [restTime, setRestTime] = useState(0); // 휴식 시간 (초)
  const stationaryCountRef = useRef(0); // 정지 상태 카운터
  const AUTO_PAUSE_SPEED_THRESHOLD = 1.5; // km/h 이하면 정지로 판단
  const AUTO_PAUSE_DELAY_SECONDS = 5; // 5초 이상 정지 시 자동 일시정지
  
  // GPX 경로 따라가기
  const [gpxRoute, setGpxRoute] = useState<GpxRoute | null>(null);
  
  // 네비게이션 상태
  const [hasNavigation, setHasNavigation] = useState(false);
  const [navigationDestination, setNavigationDestination] = useState<{
    name: string;
    lat: number;
    lng: number;
  } | null>(null);
  const [navigationRoute, setNavigationRoute] = useState<GpsPoint[]>([]);
  const [navigationSteps, setNavigationSteps] = useState<{
    instruction: string;
    distance: string;
    duration: string;
    maneuver?: string;
  }[]>([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [distanceToDestination, setDistanceToDestination] = useState<number | null>(null);
  
  // 그룹 채팅
  const [showChat, setShowChat] = useState(false);

  // Battery optimization guide
  const batteryGuide = useBatteryOptimizationGuide();

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
  
  // ref로 최신 값 추적 (interval 클로저 문제 해결)
  const currentSpeedRef = useRef(0);
  const distanceRef = useRef(0);
  const voiceSettingsRef = useRef<VoiceSettings | null>(null);
  const isBackgroundEnabledRef = useRef(false);

  useEffect(() => {
    isRunningRef.current = isRunning;
  }, [isRunning]);
  
  // 최신 값을 ref에 동기화
  useEffect(() => {
    currentSpeedRef.current = currentSpeed;
  }, [currentSpeed]);
  
  useEffect(() => {
    distanceRef.current = distance;
  }, [distance]);
  
  useEffect(() => {
    voiceSettingsRef.current = voiceSettings;
  }, [voiceSettings]);
  
  useEffect(() => {
    isBackgroundEnabledRef.current = isBackgroundEnabled;
  }, [isBackgroundEnabled]);

  // isAutoPaused 상태를 ref에도 동기화
  useEffect(() => {
    isAutoPausedRef.current = isAutoPaused;
  }, [isAutoPaused]);

  // Load selected scooter on mount
  useEffect(() => {
    getSelectedScooter().then(setSelectedScooter);
  }, []);

  // Parse groupId from params
  useEffect(() => {
    if (params.groupId) {
      const id = parseInt(params.groupId, 10);
      if (!isNaN(id)) {
        setGroupId(id);
      }
    }
  }, [params.groupId]);

  // Parse navigation params
  useEffect(() => {
    if (params.withNavigation === "true") {
      setHasNavigation(true);
      
      // Parse destination
      if (params.destinationName && params.destinationLat && params.destinationLng) {
        setNavigationDestination({
          name: params.destinationName,
          lat: parseFloat(params.destinationLat),
          lng: parseFloat(params.destinationLng),
        });
      }
      
      // Parse route polyline
      if (params.routePolyline) {
        try {
          const points = JSON.parse(params.routePolyline) as GpsPoint[];
          setNavigationRoute(points);
          
          // Set as GPX route for map display
          setGpxRoute({
            name: params.destinationName || "네비게이션 경로",
            points: points.map(p => ({
              latitude: p.latitude,
              longitude: p.longitude,
            })),
            totalDistance: 0, // Will be calculated from route
            estimatedDuration: 0, // Will be calculated from route
          });
        } catch (e) {
          console.error("Failed to parse route polyline:", e);
        }
      }
      
      // Parse route steps
      if (params.routeSteps) {
        try {
          const steps = JSON.parse(params.routeSteps);
          setNavigationSteps(steps);
        } catch (e) {
          console.error("Failed to parse route steps:", e);
        }
      }
    }
  }, [params.withNavigation, params.destinationName, params.destinationLat, params.destinationLng, params.routePolyline, params.routeSteps]);

  // Track previous group members for detecting ride end
  const previousMembersRef = useRef<Map<number, boolean>>(new Map());
  const rideEndAlertedRef = useRef<Set<number>>(new Set());

  // Update group members when data changes and detect ride end
  useEffect(() => {
    if (groupMembersData) {
      // 그룹원 주행 종료 감지
      groupMembersData.forEach(member => {
        const wasRiding = previousMembersRef.current.get(member.userId);
        const isNowRiding = member.isRiding;
        
        // 이전에 주행 중이었는데 지금은 주행 중이 아니면 종료 알림
        if (wasRiding === true && isNowRiding === false) {
          if (!rideEndAlertedRef.current.has(member.userId)) {
            rideEndAlertedRef.current.add(member.userId);
            Alert.alert(
              "그룹원 주행 종료",
              `${member.name || '그룹원'}님이 주행을 종료하였습니다.`,
              [{ text: "확인" }]
            );
            if (Platform.OS !== "web") {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            }
          }
        } else if (isNowRiding) {
          // 다시 주행 시작하면 알림 상태 리셋
          rideEndAlertedRef.current.delete(member.userId);
        }
        
        // 현재 상태 저장
        previousMembersRef.current.set(member.userId, isNowRiding);
      });
      
      setGroupMembers(groupMembersData);
    }
  }, [groupMembersData]);

  // Check for distant group members and alert
  const distantMemberAlertedRef = useRef<Set<number>>(new Set());
  useEffect(() => {
    if (!groupId || !currentLocation || groupMembers.length === 0) return;

    const DISTANCE_THRESHOLD_METERS = 3000; // 3km 이상 떨어지면 경고
    
    groupMembers.forEach(member => {
      if (!member.latitude || !member.longitude) return;
      
      const distanceToMember = calculateDistance(
        currentLocation.latitude,
        currentLocation.longitude,
        member.latitude,
        member.longitude
      ) * 1000; // km to m
      
      if (distanceToMember > DISTANCE_THRESHOLD_METERS) {
        // 아직 알림을 보내지 않은 멤버만 알림
        if (!distantMemberAlertedRef.current.has(member.userId)) {
          distantMemberAlertedRef.current.add(member.userId);
          Alert.alert(
            "팀원이 멀어졌습니다",
            `${member.name || '그룹원'}님이 ${(distanceToMember / 1000).toFixed(1)}km 떨어져 있습니다.`,
            [{ text: "확인" }]
          );
          if (Platform.OS !== "web") {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          }
        }
      } else {
        // 다시 가까워지면 알림 상태 리셋
        distantMemberAlertedRef.current.delete(member.userId);
      }
    });
  }, [groupId, currentLocation, groupMembers]);
  
  // Load GPX route if withRoute param is set
  useEffect(() => {
    const loadGpxRoute = async () => {
      if (params.withRoute === "true") {
        try {
          const routeJson = await AsyncStorage.getItem("@current_gpx_route");
          if (routeJson) {
            const route: GpxRoute = JSON.parse(routeJson);
            setGpxRoute(route);
            // 사용 후 임시 데이터 삭제
            await AsyncStorage.removeItem("@current_gpx_route");
          }
        } catch (error) {
          console.error("Failed to load GPX route:", error);
        }
      }
    };
    loadGpxRoute();
  }, [params.withRoute]);

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
    // interval은 한 번만 생성하고 ref로 최신 값 참조
    intervalRef.current = setInterval(() => {
      // ref를 사용하여 클로저 문제 해결
      if (isRunningRef.current && !isAutoPausedRef.current) {
        // 주행 중일 때만 시간 카운트
        setDuration((prev) => {
          const newDuration = prev + 1;
          // Voice announcement check (every second, let the function handle interval)
          const settings = voiceSettingsRef.current;
          if (settings) {
            announceRidingStatus(
              settings,
              currentSpeedRef.current,
              distanceRef.current,
              newDuration
            );
          }
          // Update foreground notification with current stats (every second for real-time display)
          if (Platform.OS !== "web" && isBackgroundEnabledRef.current) {
            updateForegroundNotification(
              distanceRef.current, // already in meters
              newDuration,
              currentSpeedRef.current
            );
          }
          return newDuration;
        });
      } else if (isAutoPausedRef.current) {
        // 자동 일시정지 중일 때 휴식 시간 카운트
        setRestTime((prev) => prev + 1);
      }
    }, 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []); // 의존성 배열 비움 - ref로 최신 값 참조

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
          
          // Initialize notification with zeros to clear any stale data
          updateForegroundNotification(0, 0, 0);
          
          // Show battery optimization guide if needed (after a short delay)
          setTimeout(() => {
            if (batteryGuide.shouldShow) {
              batteryGuide.showGuide();
              batteryGuide.markAsShown();
            }
          }, 3000);
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

    // 자동 일시정지 로직: 속도가 임계값 이하면 정지 카운터 증가
    if (displaySpeed < AUTO_PAUSE_SPEED_THRESHOLD) {
      stationaryCountRef.current += 1;
      if (stationaryCountRef.current >= AUTO_PAUSE_DELAY_SECONDS && !isAutoPaused) {
        setIsAutoPaused(true);
        if (Platform.OS !== "web") {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
      }
    } else {
      // 움직이면 카운터 리셋 및 자동 일시정지 해제
      stationaryCountRef.current = 0;
      if (isAutoPaused) {
        setIsAutoPaused(false);
        if (Platform.OS !== "web") {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        }
      }
    }

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

      // Update group location if in group riding
      if (groupId) {
        updateGroupLocation.mutate({
          groupId,
          latitude,
          longitude,
          distance: distance,
          duration: duration,
          currentSpeed: displaySpeed,
          isRiding: true,
        });
      }

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

      // Update navigation step if navigation is active
      if (hasNavigation && navigationRoute.length > 0) {
        updateNavigationProgress(latitude, longitude);
      }
    }
  };

  // Update navigation progress based on current location
  const updateNavigationProgress = (lat: number, lng: number) => {
    if (!navigationDestination || navigationRoute.length === 0) return;

    // Calculate distance to destination
    const distToDest = calculateDistance(lat, lng, navigationDestination.lat, navigationDestination.lng);
    setDistanceToDestination(distToDest);

    // Check if arrived at destination (within 50 meters)
    if (distToDest < 0.05) { // 50 meters in km
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      Alert.alert(
        "목적지 도착",
        `${navigationDestination.name}에 도착했습니다!`,
        [{ text: "확인" }]
      );
      setHasNavigation(false);
      return;
    }

    // Update current step based on proximity to route points
    // Find the closest point on the route and determine which step we're on
    if (navigationSteps.length > 0 && currentStepIndex < navigationSteps.length - 1) {
      // Simple heuristic: advance step when we've traveled enough distance
      // In a real app, you'd use more sophisticated logic with route geometry
      const stepProgress = gpsPointsRef.current.length;
      const estimatedStepsPerPoint = Math.max(1, Math.floor(navigationRoute.length / navigationSteps.length));
      const newStepIndex = Math.min(
        Math.floor(stepProgress / estimatedStepsPerPoint),
        navigationSteps.length - 1
      );
      
      if (newStepIndex > currentStepIndex) {
        setCurrentStepIndex(newStepIndex);
        if (Platform.OS !== "web") {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
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
            try {
              // Stop tracking first
              stopLocationTracking();
              if (Platform.OS !== "web") {
                await stopBackgroundLocationTracking();
              }

              // Stop sharing live location
              try {
                stopLiveLocation.mutate();
              } catch (e) {
                console.log("[Riding] Stop live location error:", e);
              }

              // Calculate final stats from GPS points
              const gpsPointsCopy = [...gpsPointsRef.current];
              console.log("[Riding] GPS points count:", gpsPointsCopy.length);
              
              const finalDistance = calculateTotalDistance(gpsPointsCopy);
              const finalAvgSpeed = calculateAverageSpeed(gpsPointsCopy);
              const finalMaxSpeed = getMaxSpeed(gpsPointsCopy);

              // Use calculated values if available, otherwise use state values
              const finalDist = finalDistance > 0 ? finalDistance : distance;
              const finalAvg = finalAvgSpeed > 0 ? finalAvgSpeed : avgSpeed;
              const finalMax = finalMaxSpeed > 0 ? finalMaxSpeed : maxSpeed;

              console.log("[Riding] Final stats - dist:", finalDist, "avg:", finalAvg, "max:", finalMax);

              // Build group riding info if applicable
              const groupInfo = groupId && groupMembers.length > 0 ? {
                groupId,
                groupName: groupMembers.find(m => m.isRiding)?.name || "그룹 라이딩",
                groupMembers: groupMembers.map(m => ({ userId: m.userId, name: m.name })),
              } : {};

              // Generate record ID first
              const recordId = generateId();
              const now = new Date();
              
              const record = {
                id: recordId,
                date: now.toLocaleDateString("ko-KR"),
                duration: duration > 0 ? duration : Math.floor((now.getTime() - startTimeRef.current.getTime()) / 1000),
                distance: finalDist,
                avgSpeed: finalAvg,
                maxSpeed: finalMax,
                startTime: startTimeRef.current.toISOString(),
                endTime: now.toISOString(),
                gpsPoints: gpsPointsCopy,
                scooterId: selectedScooter?.id,
                scooterName: selectedScooter?.name,
                ...groupInfo,
              };

              console.log("[Riding] Saving record:", recordId, "duration:", record.duration);
              
              // Save to local storage with error handling
              try {
                await saveRidingRecord(record);
                console.log("[Riding] Record saved to local storage");
              } catch (saveError) {
                console.error("[Riding] Failed to save record:", saveError);
                Alert.alert(
                  "저장 오류",
                  "주행 기록을 저장하는 중 오류가 발생했습니다. 다시 시도해주세요.",
                  [{ text: "확인" }]
                );
                return; // Don't navigate back if save failed
              }

              // Voice announcement for ride completion
              try {
                await announceEnd(finalDist, record.duration, finalAvg);
              } catch (e) {
                console.log("[Riding] Voice announcement error:", e);
              }

              // Send ride completion notification
              try {
                await notifyRideCompleted(finalDist, record.duration, finalAvg);
              } catch (e) {
                console.log("[Riding] Notification error:", e);
              }

              // Sync to server for ranking (non-blocking)
              try {
                await syncToServer.mutateAsync({
                  recordId: record.id,
                  date: record.date,
                  duration: Math.round(record.duration),
                  distance: Math.round(record.distance),
                  avgSpeed: record.avgSpeed,
                  maxSpeed: record.maxSpeed,
                  startTime: record.startTime,
                  endTime: record.endTime,
                  gpsPointsJson: gpsPointsCopy.length > 0 
                    ? JSON.stringify(gpsPointsCopy) 
                    : undefined,
                });
                console.log("[Riding] Record synced to server");
                
                // Invalidate ranking queries to reflect new data
                trpcUtils.ranking.getWeekly.invalidate();
                trpcUtils.ranking.getMonthly.invalidate();
              } catch (e) {
                console.log("[Riding] Server sync error (will retry later):", e);
              }

              router.back();
            } catch (error) {
              console.error("[Riding] Critical error during save:", error);
              Alert.alert(
                "오류 발생",
                "주행 기록 저장 중 예상치 못한 오류가 발생했습니다.",
                [
                  { text: "다시 시도", onPress: () => handleStop() },
                  { text: "저장 안함", style: "destructive", onPress: () => router.back() },
                ]
              );
            }
          },
        },
      ]
    );
  };

  const getNavigationIcon = (maneuver?: string): string => {
    switch (maneuver) {
      case "turn-left":
        return "turn-left";
      case "turn-right":
        return "turn-right";
      case "turn-slight-left":
        return "turn-slight-left";
      case "turn-slight-right":
        return "turn-slight-right";
      case "turn-sharp-left":
        return "turn-sharp-left";
      case "turn-sharp-right":
        return "turn-sharp-right";
      case "uturn-left":
      case "uturn-right":
        return "u-turn-left";
      case "roundabout-left":
      case "roundabout-right":
        return "roundabout-left";
      case "straight":
        return "straight";
      default:
        return "arrow-forward";
    }
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

        {/* Navigation Turn-by-Turn Banner */}
        {hasNavigation && navigationSteps.length > 0 && currentStepIndex < navigationSteps.length && (
          <View style={{
            backgroundColor: colors.primary,
            paddingHorizontal: 16,
            paddingVertical: 12,
            marginHorizontal: 8,
            marginBottom: 8,
            borderRadius: 12,
          }}>
            <View className="flex-row items-center">
              <View style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                backgroundColor: 'rgba(255,255,255,0.2)',
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: 12,
              }}>
                <MaterialIcons 
                  name={getNavigationIcon(navigationSteps[currentStepIndex]?.maneuver) as any} 
                  size={24} 
                  color="#FFFFFF" 
                />
              </View>
              <View className="flex-1">
                <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: 'bold' }} numberOfLines={2}>
                  {navigationSteps[currentStepIndex]?.instruction}
                </Text>
                <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13, marginTop: 2 }}>
                  {navigationSteps[currentStepIndex]?.distance} · {navigationDestination?.name}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Map or Speed Display */}
        {showMap ? (
          <View style={{ flex: 1, position: 'absolute', top: 50, left: 0, right: 0, bottom: 0 }}>
            {Platform.OS !== "web" ? (
              <GoogleRideMap
                gpsPoints={gpsPoints}
                currentLocation={currentLocation}
                isLive={true}
                showCurrentLocation={false}
                gpxRoute={gpxRoute}
                groupMembers={groupMembers}
                style={{ flex: 1, borderRadius: 0 }}
              />
            ) : (
              <RideMap
                gpsPoints={gpsPoints}
                currentLocation={currentLocation}
                isLive={true}
                showCurrentLocation={false}
                gpxRoute={gpxRoute}
                groupMembers={groupMembers}
                style={{ flex: 1, borderRadius: 0 }}
              />
            )}
            {/* 속도 오버레이 - 좌하단 */}
            <View style={{
              position: 'absolute',
              bottom: 180,
              left: 16,
              backgroundColor: 'rgba(0, 0, 0, 0.7)',
              borderRadius: 12,
              paddingHorizontal: 16,
              paddingVertical: 10,
            }}>
              <Text style={{ fontSize: 48, fontWeight: 'bold', color: '#FFFFFF' }}>
                {currentSpeed.toFixed(1)}
              </Text>
              <Text style={{ fontSize: 14, color: '#CCCCCC' }}>km/h</Text>
            </View>
            {/* 거리 오버레이 - 우상단 */}
            <View style={{
              position: 'absolute',
              top: 16,
              right: 16,
              backgroundColor: 'rgba(0, 0, 0, 0.7)',
              borderRadius: 12,
              paddingHorizontal: 14,
              paddingVertical: 8,
            }}>
              <Text style={{ fontSize: 24, fontWeight: 'bold', color: '#FFFFFF' }}>
                {(distance / 1000).toFixed(2)}
              </Text>
              <Text style={{ fontSize: 12, color: '#CCCCCC', textAlign: 'right' }}>km</Text>
            </View>
            {/* 시간 오버레이 - 좌상단 */}
            <View style={{
              position: 'absolute',
              top: 16,
              left: 16,
              backgroundColor: 'rgba(0, 0, 0, 0.7)',
              borderRadius: 12,
              paddingHorizontal: 14,
              paddingVertical: 8,
            }}>
              <Text style={{ fontSize: 24, fontWeight: 'bold', color: '#FFFFFF' }}>
                {formatDuration(duration)}
              </Text>
              <Text style={{ fontSize: 12, color: '#CCCCCC' }}>주행 시간</Text>
            </View>
            {/* 평균/최고 속도 오버레이 - 우하단 */}
            <View style={{
              position: 'absolute',
              bottom: 180,
              right: 16,
              backgroundColor: 'rgba(0, 0, 0, 0.7)',
              borderRadius: 12,
              paddingHorizontal: 14,
              paddingVertical: 8,
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#FFFFFF' }}>
                  {avgSpeed.toFixed(1)}
                </Text>
                <Text style={{ fontSize: 10, color: '#CCCCCC', marginLeft: 4 }}>평균</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: 4 }}>
                <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#FF6B6B' }}>
                  {maxSpeed.toFixed(1)}
                </Text>
                <Text style={{ fontSize: 10, color: '#CCCCCC', marginLeft: 4 }}>최고</Text>
              </View>
            </View>
            {/* 휴식 중 표시 */}
            {isAutoPaused && (
              <View style={{
                position: 'absolute',
                top: 80,
                left: '50%',
                transform: [{ translateX: -60 }],
                backgroundColor: 'rgba(234, 179, 8, 0.9)',
                borderRadius: 20,
                paddingHorizontal: 16,
                paddingVertical: 6,
              }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: '#000000' }}>
                  휴식 중 ({formatDuration(restTime)})
                </Text>
              </View>
            )}
          </View>
        ) : (
          <View className="items-center py-8">
            <Text className="text-8xl font-bold text-white">
              {currentSpeed.toFixed(1)}
            </Text>
            <Text className="text-xl text-gray-400 mt-1">km/h</Text>
          </View>
        )}

        {/* Time Display - 지도 모드일 때는 숨김 */}
        {!showMap && (
          <>
            <View className="items-center mb-4">
              {isAutoPaused && (
                <View className="bg-yellow-500/20 px-4 py-1 rounded-full mb-2">
                  <Text className="text-yellow-400 text-sm font-medium">
                    휴식 중 ({formatDuration(restTime)})
                  </Text>
                </View>
              )}
              <Text className="text-4xl font-bold text-white">
                {formatDuration(duration)}
              </Text>
              <Text className="text-sm text-gray-400 mt-1">
                주행 시간{restTime > 0 ? ` (휴식 ${formatDuration(restTime)})` : ""}
              </Text>
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
          </>
        )}

        {/* Control Buttons - 지도 모드일 때는 하단에 오버레이로 표시 */}
        <View style={showMap ? {
          position: 'absolute',
          bottom: 40,
          left: 0,
          right: 0,
          flexDirection: 'row',
          justifyContent: 'center',
          alignItems: 'center',
          paddingVertical: 16,
        } : undefined}
        className={!showMap ? "flex-row justify-center items-center py-4 mb-4" : undefined}
        >
          <Pressable
            onPress={handleStop}
            style={({ pressed }) => [
              {
                backgroundColor: showMap ? "rgba(51, 51, 51, 0.9)" : "#333333",
                transform: [{ scale: pressed ? 0.95 : 1 }],
                width: 64,
                height: 64,
                borderRadius: 32,
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: 32,
              },
            ]}
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
                width: 80,
                height: 80,
                borderRadius: 40,
                alignItems: 'center',
                justifyContent: 'center',
              },
            ]}
          >
            <MaterialIcons
              name={isRunning ? "pause" : "play-arrow"}
              size={40}
              color="#FFFFFF"
            />
          </Pressable>

          {/* 그룹 라이딩 시 채팅 버튼 */}
          {groupId ? (
            <Pressable
              onPress={() => setShowChat(true)}
              style={({ pressed }) => [
                {
                  backgroundColor: showMap ? "rgba(51, 51, 51, 0.9)" : "#333333",
                  transform: [{ scale: pressed ? 0.95 : 1 }],
                  width: 64,
                  height: 64,
                  borderRadius: 32,
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginLeft: 32,
                },
              ]}
            >
              <MaterialIcons name="chat" size={28} color="#FFFFFF" />
            </Pressable>
          ) : (
            <View style={{ width: 64, height: 64, marginLeft: 32 }} />
          )}
        </View>
      </View>

      {/* Battery Optimization Guide Modal */}
      <BatteryOptimizationGuide
        visible={batteryGuide.isVisible}
        onClose={batteryGuide.hideGuide}
      />

      {/* Group Chat Modal */}
      {groupId && showChat && (
        <View className="absolute inset-0 bg-background">
          <GroupChat
            groupId={groupId}
            isVisible={showChat}
            onClose={() => setShowChat(false)}
          />
        </View>
      )}
    </ScreenContainer>
  );
}
