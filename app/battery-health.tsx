import { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { MaterialIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";

interface HealthReport {
  id: number;
  healthPercent: number;
  estimatedCyclesRemaining: number;
  totalCycles: number;
  totalDistanceKm: number;
  avgEfficiency: number;
  capacityDegradation: number;
  aiAnalysis: string;
  recommendations: string;
  reportDate: Date;
}

export default function BatteryHealthScreen() {
  const { scooterId, scooterName } = useLocalSearchParams<{
    scooterId: string;
    scooterName: string;
  }>();
  const router = useRouter();
  const colors = useColors();
  
  const [report, setReport] = useState<HealthReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  
  // Get latest report
  const { data: latestReport, refetch } = trpc.batteryHealth.getLatestReport.useQuery(
    { scooterId: parseInt(scooterId || "0") },
    { enabled: !!scooterId }
  );
  
  // Get report history
  const { data: historyData } = trpc.batteryHealth.getHistory.useQuery(
    { scooterId: parseInt(scooterId || "0"), limit: 5 },
    { enabled: !!scooterId }
  );
  
  // Generate new report
  const generateMutation = trpc.batteryHealth.generateReport.useMutation({
    onSuccess: (data) => {
      setReport(data as HealthReport);
      refetch();
      setGenerating(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (error) => {
      setGenerating(false);
      Alert.alert("오류", error.message);
    },
  });
  
  useEffect(() => {
    if (latestReport) {
      setReport(latestReport as HealthReport);
    }
    setLoading(false);
  }, [latestReport]);
  
  const handleGenerateReport = () => {
    setGenerating(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    generateMutation.mutate({ scooterId: parseInt(scooterId || "0") });
  };
  
  const getHealthColor = (percent: number) => {
    if (percent >= 80) return colors.success;
    if (percent >= 60) return colors.warning;
    return colors.error;
  };
  
  const getHealthLabel = (percent: number) => {
    if (percent >= 80) return "양호";
    if (percent >= 60) return "보통";
    return "교체 필요";
  };
  
  if (loading) {
    return (
      <ScreenContainer className="flex-1 items-center justify-center">
        <ActivityIndicator size="large" color={colors.primary} />
        <Text className="text-muted mt-4">배터리 정보를 불러오는 중...</Text>
      </ScreenContainer>
    );
  }
  
  return (
    <ScreenContainer>
      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
        {/* 헤더 */}
        <View className="flex-row items-center p-4 border-b border-border">
          <TouchableOpacity
            onPress={() => router.back()}
            className="mr-3"
            style={{ padding: 4 }}
          >
            <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
          </TouchableOpacity>
          <View className="flex-1">
            <Text className="text-xl font-bold text-foreground">배터리 건강도</Text>
            <Text className="text-sm text-muted">{scooterName}</Text>
          </View>
          <TouchableOpacity
            onPress={handleGenerateReport}
            disabled={generating}
            className="bg-primary rounded-full p-2"
          >
            {generating ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <MaterialIcons name="refresh" size={24} color="#fff" />
            )}
          </TouchableOpacity>
        </View>
        
        {report ? (
          <>
            {/* 건강도 원형 표시 */}
            <View className="items-center py-8">
              <View
                className="w-40 h-40 rounded-full items-center justify-center border-8"
                style={{ borderColor: getHealthColor(report.healthPercent) }}
              >
                <Text
                  className="text-4xl font-bold"
                  style={{ color: getHealthColor(report.healthPercent) }}
                >
                  {report.healthPercent}%
                </Text>
                <Text className="text-muted text-sm">
                  {getHealthLabel(report.healthPercent)}
                </Text>
              </View>
            </View>
            
            {/* 상세 정보 카드들 */}
            <View className="px-4 gap-3">
              {/* 사이클 정보 */}
              <View className="bg-surface rounded-xl p-4">
                <Text className="text-foreground font-semibold mb-3">충전 사이클</Text>
                <View className="flex-row justify-between">
                  <View className="items-center flex-1">
                    <Text className="text-2xl font-bold text-foreground">
                      {report.totalCycles}
                    </Text>
                    <Text className="text-muted text-xs">사용 사이클</Text>
                  </View>
                  <View className="w-px bg-border" />
                  <View className="items-center flex-1">
                    <Text className="text-2xl font-bold text-primary">
                      {report.estimatedCyclesRemaining}
                    </Text>
                    <Text className="text-muted text-xs">예상 잔여</Text>
                  </View>
                </View>
                <View className="mt-3 h-2 bg-border rounded-full overflow-hidden">
                  <View
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.min(100, (report.totalCycles / (report.totalCycles + report.estimatedCyclesRemaining)) * 100)}%`,
                      backgroundColor: getHealthColor(report.healthPercent),
                    }}
                  />
                </View>
              </View>
              
              {/* 효율 정보 */}
              <View className="bg-surface rounded-xl p-4">
                <Text className="text-foreground font-semibold mb-3">에너지 효율</Text>
                <View className="flex-row justify-between">
                  <View className="items-center flex-1">
                    <Text className="text-2xl font-bold text-foreground">
                      {report.avgEfficiency.toFixed(1)}
                    </Text>
                    <Text className="text-muted text-xs">Wh/km</Text>
                  </View>
                  <View className="w-px bg-border" />
                  <View className="items-center flex-1">
                    <Text className="text-2xl font-bold text-foreground">
                      {report.totalDistanceKm.toFixed(0)}
                    </Text>
                    <Text className="text-muted text-xs">총 주행 (km)</Text>
                  </View>
                  <View className="w-px bg-border" />
                  <View className="items-center flex-1">
                    <Text className="text-2xl font-bold" style={{ color: colors.error }}>
                      -{report.capacityDegradation.toFixed(0)}%
                    </Text>
                    <Text className="text-muted text-xs">용량 감소</Text>
                  </View>
                </View>
              </View>
              
              {/* AI 분석 */}
              <View className="bg-surface rounded-xl p-4">
                <View className="flex-row items-center mb-3">
                  <MaterialIcons name="psychology" size={20} color={colors.primary} />
                  <Text className="text-foreground font-semibold ml-2">AI 분석</Text>
                </View>
                <Text className="text-foreground leading-6">{report.aiAnalysis}</Text>
              </View>
              
              {/* 권장 사항 */}
              <View className="bg-primary/10 rounded-xl p-4 mb-6">
                <View className="flex-row items-center mb-3">
                  <MaterialIcons name="lightbulb" size={20} color={colors.primary} />
                  <Text className="text-primary font-semibold ml-2">권장 사항</Text>
                </View>
                <Text className="text-foreground leading-6">{report.recommendations}</Text>
              </View>
            </View>
            
            {/* 리포트 이력 */}
            {historyData && historyData.reports.length > 1 && (
              <View className="px-4 mb-8">
                <Text className="text-foreground font-semibold mb-3">이전 리포트</Text>
                {historyData.reports.slice(1).map((r, index) => (
                  <View
                    key={index}
                    className="bg-surface rounded-xl p-3 mb-2 flex-row items-center justify-between"
                  >
                    <View>
                      <Text className="text-muted text-sm">
                        {new Date(r.reportDate).toLocaleDateString()}
                      </Text>
                    </View>
                    <View className="flex-row items-center">
                      <Text
                        className="font-bold mr-2"
                        style={{ color: getHealthColor(r.healthPercent) }}
                      >
                        {r.healthPercent}%
                      </Text>
                      <Text className="text-muted text-sm">
                        {r.totalDistanceKm.toFixed(0)}km
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </>
        ) : (
          <View className="items-center py-16">
            <MaterialIcons name="battery-unknown" size={64} color={colors.muted} />
            <Text className="text-muted mt-4 text-center">
              배터리 건강도 리포트가 없습니다.
            </Text>
            <Text className="text-muted text-sm text-center mt-2">
              주행 기록이 쌓이면 더 정확한 분석이 가능합니다.
            </Text>
            <TouchableOpacity
              onPress={handleGenerateReport}
              disabled={generating}
              className="mt-6 bg-primary px-8 py-4 rounded-full"
            >
              {generating ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text className="text-white font-semibold">리포트 생성</Text>
              )}
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}
