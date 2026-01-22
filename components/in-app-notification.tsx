import { useEffect, useState, useRef } from "react";
import { View, Text, Pressable, Animated, Platform } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useColors } from "@/hooks/use-colors";

export interface InAppNotification {
  id: string;
  type: "friend_request" | "friend_accepted" | "challenge_invite" | "ride_started" | "group_invite" | "comment" | "like" | "general";
  title: string;
  body: string;
  data?: Record<string, unknown>;
  timestamp: number;
}

interface InAppNotificationBannerProps {
  notification: InAppNotification | null;
  onDismiss: () => void;
}

export function InAppNotificationBanner({ notification, onDismiss }: InAppNotificationBannerProps) {
  const colors = useColors();
  const router = useRouter();
  const slideAnim = useRef(new Animated.Value(-100)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (notification) {
      setIsVisible(true);
      // Haptic feedback
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      // Slide in
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          useNativeDriver: true,
          tension: 100,
          friction: 10,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();

      // Auto dismiss after 5 seconds
      const timer = setTimeout(() => {
        dismissNotification();
      }, 5000);

      return () => clearTimeout(timer);
    }
  }, [notification]);

  const dismissNotification = () => {
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: -100,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setIsVisible(false);
      onDismiss();
    });
  };

  const handlePress = () => {
    dismissNotification();
    
    // Navigate based on notification type
    if (notification) {
      switch (notification.type) {
        case "friend_request":
        case "friend_accepted":
          router.push("/friends");
          break;
        case "challenge_invite":
          if (notification.data?.challengeId) {
            router.push(`/challenge-detail?id=${notification.data.challengeId}`);
          } else {
            router.push("/challenges");
          }
          break;
        case "ride_started":
          router.push("/friends-map");
          break;
        case "group_invite":
          router.push("/group-riding");
          break;
        case "comment":
        case "like":
          if (notification.data?.postId) {
            router.push(`/post-detail?id=${notification.data.postId}`);
          } else {
            router.push("/(tabs)/community");
          }
          break;
        default:
          router.push("/notifications-center");
      }
    }
  };

  const getIcon = () => {
    switch (notification?.type) {
      case "friend_request":
        return "person-add";
      case "friend_accepted":
        return "people";
      case "challenge_invite":
        return "emoji-events";
      case "ride_started":
        return "electric-scooter";
      case "group_invite":
        return "groups";
      case "comment":
        return "chat-bubble";
      case "like":
        return "favorite";
      default:
        return "notifications";
    }
  };

  const getIconColor = () => {
    switch (notification?.type) {
      case "friend_request":
      case "friend_accepted":
        return "#4CAF50";
      case "challenge_invite":
        return "#FFC107";
      case "ride_started":
        return colors.primary;
      case "group_invite":
        return "#2196F3";
      case "like":
        return "#F44336";
      default:
        return colors.primary;
    }
  };

  if (!isVisible || !notification) return null;

  return (
    <Animated.View
      style={{
        position: "absolute",
        top: 50,
        left: 16,
        right: 16,
        zIndex: 9999,
        transform: [{ translateY: slideAnim }],
        opacity: opacityAnim,
      }}
    >
      <Pressable
        onPress={handlePress}
        style={({ pressed }) => ({
          backgroundColor: colors.surface,
          borderRadius: 16,
          padding: 16,
          flexDirection: "row",
          alignItems: "center",
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.3,
          shadowRadius: 8,
          elevation: 8,
          borderWidth: 1,
          borderColor: colors.border,
          opacity: pressed ? 0.9 : 1,
        })}
      >
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: `${getIconColor()}20`,
            alignItems: "center",
            justifyContent: "center",
            marginRight: 12,
          }}
        >
          <MaterialIcons name={getIcon() as any} size={24} color={getIconColor()} />
        </View>
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontSize: 15,
              fontWeight: "600",
              color: colors.foreground,
              marginBottom: 2,
            }}
            numberOfLines={1}
          >
            {notification.title}
          </Text>
          <Text
            style={{
              fontSize: 13,
              color: colors.muted,
            }}
            numberOfLines={2}
          >
            {notification.body}
          </Text>
        </View>
        <Pressable
          onPress={(e) => {
            e.stopPropagation();
            dismissNotification();
          }}
          style={({ pressed }) => ({
            padding: 8,
            opacity: pressed ? 0.5 : 1,
          })}
        >
          <MaterialIcons name="close" size={20} color={colors.muted} />
        </Pressable>
      </Pressable>
    </Animated.View>
  );
}

// Global notification state manager
type NotificationListener = (notification: InAppNotification) => void;
const listeners: Set<NotificationListener> = new Set();

export function addNotificationListener(listener: NotificationListener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function showInAppNotification(notification: Omit<InAppNotification, "id" | "timestamp">) {
  const fullNotification: InAppNotification = {
    ...notification,
    id: Math.random().toString(36).substring(7),
    timestamp: Date.now(),
  };
  
  listeners.forEach(listener => listener(fullNotification));
}
