import { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  Platform,
  Animated,
  Easing,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/hooks/use-auth";

const SHOWN_BADGES_KEY = "shown_badge_popups";

interface UserBadge {
  badge: {
    id: number;
    name: string;
    description: string | null;
    icon: string;
    color: string;
    category: string;
  };
  earnedAt: Date;
}

interface DisplayBadge {
  id: number;
  name: string;
  description: string;
  icon: string;
  color: string;
  category: string;
  earnedAt: Date;
}

export function BadgeEarnedPopup() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, isAuthenticated } = useAuth();
  const [visible, setVisible] = useState(false);
  const [currentBadge, setCurrentBadge] = useState<DisplayBadge | null>(null);
  const [pendingBadges, setPendingBadges] = useState<DisplayBadge[]>([]);
  
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;

  // 사용자 배지 조회
  const { data: userBadges } = trpc.badges.mine.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );

  // 새로 획득한 배지 확인
  useEffect(() => {
    const checkNewBadges = async () => {
      if (!userBadges || userBadges.length === 0) return;

      try {
        const shownBadgesStr = await AsyncStorage.getItem(SHOWN_BADGES_KEY);
        const shownBadges: number[] = shownBadgesStr ? JSON.parse(shownBadgesStr) : [];

        // 아직 보여주지 않은 배지 필터링
        const newBadges = userBadges
          .filter((item: UserBadge) => !shownBadges.includes(item.badge.id))
          .map((item: UserBadge): DisplayBadge => ({
            id: item.badge.id,
            name: item.badge.name,
            description: item.badge.description || "",
            icon: item.badge.icon,
            color: item.badge.color,
            category: item.badge.category,
            earnedAt: item.earnedAt,
          }));

        if (newBadges.length > 0) {
          setPendingBadges(newBadges);
        }
      } catch (error) {
        console.error("Failed to check new badges:", error);
      }
    };

    checkNewBadges();
  }, [userBadges]);

  // 대기 중인 배지가 있으면 표시
  useEffect(() => {
    if (pendingBadges.length > 0 && !visible) {
      showNextBadge();
    }
  }, [pendingBadges, visible]);

  const showNextBadge = () => {
    if (pendingBadges.length === 0) return;

    const nextBadge = pendingBadges[0];
    setCurrentBadge(nextBadge);
    setVisible(true);

    // 햅틱 피드백
    if (Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }

    // 애니메이션 시작
    scaleAnim.setValue(0);
    rotateAnim.setValue(0);
    glowAnim.setValue(0);

    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 4,
        tension: 40,
        useNativeDriver: true,
      }),
      Animated.timing(rotateAnim, {
        toValue: 1,
        duration: 600,
        easing: Easing.out(Easing.back(1.5)),
        useNativeDriver: true,
      }),
      Animated.loop(
        Animated.sequence([
          Animated.timing(glowAnim, {
            toValue: 1,
            duration: 1000,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(glowAnim, {
            toValue: 0,
            duration: 1000,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      ),
    ]).start();
  };

  const handleClose = async () => {
    if (!currentBadge) return;

    // 표시한 배지 저장
    try {
      const shownBadgesStr = await AsyncStorage.getItem(SHOWN_BADGES_KEY);
      const shownBadges: number[] = shownBadgesStr ? JSON.parse(shownBadgesStr) : [];
      shownBadges.push(currentBadge.id);
      await AsyncStorage.setItem(SHOWN_BADGES_KEY, JSON.stringify(shownBadges));
    } catch (error) {
      console.error("Failed to save shown badge:", error);
    }

    // 대기 목록에서 제거
    setPendingBadges((prev) => prev.slice(1));
    setVisible(false);
    setCurrentBadge(null);
  };

  const getBadgeIcon = (category: string): string => {
    switch (category) {
      case "achievement": return "trophy";
      case "special": return "star";
      case "event": return "gift";
      case "milestone": return "ribbon";
      default: return "medal";
    }
  };

  const getBadgeColor = (category: string): string => {
    switch (category) {
      case "achievement": return "#FFD700";
      case "special": return "#9333EA";
      case "event": return "#EC4899";
      case "milestone": return "#3B82F6";
      default: return "#F59E0B";
    }
  };

  if (!visible || !currentBadge) return null;

  // 배지 자체 색상 사용, 없으면 카테고리 기본 색상
  const badgeColor = currentBadge.color || getBadgeColor(currentBadge.category);
  // 배지 자체 아이콘 사용, 없으면 카테고리 기본 아이콘
  const badgeIcon = currentBadge.icon || getBadgeIcon(currentBadge.category);

  const rotate = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["-15deg", "0deg"],
  });

  const glowOpacity = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 0.8],
  });

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <View className="flex-1 bg-black/70 items-center justify-center px-6" style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}>
        <Animated.View
          style={{
            transform: [{ scale: scaleAnim }, { rotate }],
          }}
          className="bg-background rounded-3xl p-6 w-full max-w-sm items-center"
        >
          {/* 축하 텍스트 */}
          <View className="flex-row items-center mb-4">
            <Text className="text-2xl">🎉</Text>
            <Text className="text-xl font-bold text-foreground mx-2">축하합니다!</Text>
            <Text className="text-2xl">🎉</Text>
          </View>

          {/* 배지 아이콘 */}
          <Animated.View
            style={{
              opacity: glowOpacity,
              position: "absolute",
              top: 80,
              width: 140,
              height: 140,
              borderRadius: 70,
              backgroundColor: badgeColor,
            }}
          />
          <View
            className="w-28 h-28 rounded-full items-center justify-center mb-4 shadow-lg"
            style={{ backgroundColor: badgeColor }}
          >
            <Ionicons name={badgeIcon as any} size={56} color="white" />
          </View>

          {/* 배지 이름 */}
          <Text className="text-xl font-bold text-foreground text-center mb-2">
            {currentBadge.name}
          </Text>

          {/* 배지 설명 */}
          <Text className="text-muted text-center mb-6 px-4">
            {currentBadge.description}
          </Text>

          {/* 카테고리 태그 */}
          <View
            className="px-4 py-1.5 rounded-full mb-6"
            style={{ backgroundColor: `${badgeColor}20` }}
          >
            <Text style={{ color: badgeColor, fontWeight: "600", fontSize: 13 }}>
              {currentBadge.category === "achievement"
                ? "업적 배지"
                : currentBadge.category === "special"
                ? "특별 배지"
                : currentBadge.category === "event"
                ? "이벤트 배지"
                : currentBadge.category === "milestone"
                ? "마일스톤 배지"
                : "배지"}
            </Text>
          </View>

          {/* 확인 버튼 */}
          <TouchableOpacity
            onPress={handleClose}
            className="w-full py-4 rounded-xl items-center"
            style={{ backgroundColor: badgeColor }}
          >
            <Text className="text-white font-bold text-lg">확인</Text>
          </TouchableOpacity>

          {/* 남은 배지 수 표시 */}
          {pendingBadges.length > 1 && (
            <Text className="text-muted text-sm mt-4">
              +{pendingBadges.length - 1}개의 배지가 더 있습니다
            </Text>
          )}
        </Animated.View>
      </View>
    </Modal>
  );
}
