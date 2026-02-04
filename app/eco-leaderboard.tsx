import { useState, useEffect, useCallback } from "react";
import { Text, View, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/hooks/use-auth";
import { getGradeColor, getGradeDescription } from "@/lib/eco-score";

interface EcoLeaderboardEntry {
  rank: number;
  userId: number;
  userName: string;
  profileImageUrl?: string;
  avgEcoScore: number;
  grade: 'S' | 'A' | 'B' | 'C' | 'D';
  totalCO2Saved: number;
  rideCount: number;
}

export default function EcoLeaderboardScreen() {
  const router = useRouter();
  const colors = useColors();
  const { user, isAuthenticated } = useAuth();
  const [period, setPeriod] = useState<'weekly' | 'monthly' | 'allTime'>('weekly');
  const [refreshing, setRefreshing] = useState(false);

  // tRPC queries - 상위 10위까지만 공개
  const leaderboardQuery = trpc.ecoLeaderboard.getLeaderboard.useQuery(
    { period, limit: 10 },
    { enabled: isAuthenticated }
  );

  const myRankQuery = trpc.ecoLeaderboard.getMyRank.useQuery(
    { period },
    { enabled: isAuthenticated }
  );

  const leaderboard = leaderboardQuery.data || [];
  const myRank = myRankQuery.data || null;
  const isLoading = leaderboardQuery.isLoading || myRankQuery.isLoading;

  // Refetch on focus
  useFocusEffect(
    useCallback(() => {
      if (isAuthenticated) {
        leaderboardQuery.refetch();
        myRankQuery.refetch();
      }
    }, [isAuthenticated, period])
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      leaderboardQuery.refetch(),
      myRankQuery.refetch(),
    ]);
    setRefreshing(false);
  };

  const handlePeriodChange = (newPeriod: typeof period) => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setPeriod(newPeriod);
  };

  const renderLeaderboardItem = ({ item, index }: { item: EcoLeaderboardEntry; index: number }) => {
    const isMe = user && item.userId === user.id;
    const isTop3 = item.rank <= 3;
    
    return (
      <TouchableOpacity
        style={[
          styles.leaderboardItem,
          { backgroundColor: colors.surface, borderColor: colors.border },
          isMe && { borderColor: colors.primary, borderWidth: 2 },
        ]}
        onPress={() => {
          if (Platform.OS !== "web") {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }
          router.push(`/user-profile?userId=${item.userId}`);
        }}
        activeOpacity={0.7}
      >
        {/* 순위 */}
        <View style={[styles.rankContainer, isTop3 && { backgroundColor: getGradeColor(item.grade) }]}>
          {isTop3 ? (
            <MaterialIcons 
              name={item.rank === 1 ? "emoji-events" : item.rank === 2 ? "workspace-premium" : "military-tech"} 
              size={20} 
              color="#FFFFFF" 
            />
          ) : (
            <Text style={[styles.rankText, { color: colors.muted }]}>{item.rank}</Text>
          )}
        </View>

        {/* 사용자 정보 */}
        <View style={styles.userInfo}>
          <Text style={[styles.userName, { color: colors.foreground }]} numberOfLines={1}>
            {item.userName}
            {isMe && " (나)"}
          </Text>
          <Text style={[styles.userStats, { color: colors.muted }]}>
            {item.rideCount}회 주행 · CO₂ {item.totalCO2Saved.toFixed(1)}kg 절감
          </Text>
        </View>

        {/* 에코 스코어 */}
        <View style={styles.scoreContainer}>
          <View style={[styles.gradeBadge, { backgroundColor: getGradeColor(item.grade) }]}>
            <Text style={styles.gradeText}>{item.grade}</Text>
          </View>
          <Text style={[styles.scoreText, { color: colors.foreground }]}>
            {item.avgEcoScore}점
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <ScreenContainer>
      {/* 헤더 */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>에코 리더보드</Text>
        <View style={styles.headerRight}>
          <MaterialIcons name="eco" size={24} color={colors.primary} />
        </View>
      </View>

      {/* 기간 선택 */}
      <View style={[styles.periodSelector, { backgroundColor: colors.surface }]}>
        {(['weekly', 'monthly', 'allTime'] as const).map((p) => (
          <TouchableOpacity
            key={p}
            style={[
              styles.periodButton,
              period === p && { backgroundColor: colors.primary },
            ]}
            onPress={() => handlePeriodChange(p)}
          >
            <Text
              style={[
                styles.periodButtonText,
                { color: period === p ? "#FFFFFF" : colors.muted },
              ]}
            >
              {p === 'weekly' ? '주간' : p === 'monthly' ? '월간' : '전체'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* 내 순위 카드 */}
      {myRank && (
        <View style={[styles.myRankCard, { backgroundColor: colors.surface, borderColor: colors.primary }]}>
          <View style={styles.myRankHeader}>
            <MaterialIcons name="person" size={20} color={colors.primary} />
            <Text style={[styles.myRankTitle, { color: colors.foreground }]}>내 에코 점수</Text>
          </View>
          <View style={styles.myRankContent}>
            <View style={styles.myRankLeft}>
              <Text style={[styles.myRankNumber, { color: colors.foreground }]}>#{myRank.rank}</Text>
              <Text style={[styles.myRankLabel, { color: colors.muted }]}>순위</Text>
            </View>
            <View style={styles.myRankCenter}>
              <View style={[styles.myGradeBadge, { backgroundColor: getGradeColor(myRank.grade) }]}>
                <Text style={styles.myGradeText}>{myRank.grade}</Text>
              </View>
              <Text style={[styles.myScoreText, { color: colors.foreground }]}>{myRank.avgEcoScore}점</Text>
            </View>
            <View style={styles.myRankRight}>
              <Text style={[styles.myCO2Text, { color: colors.primary }]}>
                CO₂ {myRank.totalCO2Saved.toFixed(1)}kg
              </Text>
              <Text style={[styles.myRankLabel, { color: colors.muted }]}>절감</Text>
            </View>
          </View>
          <Text style={[styles.myRankDescription, { color: colors.muted }]}>
            {getGradeDescription(myRank.grade)}
          </Text>
        </View>
      )}

      {/* 리더보드 - 상위 10위까지만 표시 */}
      <View style={[styles.leaderboardHeader, { borderBottomColor: colors.border }]}>
        <Text style={[styles.leaderboardHeaderText, { color: colors.muted }]}>
          🏆 TOP 10 에코 라이더
        </Text>
      </View>
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.muted }]}>로딩 중...</Text>
        </View>
      ) : (
        <FlatList
          data={leaderboard.slice(0, 10)}
          renderItem={renderLeaderboardItem}
          keyExtractor={(item) => String(item.userId)}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <MaterialIcons name="eco" size={48} color={colors.muted} />
              <Text style={[styles.emptyText, { color: colors.muted }]}>
                아직 데이터가 없습니다
              </Text>
              <Text style={[styles.emptySubText, { color: colors.muted }]}>
                주행을 시작하면 에코 점수가 기록됩니다
              </Text>
            </View>
          }
        />
      )}

      {/* 에코 팁 */}
      <View style={[styles.tipCard, { backgroundColor: colors.surface }]}>
        <MaterialIcons name="lightbulb" size={20} color={colors.warning} />
        <Text style={[styles.tipText, { color: colors.muted }]}>
          부드러운 가속과 15-25km/h 속도 유지로 에코 점수를 높여보세요!
        </Text>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
  },
  headerRight: {
    width: 32,
    alignItems: "center",
  },
  periodSelector: {
    flexDirection: "row",
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 12,
    padding: 4,
  },
  periodButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
  },
  periodButtonText: {
    fontSize: 14,
    fontWeight: "600",
  },
  myRankCard: {
    marginHorizontal: 16,
    marginTop: 16,
    padding: 16,
    borderRadius: 16,
    borderWidth: 2,
  },
  myRankHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  myRankTitle: {
    fontSize: 14,
    fontWeight: "600",
  },
  myRankContent: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  myRankLeft: {
    alignItems: "center",
  },
  myRankNumber: {
    fontSize: 28,
    fontWeight: "700",
  },
  myRankLabel: {
    fontSize: 12,
  },
  myRankCenter: {
    alignItems: "center",
  },
  myGradeBadge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 4,
  },
  myGradeText: {
    fontSize: 24,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  myScoreText: {
    fontSize: 16,
    fontWeight: "600",
  },
  myRankRight: {
    alignItems: "center",
  },
  myCO2Text: {
    fontSize: 16,
    fontWeight: "700",
  },
  myRankDescription: {
    textAlign: "center",
    marginTop: 12,
    fontSize: 13,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 100,
  },
  leaderboardItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
  },
  rankContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  rankText: {
    fontSize: 16,
    fontWeight: "600",
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 2,
  },
  userStats: {
    fontSize: 12,
  },
  scoreContainer: {
    alignItems: "center",
  },
  gradeBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 2,
  },
  gradeText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  scoreText: {
    fontSize: 12,
    fontWeight: "600",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
  },
  emptyContainer: {
    alignItems: "center",
    paddingVertical: 48,
  },
  emptyText: {
    marginTop: 12,
    fontSize: 14,
    fontWeight: "600",
  },
  emptySubText: {
    marginTop: 4,
    fontSize: 12,
  },
  tipCard: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 12,
    borderRadius: 12,
    gap: 8,
  },
  tipText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  leaderboardHeader: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    marginTop: 8,
  },
  leaderboardHeaderText: {
    fontSize: 14,
    fontWeight: "600",
  },
});
