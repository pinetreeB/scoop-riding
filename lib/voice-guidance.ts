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
