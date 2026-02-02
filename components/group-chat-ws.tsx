/**
 * WebSocket-based Group Chat Component
 * Real-time chat using WebSocket connection
 */
import { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";

import { useColors } from "@/hooks/use-colors";
import { useAuth } from "@/hooks/use-auth";
import { trpc } from "@/lib/trpc";

interface GroupChatWSProps {
  groupId: number;
  isVisible: boolean;
  onClose: () => void;
  wsConnected: boolean;
  sendChatMessage: (message: string, messageType?: "text" | "location" | "alert") => void;
  onChatMessageReceived?: (callback: (message: ChatMessage) => void) => void;
}

interface ChatMessage {
  id: number;
  oderId?: number; // For optimistic updates
  userId: number;
  userName: string | null;
  userProfileImage: string | null;
  message: string;
  messageType: "text" | "location" | "alert";
  createdAt: Date;
  pending?: boolean;
}

export function GroupChatWS({ 
  groupId, 
  isVisible, 
  onClose, 
  wsConnected,
  sendChatMessage,
}: GroupChatWSProps) {
  const colors = useColors();
  const { user } = useAuth();
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const flatListRef = useRef<FlatList>(null);
  const messageIdCounterRef = useRef(0);

  // 초기 메시지 로드 (HTTP)
  const { data: initialMessages, isLoading } = trpc.groups.getMessages.useQuery(
    { groupId, limit: 50 },
    { enabled: isVisible && groupId > 0 }
  );

  // HTTP fallback mutation (WebSocket 연결 안 됐을 때)
  const sendMessageMutation = trpc.groups.sendMessage.useMutation({
    onSuccess: (newMessage) => {
      if (newMessage) {
        // DB에서는 id와 createdAt만 반환하므로 pending 메시지 업데이트
        setMessages(prev => {
          // pending 메시지를 실제 메시지로 교체
          return prev.map(m => {
            if (m.pending && m.userId === user?.id) {
              return {
                ...m,
                id: newMessage.id,
                createdAt: newMessage.createdAt,
                pending: false,
              };
            }
            return m;
          });
        });
      }
      setMessage("");
      if (Platform.OS !== "web") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    },
  });

  // 초기 메시지 설정
  useEffect(() => {
    if (initialMessages && initialMessages.length > 0) {
      setMessages(initialMessages.map(m => ({
        ...m,
        messageType: m.messageType as "text" | "location" | "alert",
      })));
    }
  }, [initialMessages]);

  // WebSocket 메시지 수신 처리를 위한 외부 콜백 등록
  // 이 컴포넌트는 riding.tsx에서 onChatMessage 콜백을 통해 메시지를 받음

  // 메시지 전송
  const handleSend = useCallback(() => {
    if (!message.trim()) return;
    
    const trimmedMessage = message.trim();
    
    if (wsConnected) {
      // WebSocket으로 전송 (실시간)
      // Optimistic update
      const tempId = --messageIdCounterRef.current;
      setMessages(prev => [...prev, {
        id: tempId,
        userId: user?.id || 0,
        userName: user?.name || null,
        userProfileImage: user?.profileImageUrl || null,
        message: trimmedMessage,
        messageType: "text",
        createdAt: new Date(),
        pending: true,
      }]);
      
      sendChatMessage(trimmedMessage, "text");
      setMessage("");
      
      if (Platform.OS !== "web") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    } else {
      // HTTP fallback
      sendMessageMutation.mutate({
        groupId,
        message: trimmedMessage,
        messageType: "text",
      });
    }
  }, [groupId, message, wsConnected, sendChatMessage, sendMessageMutation, user]);

  // 외부에서 WebSocket 메시지 추가 (riding.tsx에서 호출)
  const addMessage = useCallback((newMessage: ChatMessage) => {
    setMessages(prev => {
      // 중복 체크
      if (prev.some(m => m.id === newMessage.id)) {
        return prev;
      }
      // pending 메시지 제거 (같은 사용자의 같은 내용)
      const filtered = prev.filter(m => 
        !(m.pending && m.userId === newMessage.userId && m.message === newMessage.message)
      );
      return [...filtered, newMessage];
    });
    
    // 스크롤 to bottom
    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 100);
  }, []);

  // Export addMessage for parent component
  useEffect(() => {
    // @ts-ignore - 부모 컴포넌트에서 접근할 수 있도록 ref에 함수 노출
    if (flatListRef.current) {
      (flatListRef.current as any).addMessage = addMessage;
    }
  }, [addMessage]);

  // 메시지 렌더링
  const renderMessage = useCallback(({ item }: { item: ChatMessage }) => {
    const isMyMessage = item.userId === user?.id;
    const isAlert = item.messageType === "alert";

    if (isAlert) {
      return (
        <View className="items-center my-2">
          <View className="bg-yellow-500/20 px-3 py-1.5 rounded-full">
            <Text className="text-yellow-600 text-xs">{item.message}</Text>
          </View>
        </View>
      );
    }

    return (
      <View className={`flex-row mb-3 ${isMyMessage ? "justify-end" : "justify-start"}`}>
        {!isMyMessage && (
          <View className="mr-2">
            {item.userProfileImage ? (
              <Image
                source={{ uri: item.userProfileImage }}
                style={{ width: 32, height: 32, borderRadius: 16 }}
              />
            ) : (
              <View
                style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.primary }}
                className="items-center justify-center"
              >
                <Text className="text-white text-sm font-bold">
                  {(item.userName || "?").charAt(0)}
                </Text>
              </View>
            )}
          </View>
        )}
        <View className={`max-w-[70%] ${isMyMessage ? "items-end" : "items-start"}`}>
          {!isMyMessage && (
            <Text className="text-xs text-muted mb-1">{item.userName || "익명"}</Text>
          )}
          <View
            className={`px-3 py-2 rounded-2xl ${
              isMyMessage ? "bg-primary" : "bg-surface"
            } ${item.pending ? "opacity-60" : ""}`}
          >
            <Text className={isMyMessage ? "text-white" : "text-foreground"}>
              {item.message}
            </Text>
          </View>
          <Text className="text-xs text-muted mt-1">
            {item.pending ? "전송 중..." : new Date(item.createdAt).toLocaleTimeString("ko-KR", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </Text>
        </View>
      </View>
    );
  }, [colors.primary, user?.id]);

  if (!isVisible) return null;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="flex-1 bg-background"
    >
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-border">
        <Pressable
          onPress={onClose}
          style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
        >
          <MaterialIcons name="close" size={24} color={colors.foreground} />
        </Pressable>
        <View className="flex-row items-center">
          <Text className="text-lg font-bold text-foreground">그룹 채팅</Text>
          {wsConnected && (
            <View className="ml-2 w-2 h-2 rounded-full bg-green-500" />
          )}
        </View>
        <View style={{ width: 24 }} />
      </View>

      {/* Messages */}
      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : messages.length === 0 ? (
        <View className="flex-1 items-center justify-center px-8">
          <MaterialIcons name="chat-bubble-outline" size={48} color={colors.muted} />
          <Text className="text-muted mt-4 text-center">
            아직 메시지가 없습니다.{"\n"}첫 메시지를 보내보세요!
          </Text>
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={{ padding: 16 }}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => {
            flatListRef.current?.scrollToEnd({ animated: true });
          }}
        />
      )}

      {/* Input */}
      <View className="flex-row items-center px-4 py-3 border-t border-border bg-background">
        <TextInput
          value={message}
          onChangeText={setMessage}
          placeholder="메시지를 입력하세요..."
          placeholderTextColor={colors.muted}
          className="flex-1 bg-surface rounded-full px-4 py-2 text-foreground mr-2"
          style={{ maxHeight: 100 }}
          multiline
          returnKeyType="send"
          onSubmitEditing={handleSend}
        />
        <Pressable
          onPress={handleSend}
          disabled={!message.trim() || sendMessageMutation.isPending}
          style={({ pressed }) => [
            { opacity: pressed || !message.trim() ? 0.5 : 1 },
          ]}
          className="w-10 h-10 bg-primary rounded-full items-center justify-center"
        >
          {sendMessageMutation.isPending ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <MaterialIcons name="send" size={20} color="#FFFFFF" />
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

// Export addMessage type for parent component
export type { ChatMessage };
