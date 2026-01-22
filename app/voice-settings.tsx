import { useState, useEffect, useCallback } from "react";
import {
  Text,
  View,
  ScrollView,
  Pressable,
  Platform,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Haptics from "expo-haptics";

import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import {
  VoiceSettings,
  VoiceLanguage,
  getVoiceSettings,
  saveVoiceSettings,
  announceRidingStatus,
  getAvailableLanguages,
} from "@/lib/voice-guidance";

export default function VoiceSettingsScreen() {
  const colors = useColors();
  const router = useRouter();
  const [settings, setSettings] = useState<VoiceSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    const loaded = await getVoiceSettings();
    setSettings(loaded);
    setLoading(false);
  };

  const updateSetting = useCallback(async (key: keyof VoiceSettings, value: boolean | number | string) => {
    if (!settings) return;
    
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);
    await saveVoiceSettings(newSettings);
  }, [settings]);

  const testVoice = async () => {
    if (!settings) return;
    
    setTesting(true);
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    
    // Test with sample data
    await announceRidingStatus(
      { ...settings, enabled: true },
      25, // 25 km/h
      5500, // 5.5 km
      1800, // 30 minutes
      true // force announce
    );
    
    setTimeout(() => setTesting(false), 2000);
  };

  const intervalOptions = [1, 3, 5, 10, 15];

  if (loading || !settings) {
    return (
      <ScreenContainer>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      {/* Header */}
      <View className="flex-row items-center px-5 py-4 border-b border-border">
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
          className="mr-4"
        >
          <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
        </Pressable>
        <Text className="text-xl font-bold text-foreground">음성 안내 설정</Text>
      </View>

      <ScrollView className="flex-1 p-5">
        {/* Main Toggle */}
        <View className="bg-surface rounded-2xl border border-border p-4 mb-6">
          <Pressable
            onPress={() => updateSetting("enabled", !settings.enabled)}
            style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
            className="flex-row items-center"
          >
            <MaterialIcons 
              name={settings.enabled ? "volume-up" : "volume-off"} 
              size={32} 
              color={settings.enabled ? colors.primary : colors.muted} 
            />
            <View className="flex-1 ml-4">
              <Text className="text-lg font-bold text-foreground">음성 안내</Text>
              <Text className="text-muted text-sm">
                주행 중 속도, 거리, 시간을 음성으로 안내합니다
              </Text>
            </View>
            <View 
              className="w-14 h-8 rounded-full"
              style={{ 
                backgroundColor: settings.enabled ? colors.primary : colors.border,
                flexDirection: 'row',
                justifyContent: settings.enabled ? 'flex-end' : 'flex-start',
                alignItems: 'center',
                padding: 2,
              }}
            >
              <View 
                className="w-7 h-7 rounded-full"
                style={{ backgroundColor: '#FFFFFF' }}
              />
            </View>
          </Pressable>
        </View>

        {/* Announcement Options */}
        <Text className="text-lg font-bold text-foreground mb-3">안내 항목</Text>
        <View className="bg-surface rounded-2xl border border-border overflow-hidden mb-6">
          {/* Speed */}
          <Pressable
            onPress={() => updateSetting("speedAnnouncement", !settings.speedAnnouncement)}
            style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
            className="flex-row items-center p-4 border-b border-border"
          >
            <MaterialIcons name="speed" size={24} color={colors.primary} />
            <Text className="flex-1 ml-3 text-foreground font-medium">현재 속도</Text>
            <MaterialIcons 
              name={settings.speedAnnouncement ? "check-box" : "check-box-outline-blank"} 
              size={24} 
              color={settings.speedAnnouncement ? colors.primary : colors.muted} 
            />
          </Pressable>

          {/* Distance */}
          <Pressable
            onPress={() => updateSetting("distanceAnnouncement", !settings.distanceAnnouncement)}
            style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
            className="flex-row items-center p-4 border-b border-border"
          >
            <MaterialIcons name="straighten" size={24} color={colors.primary} />
            <Text className="flex-1 ml-3 text-foreground font-medium">주행 거리</Text>
            <MaterialIcons 
              name={settings.distanceAnnouncement ? "check-box" : "check-box-outline-blank"} 
              size={24} 
              color={settings.distanceAnnouncement ? colors.primary : colors.muted} 
            />
          </Pressable>

          {/* Time */}
          <Pressable
            onPress={() => updateSetting("timeAnnouncement", !settings.timeAnnouncement)}
            style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
            className="flex-row items-center p-4"
          >
            <MaterialIcons name="timer" size={24} color={colors.primary} />
            <Text className="flex-1 ml-3 text-foreground font-medium">주행 시간</Text>
            <MaterialIcons 
              name={settings.timeAnnouncement ? "check-box" : "check-box-outline-blank"} 
              size={24} 
              color={settings.timeAnnouncement ? colors.primary : colors.muted} 
            />
          </Pressable>
        </View>

        {/* Interval */}
        <Text className="text-lg font-bold text-foreground mb-3">안내 간격</Text>
        <View className="bg-surface rounded-2xl border border-border p-4 mb-6">
          <View className="flex-row flex-wrap gap-2">
            {intervalOptions.map((interval) => (
              <Pressable
                key={interval}
                onPress={() => updateSetting("intervalMinutes", interval)}
                style={({ pressed }) => [{ 
                  opacity: pressed ? 0.7 : 1,
                  backgroundColor: settings.intervalMinutes === interval ? colors.primary : colors.background,
                  borderColor: settings.intervalMinutes === interval ? colors.primary : colors.border,
                }]}
                className="px-4 py-2 rounded-full border"
              >
                <Text 
                  style={{ 
                    color: settings.intervalMinutes === interval ? '#FFFFFF' : colors.foreground 
                  }}
                  className="font-medium"
                >
                  {interval}분
                </Text>
              </Pressable>
            ))}
          </View>
          <Text className="text-muted text-sm mt-3">
            선택한 간격마다 주행 정보를 음성으로 안내합니다
          </Text>
        </View>

        {/* Test Button */}
        <Pressable
          onPress={testVoice}
          disabled={testing}
          style={({ pressed }) => [{ 
            opacity: pressed || testing ? 0.7 : 1,
            backgroundColor: colors.primary,
          }]}
          className="flex-row items-center justify-center p-4 rounded-2xl mb-6"
        >
          {testing ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <MaterialIcons name="play-arrow" size={24} color="#FFFFFF" />
              <Text className="text-white font-bold ml-2">테스트 음성 재생</Text>
            </>
          )}
        </Pressable>

        {/* Language Selection */}
        <Text className="text-lg font-bold text-foreground mb-3">안내 언어</Text>
        <View className="bg-surface rounded-2xl border border-border p-4 mb-6">
          <View className="flex-row flex-wrap gap-2">
            {getAvailableLanguages().map((lang) => (
              <Pressable
                key={lang.code}
                onPress={() => updateSetting("language", lang.code)}
                style={({ pressed }) => [{ 
                  opacity: pressed ? 0.7 : 1,
                  backgroundColor: settings.language === lang.code ? colors.primary : colors.background,
                  borderColor: settings.language === lang.code ? colors.primary : colors.border,
                }]}
                className="px-4 py-2 rounded-full border"
              >
                <Text 
                  style={{ 
                    color: settings.language === lang.code ? '#FFFFFF' : colors.foreground 
                  }}
                  className="font-medium"
                >
                  {lang.name}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text className="text-muted text-sm mt-3">
            선택한 언어로 음성 안내를 제공합니다
          </Text>
        </View>

        {/* Info */}
        <View className="bg-surface/50 rounded-xl p-4 mb-6">
          <View className="flex-row items-start">
            <MaterialIcons name="info-outline" size={20} color={colors.muted} />
            <Text className="flex-1 ml-2 text-muted text-sm">
              음성 안내는 주행 중에만 작동하며, 이어폰이나 스피커를 통해 들을 수 있습니다.
              웹 브라우저에서는 지원되지 않을 수 있습니다.
            </Text>
          </View>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
