import { View, Text } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useColors } from "@/hooks/use-colors";

interface WeatherIconProps {
  condition?: string;
  size?: number;
  showLabel?: boolean;
}

/**
 * 날씨 상태에 따른 아이콘 표시
 * 기상청 API의 날씨 상태 문자열을 아이콘으로 변환
 */
export function WeatherIcon({ condition, size = 24, showLabel = false }: WeatherIconProps) {
  const colors = useColors();
  
  // 날씨 상태에 따른 아이콘 및 색상 매핑
  const getWeatherInfo = (cond?: string): { icon: keyof typeof MaterialIcons.glyphMap; color: string; label: string } => {
    if (!cond) return { icon: "wb-sunny", color: "#FFB800", label: "맑음" };
    
    const condLower = cond.toLowerCase();
    
    if (condLower.includes("비") || condLower.includes("rain") || condLower.includes("소나기")) {
      return { icon: "grain", color: "#4A90D9", label: "비" };
    }
    if (condLower.includes("눈") || condLower.includes("snow")) {
      return { icon: "ac-unit", color: "#87CEEB", label: "눈" };
    }
    if (condLower.includes("흐림") || condLower.includes("구름") || condLower.includes("cloudy")) {
      return { icon: "cloud", color: "#9E9E9E", label: "흐림" };
    }
    if (condLower.includes("안개") || condLower.includes("fog")) {
      return { icon: "cloud", color: "#B0BEC5", label: "안개" };
    }
    if (condLower.includes("맑음") || condLower.includes("sunny") || condLower.includes("clear")) {
      return { icon: "wb-sunny", color: "#FFB800", label: "맑음" };
    }
    
    // 기본값
    return { icon: "wb-sunny", color: "#FFB800", label: cond };
  };
  
  const weatherInfo = getWeatherInfo(condition);
  
  return (
    <View className="flex-row items-center">
      <MaterialIcons name={weatherInfo.icon} size={size} color={weatherInfo.color} />
      {showLabel && (
        <Text className="text-sm text-muted ml-1">{weatherInfo.label}</Text>
      )}
    </View>
  );
}

interface WeatherInfoCardProps {
  temperature?: number;
  humidity?: number;
  windSpeed?: number;
  weatherCondition?: string;
  compact?: boolean;
}

/**
 * 날씨 정보 카드 컴포넌트
 * 주행 기록 상세 화면에서 사용
 */
export function WeatherInfoCard({ 
  temperature, 
  humidity, 
  windSpeed, 
  weatherCondition,
  compact = false 
}: WeatherInfoCardProps) {
  const colors = useColors();
  
  // 날씨 정보가 하나도 없으면 렌더링하지 않음
  if (temperature === undefined && humidity === undefined && windSpeed === undefined && !weatherCondition) {
    return null;
  }
  
  if (compact) {
    return (
      <View className="flex-row items-center bg-surface/50 rounded-lg px-3 py-2">
        <WeatherIcon condition={weatherCondition} size={20} />
        {temperature !== undefined && (
          <Text className="text-foreground font-medium ml-2">{temperature}°C</Text>
        )}
        {humidity !== undefined && (
          <Text className="text-muted text-sm ml-2">{humidity}%</Text>
        )}
        {windSpeed !== undefined && (
          <Text className="text-muted text-sm ml-2">{windSpeed}m/s</Text>
        )}
      </View>
    );
  }
  
  return (
    <View className="bg-surface rounded-2xl p-4">
      <View className="flex-row items-center mb-3">
        <MaterialIcons name="wb-cloudy" size={18} color={colors.primary} />
        <Text className="text-foreground font-semibold ml-2">주행 당시 날씨</Text>
      </View>
      
      <View className="flex-row items-center">
        {/* 날씨 아이콘 및 상태 */}
        <View className="items-center mr-6">
          <WeatherIcon condition={weatherCondition} size={40} />
          <Text className="text-muted text-sm mt-1">{weatherCondition || "맑음"}</Text>
        </View>
        
        {/* 상세 정보 */}
        <View className="flex-1">
          <View className="flex-row flex-wrap gap-4">
            {temperature !== undefined && (
              <View className="flex-row items-center">
                <MaterialIcons name="thermostat" size={16} color={colors.muted} />
                <Text className="text-foreground ml-1">{temperature}°C</Text>
              </View>
            )}
            {humidity !== undefined && (
              <View className="flex-row items-center">
                <MaterialIcons name="water-drop" size={16} color={colors.muted} />
                <Text className="text-foreground ml-1">{humidity}%</Text>
              </View>
            )}
            {windSpeed !== undefined && (
              <View className="flex-row items-center">
                <MaterialIcons name="air" size={16} color={colors.muted} />
                <Text className="text-foreground ml-1">{windSpeed}m/s</Text>
              </View>
            )}
          </View>
        </View>
      </View>
    </View>
  );
}
