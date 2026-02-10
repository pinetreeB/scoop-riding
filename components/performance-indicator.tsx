/**
 * 성능 모니터링 인디케이터 컴포넌트
 * 주행 화면에서 GPS 정확도, 메모리 사용량 등을 표시
 */

import { useState, useEffect } from "react";
import { View, Text, Pressable, Modal, ScrollView, StyleSheet } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/use-colors";
import { performanceMonitor, type PerformanceMetrics, type PerformanceWarning } from "@/lib/performance-monitor";

interface PerformanceIndicatorProps {
  gpsAccuracy: number | null;
  gpsPointCount: number;
  isBackgroundEnabled: boolean;
}

export function PerformanceIndicator({
  gpsAccuracy,
  gpsPointCount,
  isBackgroundEnabled,
}: PerformanceIndicatorProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [showDetails, setShowDetails] = useState(false);
  const [metrics, setMetrics] = useState<PerformanceMetrics | null>(null);
  
  // 성능 모니터 업데이트
  useEffect(() => {
    performanceMonitor.recordGpsUpdate(gpsAccuracy);
    performanceMonitor.setGpsPointCount(gpsPointCount);
    performanceMonitor.setBackgroundMode(isBackgroundEnabled);
  }, [gpsAccuracy, gpsPointCount, isBackgroundEnabled]);
  
  // 주기적으로 메트릭 업데이트
  useEffect(() => {
    const interval = setInterval(() => {
      setMetrics(performanceMonitor.getMetrics());
    }, 2000);
    
    return () => clearInterval(interval);
  }, []);
  
  const status = performanceMonitor.getStatusSummary();
  
  const getStatusColor = () => {
    switch (status.status) {
      case "critical": return colors.error;
      case "warning": return colors.warning;
      default: return colors.success;
    }
  };
  
  const getStatusIcon = (): "signal-cellular-4-bar" | "signal-cellular-alt" | "signal-cellular-off" => {
    if (gpsAccuracy === null) return "signal-cellular-off";
    if (gpsAccuracy <= 10) return "signal-cellular-4-bar";
    if (gpsAccuracy <= 30) return "signal-cellular-alt";
    return "signal-cellular-alt";
  };
  
  const formatUptime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    }
    return `${minutes}:${secs.toString().padStart(2, "0")}`;
  };
  
  const getSeverityColor = (severity: PerformanceWarning["severity"]) => {
    switch (severity) {
      case "high": return colors.error;
      case "medium": return colors.warning;
      default: return colors.muted;
    }
  };
  
  return (
    <>
      <Pressable
        onPress={() => setShowDetails(true)}
        style={({ pressed }) => [
          styles.indicator,
          { backgroundColor: colors.surface, borderColor: colors.border },
          pressed && { opacity: 0.7 },
        ]}
      >
        <MaterialIcons name={getStatusIcon()} size={16} color={getStatusColor()} />
        <Text style={[styles.indicatorText, { color: colors.foreground }]}>
          {gpsAccuracy !== null ? `${gpsAccuracy.toFixed(0)}m` : "--"}
        </Text>
      </Pressable>
      
      <Modal
        visible={showDetails}
        animationType="slide"
        transparent
        onRequestClose={() => setShowDetails(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.background, paddingBottom: Math.max(16, insets.bottom + 8) }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>
                성능 모니터
              </Text>
              <Pressable onPress={() => setShowDetails(false)}>
                <MaterialIcons name="close" size={24} color={colors.foreground} />
              </Pressable>
            </View>
            
            <ScrollView style={styles.modalBody}>
              {/* 상태 요약 */}
              <View style={[styles.statusCard, { backgroundColor: colors.surface }]}>
                <View style={[styles.statusDot, { backgroundColor: getStatusColor() }]} />
                <Text style={[styles.statusText, { color: colors.foreground }]}>
                  {status.message}
                </Text>
              </View>
              
              {/* GPS 정보 */}
              <View style={[styles.section, { backgroundColor: colors.surface }]}>
                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                  GPS 정보
                </Text>
                <View style={styles.metricRow}>
                  <Text style={[styles.metricLabel, { color: colors.muted }]}>정확도</Text>
                  <Text style={[styles.metricValue, { color: colors.foreground }]}>
                    {gpsAccuracy !== null ? `${gpsAccuracy.toFixed(1)}m` : "측정 중..."}
                  </Text>
                </View>
                <View style={styles.metricRow}>
                  <Text style={[styles.metricLabel, { color: colors.muted }]}>포인트 수</Text>
                  <Text style={[styles.metricValue, { color: colors.foreground }]}>
                    {gpsPointCount.toLocaleString()}개
                  </Text>
                </View>
                <View style={styles.metricRow}>
                  <Text style={[styles.metricLabel, { color: colors.muted }]}>업데이트 빈도</Text>
                  <Text style={[styles.metricValue, { color: colors.foreground }]}>
                    {metrics?.gpsUpdateFrequency.toFixed(2) ?? "0"}/초
                  </Text>
                </View>
              </View>
              
              {/* 메모리 정보 */}
              <View style={[styles.section, { backgroundColor: colors.surface }]}>
                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                  메모리 사용량 (추정)
                </Text>
                <View style={styles.metricRow}>
                  <Text style={[styles.metricLabel, { color: colors.muted }]}>전체</Text>
                  <Text style={[styles.metricValue, { color: colors.foreground }]}>
                    {metrics?.estimatedMemoryUsage.toFixed(1) ?? "0"}MB
                  </Text>
                </View>
                <View style={styles.metricRow}>
                  <Text style={[styles.metricLabel, { color: colors.muted }]}>GPS 데이터</Text>
                  <Text style={[styles.metricValue, { color: colors.foreground }]}>
                    {metrics?.gpsPointsMemory.toFixed(2) ?? "0"}MB
                  </Text>
                </View>
              </View>
              
              {/* 앱 상태 */}
              <View style={[styles.section, { backgroundColor: colors.surface }]}>
                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                  앱 상태
                </Text>
                <View style={styles.metricRow}>
                  <Text style={[styles.metricLabel, { color: colors.muted }]}>실행 시간</Text>
                  <Text style={[styles.metricValue, { color: colors.foreground }]}>
                    {formatUptime(metrics?.uptime ?? 0)}
                  </Text>
                </View>
                <View style={styles.metricRow}>
                  <Text style={[styles.metricLabel, { color: colors.muted }]}>백그라운드</Text>
                  <Text style={[styles.metricValue, { color: isBackgroundEnabled ? colors.success : colors.muted }]}>
                    {isBackgroundEnabled ? "활성화" : "비활성화"}
                  </Text>
                </View>
              </View>
              
              {/* 경고 목록 */}
              {metrics && metrics.warnings.length > 0 && (
                <View style={[styles.section, { backgroundColor: colors.surface }]}>
                  <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                    최근 경고
                  </Text>
                  {metrics.warnings.slice(-5).reverse().map((warning, index) => (
                    <View key={index} style={styles.warningRow}>
                      <View style={[styles.warningDot, { backgroundColor: getSeverityColor(warning.severity) }]} />
                      <Text style={[styles.warningText, { color: colors.foreground }]}>
                        {warning.message}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  indicator: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    gap: 4,
  },
  indicatorText: {
    fontSize: 12,
    fontWeight: "500",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "80%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "600",
  },
  modalBody: {
    padding: 16,
  },
  statusCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    gap: 12,
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 16,
    fontWeight: "500",
  },
  section: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 12,
  },
  metricRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
  },
  metricLabel: {
    fontSize: 14,
  },
  metricValue: {
    fontSize: 14,
    fontWeight: "500",
  },
  warningRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    gap: 8,
  },
  warningDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  warningText: {
    fontSize: 13,
    flex: 1,
  },
});
