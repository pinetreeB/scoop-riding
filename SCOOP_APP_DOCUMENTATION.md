# SCOOP - 전동킥보드 주행기록 앱

## 📱 앱 개요

**SCOOP**은 전동킥보드(전동 모빌리티) 사용자를 위한 종합 주행 기록 및 분석 앱입니다. GPS 기반 실시간 주행 추적, AI 주행 분석, 커뮤니티, 그룹 라이딩 등 다양한 기능을 제공합니다.

### 핵심 기능
- **실시간 주행 기록**: GPS 기반 거리, 속도, 고도, 경로 추적
- **AI 주행 분석**: Google Gemini AI를 활용한 주행 패턴 분석 및 피드백
- **날씨 연동**: 기상청 API를 통한 주행 시 날씨 정보 자동 수집
- **배터리 분석**: 주행별 배터리 소모량 및 연비 분석
- **그룹 라이딩**: WebSocket 기반 실시간 위치 공유 및 채팅
- **커뮤니티**: 게시판, 댓글, 좋아요, 알림 시스템
- **업적/뱃지**: 주행 목표 달성 시 뱃지 획득

---

## 🛠 기술 스택

### Frontend (Mobile App)
| 기술 | 버전 | 용도 |
|------|------|------|
| React Native | 0.81.5 | 크로스 플랫폼 모바일 앱 |
| Expo SDK | 54 | 네이티브 기능 접근 |
| TypeScript | 5.9 | 타입 안전성 |
| NativeWind | 4.x | Tailwind CSS 스타일링 |
| Expo Router | 6.x | 파일 기반 라우팅 |
| TanStack Query | 5.x | 서버 상태 관리 |
| tRPC | 11.x | 타입 안전 API 통신 |
| React Native Reanimated | 4.x | 애니메이션 |

### Backend (Server)
| 기술 | 용도 |
|------|------|
| Express.js | HTTP 서버 |
| tRPC | API 라우터 |
| Drizzle ORM | 데이터베이스 ORM |
| PostgreSQL | 메인 데이터베이스 |
| WebSocket | 실시간 통신 (그룹 라이딩) |
| Google Gemini AI | AI 주행 분석 |
| 기상청 API | 날씨 정보 |

### 인프라
| 서비스 | 용도 |
|------|------|
| EAS Build | 앱 빌드 |
| Google OAuth | 소셜 로그인 |
| Google Maps API | 지도 표시 |
| S3 | 파일 저장소 |

---

## 📁 프로젝트 구조

```
scoop-riding/
├── app/                          # Expo Router 페이지
│   ├── (tabs)/                   # 탭 네비게이션
│   │   ├── _layout.tsx           # 탭 레이아웃
│   │   ├── index.tsx             # 홈 화면
│   │   ├── history.tsx           # 주행 기록 목록
│   │   ├── community.tsx         # 커뮤니티
│   │   ├── ai-assistant.tsx      # AI 도우미
│   │   └── settings.tsx          # 설정
│   ├── admin/                    # 관리자 페이지
│   │   └── dashboard.tsx         # 관리자 대시보드
│   ├── riding.tsx                # 주행 화면 (핵심)
│   ├── ride-detail.tsx           # 주행 상세
│   ├── scooter-select.tsx        # 기체 선택
│   ├── group-riding.tsx          # 그룹 라이딩
│   ├── weather-stats.tsx         # 날씨별 통계
│   ├── monthly-weather-report.tsx # 월간 날씨 리포트
│   └── ...
├── components/                   # 재사용 컴포넌트
│   ├── screen-container.tsx      # SafeArea 래퍼
│   ├── weather-widget.tsx        # 날씨 위젯
│   ├── weather-icon.tsx          # 날씨 아이콘
│   ├── weather-timeline.tsx      # 경로별 날씨 타임라인
│   ├── weather-riding-tips.tsx   # 날씨 기반 주행 팁
│   ├── performance-indicator.tsx # 성능 모니터링 UI
│   └── ui/                       # UI 컴포넌트
├── lib/                          # 유틸리티 및 상태 관리
│   ├── riding-store.ts           # 주행 기록 로컬 저장소
│   ├── scooter-store.ts          # 킥보드 정보 저장소
│   ├── ride-analysis.ts          # GPS 데이터 분석
│   ├── ride-session-recovery.ts  # 세션 복구 (앱 강제종료 대비)
│   ├── performance-monitor.ts    # 성능 모니터링
│   ├── notifications.ts          # 푸시 알림
│   ├── gps-utils.ts              # GPS 계산 유틸
│   ├── trpc.ts                   # tRPC 클라이언트
│   └── utils.ts                  # 공통 유틸
├── hooks/                        # 커스텀 훅
│   ├── use-colors.ts             # 테마 색상
│   ├── use-auth.ts               # 인증 상태
│   └── use-group-websocket.ts    # 그룹 WebSocket
├── server/                       # 백엔드 서버
│   ├── _core/                    # 서버 코어
│   │   └── index.ts              # 서버 엔트리
│   ├── routers.ts                # tRPC 라우터 (API 정의)
│   ├── db.ts                     # 데이터베이스 함수
│   ├── weather.ts                # 기상청 API 연동
│   └── __tests__/                # 서버 테스트
├── drizzle/                      # 데이터베이스
│   └── schema.ts                 # DB 스키마 정의
├── shared/                       # 공유 타입/스키마
├── tests/                        # 테스트 파일
├── docs/                         # 문서
├── app.config.ts                 # Expo 설정
├── tailwind.config.js            # Tailwind 설정
├── theme.config.js               # 테마 색상 설정
├── package.json                  # 의존성
├── todo.md                       # 기능 구현 히스토리
└── design.md                     # UI/UX 디자인 문서
```

---

## 🔑 핵심 파일 설명

### 1. `app/riding.tsx` - 주행 화면 (가장 중요)
- **기능**: 실시간 GPS 추적, 속도/거리/시간 계산, 지도 표시
- **주요 로직**:
  - GPS 위치 추적 및 필터링 (정확도, 속도 기반)
  - 자동 일시정지 (정지 감지 시)
  - 배터리 전압 기록
  - 날씨 정보 수집 (주행 시작 시, 5km/30분마다)
  - 그룹 라이딩 WebSocket 연동
  - AI 주행 분석 요청
  - 세션 자동 백업/복구 (앱 강제종료 대비)

### 2. `lib/riding-store.ts` - 주행 기록 저장소
- **기능**: AsyncStorage 기반 로컬 주행 기록 관리
- **주요 함수**:
  - `saveRidingRecord()`: 중복 체크 후 저장
  - `getRidingRecords()`: 기록 조회
  - `deleteRidingRecord()`: 기록 삭제
  - `syncRidingRecords()`: 서버 동기화

### 3. `server/routers.ts` - API 라우터
- **주요 API**:
  - `rides.create`: 주행 기록 생성
  - `rides.analyzeRide`: AI 주행 분석
  - `weather.getCurrent`: 현재 날씨 조회
  - `groups.*`: 그룹 라이딩 관련
  - `posts.*`: 커뮤니티 게시글
  - `badges.*`: 업적/뱃지

### 4. `server/weather.ts` - 기상청 API 연동
- **기능**: 위경도 → 기상청 격자 변환, 단기예보 조회
- **수집 데이터**: 온도, 습도, 풍속, 풍향, 강수형태, 날씨상태

### 5. `lib/ride-analysis.ts` - GPS 데이터 분석
- **분석 항목**:
  - 가속도 (속도 변화율)
  - 경사도/고도 변화
  - 급가속/급감속 횟수
  - 정지 횟수

---

## 📊 데이터베이스 스키마 (주요 테이블)

```sql
-- 사용자
users (id, email, name, profileImage, profileColor, isAdmin, createdAt)

-- 주행 기록
ridingRecords (
  id, date, duration, distance, avgSpeed, maxSpeed,
  startTime, endTime, gpsPoints, scooterId, scooterName,
  voltageStart, voltageEnd, socStart, socEnd,
  temperature, humidity, windSpeed, weatherCondition,
  userId, synced, createdAt
)

-- 킥보드
scooters (id, name, model, batteryVoltage, batteryCapacity, userId)

-- 그룹 라이딩
groups (id, name, code, creatorId, isActive, createdAt)
groupMembers (id, groupId, userId, joinedAt)

-- 커뮤니티
posts (id, title, content, category, authorId, viewCount, createdAt)
comments (id, postId, content, authorId, createdAt)
likes (id, postId, userId, createdAt)

-- 업적/뱃지
badges (id, name, description, icon, condition, createdAt)
userBadges (id, userId, badgeId, earnedAt)

-- 목표
goals (id, userId, type, targetValue, currentValue, startDate, endDate)
```

---

## 🔄 주요 플로우

### 주행 기록 플로우
```
1. 홈 화면 → "주행 시작" 버튼
2. 기체 선택 화면 → 킥보드 선택 (배터리 전압 입력 옵션)
3. 주행 화면 진입
   - GPS 추적 시작
   - 날씨 정보 수집 (기상청 API)
   - 실시간 속도/거리/시간 표시
   - 지도에 경로 표시
4. 주행 종료
   - 종료 전압 입력 (옵션)
   - 로컬 저장 (AsyncStorage)
   - 서버 동기화 (tRPC)
   - AI 분석 요청 (Gemini)
5. 주행 상세 화면
   - 통계 표시
   - AI 분석 결과
   - 날씨 정보
   - 고도/속도 그래프
```

### 그룹 라이딩 플로우
```
1. 그룹 생성 또는 참가 (초대 코드)
2. WebSocket 연결
3. 실시간 위치 공유 (500ms 간격)
4. 지도에 멤버 위치 표시
5. 그룹 채팅
6. 주행 종료 시 그룹 정보 포함 저장
```

---

## 🧪 테스트

```bash
# 전체 테스트 실행
pnpm test

# 특정 테스트 파일 실행
pnpm test server/__tests__/weather.test.ts
```

**테스트 현황**: 283개 테스트 통과

---

## 🚀 빌드 및 배포

```bash
# 개발 서버 실행
pnpm dev

# Android APK 빌드 (테스트용)
npx eas build --platform android --profile preview

# Android APK 빌드 (프로덕션)
npx eas build --platform android --profile production

# iOS 빌드
npx eas build --platform ios --profile production
```

---

## 🔐 환경 변수

| 변수명 | 설명 |
|--------|------|
| `DATABASE_URL` | PostgreSQL 연결 문자열 |
| `JWT_SECRET` | JWT 토큰 시크릿 |
| `GOOGLE_CLIENT_ID` | Google OAuth 클라이언트 ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth 시크릿 |
| `GEMINI_API_KEY` | Google Gemini AI API 키 |
| `KMA_API_KEY` | 기상청 API 키 |
| `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` | Google Maps API 키 |
| `S3_*` | S3 스토리지 설정 |

---

## 📝 최근 업데이트 (2026-02-04)

### 새로운 기능
- ✅ 기상청 API 연동 (날씨 정보 자동 수집)
- ✅ AI 분석 강화 (가속도, 경사도, 급가속/급감속)
- ✅ 날씨별 주행 통계 및 연비 비교 그래프
- ✅ 경로별 날씨 변화 타임라인
- ✅ 월간 날씨 리포트
- ✅ 홈 화면 날씨 위젯
- ✅ 주행 중 날씨 변화 푸시 알림
- ✅ 주행 세션 자동 복구 (앱 강제종료 대비)
- ✅ 성능 모니터링 인디케이터

### 버그 수정
- ✅ 주행 기록 중복 저장 문제
- ✅ 뒤로가기 종료 시 메인화면 이동
- ✅ 주행시간 측정 불일치 문제
- ✅ 관리자 대시보드 하얀화면 문제
- ✅ 키보드가 입력란 가리는 문제

---

## 📞 문의

이 문서에 대한 질문이나 코드 리뷰 요청은 개발자에게 문의해주세요.
