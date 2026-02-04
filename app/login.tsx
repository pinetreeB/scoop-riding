import { useState, useEffect } from "react";
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
  Image,
} from "react-native";
import { useRouter } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Haptics from "expo-haptics";
import {
  GoogleSignin,
  statusCodes,
  isSuccessResponse,
  isErrorWithCode,
} from "@react-native-google-signin/google-signin";

import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/hooks/use-auth";
import { useTranslation } from "@/hooks/use-translation";

// Configure Google Sign-In
GoogleSignin.configure({
  webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || "",
  offlineAccess: true,
  forceCodeForRefreshToken: true,
});

export default function LoginScreen() {
  const router = useRouter();
  const colors = useColors();
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const { login: authLogin } = useAuth();
  const loginMutation = trpc.auth.login.useMutation();
  const googleLoginMutation = trpc.auth.googleLogin.useMutation();

  const handleGoogleSignIn = async () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    // Check if Google OAuth is configured
    if (!process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID) {
      Alert.alert(
        t("common.error"),
        t("auth.alerts.googleSetupRequired"),
        [{ text: t("common.confirm") }]
      );
      return;
    }

    setIsGoogleLoading(true);

    try {
      // Check if Google Play Services are available
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

      // Sign in with Google
      const response = await GoogleSignin.signIn();

      if (isSuccessResponse(response)) {
        const { data } = response;
        const idToken = data.idToken;
        const user = data.user;

        if (!user.email || !user.id) {
          Alert.alert(t("common.error"), t("auth.alerts.googleAccountError"));
          return;
        }

        // Call our backend to handle Google login
        const result = await googleLoginMutation.mutateAsync({
          idToken: idToken || "",
          email: user.email,
          name: user.name || user.email.split("@")[0],
          googleId: user.id,
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

          // AuthGuard will handle navigation automatically
        } else {
          Alert.alert(t("auth.alerts.loginFailed"), result.error || t("auth.alerts.googleError"));
        }
      }
    } catch (error) {
      if (isErrorWithCode(error)) {
        switch (error.code) {
          case statusCodes.IN_PROGRESS:
            // Operation is already in progress
            break;
          case statusCodes.PLAY_SERVICES_NOT_AVAILABLE:
            Alert.alert(t("common.error"), t("auth.alerts.googlePlayNotAvailable"));
            break;
          case statusCodes.SIGN_IN_CANCELLED:
            // User cancelled the sign-in flow
            break;
          default:
            console.error("Google sign-in error:", error);
            Alert.alert(t("common.error"), t("auth.alerts.googleError"));
        }
      } else {
        console.error("Google login error:", error);
        Alert.alert(t("common.error"), t("auth.alerts.googleError"));
      }
    } finally {
      setIsGoogleLoading(false);
    }
  };

  const handleLogin = async () => {
    if (!email.trim()) {
      Alert.alert(t("common.error"), t("auth.alerts.emailRequired"));
      return;
    }
    if (!password) {
      Alert.alert(t("common.error"), t("auth.alerts.passwordRequired"));
      return;
    }

    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    setIsLoading(true);

    try {
      const result = await loginMutation.mutateAsync({ email: email.trim(), password });

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

        // AuthGuard will handle navigation automatically
      } else {
        Alert.alert(t("auth.alerts.loginFailed"), result.error || t("auth.alerts.loginError"));
      }
    } catch (error) {
      console.error("Login error:", error);
      Alert.alert(t("common.error"), t("auth.alerts.loginError"));
    } finally {
      setIsLoading(false);
    }
  };

  const goToRegister = () => {
    router.push("/register");
  };

  const goToForgotPassword = () => {
    router.push("/forgot-password");
  };

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1"
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
        >
          <View className="flex-1 px-6 pt-12">
            {/* Logo and Title */}
            <View className="items-center mb-10">
              <Image
                source={require("@/assets/images/scoop-logo.jpg")}
                style={{ width: 180, height: 180, borderRadius: 16 }}
                resizeMode="contain"
              />
            </View>

            {/* Login Form */}
            <View className="gap-4">
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
                <View className="flex-row justify-between items-center mb-2">
                  <Text className="text-sm text-muted">{t("auth.password")}</Text>
                  <Pressable
                    onPress={goToForgotPassword}
                    style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
                  >
                    <Text style={{ color: colors.primary }} className="text-sm">
                      {t("auth.forgotPassword")}
                    </Text>
                  </Pressable>
                </View>
                <View className="flex-row items-center bg-surface rounded-xl px-4 border border-border">
                  <MaterialIcons name="lock" size={20} color={colors.muted} />
                  <TextInput
                    className="flex-1 py-4 px-3 text-foreground"
                    placeholder={t("auth.passwordPlaceholder")}
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
                className="py-4 rounded-xl items-center mt-2"
              >
                {isLoading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text className="text-white font-semibold text-lg">{t("auth.login")}</Text>
                )}
              </Pressable>

              {/* Google Login Button - 임시 비활성화 */}
              {/* TODO: Google OAuth 설정 완료 후 다시 활성화
              <View className="flex-row items-center my-4">
                <View className="flex-1 h-px bg-border" />
                <Text className="mx-4 text-muted text-sm">{t("auth.orContinueWith")}</Text>
                <View className="flex-1 h-px bg-border" />
              </View>
              <Pressable
                onPress={handleGoogleSignIn}
                disabled={isGoogleLoading}
                style={({ pressed }) => [
                  {
                    opacity: pressed || isGoogleLoading ? 0.8 : 1,
                    borderColor: colors.border,
                    borderWidth: 1,
                  },
                ]}
                className="py-4 rounded-xl items-center flex-row justify-center bg-surface"
              >
                {isGoogleLoading ? (
                  <ActivityIndicator color={colors.foreground} />
                ) : (
                  <>
                    <View className="w-5 h-5 mr-3">
                      <MaterialIcons name="g-mobiledata" size={24} color={colors.foreground} />
                    </View>
                    <Text className="text-foreground font-semibold">{t("auth.google")}</Text>
                  </>
                )}
              </Pressable>
              */}

              {/* Register Link */}
              <View className="flex-row items-center justify-center mt-6">
                <Text className="text-muted">{t("auth.noAccount")} </Text>
                <Pressable
                  onPress={goToRegister}
                  style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
                >
                  <Text style={{ color: colors.primary }} className="font-semibold">
                    {t("auth.signup")}
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
