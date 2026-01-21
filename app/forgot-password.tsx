import { useState } from "react";
import {
  Text,
  View,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  ActivityIndicator,
} from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";

export default function ForgotPasswordScreen() {
  const colors = useColors();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSent, setIsSent] = useState(false);

  const requestPasswordResetMutation = trpc.auth.requestPasswordReset.useMutation();

  const handleSubmit = async () => {
    if (!email.trim()) {
      Alert.alert("오류", "이메일을 입력해주세요.");
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      Alert.alert("오류", "올바른 이메일 형식이 아닙니다.");
      return;
    }

    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    setIsLoading(true);

    try {
      const result = await requestPasswordResetMutation.mutateAsync({ email });

      if (Platform.OS !== "web") {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
        setIsSent(true);
    } catch (error: any) {
      console.error("Password reset error:", error);
      Alert.alert("오류", "요청 처리 중 오류가 발생했습니다.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleBack = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    router.back();
  };

  if (isSent) {
    return (
      <ScreenContainer>
        <View className="flex-1 px-6 justify-center items-center">
          <View 
            className="w-20 h-20 rounded-full items-center justify-center mb-6"
            style={{ backgroundColor: colors.success }}
          >
            <MaterialIcons name="mark-email-read" size={40} color="#FFFFFF" />
          </View>
          
          <Text className="text-2xl font-bold text-foreground text-center mb-3">
            이메일을 확인해주세요
          </Text>
          
          <Text className="text-muted text-center mb-8 leading-6">
            {email}로 비밀번호 재설정 링크를 발송했습니다.{"\n"}
            이메일을 확인하여 비밀번호를 재설정해주세요.
          </Text>

          <Text className="text-muted text-sm text-center mb-8">
            이메일이 도착하지 않았나요?{"\n"}
            스팸 폴더를 확인하거나 잠시 후 다시 시도해주세요.
          </Text>

          <Pressable
            onPress={() => router.replace("/login")}
            style={({ pressed }) => [
              { 
                opacity: pressed ? 0.8 : 1,
                backgroundColor: colors.primary,
              }
            ]}
            className="w-full py-4 rounded-xl items-center"
          >
            <Text className="text-white font-bold text-lg">로그인으로 돌아가기</Text>
          </Pressable>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1"
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View className="px-4 pt-4">
            <Pressable
              onPress={handleBack}
              style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
              className="w-10 h-10 items-center justify-center"
            >
              <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
            </Pressable>
          </View>

          <View className="flex-1 px-6 pt-8">
            {/* Icon */}
            <View className="items-center mb-8">
              <View 
                className="w-20 h-20 rounded-full items-center justify-center"
                style={{ backgroundColor: colors.primary + "20" }}
              >
                <MaterialIcons name="lock-reset" size={40} color={colors.primary} />
              </View>
            </View>

            {/* Title */}
            <Text className="text-2xl font-bold text-foreground text-center mb-3">
              비밀번호 찾기
            </Text>
            <Text className="text-muted text-center mb-8">
              가입한 이메일 주소를 입력하시면{"\n"}
              비밀번호 재설정 링크를 보내드립니다.
            </Text>

            {/* Email Input */}
            <View className="mb-6">
              <Text className="text-foreground font-medium mb-2">이메일</Text>
              <View className="flex-row items-center bg-surface border border-border rounded-xl px-4">
                <MaterialIcons name="email" size={20} color={colors.muted} />
                <TextInput
                  className="flex-1 py-4 px-3 text-foreground"
                  placeholder="example@email.com"
                  placeholderTextColor={colors.muted}
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!isLoading}
                  returnKeyType="done"
                  onSubmitEditing={handleSubmit}
                />
              </View>
            </View>

            {/* Submit Button */}
            <Pressable
              onPress={handleSubmit}
              disabled={isLoading}
              style={({ pressed }) => [
                { 
                  opacity: pressed || isLoading ? 0.8 : 1,
                  backgroundColor: colors.primary,
                }
              ]}
              className="py-4 rounded-xl items-center flex-row justify-center"
            >
              {isLoading ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <MaterialIcons name="send" size={20} color="#FFFFFF" />
                  <Text className="text-white font-bold text-lg ml-2">재설정 링크 발송</Text>
                </>
              )}
            </Pressable>

            {/* Back to Login */}
            <View className="flex-row justify-center mt-6">
              <Text className="text-muted">비밀번호가 기억나셨나요? </Text>
              <Pressable onPress={handleBack}>
                <Text className="font-bold" style={{ color: colors.primary }}>
                  로그인
                </Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}
