# 한국 길안내 지원 맵 API 조사 결과

## 조사 배경
Google Maps API는 한국에서 길안내(Directions/Navigation) 기능을 지원하지 않습니다. 이는 한국의 지도 데이터 규제로 인해 Google이 한국 내 상세 도로 데이터를 사용할 수 없기 때문입니다. 따라서 한국에서 네비게이션 기능을 구현하려면 국내 지도 API를 사용해야 합니다.

## 주요 한국 지도 API 비교

### 1. 카카오 모빌리티 API (Kakao Mobility)

**무료 쿼터 (일일 제공량):**
| API | 일일 무료 요청 수 |
|-----|-----------------|
| 자동차 길찾기 | 10,000회 |
| 다중 경유지 길찾기 | 5,000회 |
| 다중 출발지 길찾기 | 1,000회 |
| 다중 목적지 길찾기 | 1,000회 |
| 미래운행정보 길찾기 | 5,000회 |
| 길찾기 SDK (실시간 길안내) | 100,000회 |
| 길찾기 SDK (안전운전 모드) | 100,000회 |
| 길찾기 SDK (위치 조회 모드) | 100,000회 |

**유료 가격 (무료 쿼터 초과 시):**
- 자동차 길찾기: ~1,000,000건 당 8원/건

**장점:**
- 한국 내 가장 널리 사용되는 지도 서비스
- 카카오내비 연동 가능
- REST API 및 SDK 모두 제공
- 상대적으로 넉넉한 무료 쿼터

**단점:**
- 이륜차(오토바이/킥보드) 전용 경로 미지원 (자동차 경로만 제공)

### 2. T Map API (SK텔레콤)

**제공 기능:**
- 지도보기 (Raster/Vector Map SDK)
- POI 검색
- 지오코딩
- 교통정보
- 경로안내 (자동차)
- 다중 경유지 안내
- 경유지 최적화
- Navi SDK (Android, iOS, Flutter)

**무료 쿼터:**
- POI 검색: 일 2만건
- 경로탐색: 일 1천건
- 교통정보: 일 1천건

**유료 가격:**
- 종량제: API별 필요한 수량을 후불 종량제로 사용
- 정액제: 월정액 2,000,000원(VAT별도)으로 일정 사용량만큼 이용

**장점:**
- 한국 내 가장 정확한 실시간 교통정보
- 네이티브 Navi SDK 제공 (Flutter 지원)
- 배달의민족, 이마트 등 대기업에서 사용 중

**단점:**
- 무료 쿼터가 상대적으로 적음
- 이륜차 전용 경로 미지원

### 3. 네이버 지도 API (Naver Maps)

**제공 기능:**
- 지도 표시 (Web, Android, iOS)
- Directions 5 API (경유지 5개까지)
- Directions 15 API (경유지 15개까지)
- 주소-좌표 변환

**무료 쿼터:**
- 지도 API: 월 300만 호출
- 로컬 API: 일 10만 호출

**장점:**
- 네이버 검색과 연동 가능
- 상세한 POI 정보

**단점:**
- 길찾기 API 문서가 상대적으로 부족
- 이륜차 전용 경로 미지원

## 이륜차(킥보드/오토바이) 경로 안내 현황

**중요:** 현재 한국의 모든 주요 지도 API는 **이륜차 전용 경로를 공식적으로 지원하지 않습니다.**

- 카카오: 자동차, 대중교통, 도보, 자전거 경로만 지원
- T Map: 자동차 경로만 지원
- 네이버: 자동차, 대중교통, 도보 경로만 지원

**대안:**
1. **자전거 경로 사용**: 킥보드는 자전거와 유사한 경로를 사용할 수 있음
2. **자동차 경로 사용**: 도로 주행 시 자동차 경로 참고
3. **Google Maps 자전거 경로**: Google Maps는 한국에서 자전거 경로를 부분적으로 지원

## 권장 구현 방안

### 단기 (현재 앱)
1. **현재 Google Maps 유지**: 지도 표시 및 GPS 추적은 Google Maps로 계속 사용
2. **길안내 기능 제한 안내**: 한국에서 턴바이턴 네비게이션은 제한적임을 사용자에게 안내
3. **외부 네비게이션 앱 연동**: 카카오내비, T Map 등 외부 앱으로 연결하는 버튼 제공

### 중기 (사용자 1,000명 이상 시)
1. **카카오 모빌리티 API 연동**: 자전거 또는 자동차 경로를 기반으로 길안내 제공
2. **하이브리드 접근**: 지도 표시는 Google Maps, 경로 계산은 카카오 API 사용

### 장기
1. **T Map Navi SDK 연동**: 네이티브 네비게이션 경험 제공
2. **이륜차 전용 경로 데이터 수집**: 사용자 주행 데이터를 기반으로 자체 경로 최적화

## 구현 예시: 외부 네비게이션 앱 연동

```typescript
import { Linking, Platform } from 'react-native';

// 카카오내비로 길안내 시작
const openKakaoNavi = async (destLat: number, destLng: number, destName: string) => {
  const kakaoNaviUrl = Platform.select({
    ios: `kakaomap://route?sp=&ep=${destLat},${destLng}&by=CAR`,
    android: `kakaomap://route?sp=&ep=${destLat},${destLng}&by=CAR`,
  });
  
  const canOpen = await Linking.canOpenURL(kakaoNaviUrl);
  if (canOpen) {
    await Linking.openURL(kakaoNaviUrl);
  } else {
    // 카카오맵 앱이 없으면 스토어로 이동
    const storeUrl = Platform.select({
      ios: 'https://apps.apple.com/kr/app/kakaomap/id304608425',
      android: 'https://play.google.com/store/apps/details?id=net.daum.android.map',
    });
    await Linking.openURL(storeUrl);
  }
};

// T Map으로 길안내 시작
const openTMap = async (destLat: number, destLng: number, destName: string) => {
  const tmapUrl = `tmap://route?goalx=${destLng}&goaly=${destLat}&goalname=${encodeURIComponent(destName)}`;
  
  const canOpen = await Linking.canOpenURL(tmapUrl);
  if (canOpen) {
    await Linking.openURL(tmapUrl);
  } else {
    const storeUrl = Platform.select({
      ios: 'https://apps.apple.com/kr/app/tmap/id431589174',
      android: 'https://play.google.com/store/apps/details?id=com.skt.tmap.ku',
    });
    await Linking.openURL(storeUrl);
  }
};

// 네이버 지도로 길안내 시작
const openNaverMap = async (destLat: number, destLng: number, destName: string) => {
  const naverUrl = `nmap://route/car?dlat=${destLat}&dlng=${destLng}&dname=${encodeURIComponent(destName)}&appname=com.scoop.riding`;
  
  const canOpen = await Linking.canOpenURL(naverUrl);
  if (canOpen) {
    await Linking.openURL(naverUrl);
  } else {
    const storeUrl = Platform.select({
      ios: 'https://apps.apple.com/kr/app/naver-map/id311867728',
      android: 'https://play.google.com/store/apps/details?id=com.nhn.android.nmap',
    });
    await Linking.openURL(storeUrl);
  }
};
```

## 결론

한국에서 킥보드/이륜차 전용 네비게이션을 구현하는 것은 현재 API 제한으로 인해 어렵습니다. 가장 실용적인 접근 방식은:

1. **외부 네비게이션 앱 연동**을 통해 사용자가 선호하는 앱으로 길안내를 받을 수 있도록 함
2. **자전거 경로**를 기반으로 대략적인 경로 안내 제공
3. 사용자 수가 증가하면 **카카오 모빌리티 API**를 연동하여 앱 내 길안내 기능 강화

---
작성일: 2026-01-30
