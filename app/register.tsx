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
import { useTranslation } from "@/hooks/use-translation";

export default function RegisterScreen() {
  const router = useRouter();
  const colors = useColors();
  const { t } = useTranslation();
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
      Alert.alert(t("common.error"), t("auth.alerts.nicknameRequired"));
      return;
    }
    if (!email.trim()) {
      Alert.alert(t("common.error"), t("auth.alerts.emailRequired"));
      return;
    }
    if (!password) {
      Alert.alert(t("common.error"), t("auth.alerts.passwordRequired"));
      return;
    }
    if (password.length < 6) {
      Alert.alert(t("common.error"), t("auth.alerts.passwordTooShort"));
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert(t("common.error"), t("auth.alerts.passwordMismatch"));
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

        Alert.alert(t("auth.registerSuccess"), t("auth.registerSuccessMessage"), [
          { text: t("common.confirm") },
        ]);
        // AuthGuard will handle navigation automatically
      } else {
        Alert.alert(t("auth.alerts.registerFailed"), result.error || t("auth.alerts.registerError"));
      }
    } catch (error) {
      console.error("Register error:", error);
      Alert.alert(t("common.error"), t("auth.alerts.registerError"));
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
            <Text className="text-lg font-semibold text-foreground ml-2">{t("auth.signup")}</Text>
          </View>

          <View className="flex-1 px-6 pt-6">
            {/* Title */}
            <View className="mb-8">
              <Text className="text-2xl font-bold text-foreground">
                SCOOP {t("auth.signup")}
              </Text>
              <Text className="text-muted mt-2">
                {t("auth.signupDesc")}
              </Text>
            </View>

            {/* Register Form */}
            <View className="gap-4">
              {/* Name Input */}
              <View>
                <Text className="text-sm text-muted mb-2">{t("auth.nickname")}</Text>
                <View className="flex-row items-center bg-surface rounded-xl px-4 border border-border">
                  <MaterialIcons name="person" size={20} color={colors.muted} />
                  <TextInput
                    className="flex-1 py-4 px-3 text-foreground"
                    placeholder={t("auth.nicknamePlaceholder")}
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
                <Text className="text-sm text-muted mb-2">{t("auth.email")}</Text>
                <View className="flex-row items-center bg-surface rounded-xl px-4 border border-border">
                  <MaterialIcons name="email" size={20} color={colors.muted} />
                  <TextInput
                    className="flex-1 py-4 px-3 text-foreground"
                    placeholder={t("auth.emailPlaceholder")}
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
                <Text className="text-sm text-muted mb-2">{t("auth.password")}</Text>
                <View className="flex-row items-center bg-surface rounded-xl px-4 border border-border">
                  <MaterialIcons name="lock" size={20} color={colors.muted} />
                  <TextInput
                    className="flex-1 py-4 px-3 text-foreground"
                    placeholder={t("auth.passwordPlaceholderWithHint")}
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
                <Text className="text-sm text-muted mb-2">{t("auth.confirmPassword")}</Text>
                <View className="flex-row items-center bg-surface rounded-xl px-4 border border-border">
                  <MaterialIcons name="lock-outline" size={20} color={colors.muted} />
                  <TextInput
                    className="flex-1 py-4 px-3 text-foreground"
                    placeholder={t("auth.confirmPasswordPlaceholder")}
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
                    {t("auth.alerts.passwordMismatch")}
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
                  <Text className="text-white font-semibold text-lg">{t("auth.signup")}</Text>
                )}
              </Pressable>

              {/* Login Link */}
              <View className="flex-row items-center justify-center mt-6">
                <Text className="text-muted">{t("auth.haveAccount")} </Text>
                <Pressable
                  onPress={goToLogin}
                  style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
                >
                  <Text style={{ color: colors.primary }} className="font-semibold">
                    {t("auth.login")}
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
