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

interface GroupChatProps {
  groupId: number;
  isVisible: boolean;
  onClose: () => void;
}

interface ChatMessage {
  id: number;
  userId: number;
  userName: string | null;
  userProfileImage: string | null;
  message: string;
  messageType: "text" | "location" | "alert";
  createdAt: Date;
}

export function GroupChat({ groupId, isVisible, onClose }: GroupChatProps) {
  const colors = useColors();
  const { user } = useAuth();
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [lastMessageId, setLastMessageId] = useState(0);
  const flatListRef = useRef<FlatList>(null);
  const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 메시지 전송 mutation
  const sendMessageMutation = trpc.groups.sendMessage.useMutation({
    onSuccess: () => {
      setMessage("");
      if (Platform.OS !== "web") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    },
  });

  // 초기 메시지 로드
  const { data: initialMessages, isLoading } = trpc.groups.getMessages.useQuery(
    { groupId, limit: 50 },
    { enabled: isVisible && groupId > 0 }
  );

  // 새 메시지 폴링
  const { data: newMessages, refetch: refetchNewMessages } = trpc.groups.getNewMessages.useQuery(
    { groupId, afterId: lastMessageId },
    { enabled: isVisible && groupId > 0 && lastMessageId > 0, refetchInterval: false }
  );

  // 초기 메시지 설정
  useEffect(() => {
    if (initialMessages && initialMessages.length > 0) {
      setMessages(initialMessages);
      setLastMessageId(initialMessages[initialMessages.length - 1].id);
    }
  }, [initialMessages]);

  // 새 메시지 추가
  useEffect(() => {
    if (newMessages && newMessages.length > 0) {
      setMessages(prev => {
        const existingIds = new Set(prev.map(m => m.id));
        const uniqueNew = newMessages.filter(m => !existingIds.has(m.id));
        if (uniqueNew.length > 0) {
          const updated = [...prev, ...uniqueNew];
          setLastMessageId(updated[updated.length - 1].id);
          return updated;
        }
        return prev;
      });
    }
  }, [newMessages]);

  // 폴링 시작/중지
  useEffect(() => {
    if (isVisible && lastMessageId > 0) {
      pollingIntervalRef.current = setInterval(() => {
        refetchNewMessages();
      }, 2000); // 2초마다 새 메시지 확인
    }

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, [isVisible, lastMessageId, refetchNewMessages]);

  // 메시지 전송
  const handleSend = useCallback(() => {
    if (!message.trim()) return;
    
    sendMessageMutation.mutate({
      groupId,
      message: message.trim(),
      messageType: "text",
    });
  }, [groupId, message, sendMessageMutation]);

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
            }`}
          >
            <Text className={isMyMessage ? "text-white" : "text-foreground"}>
              {item.message}
            </Text>
          </View>
          <Text className="text-xs text-muted mt-1">
            {new Date(item.createdAt).toLocaleTimeString("ko-KR", {
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
        <Text className="text-lg font-bold text-foreground">그룹 채팅</Text>
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
