import { Alert, FlatList, Linking, Pressable, Text, View } from "react-native";
import { useMemo } from "react";
import { useRouter } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import Constants from "expo-constants";

import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";

function compareVersions(a: string, b: string): number {
  const aParts = a.split(".").map((part) => Number(part) || 0);
  const bParts = b.split(".").map((part) => Number(part) || 0);
  const maxLength = Math.max(aParts.length, bParts.length);

  for (let i = 0; i < maxLength; i += 1) {
    const aValue = aParts[i] ?? 0;
    const bValue = bParts[i] ?? 0;
    if (aValue > bValue) return 1;
    if (aValue < bValue) return -1;
  }

  return 0;
}

function formatPublishedDate(value?: string | Date | null): string {
  if (!value) return "날짜 정보 없음";

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "날짜 정보 없음";

  return date.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

export default function VersionHistoryScreen() {
  const colors = useColors();
  const router = useRouter();
  const currentVersion = Constants.expoConfig?.version ?? "0.0.0";

  const { data: history = [], isLoading, refetch, isRefetching } = trpc.appVersion.getHistory.useQuery(
    { platform: "android" },
    { staleTime: 1000 * 60 * 10 }
  );

  const latestVersion = useMemo(() => history[0]?.version ?? currentVersion, [history, currentVersion]);

  return (
    <ScreenContainer>
      <View className="flex-1 px-5 pt-6 pb-4">
        <View className="flex-row items-center justify-between mb-4">
          <Pressable
            onPress={() => router.back()}
            className="w-10 h-10 rounded-full items-center justify-center bg-card"
          >
            <MaterialIcons name="arrow-back" size={22} color={colors.foreground} />
          </Pressable>
          <Text className="text-foreground text-lg font-bold">버전 히스토리</Text>
          <View className="w-10" />
        </View>

        <View className="bg-card border border-border rounded-2xl px-4 py-3 mb-4">
          <Text className="text-muted text-xs">현재 사용 버전</Text>
          <Text className="text-foreground text-base font-semibold mt-1">v{currentVersion}</Text>
          <Text className="text-muted text-xs mt-1">
            최신 버전: v{latestVersion}
          </Text>
        </View>

        <FlatList
          data={history}
          refreshing={isRefetching}
          onRefresh={refetch}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ paddingBottom: 20 }}
          ListEmptyComponent={
            <View className="bg-card border border-border rounded-2xl px-4 py-6 items-center">
              <Text className="text-muted">{isLoading ? "버전 정보를 불러오는 중..." : "등록된 버전 정보가 없습니다."}</Text>
            </View>
          }
          renderItem={({ item }) => {
            const isCurrentVersion = item.version === currentVersion;
            const hasNewerVersion = compareVersions(item.version, currentVersion) > 0;

            return (
              <View className="bg-card border border-border rounded-2xl p-4 mb-3">
                <View className="flex-row items-start justify-between">
                  <View className="flex-row flex-1 pr-3">
                    <View className="w-9 h-9 rounded-full bg-primary/20 items-center justify-center mr-3 mt-0.5">
                      <MaterialIcons name="new-releases" size={18} color={colors.primary} />
                    </View>
                    <View className="flex-1">
                      <Text className="text-foreground font-semibold text-base">v{item.version}</Text>
                      <Text className="text-muted text-xs mt-0.5">출시일: {formatPublishedDate(item.publishedAt)}</Text>
                    </View>
                  </View>
                  {isCurrentVersion ? (
                    <View className="bg-primary rounded-full px-2.5 py-1">
                      <Text className="text-white text-[11px] font-semibold">현재 버전</Text>
                    </View>
                  ) : null}
                </View>

                <Text className="text-muted text-sm leading-5 mt-3">
                  {item.releaseNotes?.trim() || "릴리즈 노트가 등록되지 않았습니다."}
                </Text>

                {hasNewerVersion && item.downloadUrl ? (
                  <Pressable
                    onPress={async () => {
                      try {
                        await Linking.openURL(item.downloadUrl);
                      } catch (error) {
                        Alert.alert("오류", "다운로드 링크를 열 수 없습니다.");
                        console.error("[VersionHistory] Failed to open download URL:", error);
                      }
                    }}
                    className="mt-3 self-start bg-primary rounded-lg px-3 py-2"
                  >
                    <Text className="text-white text-xs font-semibold">다운로드</Text>
                  </Pressable>
                ) : null}
              </View>
            );
          }}
        />
      </View>
    </ScreenContainer>
  );
}
