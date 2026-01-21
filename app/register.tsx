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

import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/hooks/use-auth";

export default function RegisterScreen() {
  const router = useRouter();
  const colors = useColors();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const { login: authLogin } = useAuth();
  const registerMutation = trpc.auth.register.useMutation();

  const handleRegister = async () => {
    if (!name.trim()) {
      Alert.alert("오류", "이름을 입력해주세요.");
      return;
    }
    if (!email.trim()) {
      Alert.alert("오류", "이메일을 입력해주세요.");
      return;
    }
    if (!password) {
      Alert.alert("오류", "비밀번호를 입력해주세요.");
      return;
    }
    if (password.length < 6) {
      Alert.alert("오류", "비밀번호는 6자 이상이어야 합니다.");
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert("오류", "비밀번호가 일치하지 않습니다.");
      return;
    }

    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    setIsLoading(true);

    try {
      const result = await registerMutation.mutateAsync({
        name: name.trim(),
        email: email.trim(),
        password,
      });

      if (result.success && result.token && result.user) {
        // Use AuthContext login to update state immediately
        await authLogin(
          {
            id: result.user.id,
            openId: result.user.openId,
            name: result.user.name,
            email: result.user.email,
            loginMethod: result.user.loginMethod,
            lastSignedIn: new Date(result.user.lastSignedIn),
          },
          result.token
        );

        if (Platform.OS !== "web") {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }

        Alert.alert("회원가입 완료", "환영합니다! SCOOP과 함께 안전한 라이딩 되세요.", [
          { text: "확인" },
        ]);
        // AuthGuard will handle navigation automatically
      } else {
        Alert.alert("회원가입 실패", result.error || "회원가입에 실패했습니다.");
      }
    } catch (error) {
      console.error("Register error:", error);
      Alert.alert("오류", "회원가입 중 오류가 발생했습니다.");
    } finally {
      setIsLoading(false);
    }
  };

  const goToLogin = () => {
    router.back();
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
          {/* Header */}
          <View className="flex-row items-center px-4 py-3">
            <Pressable
              onPress={goToLogin}
              style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
              className="p-2 -ml-2"
            >
              <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
            </Pressable>
            <Text className="text-lg font-semibold text-foreground ml-2">회원가입</Text>
          </View>

          <View className="flex-1 px-6 pt-6">
            {/* Title */}
            <View className="mb-8">
              <Text className="text-2xl font-bold text-foreground">
                SCOOP 회원가입
              </Text>
              <Text className="text-muted mt-2">
                계정을 만들고 주행 기록을 저장하세요
              </Text>
            </View>

            {/* Register Form */}
            <View className="gap-4">
              {/* Name Input */}
              <View>
                <Text className="text-sm text-muted mb-2">이름</Text>
                <View className="flex-row items-center bg-surface rounded-xl px-4 border border-border">
                  <MaterialIcons name="person" size={20} color={colors.muted} />
                  <TextInput
                    className="flex-1 py-4 px-3 text-foreground"
                    placeholder="이름 입력"
                    placeholderTextColor={colors.muted}
                    value={name}
                    onChangeText={setName}
                    autoCapitalize="words"
                    returnKeyType="next"
                  />
                </View>
              </View>

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
                    placeholder="비밀번호 입력 (6자 이상)"
                    placeholderTextColor={colors.muted}
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                    returnKeyType="next"
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

              {/* Confirm Password Input */}
              <View>
                <Text className="text-sm text-muted mb-2">비밀번호 확인</Text>
                <View className="flex-row items-center bg-surface rounded-xl px-4 border border-border">
                  <MaterialIcons name="lock-outline" size={20} color={colors.muted} />
                  <TextInput
                    className="flex-1 py-4 px-3 text-foreground"
                    placeholder="비밀번호 다시 입력"
                    placeholderTextColor={colors.muted}
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    secureTextEntry={!showPassword}
                    returnKeyType="done"
                    onSubmitEditing={handleRegister}
                  />
                </View>
                {password && confirmPassword && password !== confirmPassword && (
                  <Text className="text-error text-xs mt-1">
                    비밀번호가 일치하지 않습니다
                  </Text>
                )}
              </View>

              {/* Register Button */}
              <Pressable
                onPress={handleRegister}
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
                  <Text className="text-white font-semibold text-lg">회원가입</Text>
                )}
              </Pressable>

              {/* Login Link */}
              <View className="flex-row items-center justify-center mt-6">
                <Text className="text-muted">이미 계정이 있으신가요? </Text>
                <Pressable
                  onPress={goToLogin}
                  style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
                >
                  <Text style={{ color: colors.primary }} className="font-semibold">
                    로그인
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
