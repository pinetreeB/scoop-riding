import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";

import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import { useAiUsage, formatAiUsage } from "@/hooks/use-ai-usage";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

export default function BatteryAiScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ scooterId: string; scooterName: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const flatListRef = useRef<FlatList>(null);

  const scooterId = params.scooterId ? parseInt(params.scooterId) : null;
  const scooterName = params.scooterName || "기체";

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [temperature, setTemperature] = useState<number | undefined>();

  // AI 사용량 훅
  const { remaining, monthlyLimit, canUse, limitMessage, refetch: refetchAiUsage } = useAiUsage();

  // API hooks
  const checkLimit = trpc.batteryAi.checkLimit.useQuery();
  const getHistory = trpc.batteryAi.getHistory.useQuery(
    { scooterId: scooterId || undefined, limit: 20 },
    { enabled: !!scooterId }
  );
  const getSummary = trpc.batteryAi.getSummary.useQuery(
    { scooterId: scooterId! },
    { enabled: !!scooterId }
  );
  const analyzeMutation = trpc.batteryAi.analyze.useMutation();
  const clearHistoryMutation = trpc.batteryAi.clearHistory.useMutation();

  // Get current temperature
  useEffect(() => {
    const getWeather = async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") return;

        const location = await Location.getCurrentPositionAsync({});
        // Use OpenWeatherMap or similar API to get temperature
        // For now, we'll skip this and let the AI work without temperature
      } catch (error) {
        console.log("Failed to get weather:", error);
      }
    };
    getWeather();
  }, []);

  // Load chat history
  useEffect(() => {
    if (getHistory.data) {
      const historyMessages: ChatMessage[] = getHistory.data.map((msg, index) => ({
        id: `history-${index}`,
        role: msg.role as "user" | "assistant",
        content: msg.content,
        timestamp: new Date(msg.createdAt),
      }));
      setMessages(historyMessages.reverse());
    }
  }, [getHistory.data]);

  // Add welcome message if no history
  useEffect(() => {
    if (messages.length === 0 && !getHistory.isLoading) {
      const welcomeMessage: ChatMessage = {
        id: "welcome",
        role: "assistant",
        content: `안녕하세요! ${scooterName}의 배터리 분석 AI입니다. 🔋\n\n다음과 같은 질문을 해보세요:\n• "현재 배터리로 얼마나 갈 수 있어?"\n• "내 연비가 좋은 편이야?"\n• "배터리 수명은 어때?"\n• "오늘 30km 갈 수 있을까?"`,
        timestamp: new Date(),
      };
      setMessages([welcomeMessage]);
    }
  }, [getHistory.isLoading, scooterName]);

  const handleSend = async () => {
    if (!inputText.trim() || isLoading || !scooterId) return;

    // Check limit
    if (checkLimit.data && !checkLimit.data.canChat) {
      Alert.alert(
        "일일 한도 초과",
        "오늘의 AI 채팅 한도(10회)를 모두 사용했습니다. 내일 다시 이용해주세요.",
        [{ text: "확인" }]
      );
      return;
    }

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: inputText.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputText("");
    setIsLoading(true);

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    try {
      const result = await analyzeMutation.mutateAsync({
        scooterId,
        question: userMessage.content,
        temperature,
      });

      if (result.success && result.response) {
        const aiMessage: ChatMessage = {
          id: `ai-${Date.now()}`,
          role: "assistant",
          content: result.response,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, aiMessage]);
        
        // Refresh limit
        checkLimit.refetch();
        refetchAiUsage();
      } else {
        Alert.alert("오류", result.error || "응답을 받지 못했습니다.");
      }
    } catch (error: any) {
      console.error("AI chat error:", error);
      Alert.alert("오류", "AI 분석 중 오류가 발생했습니다.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearHistory = () => {
    Alert.alert(
      "대화 기록 삭제",
      "모든 대화 기록을 삭제하시겠습니까?",
      [
        { text: "취소", style: "cancel" },
        {
          text: "삭제",
          style: "destructive",
          onPress: async () => {
            try {
              await clearHistoryMutation.mutateAsync({ scooterId: scooterId || undefined });
              setMessages([]);
              getHistory.refetch();
            } catch (error) {
              Alert.alert("오류", "대화 기록 삭제에 실패했습니다.");
            }
          },
        },
      ]
    );
  };

  const renderMessage = ({ item }: { item: ChatMessage }) => {
    const isUser = item.role === "user";
    return (
      <View
        className={`mx-4 my-2 ${isUser ? "items-end" : "items-start"}`}
      >
        <View
          className={`max-w-[85%] rounded-2xl px-4 py-3 ${
            isUser ? "bg-primary" : "bg-surface"
          }`}
        >
          <Text
            className={`text-base leading-6 ${
              isUser ? "text-white" : "text-foreground"
            }`}
          >
            {item.content}
          </Text>
        </View>
        <Text className="text-xs text-muted mt-1 mx-2">
          {item.timestamp.toLocaleTimeString("ko-KR", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </Text>
      </View>
    );
  };

  if (!scooterId) {
    return (
      <ScreenContainer className="flex-1 items-center justify-center">
        <Text className="text-foreground text-lg">기체를 선택해주세요.</Text>
        <Pressable
          onPress={() => router.back()}
          className="mt-4 bg-primary px-6 py-3 rounded-full"
        >
          <Text className="text-white font-semibold">돌아가기</Text>
        </Pressable>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer edges={["top", "left", "right"]}>
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-border">
        <Pressable
          onPress={() => router.back()}
          className="p-2 -ml-2"
          style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
        >
          <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
        </Pressable>
        
        <View className="flex-1 mx-4">
          <Text className="text-lg font-bold text-foreground text-center">
            배터리 AI
          </Text>
          <Text className="text-xs text-muted text-center">
            {scooterName}
          </Text>
        </View>

        <Pressable
          onPress={handleClearHistory}
          className="p-2 -mr-2"
          style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
        >
          <MaterialIcons name="delete-outline" size={24} color={colors.muted} />
        </Pressable>
      </View>

      {/* Monthly AI Usage Info */}
      <View className="flex-row items-center justify-center py-2 bg-surface/50 gap-4">
        <View className="flex-row items-center">
          <MaterialIcons 
            name={remaining <= 5 ? "warning" : "smart-toy"} 
            size={16} 
            color={remaining <= 5 ? colors.warning : colors.primary} 
          />
          <Text className={`text-xs ml-1 ${remaining <= 5 ? 'text-warning font-medium' : 'text-muted'}`}>
            월간 AI: {remaining}/{monthlyLimit}회 남음
          </Text>
        </View>
        {checkLimit.data && (
          <View className="flex-row items-center">
            <MaterialIcons name="chat" size={14} color={colors.muted} />
            <Text className="text-xs text-muted ml-1">
              오늘 {checkLimit.data.used}/{checkLimit.data.limit}회
            </Text>
          </View>
        )}
      </View>

      {/* AI Limit Warning */}
      {!canUse && (
        <View className="mx-4 mt-2 p-3 bg-error/10 rounded-xl border border-error/30">
          <View className="flex-row items-center">
            <MaterialIcons name="error-outline" size={20} color={colors.error} />
            <Text className="text-sm text-error ml-2 flex-1">
              {limitMessage || '이번 달 AI 사용 횟수를 모두 사용했습니다.'}
            </Text>
          </View>
        </View>
      )}

      {/* Battery Summary */}
      {getSummary.data && (
        <View className="mx-4 mt-2 p-3 bg-surface rounded-xl">
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center">
              <MaterialIcons name="battery-charging-full" size={20} color={colors.primary} />
              <Text className="text-sm font-medium text-foreground ml-2">
                {getSummary.data.batterySpec}
              </Text>
            </View>
            {getSummary.data.avgEfficiencyWhKm && (
              <Text className="text-xs text-muted">
                평균 {getSummary.data.avgEfficiencyWhKm.toFixed(1)} Wh/km
              </Text>
            )}
          </View>
          {getSummary.data.estimatedRangeKm && (
            <Text className="text-xs text-success mt-1">
              예상 주행거리: ~{Math.round(getSummary.data.estimatedRangeKm)}km
            </Text>
          )}
        </View>
      )}

      {/* Chat Messages */}
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1"
        keyboardVerticalOffset={insets.top + 60}
      >
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderMessage}
          contentContainerStyle={{ paddingVertical: 16 }}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd()}
          onLayout={() => flatListRef.current?.scrollToEnd()}
        />

        {/* Loading Indicator */}
        {isLoading && (
          <View className="flex-row items-center mx-4 mb-2">
            <View className="bg-surface rounded-2xl px-4 py-3">
              <ActivityIndicator size="small" color={colors.primary} />
            </View>
          </View>
        )}

        {/* Input Area */}
        <View
          className="flex-row items-end px-4 py-3 border-t border-border bg-background"
          style={{ paddingBottom: Math.max(insets.bottom, 12) }}
        >
          <View className="flex-1 flex-row items-end bg-surface rounded-2xl px-4 py-2 mr-2">
            <TextInput
              value={inputText}
              onChangeText={setInputText}
              placeholder="배터리에 대해 물어보세요..."
              placeholderTextColor={colors.muted}
              multiline
              maxLength={500}
              className="flex-1 text-base text-foreground max-h-24"
              style={{ minHeight: 24 }}
              returnKeyType="send"
              onSubmitEditing={handleSend}
            />
          </View>
          
          <Pressable
            onPress={handleSend}
            disabled={!inputText.trim() || isLoading}
            className={`w-10 h-10 rounded-full items-center justify-center ${
              inputText.trim() && !isLoading ? "bg-primary" : "bg-muted/30"
            }`}
            style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
          >
            <MaterialIcons
              name="send"
              size={20}
              color={inputText.trim() && !isLoading ? "#fff" : colors.muted}
            />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}
