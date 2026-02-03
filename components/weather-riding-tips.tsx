import { View, Text, Pressable } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useColors } from "@/hooks/use-colors";
import { WeatherIcon } from "./weather-icon";

interface WeatherInfo {
  temperature?: number | null;
  humidity?: number | null;
  windSpeed?: number | null;
  weatherCondition?: string | null;
}

interface WeatherRidingTipsProps {
  weather: WeatherInfo | null;
  onDismiss?: () => void;
}

interface RidingTip {
  icon: string;
  title: string;
  description: string;
  severity: "info" | "warning" | "danger";
}

/**
 * 날씨 조건에 따른 주행 팁 생성
 */
function generateRidingTips(weather: WeatherInfo | null): RidingTip[] {
  if (!weather) return [];
  
  const tips: RidingTip[] = [];
  const { temperature, humidity, windSpeed, weatherCondition } = weather;
  
  // 날씨 상태 기반 팁
  if (weatherCondition) {
    const condLower = weatherCondition.toLowerCase();
    
    if (condLower.includes("비") || condLower.includes("rain") || condLower.includes("소나기")) {
      tips.push({
        icon: "warning",
        title: "미끄러움 주의",
        description: "비 오는 날은 노면이 미끄럽습니다. 제동 거리가 평소보다 1.5배 길어지므로 속도를 줄이고 급제동을 피하세요.",
        severity: "warning",
      });
      tips.push({
        icon: "visibility",
        title: "시야 확보",
        description: "우비나 방수 재킷을 착용하고, 헬멧 바이저에 발수 코팅을 해두면 시야 확보에 도움됩니다.",
        severity: "info",
      });
    }
    
    if (condLower.includes("눈") || condLower.includes("snow")) {
      tips.push({
        icon: "ac-unit",
        title: "적설 주의",
        description: "눈길 주행은 매우 위험합니다. 가급적 주행을 피하고, 불가피한 경우 최저 속도로 이동하세요.",
        severity: "danger",
      });
      tips.push({
        icon: "battery-alert",
        title: "배터리 성능 저하",
        description: "저온에서 배터리 효율이 20-30% 감소합니다. 평소보다 짧은 거리만 주행하세요.",
        severity: "warning",
      });
    }
    
    if (condLower.includes("안개") || condLower.includes("fog")) {
      tips.push({
        icon: "visibility-off",
        title: "시야 불량",
        description: "안개가 짙은 날은 시야가 제한됩니다. 전조등을 켜고 천천히 주행하세요.",
        severity: "warning",
      });
    }
  }
  
  // 온도 기반 팁
  if (temperature !== undefined && temperature !== null) {
    if (temperature <= 0) {
      tips.push({
        icon: "severe-cold",
        title: "동결 주의",
        description: "영하의 날씨에는 노면이 얼어있을 수 있습니다. 특히 그늘진 곳과 다리 위를 주의하세요.",
        severity: "danger",
      });
    } else if (temperature <= 5) {
      tips.push({
        icon: "thermostat",
        title: "저온 주의",
        description: "추운 날씨에는 타이어 그립력이 저하됩니다. 워밍업 후 주행하고 급가속을 피하세요.",
        severity: "warning",
      });
    } else if (temperature >= 35) {
      tips.push({
        icon: "wb-sunny",
        title: "고온 주의",
        description: "무더운 날씨에는 배터리 과열에 주의하세요. 장시간 주행 후 충전 전 10분 정도 쉬어주세요.",
        severity: "warning",
      });
    }
  }
  
  // 풍속 기반 팁
  if (windSpeed !== undefined && windSpeed !== null) {
    if (windSpeed >= 10) {
      tips.push({
        icon: "air",
        title: "강풍 주의",
        description: "강한 바람에 균형을 잃을 수 있습니다. 속도를 줄이고 핸들을 단단히 잡으세요.",
        severity: "warning",
      });
    } else if (windSpeed >= 7) {
      tips.push({
        icon: "air",
        title: "바람 주의",
        description: "바람이 강한 날은 연비가 10-20% 저하될 수 있습니다. 맞바람 구간에서 속도를 줄이세요.",
        severity: "info",
      });
    }
  }
  
  // 습도 기반 팁
  if (humidity !== undefined && humidity !== null && humidity >= 80) {
    tips.push({
      icon: "water-drop",
      title: "높은 습도",
      description: "습도가 높으면 노면이 미끄러울 수 있습니다. 특히 타일이나 맨홀 뚜껑을 주의하세요.",
      severity: "info",
    });
  }
  
  // 기본 팁 (날씨 정보가 있지만 특별한 주의사항이 없는 경우)
  if (tips.length === 0) {
    tips.push({
      icon: "check-circle",
      title: "좋은 주행 조건",
      description: "현재 날씨는 주행하기 좋은 조건입니다. 안전 운전하세요!",
      severity: "info",
    });
  }
  
  return tips;
}

/**
 * 날씨 기반 주행 추천 카드 컴포넌트
 */
export function WeatherRidingTips({ weather, onDismiss }: WeatherRidingTipsProps) {
  const colors = useColors();
  const tips = generateRidingTips(weather);
  
  if (!weather || tips.length === 0) return null;
  
  const getSeverityColor = (severity: RidingTip["severity"]) => {
    switch (severity) {
      case "danger": return colors.error;
      case "warning": return colors.warning;
      default: return colors.primary;
    }
  };
  
  const getSeverityBgColor = (severity: RidingTip["severity"]) => {
    switch (severity) {
      case "danger": return "rgba(239, 68, 68, 0.1)";
      case "warning": return "rgba(245, 158, 11, 0.1)";
      default: return "rgba(10, 126, 164, 0.1)";
    }
  };
  
  return (
    <View className="bg-surface rounded-2xl p-4">
      {/* Header */}
      <View className="flex-row items-center justify-between mb-3">
        <View className="flex-row items-center">
          <MaterialIcons name="tips-and-updates" size={20} color={colors.primary} />
          <Text className="text-foreground font-semibold ml-2">날씨 기반 주행 팁</Text>
        </View>
        {onDismiss && (
          <Pressable
            onPress={onDismiss}
            style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
          >
            <MaterialIcons name="close" size={20} color={colors.muted} />
          </Pressable>
        )}
      </View>
      
      {/* Current Weather Summary */}
      {weather && (
        <View className="flex-row items-center mb-4 p-3 bg-background rounded-xl">
          <WeatherIcon condition={weather.weatherCondition ?? undefined} size={32} />
          <View className="ml-3">
            <Text className="text-foreground font-medium">
              {weather.weatherCondition || "맑음"}
            </Text>
            <View className="flex-row items-center mt-0.5">
              {weather.temperature !== undefined && (
                <Text className="text-muted text-sm">{weather.temperature}°C</Text>
              )}
              {weather.humidity !== undefined && (
                <Text className="text-muted text-sm ml-2">습도 {weather.humidity}%</Text>
              )}
              {weather.windSpeed !== undefined && (
                <Text className="text-muted text-sm ml-2">풍속 {weather.windSpeed}m/s</Text>
              )}
            </View>
          </View>
        </View>
      )}
      
      {/* Tips List */}
      <View className="gap-3">
        {tips.map((tip, index) => (
          <View 
            key={index}
            className="p-3 rounded-xl"
            style={{ backgroundColor: getSeverityBgColor(tip.severity) }}
          >
            <View className="flex-row items-start">
              <MaterialIcons 
                name={tip.icon as any} 
                size={20} 
                color={getSeverityColor(tip.severity)} 
              />
              <View className="flex-1 ml-2">
                <Text 
                  className="font-medium"
                  style={{ color: getSeverityColor(tip.severity) }}
                >
                  {tip.title}
                </Text>
                <Text className="text-foreground text-sm mt-1 leading-5">
                  {tip.description}
                </Text>
              </View>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

/**
 * 컴팩트 버전의 날씨 주행 팁 (홈 화면용)
 */
export function WeatherRidingTipCompact({ weather }: { weather: WeatherInfo | null }) {
  const colors = useColors();
  const tips = generateRidingTips(weather);
  
  if (!weather || tips.length === 0) return null;
  
  // 가장 중요한 팁만 표시
  const mainTip = tips.find(t => t.severity === "danger") || 
                  tips.find(t => t.severity === "warning") || 
                  tips[0];
  
  const getSeverityColor = (severity: RidingTip["severity"]) => {
    switch (severity) {
      case "danger": return colors.error;
      case "warning": return colors.warning;
      default: return colors.primary;
    }
  };
  
  return (
    <View 
      className="flex-row items-center p-3 rounded-xl"
      style={{ 
        backgroundColor: mainTip.severity === "danger" 
          ? "rgba(239, 68, 68, 0.1)" 
          : mainTip.severity === "warning"
          ? "rgba(245, 158, 11, 0.1)"
          : "rgba(10, 126, 164, 0.1)"
      }}
    >
      <MaterialIcons 
        name={mainTip.icon as any} 
        size={18} 
        color={getSeverityColor(mainTip.severity)} 
      />
      <Text 
        className="flex-1 text-sm ml-2"
        style={{ color: colors.foreground }}
        numberOfLines={2}
      >
        {mainTip.description}
      </Text>
    </View>
  );
}
