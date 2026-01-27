import * as Speech from 'expo-speech';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const VOICE_SETTINGS_KEY = '@scoop_voice_settings';

export type VoiceLanguage = 'ko-KR' | 'en-US';

export interface VoiceSettings {
  enabled: boolean;
  speedAnnouncement: boolean;
  distanceAnnouncement: boolean;
  timeAnnouncement: boolean;
  intervalMinutes: number; // Announcement interval in minutes
  language: VoiceLanguage;
}

const DEFAULT_SETTINGS: VoiceSettings = {
  enabled: false,
  speedAnnouncement: true,
  distanceAnnouncement: true,
  timeAnnouncement: true,
  intervalMinutes: 5,
  language: 'ko-KR',
};

// Language-specific text
const TEXTS = {
  'ko-KR': {
    ridingTime: '주행 시간',
    ridingDistance: '주행 거리',
    currentSpeed: '현재 속도',
    startRiding: '주행을 시작합니다',
    endRiding: '주행이 완료되었습니다',
    total: '총',
    during: '동안 주행했습니다',
    avgSpeed: '평균 속도는',
    hours: '시간',
    minutes: '분',
    seconds: '초',
    kilometers: '킬로미터',
    meters: '미터',
    speedUnit: '시속',
    kmPerHour: '킬로미터',
    // Navigation
    arrivedAt: '목적지에 도착했습니다',
    inDistance: '앞에서',
    turnLeft: '좌회전 하세요',
    turnRight: '우회전 하세요',
    turnSlightLeft: '약간 좌회전 하세요',
    turnSlightRight: '약간 우회전 하세요',
    turnSharpLeft: '급하게 좌회전 하세요',
    turnSharpRight: '급하게 우회전 하세요',
    uTurn: '유턴 하세요',
    roundabout: '회전교차로를 돌아서 진행하세요',
    straight: '직진하세요',
    routeDeviated: '경로를 이탈했습니다. 경로를 재계산합니다',
    navigationStarted: '경로 안내를 시작합니다',
  },
  'en-US': {
    ridingTime: 'Riding time',
    ridingDistance: 'Distance traveled',
    currentSpeed: 'Current speed',
    startRiding: 'Starting ride',
    endRiding: 'Ride completed',
    total: 'Total',
    during: 'traveled in',
    avgSpeed: 'Average speed was',
    hours: 'hours',
    minutes: 'minutes',
    seconds: 'seconds',
    kilometers: 'kilometers',
    meters: 'meters',
    speedUnit: '',
    kmPerHour: 'kilometers per hour',
    // Navigation
    arrivedAt: 'You have arrived at your destination',
    inDistance: 'In',
    turnLeft: 'turn left',
    turnRight: 'turn right',
    turnSlightLeft: 'turn slight left',
    turnSlightRight: 'turn slight right',
    turnSharpLeft: 'turn sharp left',
    turnSharpRight: 'turn sharp right',
    uTurn: 'make a U-turn',
    roundabout: 'enter the roundabout',
    straight: 'continue straight',
    routeDeviated: 'You have left the route. Recalculating',
    navigationStarted: 'Navigation started',
  },
};

let lastAnnouncementTime = 0;

export async function getVoiceSettings(): Promise<VoiceSettings> {
  try {
    const stored = await AsyncStorage.getItem(VOICE_SETTINGS_KEY);
    if (stored) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
    }
  } catch (error) {
    console.error('Failed to load voice settings:', error);
  }
  return DEFAULT_SETTINGS;
}

export async function saveVoiceSettings(settings: VoiceSettings): Promise<void> {
  try {
    await AsyncStorage.setItem(VOICE_SETTINGS_KEY, JSON.stringify(settings));
  } catch (error) {
    console.error('Failed to save voice settings:', error);
  }
}

export function formatDurationForSpeech(seconds: number, language: VoiceLanguage): string {
  const t = TEXTS[language];
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  
  if (language === 'ko-KR') {
    if (hours > 0) {
      return `${hours}${t.hours} ${minutes}${t.minutes}`;
    }
    return `${minutes}${t.minutes}`;
  } else {
    if (hours > 0) {
      return `${hours} ${t.hours} ${minutes} ${t.minutes}`;
    }
    return `${minutes} ${t.minutes}`;
  }
}

export function formatDistanceForSpeech(meters: number, language: VoiceLanguage): string {
  const t = TEXTS[language];
  const km = meters / 1000;
  
  if (km >= 1) {
    if (language === 'ko-KR') {
      return `${km.toFixed(1)}${t.kilometers}`;
    } else {
      return `${km.toFixed(1)} ${t.kilometers}`;
    }
  }
  
  if (language === 'ko-KR') {
    return `${Math.round(meters)}${t.meters}`;
  } else {
    return `${Math.round(meters)} ${t.meters}`;
  }
}

export function formatSpeedForSpeech(speedKmh: number, language: VoiceLanguage): string {
  const t = TEXTS[language];
  
  if (language === 'ko-KR') {
    return `${t.speedUnit} ${Math.round(speedKmh)}${t.kmPerHour}`;
  } else {
    return `${Math.round(speedKmh)} ${t.kmPerHour}`;
  }
}

export async function announceRidingStatus(
  settings: VoiceSettings,
  currentSpeed: number,
  totalDistance: number,
  elapsedTime: number,
  forceAnnounce: boolean = false
): Promise<void> {
  if (!settings.enabled) return;
  
  // Check if web platform (Speech may not work well)
  if (Platform.OS === 'web') {
    console.log('Voice guidance not available on web');
    return;
  }
  
  const now = Date.now();
  const intervalMs = settings.intervalMinutes * 60 * 1000;
  
  // Check if enough time has passed since last announcement
  if (!forceAnnounce && now - lastAnnouncementTime < intervalMs) {
    return;
  }
  
  lastAnnouncementTime = now;
  
  const t = TEXTS[settings.language];
  
  // Build announcement text
  const parts: string[] = [];
  
  if (settings.timeAnnouncement) {
    parts.push(`${t.ridingTime} ${formatDurationForSpeech(elapsedTime, settings.language)}`);
  }
  
  if (settings.distanceAnnouncement) {
    parts.push(`${t.ridingDistance} ${formatDistanceForSpeech(totalDistance, settings.language)}`);
  }
  
  if (settings.speedAnnouncement && currentSpeed > 0) {
    parts.push(`${t.currentSpeed} ${formatSpeedForSpeech(currentSpeed, settings.language)}`);
  }
  
  if (parts.length === 0) return;
  
  const announcement = parts.join('. ');
  
  try {
    // Stop any ongoing speech first
    await Speech.stop();
    
    // Speak the announcement
    Speech.speak(announcement, {
      language: settings.language,
      pitch: 1.0,
      rate: 1.0,
    });
  } catch (error) {
    console.error('Failed to speak announcement:', error);
  }
}

export async function announceStart(): Promise<void> {
  const settings = await getVoiceSettings();
  if (!settings.enabled || Platform.OS === 'web') return;
  
  const t = TEXTS[settings.language];
  
  try {
    Speech.speak(t.startRiding, {
      language: settings.language,
      pitch: 1.0,
      rate: 1.0,
    });
  } catch (error) {
    console.error('Failed to speak start announcement:', error);
  }
}

export async function announceEnd(
  totalDistance: number,
  elapsedTime: number,
  avgSpeed: number
): Promise<void> {
  const settings = await getVoiceSettings();
  if (!settings.enabled || Platform.OS === 'web') return;
  
  const t = TEXTS[settings.language];
  
  let announcement: string;
  if (settings.language === 'ko-KR') {
    announcement = `${t.endRiding}. ${t.total} ${formatDistanceForSpeech(totalDistance, settings.language)}를 ${formatDurationForSpeech(elapsedTime, settings.language)} ${t.during}. ${t.avgSpeed} ${formatSpeedForSpeech(avgSpeed, settings.language)}입니다.`;
  } else {
    announcement = `${t.endRiding}. ${t.total} ${formatDistanceForSpeech(totalDistance, settings.language)} ${t.during} ${formatDurationForSpeech(elapsedTime, settings.language)}. ${t.avgSpeed} ${formatSpeedForSpeech(avgSpeed, settings.language)}.`;
  }
  
  try {
    await Speech.stop();
    Speech.speak(announcement, {
      language: settings.language,
      pitch: 1.0,
      rate: 1.0,
    });
  } catch (error) {
    console.error('Failed to speak end announcement:', error);
  }
}

export function resetAnnouncementTimer(): void {
  lastAnnouncementTime = 0;
}

export async function stopSpeech(): Promise<void> {
  try {
    await Speech.stop();
  } catch (error) {
    console.error('Failed to stop speech:', error);
  }
}

// Get available languages
export function getAvailableLanguages(): { code: VoiceLanguage; name: string }[] {
  return [
    { code: 'ko-KR', name: '한국어' },
    { code: 'en-US', name: 'English' },
  ];
}


// Navigation voice guidance functions
export interface NavigationStep {
  instruction: string;
  distance: string;
  duration: string;
  maneuver?: string;
}

// Get maneuver text for voice announcement
function getManeuverText(maneuver: string | undefined, language: VoiceLanguage): string {
  const t = TEXTS[language];
  
  switch (maneuver) {
    case 'turn-left':
      return t.turnLeft;
    case 'turn-right':
      return t.turnRight;
    case 'turn-slight-left':
      return t.turnSlightLeft;
    case 'turn-slight-right':
      return t.turnSlightRight;
    case 'turn-sharp-left':
      return t.turnSharpLeft;
    case 'turn-sharp-right':
      return t.turnSharpRight;
    case 'uturn-left':
    case 'uturn-right':
      return t.uTurn;
    case 'roundabout-left':
    case 'roundabout-right':
      return t.roundabout;
    case 'straight':
      return t.straight;
    default:
      return t.straight;
  }
}

// Announce navigation step (turn-by-turn)
export async function announceNavigationStep(
  step: NavigationStep,
  distanceToStep?: number // distance in meters to the next turn
): Promise<void> {
  const settings = await getVoiceSettings();
  if (!settings.enabled || Platform.OS === 'web') return;
  
  const t = TEXTS[settings.language];
  
  let announcement: string;
  
  if (distanceToStep !== undefined && distanceToStep > 0) {
    const distanceText = formatDistanceForSpeech(distanceToStep, settings.language);
    const maneuverText = getManeuverText(step.maneuver, settings.language);
    
    if (settings.language === 'ko-KR') {
      announcement = `${distanceText} ${t.inDistance} ${maneuverText}`;
    } else {
      announcement = `${t.inDistance} ${distanceText}, ${maneuverText}`;
    }
  } else {
    // Use the instruction directly if no distance
    announcement = step.instruction;
  }
  
  try {
    await Speech.stop();
    Speech.speak(announcement, {
      language: settings.language,
      pitch: 1.0,
      rate: 1.0,
    });
  } catch (error) {
    console.error('Failed to speak navigation step:', error);
  }
}

// Announce arrival at destination
export async function announceArrival(destinationName?: string): Promise<void> {
  const settings = await getVoiceSettings();
  if (!settings.enabled || Platform.OS === 'web') return;
  
  const t = TEXTS[settings.language];
  
  let announcement: string;
  if (destinationName) {
    if (settings.language === 'ko-KR') {
      announcement = `${destinationName}에 ${t.arrivedAt}`;
    } else {
      announcement = `${t.arrivedAt}. ${destinationName}`;
    }
  } else {
    announcement = t.arrivedAt;
  }
  
  try {
    await Speech.stop();
    Speech.speak(announcement, {
      language: settings.language,
      pitch: 1.0,
      rate: 1.0,
    });
  } catch (error) {
    console.error('Failed to speak arrival announcement:', error);
  }
}

// Announce route deviation
export async function announceRouteDeviation(): Promise<void> {
  const settings = await getVoiceSettings();
  if (!settings.enabled || Platform.OS === 'web') return;
  
  const t = TEXTS[settings.language];
  
  try {
    await Speech.stop();
    Speech.speak(t.routeDeviated, {
      language: settings.language,
      pitch: 1.0,
      rate: 1.0,
    });
  } catch (error) {
    console.error('Failed to speak route deviation:', error);
  }
}

// Announce navigation started
export async function announceNavigationStarted(destinationName?: string): Promise<void> {
  const settings = await getVoiceSettings();
  if (!settings.enabled || Platform.OS === 'web') return;
  
  const t = TEXTS[settings.language];
  
  let announcement: string;
  if (destinationName) {
    if (settings.language === 'ko-KR') {
      announcement = `${destinationName}까지 ${t.navigationStarted}`;
    } else {
      announcement = `${t.navigationStarted} to ${destinationName}`;
    }
  } else {
    announcement = t.navigationStarted;
  }
  
  try {
    await Speech.stop();
    Speech.speak(announcement, {
      language: settings.language,
      pitch: 1.0,
      rate: 1.0,
    });
  } catch (error) {
    console.error('Failed to speak navigation started:', error);
  }
}
