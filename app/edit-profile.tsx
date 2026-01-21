import { useState, useEffect } from "react";
import {
  Text,
  View,
  Pressable,
  TextInput,
  Alert,
  ActivityIndicator,
  Platform,
  Image,
} from "react-native";
import { useRouter } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";

import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useAuth } from "@/hooks/use-auth";
import { trpc } from "@/lib/trpc";

export default function EditProfileScreen() {
  const router = useRouter();
  const colors = useColors();
  const { user, refreshUser } = useAuth();
  const utils = trpc.useUtils();

  const [name, setName] = useState(user?.name || "");
  const [profileImageUrl, setProfileImageUrl] = useState<string | null>(
    user?.profileImageUrl || null
  );
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const updateProfileMutation = trpc.profile.update.useMutation({
    onSuccess: () => {
      utils.auth.me.invalidate();
      if (refreshUser) refreshUser();
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      Alert.alert("성공", "프로필이 업데이트되었습니다.", [
        { text: "확인", onPress: () => router.back() },
      ]);
    },
    onError: (error) => {
      Alert.alert("오류", error.message || "프로필 업데이트에 실패했습니다.");
    },
  });

  const uploadImageMutation = trpc.profile.uploadImage.useMutation({
    onSuccess: async (data) => {
      setProfileImageUrl(data.url);
      setUploading(false);
      
      // 즉시 프로필 사진 업데이트 (저장 버튼 누르지 않아도 바로 반영)
      try {
        await updateProfileMutation.mutateAsync({
          name: name.trim() || user?.name || "",
          profileImageUrl: data.url,
        });
        utils.auth.me.invalidate();
        if (refreshUser) refreshUser();
        if (Platform.OS !== "web") {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
      } catch (e) {
        console.error("Auto-save profile image failed:", e);
      }
    },
    onError: (error) => {
      setUploading(false);
      Alert.alert("오류", error.message || "이미지 업로드에 실패했습니다.");
    },
  });

  const handlePickImage = async () => {
    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      
      if (!permissionResult.granted) {
        Alert.alert("권한 필요", "사진 라이브러리 접근 권한이 필요합니다.");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        setUploading(true);

        if (Platform.OS !== "web") {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }

        // Read file as base64
        const base64 = await FileSystem.readAsStringAsync(asset.uri, {
          encoding: FileSystem.EncodingType.Base64,
        });

        const filename = asset.uri.split("/").pop() || "profile.jpg";
        const contentType = asset.mimeType || "image/jpeg";

        uploadImageMutation.mutate({
          base64,
          filename,
          contentType,
        });
      }
    } catch (error) {
      setUploading(false);
      console.error("Image picker error:", error);
      Alert.alert("오류", "이미지를 선택하는 중 오류가 발생했습니다.");
    }
  };

  const handleSave = () => {
    if (!name.trim()) {
      Alert.alert("오류", "이름을 입력해주세요.");
      return;
    }

    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }

    setSaving(true);
    updateProfileMutation.mutate({
      name: name.trim(),
      profileImageUrl,
    });
    setSaving(false);
  };

  return (
    <ScreenContainer className="px-5">
      {/* Header */}
      <View className="flex-row items-center justify-between py-4 border-b border-border">
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
        >
          <MaterialIcons name="close" size={24} color={colors.foreground} />
        </Pressable>
        <Text className="text-lg font-bold text-foreground">프로필 수정</Text>
        <Pressable
          onPress={handleSave}
          disabled={saving || uploading}
          style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
        >
          {saving ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Text className="text-primary font-semibold">저장</Text>
          )}
        </Pressable>
      </View>

      {/* Profile Image */}
      <View className="items-center py-8">
        <Pressable
          onPress={handlePickImage}
          disabled={uploading}
          style={({ pressed }) => [{ opacity: pressed ? 0.8 : 1 }]}
        >
          <View className="relative">
            {uploading ? (
              <View
                className="w-24 h-24 rounded-full items-center justify-center"
                style={{ backgroundColor: colors.surface }}
              >
                <ActivityIndicator size="large" color={colors.primary} />
              </View>
            ) : profileImageUrl ? (
              <Image
                source={{ uri: profileImageUrl }}
                style={{ width: 96, height: 96, borderRadius: 48 }}
              />
            ) : (
              <View
                className="w-24 h-24 rounded-full items-center justify-center"
                style={{ backgroundColor: colors.primary }}
              >
                <Text className="text-white text-3xl font-bold">
                  {name.charAt(0).toUpperCase() || "?"}
                </Text>
              </View>
            )}
            <View
              className="absolute bottom-0 right-0 w-8 h-8 rounded-full items-center justify-center border-2"
              style={{
                backgroundColor: colors.surface,
                borderColor: colors.background,
              }}
            >
              <MaterialIcons name="camera-alt" size={16} color={colors.primary} />
            </View>
          </View>
        </Pressable>
        <Text className="text-muted text-sm mt-2">탭하여 사진 변경</Text>
      </View>

      {/* Name Input */}
      <View className="mb-6">
        <Text className="text-muted text-sm mb-2">이름</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="이름을 입력하세요"
          placeholderTextColor={colors.muted}
          className="bg-surface border border-border rounded-xl px-4 py-3 text-foreground"
          maxLength={50}
        />
      </View>

      {/* Email (Read-only) */}
      <View className="mb-6">
        <Text className="text-muted text-sm mb-2">이메일</Text>
        <View className="bg-surface border border-border rounded-xl px-4 py-3 opacity-60">
          <Text className="text-foreground">{user?.email || "이메일 없음"}</Text>
        </View>
        <Text className="text-muted text-xs mt-1">이메일은 변경할 수 없습니다.</Text>
      </View>
    </ScreenContainer>
  );
}
