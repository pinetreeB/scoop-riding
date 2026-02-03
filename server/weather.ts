/**
 * 기상청 단기예보 API 연동 서비스
 * 초단기실황조회 API를 사용하여 현재 날씨 정보를 가져옵니다.
 */

import axios from "axios";

// 기상청 API 응답 타입
interface WeatherApiResponse {
  response: {
    header: {
      resultCode: string;
      resultMsg: string;
    };
    body?: {
      dataType: string;
      items: {
        item: WeatherItem[];
      };
      pageNo: number;
      numOfRows: number;
      totalCount: number;
    };
  };
}

interface WeatherItem {
  baseDate: string;
  baseTime: string;
  category: string;
  nx: number;
  ny: number;
  obsrValue: string;
}

// 날씨 정보 타입
export interface WeatherInfo {
  temperature: number | null;      // 기온 (℃)
  humidity: number | null;         // 습도 (%)
  windSpeed: number | null;        // 풍속 (m/s)
  windDirection: number | null;    // 풍향 (deg)
  precipitationType: number;       // 강수형태 (0:없음, 1:비, 2:비/눈, 3:눈, 5:빗방울, 6:빗방울눈날림, 7:눈날림)
  precipitation: number | null;    // 1시간 강수량 (mm)
  weatherCondition: string;        // 날씨 상태 텍스트
  fetchedAt: string;               // 데이터 조회 시각
}

// 강수형태 코드를 텍스트로 변환
function getPrecipitationText(ptyCode: number): string {
  switch (ptyCode) {
    case 0: return "맑음";
    case 1: return "비";
    case 2: return "비/눈";
    case 3: return "눈";
    case 5: return "빗방울";
    case 6: return "빗방울눈날림";
    case 7: return "눈날림";
    default: return "알 수 없음";
  }
}

// 위경도를 기상청 격자 좌표로 변환 (Lambert Conformal Conic Projection)
export function convertToGrid(lat: number, lon: number): { nx: number; ny: number } {
  const RE = 6371.00877; // 지구 반경(km)
  const GRID = 5.0; // 격자 간격(km)
  const SLAT1 = 30.0; // 투영 위도1(degree)
  const SLAT2 = 60.0; // 투영 위도2(degree)
  const OLON = 126.0; // 기준점 경도(degree)
  const OLAT = 38.0; // 기준점 위도(degree)
  const XO = 43; // 기준점 X좌표(GRID)
  const YO = 136; // 기준점 Y좌표(GRID)

  const DEGRAD = Math.PI / 180.0;

  const re = RE / GRID;
  const slat1 = SLAT1 * DEGRAD;
  const slat2 = SLAT2 * DEGRAD;
  const olon = OLON * DEGRAD;
  const olat = OLAT * DEGRAD;

  let sn = Math.tan(Math.PI * 0.25 + slat2 * 0.5) / Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sn = Math.log(Math.cos(slat1) / Math.cos(slat2)) / Math.log(sn);
  let sf = Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sf = (Math.pow(sf, sn) * Math.cos(slat1)) / sn;
  let ro = Math.tan(Math.PI * 0.25 + olat * 0.5);
  ro = (re * sf) / Math.pow(ro, sn);

  let ra = Math.tan(Math.PI * 0.25 + lat * DEGRAD * 0.5);
  ra = (re * sf) / Math.pow(ra, sn);
  let theta = lon * DEGRAD - olon;
  if (theta > Math.PI) theta -= 2.0 * Math.PI;
  if (theta < -Math.PI) theta += 2.0 * Math.PI;
  theta *= sn;

  const nx = Math.floor(ra * Math.sin(theta) + XO + 0.5);
  const ny = Math.floor(ro - ra * Math.cos(theta) + YO + 0.5);

  return { nx, ny };
}

// 현재 시각에 맞는 발표시각 계산 (정시 단위, API는 매 정시 40분 후 업데이트)
function getBaseDateTime(): { baseDate: string; baseTime: string } {
  const now = new Date();
  // 한국 시간으로 변환
  const kstOffset = 9 * 60 * 60 * 1000;
  const kstNow = new Date(now.getTime() + kstOffset);
  
  // 현재 시각에서 40분을 빼서 가장 최근 발표 시각 계산
  let baseHour = kstNow.getUTCHours();
  let baseDate = kstNow;
  
  // 40분 이전이면 이전 시간 데이터 사용
  if (kstNow.getUTCMinutes() < 40) {
    baseHour -= 1;
    if (baseHour < 0) {
      baseHour = 23;
      baseDate = new Date(kstNow.getTime() - 24 * 60 * 60 * 1000);
    }
  }

  const year = baseDate.getUTCFullYear();
  const month = String(baseDate.getUTCMonth() + 1).padStart(2, "0");
  const day = String(baseDate.getUTCDate()).padStart(2, "0");
  const hour = String(baseHour).padStart(2, "0");

  return {
    baseDate: `${year}${month}${day}`,
    baseTime: `${hour}00`,
  };
}

/**
 * 위경도 좌표로 현재 날씨 정보를 가져옵니다.
 * @param lat 위도
 * @param lon 경도
 * @param apiKey 기상청 API 서비스키
 * @returns 날씨 정보 또는 null (실패 시)
 */
export async function getWeatherInfo(
  lat: number,
  lon: number,
  apiKey: string
): Promise<WeatherInfo | null> {
  try {
    const { nx, ny } = convertToGrid(lat, lon);
    const { baseDate, baseTime } = getBaseDateTime();

    const url = "http://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getUltraSrtNcst";
    const params = {
      serviceKey: apiKey,
      pageNo: "1",
      numOfRows: "10",
      dataType: "JSON",
      base_date: baseDate,
      base_time: baseTime,
      nx: String(nx),
      ny: String(ny),
    };

    console.log(`[Weather] Fetching weather for lat=${lat}, lon=${lon}, grid=(${nx}, ${ny}), date=${baseDate}, time=${baseTime}`);

    const response = await axios.get<WeatherApiResponse>(url, { 
      params,
      timeout: 10000 
    });

    const data = response.data;

    if (data.response.header.resultCode !== "00") {
      console.error(`[Weather] API error: ${data.response.header.resultMsg}`);
      return null;
    }

    if (!data.response.body?.items?.item) {
      console.error("[Weather] No weather data in response");
      return null;
    }

    const items = data.response.body.items.item;
    
    // 카테고리별 값 추출
    const weatherData: Record<string, number> = {};
    for (const item of items) {
      weatherData[item.category] = parseFloat(item.obsrValue);
    }

    const precipitationType = weatherData["PTY"] ?? 0;
    
    const weatherInfo: WeatherInfo = {
      temperature: weatherData["T1H"] ?? null,
      humidity: weatherData["REH"] ?? null,
      windSpeed: weatherData["WSD"] ?? null,
      windDirection: weatherData["VEC"] ?? null,
      precipitationType,
      precipitation: weatherData["RN1"] ?? null,
      weatherCondition: getPrecipitationText(precipitationType),
      fetchedAt: new Date().toISOString(),
    };

    console.log(`[Weather] Success: ${weatherInfo.temperature}℃, ${weatherInfo.humidity}%, ${weatherInfo.weatherCondition}`);

    return weatherInfo;
  } catch (error) {
    console.error("[Weather] Failed to fetch weather:", error);
    return null;
  }
}

/**
 * 날씨 정보를 사람이 읽기 쉬운 형태로 변환
 */
export function formatWeatherInfo(weather: WeatherInfo): string {
  const parts: string[] = [];
  
  if (weather.temperature !== null) {
    parts.push(`기온 ${weather.temperature}℃`);
  }
  if (weather.humidity !== null) {
    parts.push(`습도 ${weather.humidity}%`);
  }
  if (weather.windSpeed !== null) {
    parts.push(`풍속 ${weather.windSpeed}m/s`);
  }
  parts.push(`날씨 ${weather.weatherCondition}`);
  
  if (weather.precipitation !== null && weather.precipitation > 0) {
    parts.push(`강수량 ${weather.precipitation}mm`);
  }

  return parts.join(", ");
}
