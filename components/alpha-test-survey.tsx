import { useState, useEffect } from "react";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Platform,
  KeyboardAvoidingView,
  Linking,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";

const SURVEY_STORAGE_KEY = "@scoop_alpha_survey_completed";
const SURVEY_DISMISS_KEY = "@scoop_alpha_survey_dismissed";
const ALPHA_TEST_END_DATE = new Date("2026-02-28T23:59:59");

interface AlphaTestSurveyProps {
  onSubmit?: (feedback: SurveyFeedback) => void;
}

interface SurveyFeedback {
  overallRating: number;
  usabilityRating: number;
  featureRating: number;
  mostUsedFeature: string;
  improvementSuggestion: string;
  bugReport: string;
  wouldRecommend: boolean | null;
}

export function AlphaTestSurvey({ onSubmit }: AlphaTestSurveyProps) {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(1);
  const [feedback, setFeedback] = useState<SurveyFeedback>({
    overallRating: 0,
    usabilityRating: 0,
    featureRating: 0,
    mostUsedFeature: "",
    improvementSuggestion: "",
    bugReport: "",
    wouldRecommend: null,
  });

  useEffect(() => {
    checkSurveyStatus();
  }, []);

  const checkSurveyStatus = async () => {
    try {
      // 알파 테스트 기간 확인
      const now = new Date();
      if (now > ALPHA_TEST_END_DATE) {
        return; // 테스트 기간 종료
      }

      const completed = await AsyncStorage.getItem(SURVEY_STORAGE_KEY);
      const dismissed = await AsyncStorage.getItem(SURVEY_DISMISS_KEY);

      if (completed) {
        return; // 이미 완료
      }

      if (dismissed) {
        const dismissedDate = new Date(dismissed);
        const daysSinceDismiss = (now.getTime() - dismissedDate.getTime()) / (1000 * 60 * 60 * 24);
        if (daysSinceDismiss < 3) {
          return; // 3일 이내에 닫았으면 다시 표시하지 않음
        }
      }

      // 앱 사용 횟수 확인 (최소 3회 이상 사용 후 표시)
      const usageCount = await AsyncStorage.getItem("@scoop_app_usage_count");
      const count = usageCount ? parseInt(usageCount, 10) : 0;
      
      if (count >= 3) {
        // 약간의 딜레이 후 표시
        setTimeout(() => setVisible(true), 2000);
      }
    } catch (error) {
      console.error("Survey status check error:", error);
    }
  };

  const handleDismiss = async () => {
    await AsyncStorage.setItem(SURVEY_DISMISS_KEY, new Date().toISOString());
    setVisible(false);
  };

  const handleSubmit = async () => {
    try {
      await AsyncStorage.setItem(SURVEY_STORAGE_KEY, new Date().toISOString());
      onSubmit?.(feedback);
      setVisible(false);
    } catch (error) {
      console.error("Survey submit error:", error);
    }
  };

  const renderStars = (rating: number, onRate: (r: number) => void) => (
    <View className="flex-row gap-2 justify-center my-2">
      {[1, 2, 3, 4, 5].map((star) => (
        <TouchableOpacity key={star} onPress={() => onRate(star)}>
          <Ionicons
            name={star <= rating ? "star" : "star-outline"}
            size={36}
            color={star <= rating ? "#F59E0B" : "#9CA3AF"}
          />
        </TouchableOpacity>
      ))}
    </View>
  );

  const renderStep1 = () => (
    <View className="gap-4">
      <View className="items-center mb-4">
        <View className="bg-primary/20 rounded-full p-4 mb-3">
          <Ionicons name="flask" size={40} color="#F97316" />
        </View>
        <Text className="text-xl font-bold text-foreground text-center">
          오픈 알파 테스트 참여 감사합니다!
        </Text>
        <Text className="text-sm text-muted text-center mt-2">
          2월 한 달간 진행되는 알파 테스트입니다.{"\n"}
          소중한 피드백을 남겨주세요!
        </Text>
      </View>

      <View className="bg-surface rounded-xl p-4">
        <Text className="text-base font-semibold text-foreground mb-2">
          전반적인 만족도
        </Text>
        {renderStars(feedback.overallRating, (r) =>
          setFeedback({ ...feedback, overallRating: r })
        )}
      </View>

      <View className="bg-surface rounded-xl p-4">
        <Text className="text-base font-semibold text-foreground mb-2">
          사용 편의성
        </Text>
        {renderStars(feedback.usabilityRating, (r) =>
          setFeedback({ ...feedback, usabilityRating: r })
        )}
      </View>

      <View className="bg-surface rounded-xl p-4">
        <Text className="text-base font-semibold text-foreground mb-2">
          기능 완성도
        </Text>
        {renderStars(feedback.featureRating, (r) =>
          setFeedback({ ...feedback, featureRating: r })
        )}
      </View>
    </View>
  );

  const renderStep2 = () => (
    <View className="gap-4">
      <Text className="text-lg font-bold text-foreground text-center mb-2">
        어떤 기능을 가장 많이 사용하셨나요?
      </Text>

      {[
        { id: "riding", label: "주행 기록", icon: "speedometer" },
        { id: "group", label: "그룹 라이딩", icon: "people" },
        { id: "community", label: "커뮤니티", icon: "chatbubbles" },
        { id: "scooter", label: "기체 관리", icon: "bicycle" },
        { id: "stats", label: "통계 확인", icon: "stats-chart" },
      ].map((feature) => (
        <TouchableOpacity
          key={feature.id}
          className={`flex-row items-center p-4 rounded-xl border ${
            feedback.mostUsedFeature === feature.id
              ? "bg-primary/10 border-primary"
              : "bg-surface border-border"
          }`}
          onPress={() => setFeedback({ ...feedback, mostUsedFeature: feature.id })}
        >
          <Ionicons
            name={feature.icon as any}
            size={24}
            color={feedback.mostUsedFeature === feature.id ? "#F97316" : "#6B7280"}
          />
          <Text
            className={`ml-3 text-base ${
              feedback.mostUsedFeature === feature.id
                ? "text-primary font-semibold"
                : "text-foreground"
            }`}
          >
            {feature.label}
          </Text>
          {feedback.mostUsedFeature === feature.id && (
            <Ionicons name="checkmark-circle" size={24} color="#F97316" className="ml-auto" />
          )}
        </TouchableOpacity>
      ))}
    </View>
  );

  const renderStep3 = () => (
    <View className="gap-4">
      <Text className="text-lg font-bold text-foreground text-center mb-2">
        개선이 필요한 부분이 있나요?
      </Text>

      <View className="bg-surface rounded-xl p-4">
        <Text className="text-sm font-semibold text-foreground mb-2">
          개선 제안 (선택)
        </Text>
        <TextInput
          className="bg-background rounded-lg p-3 text-foreground min-h-[80px]"
          placeholder="더 나은 앱을 위한 제안을 남겨주세요"
          placeholderTextColor="#9CA3AF"
          multiline
          textAlignVertical="top"
          value={feedback.improvementSuggestion}
          onChangeText={(text) =>
            setFeedback({ ...feedback, improvementSuggestion: text })
          }
        />
      </View>

      <View className="bg-surface rounded-xl p-4">
        <Text className="text-sm font-semibold text-foreground mb-2">
          발견한 버그 (선택)
        </Text>
        <TextInput
          className="bg-background rounded-lg p-3 text-foreground min-h-[80px]"
          placeholder="발견한 버그나 오류가 있다면 알려주세요"
          placeholderTextColor="#9CA3AF"
          multiline
          textAlignVertical="top"
          value={feedback.bugReport}
          onChangeText={(text) => setFeedback({ ...feedback, bugReport: text })}
        />
      </View>

      <View className="bg-surface rounded-xl p-4">
        <Text className="text-sm font-semibold text-foreground mb-3">
          이 앱을 친구에게 추천하시겠어요?
        </Text>
        <View className="flex-row gap-3">
          <TouchableOpacity
            className={`flex-1 p-3 rounded-lg border ${
              feedback.wouldRecommend === true
                ? "bg-success/20 border-success"
                : "bg-background border-border"
            }`}
            onPress={() => setFeedback({ ...feedback, wouldRecommend: true })}
          >
            <Text
              className={`text-center font-semibold ${
                feedback.wouldRecommend === true ? "text-success" : "text-muted"
              }`}
            >
              네, 추천해요!
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            className={`flex-1 p-3 rounded-lg border ${
              feedback.wouldRecommend === false
                ? "bg-error/20 border-error"
                : "bg-background border-border"
            }`}
            onPress={() => setFeedback({ ...feedback, wouldRecommend: false })}
          >
            <Text
              className={`text-center font-semibold ${
                feedback.wouldRecommend === false ? "text-error" : "text-muted"
              }`}
            >
              아직은요...
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  const canProceed = () => {
    switch (step) {
      case 1:
        return (
          feedback.overallRating > 0 &&
          feedback.usabilityRating > 0 &&
          feedback.featureRating > 0
        );
      case 2:
        return feedback.mostUsedFeature !== "";
      case 3:
        return true; // 마지막 단계는 선택사항
      default:
        return false;
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleDismiss}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1"
      >
        <View className="flex-1 bg-black/50 justify-end">
          <View className="bg-background rounded-t-3xl max-h-[85%]">
            {/* Header */}
            <View className="flex-row items-center justify-between p-4 border-b border-border">
              <TouchableOpacity onPress={handleDismiss}>
                <Text className="text-muted">나중에</Text>
              </TouchableOpacity>
              <View className="flex-row gap-1">
                {[1, 2, 3].map((s) => (
                  <View
                    key={s}
                    className={`w-2 h-2 rounded-full ${
                      s === step ? "bg-primary" : "bg-border"
                    }`}
                  />
                ))}
              </View>
              <Text className="text-muted">{step}/3</Text>
            </View>

            {/* Content */}
            <ScrollView className="p-4" showsVerticalScrollIndicator={false}>
              {step === 1 && renderStep1()}
              {step === 2 && renderStep2()}
              {step === 3 && renderStep3()}
              <View className="h-4" />
            </ScrollView>

            {/* Footer */}
            <View className="p-4 border-t border-border">
              <View className="flex-row gap-3">
                {step > 1 && (
                  <TouchableOpacity
                    className="flex-1 bg-surface py-4 rounded-xl"
                    onPress={() => setStep(step - 1)}
                  >
                    <Text className="text-center font-semibold text-foreground">
                      이전
                    </Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  className={`flex-1 py-4 rounded-xl ${
                    canProceed() ? "bg-primary" : "bg-muted/30"
                  }`}
                  onPress={() => {
                    if (step < 3) {
                      setStep(step + 1);
                    } else {
                      handleSubmit();
                    }
                  }}
                  disabled={!canProceed()}
                >
                  <Text
                    className={`text-center font-semibold ${
                      canProceed() ? "text-white" : "text-muted"
                    }`}
                  >
                    {step < 3 ? "다음" : "제출하기"}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// 앱 사용 횟수 증가 함수 (앱 시작 시 호출)
export async function incrementAppUsageCount() {
  try {
    const usageCount = await AsyncStorage.getItem("@scoop_app_usage_count");
    const count = usageCount ? parseInt(usageCount, 10) : 0;
    await AsyncStorage.setItem("@scoop_app_usage_count", String(count + 1));
  } catch (error) {
    console.error("Usage count error:", error);
  }
}

// 알파 테스트 배너 컴포넌트
export function AlphaTestBanner() {
  const [visible, setVisible] = useState(true);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    checkBannerStatus();
  }, []);

  const checkBannerStatus = async () => {
    const now = new Date();
    if (now > ALPHA_TEST_END_DATE) {
      setVisible(false);
      return;
    }

    const bannerDismissed = await AsyncStorage.getItem("@scoop_alpha_banner_dismissed");
    if (bannerDismissed) {
      setDismissed(true);
    }
  };

  const handleDismiss = async () => {
    await AsyncStorage.setItem("@scoop_alpha_banner_dismissed", "true");
    setDismissed(true);
  };

  if (!visible || dismissed) return null;

  return (
    <View className="mx-4 mb-4 bg-primary/10 rounded-xl p-4 border border-primary/30">
      <View className="flex-row items-start">
        <View className="bg-primary/20 rounded-full p-2 mr-3">
          <Ionicons name="flask" size={20} color="#F97316" />
        </View>
        <View className="flex-1">
          <Text className="text-primary font-bold text-base">
            오픈 알파 테스트 진행 중
          </Text>
          <Text className="text-muted text-sm mt-1">
            2월 한 달간 알파 테스트가 진행됩니다.{"\n"}
            버그 발견 시 프로필 → 버그 리포트로 알려주세요!
          </Text>
        </View>
        <TouchableOpacity onPress={handleDismiss} className="p-1">
          <Ionicons name="close" size={20} color="#9CA3AF" />
        </TouchableOpacity>
      </View>
    </View>
  );
}
