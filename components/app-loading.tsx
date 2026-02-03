import { useEffect, useState } from "react";
import { View, Text, ActivityIndicator, Animated, Platform } from "react-native";
import { Image } from "expo-image";
import { useColors } from "@/hooks/use-colors";

interface AppLoadingProps {
  isLoading: boolean;
  message?: string;
}

/**
 * App loading component that shows a branded splash screen
 * while the app is initializing (auth check, data loading, etc.)
 */
export function AppLoading({ isLoading, message = "로딩 중..." }: AppLoadingProps) {
  const colors = useColors();
  const [fadeAnim] = useState(() => new Animated.Value(1));
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (!isLoading) {
      // Fade out animation
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start(() => {
        setVisible(false);
      });
    } else {
      setVisible(true);
      fadeAnim.setValue(1);
    }
  }, [isLoading, fadeAnim]);

  if (!visible) return null;

  return (
    <Animated.View
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: colors.background,
        justifyContent: "center",
        alignItems: "center",
        zIndex: 9999,
        opacity: fadeAnim,
      }}
    >
      <View style={{ alignItems: "center" }}>
        {/* Logo */}
        <Image
          source={require("@/assets/images/icon.png")}
          style={{ width: 100, height: 100, marginBottom: 24 }}
          contentFit="contain"
        />
        
        {/* App Name */}
        <Text
          style={{
            fontSize: 28,
            fontWeight: "bold",
            color: colors.primary,
            marginBottom: 16,
          }}
        >
          SCOOP
        </Text>
        
        {/* Loading indicator */}
        <ActivityIndicator size="large" color={colors.primary} />
        
        {/* Loading message */}
        <Text
          style={{
            marginTop: 16,
            fontSize: 14,
            color: colors.muted,
          }}
        >
          {message}
        </Text>
      </View>
    </Animated.View>
  );
}

/**
 * Minimal loading indicator for inline use
 */
export function InlineLoading({ message }: { message?: string }) {
  const colors = useColors();
  
  return (
    <View
      style={{
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        padding: 20,
      }}
    >
      <ActivityIndicator size="large" color={colors.primary} />
      {message && (
        <Text
          style={{
            marginTop: 12,
            fontSize: 14,
            color: colors.muted,
          }}
        >
          {message}
        </Text>
      )}
    </View>
  );
}
