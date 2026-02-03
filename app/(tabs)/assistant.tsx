import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Keyboard,
} from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useAuth } from "@/hooks/use-auth";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getApiBaseUrl } from "@/constants/oauth";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface Suggestion {
  text: string;
}

const API_BASE_URL = getApiBaseUrl() || "http://localhost:3000";

export default function AssistantScreen() {
  const colors = useColors();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const flatListRef = useRef<FlatList>(null);

  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "안녕하세요! 저는 SCOOP의 AI 어시스턴트 스쿠피입니다. 🛴\n\n전동킥보드 안전 수칙, 법규, 주행 팁 등 무엇이든 물어보세요!",
      timestamp: new Date(),
    },
  ]);
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);

  // Fetch suggestions on mount
  useEffect(() => {
    fetchSuggestions();
  }, []);

  const fetchSuggestions = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/ai/suggestions`);
      if (response.ok) {
        const data = await response.json();
        setSuggestions(data.suggestions || []);
      }
    } catch (error) {
      console.error("Failed to fetch suggestions:", error);
    }
  };

  const sendMessage = async (text: string) => {
    if (!text.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: text.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputText("");
    setIsLoading(true);
    Keyboard.dismiss();

    try {
      // Build conversation history
      const conversationHistory = messages
        .filter((m) => m.id !== "welcome")
        .map((m) => ({
          role: m.role,
          content: m.content,
        }));

      const response = await fetch(`${API_BASE_URL}/api/ai/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: text.trim(),
          userId: user?.id || 0,
          conversationHistory,
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: data.response,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, assistantMessage]);
      } else {
        const errorMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: data.error || "죄송합니다. 응답을 생성하는 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.",
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, errorMessage]);
      }
    } catch (error) {
      console.error("Chat error:", error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: "네트워크 오류가 발생했습니다. 인터넷 연결을 확인해주세요.",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSuggestionPress = (suggestion: string) => {
    sendMessage(suggestion);
  };

  const renderMessage = ({ item }: { item: Message }) => {
    const isUser = item.role === "user";

    return (
      <View
        style={{
          flexDirection: "row",
          justifyContent: isUser ? "flex-end" : "flex-start",
          marginVertical: 4,
          marginHorizontal: 12,
        }}
      >
        {!isUser && (
          <View
            style={{
              width: 32,
              height: 32,
              borderRadius: 16,
              backgroundColor: colors.primary,
              justifyContent: "center",
              alignItems: "center",
              marginRight: 8,
            }}
          >
            <MaterialIcons name="smart-toy" size={18} color="#fff" />
          </View>
        )}
        <View
          style={{
            maxWidth: "75%",
            backgroundColor: isUser ? colors.primary : colors.surface,
            borderRadius: 16,
            borderTopLeftRadius: isUser ? 16 : 4,
            borderTopRightRadius: isUser ? 4 : 16,
            paddingHorizontal: 14,
            paddingVertical: 10,
          }}
        >
          <Text
            style={{
              color: isUser ? "#fff" : colors.foreground,
              fontSize: 15,
              lineHeight: 22,
            }}
          >
            {item.content}
          </Text>
        </View>
      </View>
    );
  };

  const renderSuggestions = () => {
    if (messages.length > 1 || suggestions.length === 0) return null;

    return (
      <View style={{ paddingHorizontal: 12, paddingBottom: 12 }}>
        <Text
          style={{
            color: colors.muted,
            fontSize: 13,
            marginBottom: 8,
          }}
        >
          이런 것들을 물어보세요
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {suggestions.map((suggestion, index) => (
            <TouchableOpacity
              key={index}
              onPress={() => handleSuggestionPress(suggestion)}
              style={{
                backgroundColor: colors.surface,
                borderRadius: 16,
                paddingHorizontal: 14,
                paddingVertical: 8,
                borderWidth: 1,
                borderColor: colors.border,
              }}
              activeOpacity={0.7}
            >
              <Text style={{ color: colors.foreground, fontSize: 13 }}>
                {suggestion}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    );
  };

  return (
    <ScreenContainer edges={["top", "left", "right"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
      >
        {/* Header */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: 16,
            paddingVertical: 12,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
          }}
        >
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: colors.primary,
              justifyContent: "center",
              alignItems: "center",
              marginRight: 12,
            }}
          >
            <MaterialIcons name="smart-toy" size={24} color="#fff" />
          </View>
          <View>
            <Text
              style={{
                fontSize: 17,
                fontWeight: "600",
                color: colors.foreground,
              }}
            >
              스쿠피
            </Text>
            <Text style={{ fontSize: 13, color: colors.muted }}>
              SCOOP AI 어시스턴트
            </Text>
          </View>
        </View>

        {/* Messages */}
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingVertical: 12 }}
          onContentSizeChange={() =>
            flatListRef.current?.scrollToEnd({ animated: true })
          }
          ListFooterComponent={
            <>
              {renderSuggestions()}
              {isLoading && (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    marginHorizontal: 12,
                    marginVertical: 8,
                  }}
                >
                  <View
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 16,
                      backgroundColor: colors.primary,
                      justifyContent: "center",
                      alignItems: "center",
                      marginRight: 8,
                    }}
                  >
                    <MaterialIcons name="smart-toy" size={18} color="#fff" />
                  </View>
                  <View
                    style={{
                      backgroundColor: colors.surface,
                      borderRadius: 16,
                      borderTopLeftRadius: 4,
                      paddingHorizontal: 14,
                      paddingVertical: 10,
                    }}
                  >
                    <ActivityIndicator size="small" color={colors.primary} />
                  </View>
                </View>
              )}
            </>
          }
        />

        {/* Input */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "flex-end",
            paddingHorizontal: 12,
            paddingTop: 8,
            paddingBottom: Math.max(insets.bottom, 12),
            borderTopWidth: 1,
            borderTopColor: colors.border,
            backgroundColor: colors.background,
          }}
        >
          <TextInput
            style={{
              flex: 1,
              backgroundColor: colors.surface,
              borderRadius: 20,
              paddingHorizontal: 16,
              paddingVertical: 10,
              fontSize: 15,
              color: colors.foreground,
              maxHeight: 100,
            }}
            placeholder="메시지를 입력하세요..."
            placeholderTextColor={colors.muted}
            value={inputText}
            onChangeText={setInputText}
            multiline
            returnKeyType="send"
            onSubmitEditing={() => sendMessage(inputText)}
            blurOnSubmit={false}
            editable={!isLoading}
          />
          <TouchableOpacity
            onPress={() => sendMessage(inputText)}
            disabled={!inputText.trim() || isLoading}
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor:
                inputText.trim() && !isLoading ? colors.primary : colors.surface,
              justifyContent: "center",
              alignItems: "center",
              marginLeft: 8,
            }}
            activeOpacity={0.7}
          >
            <MaterialIcons
              name="send"
              size={20}
              color={inputText.trim() && !isLoading ? "#fff" : colors.muted}
            />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}
