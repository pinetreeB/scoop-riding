import { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  Image,
  Alert,
  Platform,
  ActivityIndicator,
  KeyboardAvoidingView,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import Constants from "expo-constants";
import * as Device from "expo-device";

import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useAuth } from "@/hooks/use-auth";
import { trpc } from "@/lib/trpc";
import { useImageUpload } from "@/lib/image-upload";

const CURRENT_APP_VERSION = Constants.expoConfig?.version || "0.1.0";

type Severity = "low" | "medium" | "high" | "critical";

interface BugReportForm {
  title: string;
  description: string;
  stepsToReproduce: string;
  expectedBehavior: string;
  actualBehavior: string;
  severity: Severity;
  screenshots: string[];
}

export default function BugReportScreen() {
  const router = useRouter();
  const colors = useColors();
  const { user } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [form, setForm] = useState<BugReportForm>({
    title: "",
    description: "",
    stepsToReproduce: "",
    expectedBehavior: "",
    actualBehavior: "",
    severity: "medium",
    screenshots: [],
  });

  const submitBugReportMutation = trpc.bugReports.submit.useMutation();
  const { upload: uploadImage, isUploading } = useImageUpload();

  const getDeviceInfo = () => {
    const parts = [];
    if (Device.brand) parts.push(Device.brand);
    if (Device.modelName) parts.push(Device.modelName);
    if (Device.osName) parts.push(Device.osName);
    if (Device.osVersion) parts.push(Device.osVersion);
    return parts.join(" / ") || "Unknown";
  };

  const handlePickImage = async () => {
    if (form.screenshots.length >= 5) {
      Alert.alert("알림", "스크린샷은 최대 5장까지 첨부할 수 있습니다.");
      return;
    }

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        setUploadingImage(true);
        const uploadedUrl = await uploadImage(result.assets[0].uri);
        if (uploadedUrl) {
          setForm(prev => ({
            ...prev,
            screenshots: [...prev.screenshots, uploadedUrl],
          }));
          if (Platform.OS !== "web") {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          }
        } else {
          Alert.alert("오류", "이미지 업로드에 실패했습니다.");
        }
        setUploadingImage(false);
      }
    } catch (error) {
      console.error("Image picker error:", error);
      setUploadingImage(false);
      Alert.alert("오류", "이미지를 선택하는 중 오류가 발생했습니다.");
    }
  };

  const handleTakePhoto = async () => {
    if (form.screenshots.length >= 5) {
      Alert.alert("알림", "스크린샷은 최대 5장까지 첨부할 수 있습니다.");
      return;
    }

    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("권한 필요", "카메라 권한이 필요합니다.");
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: false,
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        setUploadingImage(true);
        const uploadedUrl = await uploadImage(result.assets[0].uri);
        if (uploadedUrl) {
          setForm(prev => ({
            ...prev,
            screenshots: [...prev.screenshots, uploadedUrl],
          }));
          if (Platform.OS !== "web") {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          }
        } else {
          Alert.alert("오류", "이미지 업로드에 실패했습니다.");
        }
        setUploadingImage(false);
      }
    } catch (error) {
      console.error("Camera error:", error);
      setUploadingImage(false);
      Alert.alert("오류", "카메라를 사용하는 중 오류가 발생했습니다.");
    }
  };

  const handleRemoveScreenshot = (index: number) => {
    setForm(prev => ({
      ...prev,
      screenshots: prev.screenshots.filter((_, i) => i !== index),
    }));
  };

  const handleSubmit = async () => {
    if (!form.title.trim()) {
      Alert.alert("오류", "버그 제목을 입력해주세요.");
      return;
    }
    if (!form.description.trim()) {
      Alert.alert("오류", "버그 설명을 입력해주세요.");
      return;
    }

    setIsSubmitting(true);
    try {
      const deviceInfo = getDeviceInfo();
      
      await submitBugReportMutation.mutateAsync({
        title: form.title.trim(),
        description: form.description.trim(),
        stepsToReproduce: form.stepsToReproduce.trim() || undefined,
        expectedBehavior: form.expectedBehavior.trim() || undefined,
        actualBehavior: form.actualBehavior.trim() || undefined,
        screenshotUrls: form.screenshots.length > 0 ? JSON.stringify(form.screenshots) : undefined,
        severity: form.severity,
        appVersion: CURRENT_APP_VERSION,
        deviceInfo,
      });

      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }

      Alert.alert(
        "제출 완료",
        "버그 리포트가 성공적으로 제출되었습니다.\n빠른 시일 내에 확인하겠습니다.",
        [{ text: "확인", onPress: () => router.back() }]
      );
    } catch (error) {
      console.error("Bug report submit error:", error);
      Alert.alert("오류", "버그 리포트 제출 중 오류가 발생했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const severityOptions: { value: Severity; label: string; color: string; icon: string }[] = [
    { value: "low", label: "낮음", color: "#22C55E", icon: "remove-circle-outline" },
    { value: "medium", label: "보통", color: "#F59E0B", icon: "alert-circle-outline" },
    { value: "high", label: "높음", color: "#EF4444", icon: "warning-outline" },
    { value: "critical", label: "심각", color: "#DC2626", icon: "skull-outline" },
  ];

  return (
    <ScreenContainer>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1"
      >
        {/* Header */}
        <View className="flex-row items-center justify-between px-4 py-3 border-b border-border">
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="close" size={28} color={colors.foreground} />
          </TouchableOpacity>
          <Text className="text-lg font-bold text-foreground">버그 리포트</Text>
          <TouchableOpacity
            onPress={handleSubmit}
            disabled={isSubmitting}
            className={`px-4 py-2 rounded-lg ${isSubmitting ? "bg-muted/30" : "bg-primary"}`}
          >
            {isSubmitting ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text className="text-white font-semibold">제출</Text>
            )}
          </TouchableOpacity>
        </View>

        <ScrollView className="flex-1 p-4" showsVerticalScrollIndicator={false}>
          {/* Title */}
          <View className="mb-4">
            <Text className="text-sm font-semibold text-foreground mb-2">
              버그 제목 <Text className="text-error">*</Text>
            </Text>
            <TextInput
              className="bg-surface border border-border rounded-xl p-4 text-foreground"
              placeholder="버그를 간단히 설명해주세요"
              placeholderTextColor={colors.muted}
              value={form.title}
              onChangeText={(text) => setForm(prev => ({ ...prev, title: text }))}
              maxLength={200}
            />
          </View>

          {/* Description */}
          <View className="mb-4">
            <Text className="text-sm font-semibold text-foreground mb-2">
              상세 설명 <Text className="text-error">*</Text>
            </Text>
            <TextInput
              className="bg-surface border border-border rounded-xl p-4 text-foreground min-h-[100px]"
              placeholder="버그가 발생한 상황을 자세히 설명해주세요"
              placeholderTextColor={colors.muted}
              value={form.description}
              onChangeText={(text) => setForm(prev => ({ ...prev, description: text }))}
              multiline
              textAlignVertical="top"
            />
          </View>

          {/* Steps to Reproduce */}
          <View className="mb-4">
            <Text className="text-sm font-semibold text-foreground mb-2">
              재현 방법 (선택)
            </Text>
            <TextInput
              className="bg-surface border border-border rounded-xl p-4 text-foreground min-h-[80px]"
              placeholder="1. 앱을 실행한다&#10;2. 특정 버튼을 누른다&#10;3. 오류가 발생한다"
              placeholderTextColor={colors.muted}
              value={form.stepsToReproduce}
              onChangeText={(text) => setForm(prev => ({ ...prev, stepsToReproduce: text }))}
              multiline
              textAlignVertical="top"
            />
          </View>

          {/* Expected vs Actual */}
          <View className="flex-row gap-3 mb-4">
            <View className="flex-1">
              <Text className="text-sm font-semibold text-foreground mb-2">
                예상 동작 (선택)
              </Text>
              <TextInput
                className="bg-surface border border-border rounded-xl p-4 text-foreground min-h-[60px]"
                placeholder="정상적으로 동작해야 하는 방식"
                placeholderTextColor={colors.muted}
                value={form.expectedBehavior}
                onChangeText={(text) => setForm(prev => ({ ...prev, expectedBehavior: text }))}
                multiline
                textAlignVertical="top"
              />
            </View>
            <View className="flex-1">
              <Text className="text-sm font-semibold text-foreground mb-2">
                실제 동작 (선택)
              </Text>
              <TextInput
                className="bg-surface border border-border rounded-xl p-4 text-foreground min-h-[60px]"
                placeholder="실제로 발생한 문제"
                placeholderTextColor={colors.muted}
                value={form.actualBehavior}
                onChangeText={(text) => setForm(prev => ({ ...prev, actualBehavior: text }))}
                multiline
                textAlignVertical="top"
              />
            </View>
          </View>

          {/* Severity */}
          <View className="mb-4">
            <Text className="text-sm font-semibold text-foreground mb-2">
              심각도
            </Text>
            <View className="flex-row gap-2">
              {severityOptions.map((option) => (
                <TouchableOpacity
                  key={option.value}
                  className={`flex-1 p-3 rounded-xl border ${
                    form.severity === option.value
                      ? "border-2"
                      : "border-border bg-surface"
                  }`}
                  style={form.severity === option.value ? { borderColor: option.color, backgroundColor: `${option.color}15` } : {}}
                  onPress={() => setForm(prev => ({ ...prev, severity: option.value }))}
                >
                  <View className="items-center">
                    <Ionicons
                      name={option.icon as any}
                      size={20}
                      color={form.severity === option.value ? option.color : colors.muted}
                    />
                    <Text
                      className={`text-xs mt-1 font-medium ${
                        form.severity === option.value ? "" : "text-muted"
                      }`}
                      style={form.severity === option.value ? { color: option.color } : {}}
                    >
                      {option.label}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Screenshots */}
          <View className="mb-6">
            <Text className="text-sm font-semibold text-foreground mb-2">
              스크린샷 첨부 (최대 5장)
            </Text>
            
            <View className="flex-row flex-wrap gap-3">
              {form.screenshots.map((uri, index) => (
                <View key={index} className="relative">
                  <Image
                    source={{ uri }}
                    className="w-20 h-20 rounded-lg"
                    resizeMode="cover"
                  />
                  <TouchableOpacity
                    className="absolute -top-2 -right-2 bg-error rounded-full p-1"
                    onPress={() => handleRemoveScreenshot(index)}
                  >
                    <Ionicons name="close" size={14} color="#FFFFFF" />
                  </TouchableOpacity>
                </View>
              ))}
              
              {form.screenshots.length < 5 && (
                <View className="flex-row gap-2">
                  <TouchableOpacity
                    className="w-20 h-20 rounded-lg border-2 border-dashed border-border items-center justify-center bg-surface"
                    onPress={handlePickImage}
                    disabled={uploadingImage}
                  >
                    {uploadingImage ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : (
                      <>
                        <Ionicons name="images-outline" size={24} color={colors.muted} />
                        <Text className="text-xs text-muted mt-1">갤러리</Text>
                      </>
                    )}
                  </TouchableOpacity>
                  
                  {Platform.OS !== "web" && (
                    <TouchableOpacity
                      className="w-20 h-20 rounded-lg border-2 border-dashed border-border items-center justify-center bg-surface"
                      onPress={handleTakePhoto}
                      disabled={uploadingImage}
                    >
                      <Ionicons name="camera-outline" size={24} color={colors.muted} />
                      <Text className="text-xs text-muted mt-1">카메라</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </View>
          </View>

          {/* Device Info */}
          <View className="bg-surface/50 rounded-xl p-4 mb-6 border border-border">
            <Text className="text-sm font-semibold text-foreground mb-2">
              자동으로 포함되는 정보
            </Text>
            <Text className="text-xs text-muted">
              • 앱 버전: v{CURRENT_APP_VERSION}{"\n"}
              • 기기: {getDeviceInfo()}{"\n"}
              • 사용자: {user?.name || user?.email || "익명"}
            </Text>
          </View>

          <View className="h-8" />
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}
