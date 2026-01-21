import { useState } from "react";
import {
  Text,
  View,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Haptics from "expo-haptics";
import * as SecureStore from "expo-secure-store";

import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import * as Auth from "@/lib/_core/auth";

export default function LoginScreen() {
  const router = useRouter();
  const colors = useColors();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const loginMutation = trpc.auth.login.useMutation();

  const handleLogin = async () => {
    if (!email.trim()) {
      Alert.alert("오류", "이메일을 입력해주세요.");
      return;
    }
    if (!password) {
      Alert.alert("오류", "비밀번호를 입력해주세요.");
      return;
    }

    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    setIsLoading(true);

    try {
      const result = await loginMutation.mutateAsync({ email: email.trim(), password });

      if (result.success && result.token && result.user) {
        // Store session token for native
        if (Platform.OS !== "web") {
          await Auth.setSessionToken(result.token);
        }

        // Store user info
        await Auth.setUserInfo({
          id: result.user.id,
          openId: result.user.openId,
          name: result.user.name,
          email: result.user.email,
          loginMethod: result.user.loginMethod,
          lastSignedIn: new Date(result.user.lastSignedIn),
        });

        if (Platform.OS !== "web") {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }

        // Navigate to home
        router.replace("/(tabs)");
      } else {
        Alert.alert("로그인 실패", result.error || "로그인에 실패했습니다.");
      }
    } catch (error) {
      console.error("Login error:", error);
      Alert.alert("오류", "로그인 중 오류가 발생했습니다.");
    } finally {
      setIsLoading(false);
    }
  };

  const goToRegister = () => {
    router.push("/register");
  };

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1"
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
        >
          <View className="flex-1 px-6 pt-12">
            {/* Logo and Title */}
            <View className="items-center mb-12">
              <View
                className="w-20 h-20 rounded-2xl items-center justify-center mb-4"
                style={{ backgroundColor: colors.primary }}
              >
                <MaterialIcons name="electric-scooter" size={48} color="#FFFFFF" />
              </View>
              <Text className="text-3xl font-bold text-foreground">SCOOP</Text>
              <Text className="text-muted mt-2">전동킥보드 주행기록</Text>
            </View>

            {/* Login Form */}
            <View className="gap-4">
              {/* Email Input */}
              <View>
                <Text className="text-sm text-muted mb-2">이메일</Text>
                <View className="flex-row items-center bg-surface rounded-xl px-4 border border-border">
                  <MaterialIcons name="email" size={20} color={colors.muted} />
                  <TextInput
                    className="flex-1 py-4 px-3 text-foreground"
                    placeholder="이메일 주소 입력"
                    placeholderTextColor={colors.muted}
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="next"
                  />
                </View>
              </View>

              {/* Password Input */}
              <View>
                <Text className="text-sm text-muted mb-2">비밀번호</Text>
                <View className="flex-row items-center bg-surface rounded-xl px-4 border border-border">
                  <MaterialIcons name="lock" size={20} color={colors.muted} />
                  <TextInput
                    className="flex-1 py-4 px-3 text-foreground"
                    placeholder="비밀번호 입력"
                    placeholderTextColor={colors.muted}
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                    returnKeyType="done"
                    onSubmitEditing={handleLogin}
                  />
                  <Pressable
                    onPress={() => setShowPassword(!showPassword)}
                    style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
                  >
                    <MaterialIcons
                      name={showPassword ? "visibility" : "visibility-off"}
                      size={20}
                      color={colors.muted}
                    />
                  </Pressable>
                </View>
              </View>

              {/* Login Button */}
              <Pressable
                onPress={handleLogin}
                disabled={isLoading}
                style={({ pressed }) => [
                  {
                    backgroundColor: colors.primary,
                    opacity: pressed || isLoading ? 0.8 : 1,
                  },
                ]}
                className="py-4 rounded-xl items-center mt-4"
              >
                {isLoading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text className="text-white font-semibold text-lg">로그인</Text>
                )}
              </Pressable>

              {/* Register Link */}
              <View className="flex-row items-center justify-center mt-6">
                <Text className="text-muted">계정이 없으신가요? </Text>
                <Pressable
                  onPress={goToRegister}
                  style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
                >
                  <Text style={{ color: colors.primary }} className="font-semibold">
                    회원가입
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}
