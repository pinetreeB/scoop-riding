# SCOOP Riders v0.1.8 체크포인트
## 작성일: 2025-02-11

---

## 변경 사항 요약

### 1. SafeArea Modal 수정 (Edge-to-Edge 대응)
Android `edgeToEdgeEnabled: true`로 인해 Modal 내 콘텐츠가 시스템 네비게이션 바에 가려지는 문제 수정.
Modal은 새 Window에서 렌더되어 SafeAreaProvider 컨텍스트를 상속받지 못하므로 `useSafeAreaInsets()` 훅으로 직접 패딩 적용.

**수정 파일:**
- `components/alpha-test-survey.tsx` — Footer paddingBottom: Math.max(16, insets.bottom + 8)
- `components/announcement-popup.tsx` — Overlay paddingTop/Bottom: insets
- `components/badge-earned-popup.tsx` — Overlay paddingTop/Bottom: insets  
- `components/battery-optimization-guide.tsx` — paddingBottom: Math.max(40, insets.bottom + 16)
- `components/performance-indicator.tsx` — modalContent paddingBottom: Math.max(16, insets.bottom + 8)
- `app/challenge-detail.tsx` — Modal paddingBottom: Math.max(20, insets.bottom + 16)
- `app/compare-routes.tsx` — Modal paddingBottom: Math.max(16, insets.bottom + 8)
- `app/user-profile.tsx` — Modal overlay paddingTop/Bottom: insets

**이미 적용 확인 (스킵):**
- `app/(tabs)/index.tsx` — 이미 insets 적용됨
- `app/(tabs)/profile.tsx` — 4개 Modal 모두 이미 insets 적용됨
- `components/ride-analysis-modal.tsx` — 이미 useSafeAreaInsets 사용
- `components/voltage-input-modal.tsx` — 이미 SafeAreaView 사용

### 2. 관리자 대시보드 크래시 수정
0.1.7에서 설정 > 관리자 대시보드 진입 시 흰 화면/크래시 발생하던 문제 수정.

**원인:** `admin/dashboard.tsx`의 중첩 라우트 그룹 문제 + 이전 마이그레이션에서 import 구문 파손

**수정 내용:**
- `app/admin-dashboard.tsx` (신규) — 루트 레벨 관리자 대시보드 스크린
  - 깨진 import 구문 수정 (View import 누락, React 중복 import 제거)
  - ErrorBoundary 래퍼 추가로 크래시 시 복구 UI 제공
  - SafeArea insets 적용 (2개 Modal)
- `app/admin/dashboard.tsx` — /admin-dashboard로 리다이렉트 (기존 1200줄 → 6줄)
- `app/admin/index.tsx` — /admin-dashboard로 리다이렉트
- `app/_layout.tsx` — admin-dashboard 스크린 등록 (이미 완료)
- `app/(tabs)/profile.tsx` — router.push("/admin-dashboard") (이미 완료)

### 3. 날씨 기록 & AI 분석 확인 (변경 없음)
0.1.6에서 존재하던 기능이 0.1.7에서도 코드상 정상 존재 확인:
- riding.tsx: 주행 시작 시 weather.getCurrent로 날씨 수집 ✅
- riding.tsx: saveRideRecord에 temperature/humidity/windSpeed/weatherCondition/weatherChanges 포함 ✅
- ride-detail.tsx: WeatherInfoCard, WeatherTimeline 조건부 렌더링 ✅
- ride-detail.tsx: AI analyzeRide에 날씨 데이터 전달 ✅
- server/routers.ts: analyzeRide 프롬프트에 weatherInfo 포함 ✅

→ 날씨 미표시 시 가능한 원인: KMA_API_KEY 미설정, 네트워크 오류로 weather fetch 실패

---

## 수정된 파일 목록 (이 폴더에 포함)

```
v0.1.8 체크포인트/
├── CHANGELOG.md (이 파일)
├── components/
│   ├── alpha-test-survey.tsx
│   ├── announcement-popup.tsx
│   ├── badge-earned-popup.tsx
│   ├── battery-optimization-guide.tsx
│   └── performance-indicator.tsx
├── app/
│   ├── admin-dashboard.tsx (신규 - 루트 레벨)
│   ├── challenge-detail.tsx
│   ├── compare-routes.tsx
│   ├── user-profile.tsx
│   └── admin/
│       ├── dashboard.tsx (리다이렉트로 대체)
│       └── index.tsx (리다이렉트)
```

## 적용 패턴 참고

### Bottom Sheet Modal:
```tsx
const insets = useSafeAreaInsets();
// ...
<View style={{ paddingBottom: Math.max(16, insets.bottom + 8) }}>
```

### Center Dialog Modal:
```tsx
const insets = useSafeAreaInsets();
// ...
<View style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}>
```
