import { useEffect, useState, useRef } from "react";
import { Text, View, Pressable, Alert, BackHandler, Platform, Dimensions, AppState, AppStateStatus } from "react-native";
import { useRouter } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";

import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { RideMap } from "@/components/ride-map";
import { GoogleRideMap, GoogleRideMapRef } from "@/components/google-ride-map";
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
import { getSelectedScooter, getStartVoltage, clearStartVoltage, type SelectedScooter } from "@/app/select-scooter";
import { VoltageInputModal } from "@/components/voltage-input-modal";
import { RideAnalysisModal, type RideAnalysis } from "@/components/ride-analysis-modal";
import {
  getVoiceSettings,
  announceRidingStatus,
  announceStart,
  announceEnd,
  resetAnnouncementTimer,
  stopSpeech,
  VoiceSettings,
  announceNavigationStep,
  announceArrival,
  announceRouteDeviation,
  announceNavigationStarted,
} from "@/lib/voice-guidance";
import { useLocalSearchParams } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { GpxRoute, GpxPoint as GpxRoutePoint } from "@/lib/gpx-parser";
import { GroupChatWS, type ChatMessage as WsChatMessage } from "@/components/group-chat-ws";
import { BatteryOptimizationGuide, useBatteryOptimizationGuide } from "@/components/battery-optimization-guide";
import { WeatherRidingTipCompact } from "@/components/weather-riding-tips";
import { notifyWeatherChange, notifyWeatherWarning } from "@/lib/notifications";
import { PerformanceIndicator } from "@/components/performance-indicator";
import { performanceMonitor } from "@/lib/performance-monitor";
import { useAuth } from "@/hooks/use-auth";
import { analyzeRideData, type RideAnalysisResult } from "@/lib/ride-analysis";
import { useGroupWebSocket } from "@/hooks/use-group-websocket";
import { GroupMembersOverlay, type GroupMember } from "@/components/group-members-overlay";
import {
  RideSessionBackup,
  saveRideSessionBackup,
  loadRideSessionBackup,
  clearRideSessionBackup,
  hasRecoverableSession,
  getRecoverableSessionSummary,
  startBackupInterval,
  stopBackupInterval,
} from "@/lib/ride-session-recovery";
import {
  checkAnalysisEligibility,
  generateDefaultAnalysis,
  recordAnalysisRequest,
} from "@/lib/ai-optimization";
import { compressGpsData } from "@/lib/gps-compression";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");

export default function RidingScreen() {
  const router = useRouter();
  const colors = useColors();
  const { user } = useAuth();
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
  const groupIdRef = useRef<number | null>(null); // ref로도 추적하여 클로저 문제 해결
  const [groupMembers, setGroupMembers] = useState<{
    userId: number;
    name: string | null;
    profileImage: string | null;
    profileColor: string | null;
    latitude: number | null;
    longitude: number | null;
    distance: number;
    currentSpeed: number;
    isRiding: boolean;
    lastUpdate: Date | null;
  }[]>([]);

  // Group riding mutations (HTTP fallback - disabled when WebSocket is connected)
  const updateGroupLocation = trpc.groups.updateLocation.useMutation();
  
  // Chat messages state for WebSocket
  const [wsChatMessages, setWsChatMessages] = useState<Array<{
    id: number;
    userId: number;
    userName: string | null;
    userProfileImage: string | null;
    message: string;
    messageType: "text" | "location" | "alert";
    createdAt: Date;
  }>>([]);

  // Throttle member updates to prevent excessive re-renders
  const lastMemberUpdateRef = useRef<number>(0);
  const pendingMemberUpdateRef = useRef<typeof groupMembers | null>(null);
  const memberUpdateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const MEMBER_UPDATE_THROTTLE_MS = 500; // Update UI at most every 500ms
  
  // WebSocket for real-time group location sharing and chat
  const { 
    isConnected: wsConnected, 
    members: wsMembers, 
    sendLocationUpdate: wsSendLocation,
    sendChatMessage: wsSendChatMessage,
  } = useGroupWebSocket({
    groupId,
    enabled: !!groupId,
    onMembersUpdate: (members) => {
      // Convert WebSocket members to groupMembers format
      const newMembers = members.map(m => ({
        userId: m.userId,
        name: m.userName,
        profileImage: m.profileImage,
        profileColor: m.profileColor,
        latitude: m.latitude,
        longitude: m.longitude,
        distance: m.distance,
        currentSpeed: m.speed,
        isRiding: m.isRiding,
        lastUpdate: new Date(),
      }));
      
      // Throttle updates to prevent UI lag
      const now = Date.now();
      const timeSinceLastUpdate = now - lastMemberUpdateRef.current;
      
      if (timeSinceLastUpdate >= MEMBER_UPDATE_THROTTLE_MS) {
        // Enough time passed, update immediately
        lastMemberUpdateRef.current = now;
        setGroupMembers(newMembers);
        pendingMemberUpdateRef.current = null;
        if (memberUpdateTimeoutRef.current) {
          clearTimeout(memberUpdateTimeoutRef.current);
          memberUpdateTimeoutRef.current = null;
        }
      } else {
        // Store pending update and schedule delayed update
        pendingMemberUpdateRef.current = newMembers;
        if (!memberUpdateTimeoutRef.current) {
          const delay = MEMBER_UPDATE_THROTTLE_MS - timeSinceLastUpdate;
          memberUpdateTimeoutRef.current = setTimeout(() => {
            if (pendingMemberUpdateRef.current) {
              lastMemberUpdateRef.current = Date.now();
              setGroupMembers(pendingMemberUpdateRef.current);
              pendingMemberUpdateRef.current = null;
            }
            memberUpdateTimeoutRef.current = null;
          }, delay);
        }
      }
    },
    onChatMessage: (message) => {
      // Add new chat message from WebSocket with max limit
      setWsChatMessages(prev => {
        // 중복 체크
        if (prev.some(m => m.id === message.id)) return prev;
        // 최대 100개 메시지만 유지 (메모리 절약)
        const newMessages = [...prev, message];
        if (newMessages.length > 100) {
          return newMessages.slice(-100);
        }
        return newMessages;
      });
    },
    onError: (error) => {
      console.error("[WebSocket] Error:", error);
    },
  });
  
  // Cleanup member update timeout on unmount
  useEffect(() => {
    return () => {
      if (memberUpdateTimeoutRef.current) {
        clearTimeout(memberUpdateTimeoutRef.current);
      }
    };
  }, []);

  // 그룹원 온라인 여부 판별: WS 연결 시 wsMembers 기준, HTTP 폴링 시 lastUpdate 5분 기준
  const GROUP_MEMBER_OFFLINE_THRESHOLD_MS = 5 * 60 * 1000;
  const isGroupMemberOnline = (member: (typeof groupMembers)[number]) => {
    if (wsConnected) {
      return wsMembers.some((wsMember) => wsMember.userId === member.userId);
    }
    if (!member.lastUpdate) return false;
    const lastUpdateTime = new Date(member.lastUpdate).getTime();
    if (Number.isNaN(lastUpdateTime)) return false;
    return Date.now() - lastUpdateTime <= GROUP_MEMBER_OFFLINE_THRESHOLD_MS;
  };
  const visibleGroupMembers = groupMembers;

  
  // HTTP polling fallback (only when WebSocket is not connected)
  const { data: groupMembersData, refetch: refetchGroupMembers } = trpc.groups.getMembersLocations.useQuery(
    { groupId: groupId ?? 0 },
    { enabled: !!groupId && !wsConnected, refetchInterval: 3000 }
  );

  // Live location mutation for friends tracking
  const updateLiveLocation = trpc.liveLocation.update.useMutation();
  const stopLiveLocation = trpc.liveLocation.stop.useMutation();
  
  // Server sync mutation for ranking
  const syncToServer = trpc.rides.create.useMutation();
  const checkBadgesMutation = trpc.badges.check.useMutation();
  const weatherQuery = trpc.weather.getCurrent.useQuery;
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
  
  // Battery voltage tracking
  const [startVoltage, setStartVoltage] = useState<{ voltage: number; soc: number } | null>(null);
  
  // Weather info at ride start
  const [weatherInfo, setWeatherInfo] = useState<{
    temperature: number | null;
    humidity: number | null;
    windSpeed: number | null;
    windDirection: number | null;
    precipitationType: number;
    weatherCondition: string;
  } | null>(null);
  const getWeather = trpc.weather.getCurrent.useQuery;
  
  // 경로별 날씨 변화 추적 (장거리 주행 시)
  const [weatherChanges, setWeatherChanges] = useState<{
    timestamp: string;
    latitude: number;
    longitude: number;
    distanceFromStart: number;
    temperature?: number;
    humidity?: number;
    windSpeed?: number;
    weatherCondition?: string;
  }[]>([]);
  const lastWeatherCheckRef = useRef<{ distance: number; time: number }>({ distance: 0, time: 0 });
  const WEATHER_CHECK_DISTANCE_INTERVAL = 5000; // 5km마다 날씨 체크
  const WEATHER_CHECK_TIME_INTERVAL = 30 * 60 * 1000; // 30분마다 날씨 체크
  const [showEndVoltageModal, setShowEndVoltageModal] = useState(false);
  const [pendingRideData, setPendingRideData] = useState<any>(null);
  
  // AI Ride Analysis
  const [showAnalysisModal, setShowAnalysisModal] = useState(false);
  const [rideAnalysis, setRideAnalysis] = useState<RideAnalysis | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  
  // Prevent duplicate saves
  const [isSaving, setIsSaving] = useState(false);
  const isSavingRef = useRef(false);
  const [analysisRideStats, setAnalysisRideStats] = useState<any>(null);
  const analyzeRide = trpc.rides.analyzeRide.useMutation();
  
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

  const googleMapRef = useRef<GoogleRideMapRef>(null);
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
  const durationRef = useRef(0);
  const voiceSettingsRef = useRef<VoiceSettings | null>(null);
  const isBackgroundEnabledRef = useRef(false);
  
  // 세션 자동 복구 관련
  const backupIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const rideIdRef = useRef<string>(generateId());
  const [isRecoveredSession, setIsRecoveredSession] = useState(false);

  // 백그라운드 시간 보정 관련
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const backgroundEnteredAtRef = useRef<number | null>(null);
  const totalPausedTimeRef = useRef<number>(0); // 총 일시정지 누적 시간 (초)
  const pauseStartedAtRef = useRef<number | null>(null); // 일시정지 시작 시점 (ms timestamp)

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

  // isAutoPaused 상태를 ref에도 동기화 + 일시정지 시간 추적
  useEffect(() => {
    isAutoPausedRef.current = isAutoPaused;
    if (isAutoPaused) {
      // 일시정지 시작 시점 기록
      if (!pauseStartedAtRef.current) {
        pauseStartedAtRef.current = Date.now();
      }
    } else {
      // 일시정지 해제 시 누적 시간 추가
      if (pauseStartedAtRef.current) {
        const pausedSeconds = Math.floor((Date.now() - pauseStartedAtRef.current) / 1000);
        totalPausedTimeRef.current += pausedSeconds;
        pauseStartedAtRef.current = null;
      }
    }
  }, [isAutoPaused]);

  // 수동 일시정지 시간 추적
  useEffect(() => {
    if (!isRunning) {
      // 수동 일시정지 시작
      if (!pauseStartedAtRef.current) {
        pauseStartedAtRef.current = Date.now();
      }
    } else {
      // 수동 일시정지 해제
      if (pauseStartedAtRef.current) {
        const pausedSeconds = Math.floor((Date.now() - pauseStartedAtRef.current) / 1000);
        totalPausedTimeRef.current += pausedSeconds;
        pauseStartedAtRef.current = null;
      }
    }
  }, [isRunning]);

  // 백그라운드→포그라운드 복귀 시 주행시간 보정
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextAppState: AppStateStatus) => {
      const prevState = appStateRef.current;
      
      if (prevState === "active" && (nextAppState === "background" || nextAppState === "inactive")) {
        // 백그라운드로 전환
        backgroundEnteredAtRef.current = Date.now();
        console.log("[Riding] App went to background at:", new Date().toISOString());
      }
      
      if ((prevState === "background" || prevState === "inactive") && nextAppState === "active") {
        // 포그라운드로 복귀
        console.log("[Riding] App returned to foreground");
        
        // 실제 경과 시간 기반으로 duration 보정
        const now = Date.now();
        const startMs = startTimeRef.current.getTime();
        const totalElapsedSeconds = Math.floor((now - startMs) / 1000);
        
        // 현재 일시정지 중이면 현재까지의 일시정지 시간도 포함
        let currentPausedTime = totalPausedTimeRef.current;
        if (pauseStartedAtRef.current) {
          currentPausedTime += Math.floor((now - pauseStartedAtRef.current) / 1000);
        }
        
        // 주행시간 = 총 경과시간 - 일시정지 시간
        const correctedDuration = Math.max(0, totalElapsedSeconds - currentPausedTime);
        
        console.log(`[Riding] Time correction: elapsed=${totalElapsedSeconds}s, paused=${currentPausedTime}s, corrected=${correctedDuration}s, prev duration=${durationRef.current}s`);
        
        // 보정된 시간이 현재 시간보다 크면 업데이트 (시간이 더 지났으므로)
        if (correctedDuration > durationRef.current) {
          setDuration(correctedDuration);
          durationRef.current = correctedDuration;
          
          // 휴식 시간도 보정
          if (currentPausedTime > 0) {
            setRestTime(currentPausedTime);
          }
        }
        
        backgroundEnteredAtRef.current = null;
      }
      
      appStateRef.current = nextAppState;
    });
    
    return () => {
      subscription.remove();
    };
  }, []);

  // Load selected scooter and start voltage on mount
  useEffect(() => {
    getSelectedScooter().then(setSelectedScooter);
    getStartVoltage().then((data) => {
      if (data) {
        setStartVoltage({ voltage: data.voltage, soc: data.soc });
        console.log("[Riding] Start voltage loaded:", data.voltage, "V, SOC:", data.soc, "%");
      }
    });
  }, []);

  // Parse groupId from params
  useEffect(() => {
    console.log("[Riding] params.groupId:", params.groupId);
    if (params.groupId) {
      const id = parseInt(params.groupId, 10);
      console.log("[Riding] Parsed groupId:", id);
      if (!isNaN(id)) {
        setGroupId(id);
        groupIdRef.current = id; // ref도 즉시 업데이트
        console.log("[Riding] Group riding mode enabled, groupId:", id);
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
      
      // Voice announcement for navigation start
      if (params.destinationName) {
        announceNavigationStarted(params.destinationName);
      }
    }
  }, [params.withNavigation, params.destinationName, params.destinationLat, params.destinationLng, params.routePolyline, params.routeSteps]);

  // Track previous group members for detecting ride end
  const previousMembersRef = useRef<Map<number, boolean>>(new Map());
  const rideEndAlertedRef = useRef<Set<number>>(new Set());

  // Update group members when data changes and detect ride end
  useEffect(() => {
    if (groupMembersData) {
      // 자기 자신을 제외한 그룹원 목록
      const currentUserId = user?.id;
      const otherMembers = groupMembersData.filter(m => m.userId !== currentUserId);
      
      console.log("[Riding] Group members data received:", groupMembersData.length, "members, excluding self:", otherMembers.length);
      otherMembers.forEach(m => {
        console.log(`[Riding] Member ${m.userId}: lat=${m.latitude}, lng=${m.longitude}, isRiding=${m.isRiding}`);
      });
      // 그룹원 주행 종료 감지 (자기 자신 제외)
      otherMembers.forEach(member => {
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
      
      // 자기 자신을 제외한 그룹원만 지도에 표시
      setGroupMembers(otherMembers.map(m => ({
        userId: m.userId,
        name: m.name,
        profileImage: m.profileImageUrl || null,
        profileColor: (m as any).profileColor || null,
        latitude: m.latitude,
        longitude: m.longitude,
        distance: m.distance,
        currentSpeed: m.currentSpeed,
        isRiding: m.isRiding,
        lastUpdate: m.lastUpdate ? new Date(m.lastUpdate) : null,
      })));
    }
  }, [groupMembersData, user?.id]);

  // Check for distant group members and alert (WebSocket 기반 실시간 위치로 정확도 향상)
  // 자기 자신은 이미 groupMembers에서 제외되어 있음
  const distantMemberAlertedRef = useRef<Set<number>>(new Set());
  const lastDistantAlertTimeRef = useRef<Map<number, number>>(new Map());
  const consecutiveDistantCountRef = useRef<Map<number, number>>(new Map());
  
  useEffect(() => {
    // WebSocket 연결 시에만 알림 활성화 (실시간 데이터로 정확도 보장)
    if (!groupId || !currentLocation || groupMembers.length === 0 || !wsConnected) return;

    const DISTANCE_THRESHOLD_METERS = 3000; // 3km 이상 멀어지면 알림
    const MAX_REASONABLE_DISTANCE_METERS = 50000; // 50km 이상은 GPS 오류로 간주
    const ALERT_COOLDOWN_MS = 60000; // 1분 쿨다운
    const CONSECUTIVE_THRESHOLD = 3; // 3회 연속 감지 시 알림
    const now = Date.now();
    
    groupMembers.forEach(member => {
      if (!member.latitude || !member.longitude) {
        console.log(`[GroupRiding] Skipping member ${member.name}: missing location data`);
        return;
      }
      
      const distanceToMember = calculateDistance(
        currentLocation.latitude,
        currentLocation.longitude,
        member.latitude,
        member.longitude
      ) * 1000; // km to meters
      
      // GPS 오류로 인한 비정상 거리 필터링
      if (distanceToMember > MAX_REASONABLE_DISTANCE_METERS) {
        console.log(`[GroupRiding] Ignoring unreasonable distance: ${(distanceToMember / 1000).toFixed(1)}km for ${member.name}`);
        return;
      }
      
      if (distanceToMember > DISTANCE_THRESHOLD_METERS) {
        const count = (consecutiveDistantCountRef.current.get(member.userId) || 0) + 1;
        consecutiveDistantCountRef.current.set(member.userId, count);
        
        // 3회 연속 감지 시에만 알림 (일시적 GPS 튜는 현상 방지)
        if (count >= CONSECUTIVE_THRESHOLD) {
          const lastAlertTime = lastDistantAlertTimeRef.current.get(member.userId) || 0;
          
          if (now - lastAlertTime > ALERT_COOLDOWN_MS) {
            lastDistantAlertTimeRef.current.set(member.userId, now);
            console.log(`[GroupRiding] Alert: ${member.name} is ${(distanceToMember / 1000).toFixed(1)}km away`);
            Alert.alert(
              "팀원이 멀어졌습니다",
              `${member.name || '그룹원'}님이 ${(distanceToMember / 1000).toFixed(1)}km 떨어져 있습니다.`,
              [{ text: "확인" }]
            );
            if (Platform.OS !== "web") {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            }
          }
        }
      } else {
        // 거리가 임계값 이하면 카운터 리셋
        consecutiveDistantCountRef.current.set(member.userId, 0);
        distantMemberAlertedRef.current.delete(member.userId);
      }
    });
  }, [groupId, currentLocation, groupMembers, wsConnected]);
  
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

  // 세션 복구 확인 및 초기화
  // 저장 중이거나 분석 모달이 표시 중일 때 복구 팝업 방지용 ref
  const isProcessingRef = useRef(false);
  
  useEffect(() => {
    const checkAndInitialize = async () => {
      // 저장 중이거나 분석 모달이 표시 중이면 복구 팝업 표시 안 함
      if (isSavingRef.current || isProcessingRef.current) {
        console.log("[Riding] Skipping recovery check - save or analysis in progress");
        return;
      }
      
      // 복구 가능한 세션이 있는지 확인
      const hasRecoverable = await hasRecoverableSession();
      
      if (hasRecoverable) {
        const summary = await getRecoverableSessionSummary();
        if (summary) {
          const durationMin = Math.floor(summary.duration / 60);
          const distanceKm = (summary.distance / 1000).toFixed(2);
          
          Alert.alert(
            "이전 주행 복구",
            `이전에 중단된 주행 기록이 있습니다.\n\n주행 시간: ${durationMin}분\n주행 거리: ${distanceKm}km\nGPS 포인트: ${summary.pointsCount}개\n\n복구하시겠습니까?`,
            [
              {
                text: "새로 시작",
                style: "destructive",
                onPress: async () => {
                  await clearRideSessionBackup();
                  startTimeRef.current = new Date();
                  initializeGps();
                  startSessionBackup();
                },
              },
              {
                text: "복구하기",
                onPress: async () => {
                  await recoverSession();
                },
              },
            ]
          );
          return;
        }
      }
      
      // 복구할 세션이 없으면 새로 시작
      startTimeRef.current = new Date();
      initializeGps();
      startSessionBackup();
    };
    
    checkAndInitialize();

    return () => {
      stopLocationTracking();
      stopBackupInterval(backupIntervalRef.current);
      if (Platform.OS !== "web") {
        stopBackgroundLocationTracking();
      }
    };
  }, []);
  
  // 세션 복구 함수
  const recoverSession = async () => {
    const backup = await loadRideSessionBackup();
    if (!backup) {
      startTimeRef.current = new Date();
      initializeGps();
      startSessionBackup();
      return;
    }
    
    // 복구된 데이터로 상태 초기화
    rideIdRef.current = backup.id;
    startTimeRef.current = new Date(backup.startTime);
    setDuration(backup.duration);
    setRestTime(backup.restTime);
    setDistance(backup.distance);
    setMaxSpeed(backup.maxSpeed);
    setGpsPoints(backup.gpsPoints);
    gpsPointsRef.current = backup.gpsPoints;
    setIsRunning(backup.isRunning);
    setIsRecoveredSession(true);
    
    if (backup.scooter) {
      setSelectedScooter(backup.scooter as SelectedScooter);
    }
    if (backup.startVoltage) {
      setStartVoltage({ voltage: backup.startVoltage, soc: 0 });
    }
    if (backup.weatherInfo) {
      setWeatherInfo(backup.weatherInfo);
    }
    if (backup.groupId) {
      setGroupId(backup.groupId);
      groupIdRef.current = backup.groupId;
    }
    if (backup.withNavigation && backup.destinationName && backup.destinationLat && backup.destinationLng) {
      setHasNavigation(true);
      setNavigationDestination({
        name: backup.destinationName,
        lat: backup.destinationLat,
        lng: backup.destinationLng,
      });
    }
    
    // ref 동기화
    distanceRef.current = backup.distance;
    durationRef.current = backup.duration;
    
    // GPS 초기화 및 백업 시작
    initializeGps();
    startSessionBackup();
    
    Alert.alert("복구 완료", "이전 주행 기록이 복구되었습니다.");
  };
  
  // 세션 백업 시작
  const startSessionBackup = () => {
    backupIntervalRef.current = startBackupInterval(() => ({
      id: rideIdRef.current,
      startTime: startTimeRef.current.toISOString(),
      lastUpdateTime: new Date().toISOString(),
      isRunning: isRunningRef.current,
      isPaused: isAutoPausedRef.current,
      distance: distanceRef.current,
      duration: durationRef.current,
      restTime,
      maxSpeed,
      gpsPoints: gpsPointsRef.current,
      scooter: selectedScooter,
      startVoltage: startVoltage?.voltage ?? null,
      weatherInfo: weatherInfo ? {
        temperature: weatherInfo.temperature ?? 0,
        humidity: weatherInfo.humidity ?? 0,
        windSpeed: weatherInfo.windSpeed ?? 0,
        windDirection: weatherInfo.windDirection ?? 0,
        precipitationType: weatherInfo.precipitationType,
        weatherCondition: weatherInfo.weatherCondition,
      } : null,
      groupId: groupIdRef.current,
      withNavigation: hasNavigation,
      destinationName: navigationDestination?.name ?? null,
      destinationLat: navigationDestination?.lat ?? null,
      destinationLng: navigationDestination?.lng ?? null,
    }));
  };

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
          durationRef.current = newDuration; // ref도 동기화
          return newDuration;
        });
      } else if (isAutoPausedRef.current || !isRunningRef.current) {
        // 자동 일시정지 또는 수동 일시정지 중일 때 휴식 시간 카운트
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

  // 이전 좌표 기반 속도 계산 (GPS speed가 null일 때 fallback)
  const lastLocationForSpeedRef = useRef<{ latitude: number; longitude: number; timestamp: number } | null>(null);

  const calculateSpeedFromDistance = (latitude: number, longitude: number, timestamp: number): number => {
    const prev = lastLocationForSpeedRef.current;
    if (!prev) {
      lastLocationForSpeedRef.current = { latitude, longitude, timestamp };
      return 0;
    }
    const timeDiffSec = (timestamp - prev.timestamp) / 1000;
    if (timeDiffSec <= 0.1) return 0; // 너무 짧은 시간 간격 무시
    const dist = calculateDistance(prev.latitude, prev.longitude, latitude, longitude);
    lastLocationForSpeedRef.current = { latitude, longitude, timestamp };
    const speedMs = dist / timeDiffSec;
    return msToKmh(speedMs);
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
    // 전체 함수를 try-catch로 감싸서 예상치 못한 에러로 인한 크래시 방지
    try {
      if (!isRunningRef.current) return;

      const { latitude, longitude, altitude, speed, accuracy: locAccuracy } = location.coords;
      const timestamp = location.timestamp;

      // 유효하지 않은 좌표 필터링
      if (!latitude || !longitude || !isFinite(latitude) || !isFinite(longitude)) {
        console.log("[Riding] Invalid coordinates received, skipping");
        return;
      }

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

    // GPS speed가 null이면 좌표 간 거리/시간으로 속도 계산 (fallback)
    let rawSpeedKmh: number;
    if (speed !== null && speed >= 0) {
      rawSpeedKmh = msToKmh(speed);
      // 거리 기반 속도도 업데이트 (다음 fallback을 위해)
      calculateSpeedFromDistance(latitude, longitude, timestamp);
    } else {
      // GPS speed가 null인 경우 - 좌표 간 거리로 속도 추정
      rawSpeedKmh = calculateSpeedFromDistance(latitude, longitude, timestamp);
    }
    const displaySpeed = smoothSpeed(rawSpeedKmh);
    setCurrentSpeed(displaySpeed);

    // 그룹 라이딩 위치 업데이트 - WebSocket 우선, HTTP fallback
    try {
      const currentGroupId = groupIdRef.current;
      if (currentGroupId) {
        const locationData = {
          latitude,
          longitude,
          distance: distanceRef.current,
          duration: durationRef.current,
          speed: displaySpeed,
          isRiding: true,
        };
        
        // WebSocket이 연결되어 있으면 WebSocket으로 전송 (실시간)
        if (wsConnected) {
          try {
            wsSendLocation(locationData);
          } catch (wsError) {
            console.log("[Riding] WebSocket send failed (non-critical):", wsError);
          }
        } else {
          // WebSocket 연결 안되면 HTTP fallback
          updateGroupLocation.mutate({
            groupId: currentGroupId,
            ...locationData,
            currentSpeed: displaySpeed,
          }, {
            onError: (error) => {
              console.log("[Riding] Failed to update group location (non-critical):", error);
            },
          });
        }
      }
    } catch (groupUpdateError) {
      console.log("[Riding] Group location update error (non-critical):", groupUpdateError);
    }

    // 자동 일시정지 로직: 속도가 임계값 이하면 정지 카운터 증가
    // isAutoPausedRef.current를 사용하여 클로저 문제 해결
    if (displaySpeed < AUTO_PAUSE_SPEED_THRESHOLD) {
      stationaryCountRef.current += 1;
      if (stationaryCountRef.current >= AUTO_PAUSE_DELAY_SECONDS && !isAutoPausedRef.current) {
        setIsAutoPaused(true);
        isAutoPausedRef.current = true; // ref도 즉시 업데이트
        // Haptics 안전하게 호출
        if (Platform.OS !== "web") {
          try {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          } catch (e) {
            console.log("[Riding] Haptics error (non-critical):", e);
          }
        }
      }
    } else {
      // 움직이면 카운터 리셋 및 자동 일시정지 해제
      stationaryCountRef.current = 0;
      if (isAutoPausedRef.current) {
        setIsAutoPaused(false);
        isAutoPausedRef.current = false; // ref도 즉시 업데이트
        // Haptics 안전하게 호출
        if (Platform.OS !== "web") {
          try {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          } catch (e) {
            console.log("[Riding] Haptics error (non-critical):", e);
          }
        }
      }
    }

    const validation = validateGpsPoint(gpsPoint, lastValidPointRef.current, lastBearingRef.current);

    // 주행 라인 표시: validation 결과와 무관하게 이동 중이면 경로에 추가
    // (validation은 거리/속도 계산의 정확도를 위한 것이고, 라인 표시는 별도로 처리)
    const isMoving = rawSpeedKmh >= GPS_CONSTANTS.MIN_SPEED_THRESHOLD || displaySpeed >= GPS_CONSTANTS.MIN_SPEED_THRESHOLD;
    const hasMinAccuracy = locAccuracy === null || locAccuracy <= GPS_CONSTANTS.MIN_ACCURACY_THRESHOLD;
    
    if (isMoving && hasMinAccuracy) {
      // 이동 중이고 GPS 정확도가 충분하면 경로 포인트에 추가 (라인 표시용)
      gpsPointsRef.current.push(gpsPoint);
      
      // 메모리 최적화: GPS 포인트가 너무 많으면 다운샘플링
      const MAX_GPS_POINTS = 3600;
      const DOWNSAMPLE_THRESHOLD = 3000;
      
      if (gpsPointsRef.current.length > DOWNSAMPLE_THRESHOLD) {
        const downsampled = gpsPointsRef.current.filter((_, index) => 
          index === 0 || 
          index === gpsPointsRef.current.length - 1 || 
          index % 2 === 0
        );
        gpsPointsRef.current = downsampled;
      }
      
      if (gpsPointsRef.current.length > MAX_GPS_POINTS) {
        const first100 = gpsPointsRef.current.slice(0, 100);
        const last100 = gpsPointsRef.current.slice(-100);
        const middle = gpsPointsRef.current.slice(100, -100);
        const middleDownsampled = middle.filter((_, index) => index % 3 === 0);
        gpsPointsRef.current = [...first100, ...middleDownsampled, ...last100];
      }
      
      // 상태 업데이트 빈도: 5번에 1번 또는 초기 20개까지는 매번 업데이트
      if (gpsPointsRef.current.length % 5 === 0 || gpsPointsRef.current.length < 20) {
        setGpsPoints([...gpsPointsRef.current]);
      }
      setGpsPointCount(gpsPointsRef.current.length);
    } else if (validation.isValid) {
      // 이동 중이 아니지만 validation 통과한 경우에도 추가
      gpsPointsRef.current.push(gpsPoint);
      if (gpsPointsRef.current.length % 5 === 0 || gpsPointsRef.current.length < 20) {
        setGpsPoints([...gpsPointsRef.current]);
      }
      setGpsPointCount(gpsPointsRef.current.length);
    }

    if (validation.isValid) {

      // Update live location for friends to see
      const isStarting = isFirstLocationRef.current;
      
      // Fetch weather info on first valid location (ride start)
      if (isStarting && !weatherInfo) {
        // 비동기 작업을 안전하게 처리 (앱 크래시 방지)
        (async () => {
          try {
            const result = await trpcUtils.weather.getCurrent.fetch({ lat: latitude, lon: longitude });
            if (result?.success && result?.weather) {
              console.log("[Riding] Weather fetched:", result.weather);
              setWeatherInfo({
                temperature: result.weather.temperature ?? null,
                humidity: result.weather.humidity ?? null,
                windSpeed: result.weather.windSpeed ?? null,
                windDirection: result.weather.windDirection ?? null,
                precipitationType: result.weather.precipitationType ?? 0,
                weatherCondition: result.weather.weatherCondition ?? '맑음',
              });
            }
          } catch (err) {
            // 날씨 정보 가져오기 실패해도 주행은 계속
            console.log("[Riding] Weather fetch failed (non-critical):", err);
          }
        })();
      }
      
      isFirstLocationRef.current = false;
      // 실시간 위치 공유 - 실패해도 주행에 영향 없음
      try {
        updateLiveLocation.mutate({
          latitude,
          longitude,
          heading: heading ?? null,
          speed: speed ?? null,
          isRiding: true,
          isStarting,
        }, {
          onError: (error) => {
            console.log("[Riding] Live location update failed (non-critical):", error);
          },
        });
      } catch (liveLocationError) {
        console.log("[Riding] Live location error (non-critical):", liveLocationError);
      }

      // Group location update moved to before validation (line 564)

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

      // 경로별 날씨 변화 체크 (5km마다 또는 30분마다)
      try {
        const currentDistance = distance + (lastValidPointRef.current ? calculateDistance(
          lastValidPointRef.current.latitude,
          lastValidPointRef.current.longitude,
          latitude,
          longitude
        ) : 0);
        const now = Date.now();
        const distanceSinceLastCheck = currentDistance - lastWeatherCheckRef.current.distance;
        const timeSinceLastCheck = now - lastWeatherCheckRef.current.time;
        
        if (distanceSinceLastCheck >= WEATHER_CHECK_DISTANCE_INTERVAL || 
            (timeSinceLastCheck >= WEATHER_CHECK_TIME_INTERVAL && currentDistance > 1000)) {
          // 날씨 체크포인트 추가
          lastWeatherCheckRef.current = { distance: currentDistance, time: now };
          
          // 비동기 날씨 체크 - 실패해도 주행에 영향 없음
          (async () => {
            try {
              const result = await trpcUtils.weather.getCurrent.fetch({ lat: latitude, lon: longitude });
              if (result?.success && result?.weather) {
                console.log("[Riding] Weather checkpoint at", (currentDistance / 1000).toFixed(1), "km:", result.weather.weatherCondition);
                
                // 날씨 변화 감지 및 알림
                const previousCondition = weatherInfo?.weatherCondition || weatherChanges[weatherChanges.length - 1]?.weatherCondition;
                const newCondition = result.weather.weatherCondition;
                
                if (previousCondition && newCondition !== previousCondition) {
                  // 날씨가 변했을 때 알림 (안전하게 호출)
                  try {
                    notifyWeatherChange(
                      previousCondition,
                      newCondition,
                      result.weather.temperature ?? undefined
                    );
                  } catch (e) {
                    console.log("[Riding] Weather change notification failed:", e);
                  }
                  console.log("[Riding] Weather changed:", previousCondition, "->", newCondition);
                }
                
                // 경고 알림 (안전하게 호출)
                try {
                  // 강풍 경고 (10m/s 이상)
                  if (result.weather.windSpeed && result.weather.windSpeed >= 10) {
                    notifyWeatherWarning("wind", result.weather.windSpeed);
                  }
                  
                  // 한파 경고 (-10도 이하)
                  if (result.weather.temperature && result.weather.temperature <= -10) {
                    notifyWeatherWarning("cold", result.weather.temperature);
                  }
                  
                  // 폭염 경고 (35도 이상)
                  if (result.weather.temperature && result.weather.temperature >= 35) {
                    notifyWeatherWarning("heat", result.weather.temperature);
                  }
                } catch (e) {
                  console.log("[Riding] Weather warning notification failed:", e);
                }
                
                setWeatherChanges((prev) => [
                  ...prev,
                  {
                    timestamp: new Date().toISOString(),
                    latitude,
                    longitude,
                    distanceFromStart: currentDistance,
                    temperature: result.weather.temperature ?? undefined,
                    humidity: result.weather.humidity ?? undefined,
                    windSpeed: result.weather.windSpeed ?? undefined,
                    weatherCondition: result.weather.weatherCondition,
                  },
                ]);
              }
            } catch (err) {
              console.log("[Riding] Weather checkpoint fetch failed (non-critical):", err);
            }
          })();
        }
      } catch (weatherCheckError) {
        console.log("[Riding] Weather check calculation error (non-critical):", weatherCheckError);
      }

      // Update navigation step if navigation is active
      if (hasNavigation && navigationRoute.length > 0) {
        updateNavigationProgress(latitude, longitude);
      }
    }
    } catch (locationUpdateError) {
      // 위치 업데이트 중 에러 발생 시 로그만 남기고 계속 진행
      console.error("[Riding] Location update error (recovered):", locationUpdateError);
    }
  };

  // Track route deviation state
  const lastRerouteTimeRef = useRef<number>(0);
  const REROUTE_COOLDOWN = 30000; // 30 seconds cooldown between reroutes
  const ROUTE_DEVIATION_THRESHOLD = 0.1; // 100 meters in km

  // Calculate minimum distance from current position to route
  const getDistanceToRoute = (lat: number, lng: number): number => {
    if (navigationRoute.length === 0) return 0;
    
    let minDistance = Infinity;
    for (const point of navigationRoute) {
      const dist = calculateDistance(lat, lng, point.latitude, point.longitude);
      if (dist < minDistance) {
        minDistance = dist;
      }
    }
    return minDistance;
  };

  // Recalculate route from current position
  const recalculateRoute = async (lat: number, lng: number) => {
    if (!navigationDestination) return;
    
    const now = Date.now();
    if (now - lastRerouteTimeRef.current < REROUTE_COOLDOWN) {
      return; // Still in cooldown
    }
    lastRerouteTimeRef.current = now;
    
    // Voice announcement for route deviation
    announceRouteDeviation();
    
    if (Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }
    
    try {
      const GOOGLE_MAPS_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || "";
      const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${lat},${lng}&destination=${navigationDestination.lat},${navigationDestination.lng}&mode=bicycling&language=ko&key=${GOOGLE_MAPS_API_KEY}`;
      
      const response = await fetch(url);
      const data = await response.json();
      
      if (data.status === "OK" && data.routes.length > 0) {
        const route = data.routes[0];
        const leg = route.legs[0];
        
        // Decode new polyline
        const newPoints = decodePolylineForReroute(route.overview_polyline.points);
        setNavigationRoute(newPoints);
        
        // Update GPX route for map display
        setGpxRoute({
          name: navigationDestination.name,
          points: newPoints.map(p => ({
            latitude: p.latitude,
            longitude: p.longitude,
          })),
          totalDistance: leg.distance.value / 1000,
          estimatedDuration: leg.duration.value,
        });
        
        // Update steps
        const newSteps = leg.steps.map((step: any) => ({
          instruction: step.html_instructions.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim(),
          distance: step.distance.text,
          duration: step.duration.text,
          maneuver: step.maneuver,
        }));
        setNavigationSteps(newSteps);
        setCurrentStepIndex(0);
        
        // Announce first step of new route
        if (newSteps.length > 0) {
          announceNavigationStep(newSteps[0]);
        }
      }
    } catch (error) {
      console.error("Failed to recalculate route:", error);
    }
  };

  // Decode polyline helper for reroute
  const decodePolylineForReroute = (encoded: string): GpsPoint[] => {
    const points: GpsPoint[] = [];
    let index = 0;
    let lat = 0;
    let lng = 0;

    while (index < encoded.length) {
      let b;
      let shift = 0;
      let result = 0;

      do {
        b = encoded.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);

      const dlat = result & 1 ? ~(result >> 1) : result >> 1;
      lat += dlat;

      shift = 0;
      result = 0;

      do {
        b = encoded.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);

      const dlng = result & 1 ? ~(result >> 1) : result >> 1;
      lng += dlng;

      points.push({
        latitude: lat / 1e5,
        longitude: lng / 1e5,
        timestamp: Date.now(),
        altitude: null,
        speed: null,
        accuracy: null,
      });
    }

    return points;
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
      // Voice announcement for arrival
      announceArrival(navigationDestination.name);
      Alert.alert(
        "목적지 도착",
        `${navigationDestination.name}에 도착했습니다!`,
        [{ text: "확인" }]
      );
      setHasNavigation(false);
      return;
    }

    // Check for route deviation
    const distanceToRoute = getDistanceToRoute(lat, lng);
    if (distanceToRoute > ROUTE_DEVIATION_THRESHOLD) {
      // User has deviated from route, recalculate
      recalculateRoute(lat, lng);
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
        // Voice announcement for next step
        const nextStep = navigationSteps[newStepIndex];
        if (nextStep) {
          announceNavigationStep(nextStep);
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

  // Function to save ride record (called after voltage input or skip)
  const saveRideRecord = async (rideData: any, endVoltage?: number, endSoc?: number) => {
    // Prevent duplicate saves
    if (isSavingRef.current) {
      console.log("[Riding] Save already in progress, skipping duplicate call");
      return;
    }
    isSavingRef.current = true;
    isProcessingRef.current = true; // 복구 팝업 방지
    setIsSaving(true);
    
    try {
      // Add voltage data and weather info if available
      const recordWithVoltage = {
        ...rideData,
        voltageStart: startVoltage?.voltage,
        socStart: startVoltage?.soc,
        voltageEnd: endVoltage,
        socEnd: endSoc,
        // Weather info from ride start
        temperature: weatherInfo?.temperature ?? undefined,
        humidity: weatherInfo?.humidity ?? undefined,
        windSpeed: weatherInfo?.windSpeed ?? undefined,
        weatherCondition: weatherInfo?.weatherCondition ?? undefined,
        // 경로별 날씨 변화 (장거리 주행 시)
        weatherChanges: weatherChanges.length > 0 ? weatherChanges : undefined,
      };

      console.log("[Riding] Saving record with voltage data:", {
        voltageStart: startVoltage?.voltage,
        voltageEnd: endVoltage,
      });

      // Save to local storage with error handling
      try {
        await saveRidingRecord(recordWithVoltage);
        console.log("[Riding] Record saved to local storage");
        
        // 주행 기록 저장 성공 후 세션 백업 삭제 (버그 수정: 정상 저장 후에도 복구 팝업이 표시되는 문제)
        await clearRideSessionBackup();
        console.log("[Riding] Session backup cleared after successful save");
      } catch (saveError) {
        console.error("[Riding] Failed to save record (with GPS):", saveError);
        
        // 장거리 주행 시 GPS 데이터가 너무 커서 저장 실패할 수 있음
        // GPS 포인트 없이 재시도
        try {
          console.log("[Riding] Retrying save without GPS points...");
          const recordWithoutGps = { ...recordWithVoltage };
          delete recordWithoutGps.gpsPoints;
          recordWithoutGps.gpsPoints = [];
          await saveRidingRecord(recordWithoutGps);
          console.log("[Riding] Record saved without GPS points");
          await clearRideSessionBackup();
        } catch (retryError) {
          console.error("[Riding] Failed to save record even without GPS:", retryError);
          Alert.alert(
            "저장 오류",
            "주행 기록을 저장하는 중 오류가 발생했습니다. 다시 시도해주세요.",
            [{ text: "확인" }]
          );
          return;
        }
      }

      // Voice announcement for ride completion
      try {
        await announceEnd(rideData.distance, rideData.duration, rideData.avgSpeed);
      } catch (e) {
        console.log("[Riding] Voice announcement error:", e);
      }

      // Send ride completion notification
      try {
        await notifyRideCompleted(rideData.distance, rideData.duration, rideData.avgSpeed);
      } catch (e) {
        console.log("[Riding] Notification error:", e);
      }

      // Sync to server for ranking - blocking with verification
      try {
        console.log("[Riding] Starting server sync for record:", rideData.id);
        
        // GPS 데이터 압축 적용 (저장 비용 절감)
        let compressedGpsPointsJson: string | undefined;
        if (rideData.gpsPoints?.length > 0) {
          const { points: compressedPoints, stats } = compressGpsData(
            rideData.gpsPoints,
            rideData.distance
          );
          console.log(`[Riding] GPS compressed: ${stats.originalCount} → ${stats.compressedCount} points (${stats.compressionRatio}% saved)`);
          compressedGpsPointsJson = JSON.stringify(compressedPoints);
          
          // 장거리 주행 시 GPS JSON이 너무 크면 추가 다운샘플링 (5MB 제한)
          const MAX_GPS_JSON_SIZE = 5 * 1024 * 1024; // 5MB
          if (compressedGpsPointsJson.length > MAX_GPS_JSON_SIZE) {
            console.log(`[Riding] GPS JSON too large (${(compressedGpsPointsJson.length / 1024 / 1024).toFixed(1)}MB), further downsampling...`);
            const ratio = Math.ceil(compressedPoints.length / 1000);
            const furtherReduced = compressedPoints.filter((_: any, i: number) => 
              i === 0 || i === compressedPoints.length - 1 || i % ratio === 0
            );
            compressedGpsPointsJson = JSON.stringify(furtherReduced);
            console.log(`[Riding] Further reduced to ${furtherReduced.length} points (${(compressedGpsPointsJson.length / 1024).toFixed(0)}KB)`);
          }
        }
        
        const syncResult = await syncToServer.mutateAsync({
          recordId: rideData.id,
          date: rideData.date,
          duration: Math.round(rideData.duration),
          distance: Math.round(rideData.distance),
          avgSpeed: rideData.avgSpeed,
          maxSpeed: rideData.maxSpeed,
          startTime: rideData.startTime,
          endTime: rideData.endTime,
          gpsPointsJson: compressedGpsPointsJson,
          // Include scooter ID for stats update
          scooterId: rideData.scooterId,
          // Include voltage data for server
          voltageStart: startVoltage?.voltage ? String(startVoltage.voltage) : undefined,
          voltageEnd: endVoltage ? String(endVoltage) : undefined,
          socStart: startVoltage?.soc ? String(startVoltage.soc) : undefined,
          socEnd: endSoc ? String(endSoc) : undefined,
          // Include weather data from ride start
          temperature: weatherInfo?.temperature !== null ? String(weatherInfo?.temperature) : undefined,
          humidity: weatherInfo?.humidity ?? undefined,
          windSpeed: weatherInfo?.windSpeed ?? undefined,
          windDirection: weatherInfo?.windDirection ?? undefined,
          precipitationType: weatherInfo?.precipitationType ?? undefined,
          weatherCondition: weatherInfo?.weatherCondition ?? undefined,
        });
        console.log("[Riding] Server sync result:", syncResult);
        
        // Check and award badges based on cumulative stats
        try {
          await trpcUtils.friends.getMyStats.invalidate();
          const statsResult = await trpcUtils.friends.getMyStats.fetch();
          if (statsResult) {
            const badgeResult = await checkBadgesMutation.mutateAsync({
              totalDistance: statsResult.totalDistance || 0,
              totalRides: statsResult.totalRides || 0,
            });
            if (badgeResult.newBadges && badgeResult.newBadges.length > 0) {
              console.log("[Riding] New badges earned:", badgeResult.newBadges);
              // Show badge earned notification
              for (const badge of badgeResult.newBadges) {
                Alert.alert(
                  "🏆 뱃지 획득!",
                  `"${badge.name}" 뱃지를 획득했습니다!\n${badge.description}`,
                  [{ text: "확인" }]
                );
              }
            }
          }
        } catch (badgeError) {
          console.log("[Riding] Badge check after ride:", badgeError);
        }
        
        // Invalidate ranking queries to reflect new data
        await trpcUtils.ranking.getWeekly.invalidate();
        await trpcUtils.ranking.getMonthly.invalidate();
        await trpcUtils.rides.list.invalidate();
        await trpcUtils.badges.mine.invalidate();
      } catch (e) {
        console.error("[Riding] Server sync error:", e);
        Alert.alert(
          "동기화 알림",
          "주행 기록이 로컬에 저장되었습니다. 서버 동기화는 다음 접속 시 자동으로 시도됩니다.",
          [{ text: "확인" }]
        );
      }

      // Clear start voltage data
      await clearStartVoltage();

      // Trigger AI analysis (non-blocking)
      try {
        setAnalysisRideStats({
          distance: rideData.distance,
          duration: rideData.duration,
          avgSpeed: rideData.avgSpeed,
          maxSpeed: rideData.maxSpeed,
          voltageStart: startVoltage?.voltage,
          voltageEnd: endVoltage,
          socStart: startVoltage?.soc,
          socEnd: endSoc,
        });
        setShowAnalysisModal(true);
        setIsAnalyzing(true);
        
        // AI 분석 적합성 체크 (비용 절감)
        const eligibility = checkAnalysisEligibility({
          distance: rideData.distance,
          duration: rideData.duration,
          avgSpeed: rideData.avgSpeed,
          maxSpeed: rideData.maxSpeed,
          gpsPointsCount: rideData.gpsPoints?.length || 0,
        });
        
        if (!eligibility.eligible) {
          // 짧은 주행 등은 AI 호출 건너뛰기 (비용 절감)
          console.log(`[Riding] AI analysis skipped: ${eligibility.reason}`);
          recordAnalysisRequest(true);
          const defaultAnalysis = generateDefaultAnalysis(
            {
              distance: rideData.distance,
              duration: rideData.duration,
              avgSpeed: rideData.avgSpeed,
              maxSpeed: rideData.maxSpeed,
            },
            eligibility.skipReason || 'too_short'
          );
          setRideAnalysis(defaultAnalysis);
          setIsAnalyzing(false);
          return;
        }
        
        recordAnalysisRequest(false);
        
        // Analyze GPS data for advanced metrics
        const rideAnalysis = analyzeRideData(rideData.gpsPoints || []);
        
        const analysisResult = await analyzeRide.mutateAsync({
          distance: rideData.distance,
          duration: rideData.duration,
          avgSpeed: rideData.avgSpeed,
          maxSpeed: rideData.maxSpeed,
          voltageStart: startVoltage?.voltage,
          voltageEnd: endVoltage,
          socStart: startVoltage?.soc,
          socEnd: endSoc,
          scooterId: selectedScooter?.id,
          gpsPointsCount: rideData.gpsPoints?.length || 0,
          // Weather data for AI analysis
          temperature: weatherInfo?.temperature ?? undefined,
          humidity: weatherInfo?.humidity ?? undefined,
          windSpeed: weatherInfo?.windSpeed ?? undefined,
          precipitationType: weatherInfo?.precipitationType ?? undefined,
          weatherCondition: weatherInfo?.weatherCondition ?? undefined,
          // Advanced analysis data
          suddenAccelerations: rideAnalysis?.suddenAccelerations ?? undefined,
          suddenDecelerations: rideAnalysis?.suddenDecelerations ?? undefined,
          stopCount: rideAnalysis?.stopCount ?? undefined,
          elevationGain: rideAnalysis?.elevationGain ?? undefined,
          elevationLoss: rideAnalysis?.elevationLoss ?? undefined,
          maxElevation: rideAnalysis?.maxElevation ?? undefined,
          minElevation: rideAnalysis?.minElevation ?? undefined,
          avgAcceleration: rideAnalysis?.avgAcceleration ?? undefined,
        });
        
        if (analysisResult.success && analysisResult.analysis) {
          setRideAnalysis(analysisResult.analysis);
        }
        setIsAnalyzing(false);
      } catch (e) {
        console.log("[Riding] AI analysis error:", e);
        setIsAnalyzing(false);
      }
    } catch (error) {
      console.error("[Riding] Critical error during save:", error);
      Alert.alert(
        "오류 발생",
        "주행 기록 저장 중 예상치 못한 오류가 발생했습니다.",
        [
          { text: "다시 시도", onPress: () => {
            isSavingRef.current = false;
            setIsSaving(false);
            handleStop();
          } },
          { text: "저장 안함", style: "destructive", onPress: () => {
            isSavingRef.current = false;
            setIsSaving(false);
            router.replace("/(tabs)");
          } },
        ]
      );
    } finally {
      // Reset saving state after completion
      isSavingRef.current = false;
      setIsSaving(false);
    }
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
      clearStartVoltage();
      // 짧은 주행도 세션 백업 삭제 (버그 수정)
      clearRideSessionBackup();
      // Navigate to main tab instead of back (which goes to scooter selection)
      router.replace("/(tabs)");
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
              
              // 총 시간 계산 (startTime ~ endTime)
              const totalElapsedTime = Math.floor((now.getTime() - startTimeRef.current.getTime()) / 1000);
              // 실제 주행 시간 (duration state 사용)
              const actualDuration = duration > 0 ? duration : totalElapsedTime;
              // 휴식 시간 = 총 시간 - 주행 시간
              const actualRestTime = Math.max(0, totalElapsedTime - actualDuration);
              
              const record = {
                id: recordId,
                date: now.toLocaleDateString("ko-KR"),
                duration: actualDuration,
                restTime: actualRestTime > 0 ? actualRestTime : (restTime > 0 ? restTime : undefined),
                totalTime: totalElapsedTime,
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
              
              // Check if scooter has battery info and start voltage was recorded
              if (selectedScooter?.batteryVoltage && startVoltage) {
                // Show end voltage modal
                setPendingRideData(record);
                setShowEndVoltageModal(true);
              } else {
                // No battery info, save directly
                await saveRideRecord(record);
              }
            } catch (error) {
              console.error("[Riding] Critical error during save:", error);
              Alert.alert(
                "오류 발생",
                "주행 기록 저장 중 예상치 못한 오류가 발생했습니다.",
                [
                  { text: "다시 시도", onPress: () => handleStop() },
                  { text: "저장 안함", style: "destructive", onPress: () => router.replace("/(tabs)") },
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
          <View className="flex-row items-center gap-2">
            <PerformanceIndicator
              gpsAccuracy={accuracy}
              gpsPointCount={gpsPointCount}
              isBackgroundEnabled={isBackgroundEnabled}
            />
            <View className="flex-row items-center">
              <View
                className="w-3 h-3 rounded-full mr-2"
                style={{ backgroundColor: getGpsStatusColor() }}
              />
              <Text className="text-gray-400 text-sm">{getGpsStatusText()}</Text>
            </View>
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
                ref={googleMapRef}
                gpsPoints={gpsPoints}
                currentLocation={currentLocation}
                isLive={true}
                showCurrentLocation={false}
                gpxRoute={gpxRoute}
                groupMembers={visibleGroupMembers}
                navigationMode={true} // 주행 중에는 항상 네비게이션 스타일 (진행 방향이 위를 향하도록 지도 회전)
                currentSpeed={currentSpeed} // 속도 기반 자동 줌 레벨 조절
                showRecenterButton={true} // 현재 위치 버튼 표시
                style={{ flex: 1, borderRadius: 0 }}
              />
            ) : (
              <RideMap
                gpsPoints={gpsPoints}
                currentLocation={currentLocation}
                isLive={true}
                showCurrentLocation={false}
                gpxRoute={gpxRoute}
                groupMembers={visibleGroupMembers}
                style={{ flex: 1, borderRadius: 0 }}
              />
            )}
            {/* 속도계 - 중앙 하단 (더 크고 눈에 띄게) */}
            <View style={{
              position: 'absolute',
              bottom: 160,
              left: 0,
              right: 0,
              alignItems: 'center',
            }}>
              <View style={{
                backgroundColor: 'rgba(0, 0, 0, 0.85)',
                borderRadius: 20,
                paddingHorizontal: 32,
                paddingVertical: 16,
                alignItems: 'center',
                minWidth: 160,
                borderWidth: 2,
                borderColor: currentSpeed > 50 ? '#FF6D00' : 'rgba(255, 255, 255, 0.2)',
              }}>
                <Text style={{ 
                  fontSize: 72, 
                  fontWeight: 'bold', 
                  color: currentSpeed > 50 ? '#FF6D00' : '#FFFFFF',
                  lineHeight: 80,
                }}>
                  {currentSpeed.toFixed(0)}
                </Text>
                <Text style={{ fontSize: 18, color: '#AAAAAA', marginTop: -4 }}>km/h</Text>
              </View>
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
            {/* 그룹 라이딩 디버그 정보 - 비활성화 */}
            {/* TODO: 개발 시 필요한 경우 다시 활성화
            {groupId && (
              <View style={{
                position: 'absolute',
                top: 60,
                left: 8,
                backgroundColor: 'rgba(0, 0, 0, 0.8)',
                borderRadius: 8,
                padding: 8,
                maxWidth: 200,
              }}>
                <Text style={{ fontSize: 10, color: '#00FF00', fontWeight: 'bold' }}>
                  그룹 ID: {groupId}
                </Text>
                <Text style={{ fontSize: 10, color: '#FFFFFF' }}>
                  멤버 수: {groupMembers.length}
                </Text>
                <Text style={{ fontSize: 10, color: '#FFFFFF' }}>
                  주행중: {groupMembers.filter(m => m.isRiding).length}
                </Text>
                <Text style={{ fontSize: 10, color: '#FFFFFF' }}>
                  위치있음: {groupMembers.filter(m => m.latitude && m.longitude).length}
                </Text>
                {groupMembers.slice(0, 3).map((m, i) => (
                  <Text key={i} style={{ fontSize: 9, color: '#AAAAAA' }}>
                    {m.name}: {m.isRiding ? '주행중' : '대기'} ({m.latitude?.toFixed(4) || 'null'}, {m.longitude?.toFixed(4) || 'null'})
                  </Text>
                ))}
              </View>
            )}
            */}
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
            {/* 그룹 라이딩 접속자 오버레이 */}
            {groupId && visibleGroupMembers.length > 0 && (
              <GroupMembersOverlay
                members={visibleGroupMembers.map(m => ({
                  id: m.userId,
                  name: m.name,
                  profileImage: m.profileImage,
                  profileColor: m.profileColor ?? undefined,
                  isRiding: m.isRiding,
                  isOnline: isGroupMemberOnline(m),
                  latitude: m.latitude ?? undefined,
                  longitude: m.longitude ?? undefined,
                  speed: m.currentSpeed,
                  distance: m.distance,
                }))}
                currentUserId={user?.id ?? 0}
                onMemberPress={(member) => {
                  if (member.latitude && member.longitude && googleMapRef.current) {
                    googleMapRef.current.focusOnLocation(member.latitude, member.longitude);
                    console.log(`[GroupOverlay] Focus on member ${member.name} at ${member.latitude}, ${member.longitude}`);
                  }
                }}
              />
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

            {/* Weather Riding Tip */}
            {weatherInfo && (
              <View className="mx-4 mb-2">
                <WeatherRidingTipCompact weather={weatherInfo} />
              </View>
            )}
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

      {/* Group Chat Modal (WebSocket-based) */}
      {groupId && showChat && (
        <View className="absolute inset-0 bg-background">
          <GroupChatWS
            groupId={groupId}
            isVisible={showChat}
            onClose={() => setShowChat(false)}
            wsConnected={wsConnected}
            sendChatMessage={wsSendChatMessage}
            currentLocation={currentLocation}
          />
        </View>
      )}

      {/* End Voltage Input Modal */}
      <VoltageInputModal
        visible={showEndVoltageModal}
        scooter={selectedScooter}
        mode="end"
        startVoltage={startVoltage?.voltage}
        rideSummary={pendingRideData ? {
          distance: pendingRideData.distance,
          duration: pendingRideData.duration,
          avgSpeed: pendingRideData.avgSpeed,
        } : undefined}
        onSubmit={async (voltage, soc) => {
          setShowEndVoltageModal(false);
          if (pendingRideData) {
            await saveRideRecord(pendingRideData, voltage, soc);
            setPendingRideData(null);
          }
        }}
        onSkip={async () => {
          setShowEndVoltageModal(false);
          if (pendingRideData) {
            await saveRideRecord(pendingRideData);
            setPendingRideData(null);
          }
        }}
        onCancel={() => {
          setShowEndVoltageModal(false);
          setPendingRideData(null);
        }}
      />

      {/* AI Ride Analysis Modal */}
      {analysisRideStats && (
        <RideAnalysisModal
          visible={showAnalysisModal}
          onClose={async () => {
            // 먼저 모달 상태 초기화
            setShowAnalysisModal(false);
            setRideAnalysis(null);
            setAnalysisRideStats(null);
            
            // 세션 백업 확실히 삭제 (버그 수정: 복구 팝업 방지)
            try {
              await clearRideSessionBackup();
              console.log("[Riding] Session backup cleared on modal close");
            } catch (e) {
              console.error("[Riding] Failed to clear session backup:", e);
            }
            
            // 홈화면으로 이동 (약간의 딜레이로 확실한 전환 보장)
            setTimeout(() => {
              router.replace("/(tabs)");
            }, 100);
          }}
          analysis={rideAnalysis}
          isLoading={isAnalyzing}
          rideStats={analysisRideStats}
        />
      )}
    </ScreenContainer>
  );
}
