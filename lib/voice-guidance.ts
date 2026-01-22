import * as Speech from 'expo-speech';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const VOICE_SETTINGS_KEY = '@scoop_voice_settings';

export interface VoiceSettings {
  enabled: boolean;
  speedAnnouncement: boolean;
  distanceAnnouncement: boolean;
  timeAnnouncement: boolean;
  intervalMinutes: number; // Announcement interval in minutes
  language: string;
}

const DEFAULT_SETTINGS: VoiceSettings = {
  enabled: false,
  speedAnnouncement: true,
  distanceAnnouncement: true,
  timeAnnouncement: true,
  intervalMinutes: 5,
  language: 'ko-KR',
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

export function formatDurationForSpeech(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  
  if (hours > 0) {
    return `${hours}시간 ${minutes}분`;
  }
  return `${minutes}분`;
}

export function formatDistanceForSpeech(meters: number): string {
  const km = meters / 1000;
  if (km >= 1) {
    return `${km.toFixed(1)}킬로미터`;
  }
  return `${Math.round(meters)}미터`;
}

export function formatSpeedForSpeech(speedKmh: number): string {
  return `시속 ${Math.round(speedKmh)}킬로미터`;
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
  
  // Build announcement text
  const parts: string[] = [];
  
  if (settings.timeAnnouncement) {
    parts.push(`주행 시간 ${formatDurationForSpeech(elapsedTime)}`);
  }
  
  if (settings.distanceAnnouncement) {
    parts.push(`주행 거리 ${formatDistanceForSpeech(totalDistance)}`);
  }
  
  if (settings.speedAnnouncement && currentSpeed > 0) {
    parts.push(`현재 속도 ${formatSpeedForSpeech(currentSpeed)}`);
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
  
  try {
    Speech.speak('주행을 시작합니다', {
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
  
  const announcement = `주행이 완료되었습니다. 총 ${formatDistanceForSpeech(totalDistance)}를 ${formatDurationForSpeech(elapsedTime)} 동안 주행했습니다. 평균 속도는 ${formatSpeedForSpeech(avgSpeed)}입니다.`;
  
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
