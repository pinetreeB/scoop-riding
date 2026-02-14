# SCOOP - 전동킥보드 주행기록 앱 | 프로젝트 개요

**프로젝트명**: SCOOP (Scooter Riding Record & Community Platform)  
**플랫폼**: iOS / Android (Expo React Native)  
**버전**: v0.1.8  
**상태**: 활발한 개발 중 (오픈 알파 테스트)  
**GitHub**: [github.com/pinetreeB/scoop-riding](https://github.com/pinetreeB/scoop-riding)

---

## 📋 프로젝트 개요

### 앱의 목적
SCOOP은 **전동킥보드 사용자**를 위한 통합 플랫폼으로, 주행 기록 추적, 배터리 분석, 커뮤니티 공유, AI 기반 인사이트를 제공합니다.

### 핵심 기능 (v0.1.8 기준)
1. **주행 기록 추적** — GPS 기반 실시간 위치 추적, 거리/시간/속도 측정, 자동 복구
2. **배터리 분석** — 배터리 건강도 모니터링, 연비 분석, 충전 기록, AI 기반 수명 예측
3. **날씨 연동** — 기상청 API 연동, 주행 중 날씨 정보 기록, 날씨별 주행 통계
4. **AI 코칭** — Gemini API 기반 주행 분석, 개선 팁, 주간/월간 리포트
5. **커뮤니티** — 주행 기록 공유, 댓글/좋아요, 카테고리별 게시글
6. **그룹 라이딩** — 실시간 그룹 위치 공유, WebSocket 기반 멀티플레이어
7. **랭킹 & 배지** — 에코 리더보드, 성취 배지, 챌린지
8. **관리자 대시보드** — 설문, 버그 리포트, 공지사항, 사용자 관리

---

## 🏗️ 프로젝트 구조

```
scoop-riding/
├── app/                          # Expo Router 기반 화면 (모바일 앱)
│   ├── (tabs)/                   # 탭 바 네비게이션
│   │   ├── index.tsx             # 홈 화면 (통계, 날씨, 랭킹, AI 리포트)
│   │   ├── history.tsx           # 주행 기록 목록
│   │   ├── community.tsx         # 커뮤니티 게시글
│   │   ├── ai-assistant.tsx      # AI 도우미 챗봇
│   │   └── profile.tsx           # 프로필 & 설정
│   ├── riding.tsx                # 주행 화면 (실시간 GPS 추적)
│   ├── select-scooter.tsx        # 기체 선택
│   ├── ride-detail.tsx           # 주행 상세 조회
│   ├── admin-dashboard.tsx       # 관리자 대시보드
│   ├── group-riding.tsx          # 그룹 라이딩
│   └── ...                       # 기타 화면
├── components/                   # 재사용 가능한 컴포넌트
│   ├── screen-container.tsx      # SafeArea 래퍼
│   ├── weather-widget.tsx        # 날씨 카드
│   ├── skeleton-ui.tsx           # 로딩 스켈레톤
│   └── ...
├── hooks/                        # 커스텀 React Hooks
│   ├── use-auth.ts              # 인증 상태 관리
│   ├── use-colors.ts            # 테마 색상
│   └── ...
├── lib/                          # 유틸리티 & 상태 관리
│   ├── riding-store.ts          # 주행 데이터 로컬 저장
│   ├── gps-utils.ts             # GPS 거리 계산 (Haversine)
│   ├── ride-session-recovery.ts # 주행 세션 백업/복구
│   ├── trpc.ts                  # tRPC 클라이언트
│   └── ...
├── server/                       # 백엔드 (Express + tRPC)
│   ├── _core/index.ts           # Express 서버 진입점
│   ├── routers.ts               # tRPC 라우터 (모든 API 엔드포인트)
│   ├── db.ts                    # 데이터베이스 함수 (Drizzle ORM)
│   ├── weather.ts               # 기상청 API 연동
│   ├── ai.ts                    # Gemini API 연동
│   └── ...
├── __tests__/                    # Vitest 단위 테스트
├── assets/                       # 이미지, 아이콘
├── constants/                    # 상수 (번역, 테마, OAuth)
├── app.config.ts                # Expo 설정
├── package.json                 # 의존성
├── tailwind.config.js           # Tailwind CSS 설정
├── theme.config.js              # 테마 색상 정의
└── ...
```

---

## 🛠️ 기술 스택

### 프론트엔드 (모바일)
| 기술 | 버전 | 용도 |
|------|------|------|
| **React Native** | 0.81 | 크로스플랫폼 모바일 앱 |
| **Expo** | 54 | 개발 환경 & 배포 |
| **Expo Router** | 6 | 파일 기반 라우팅 |
| **TypeScript** | 5.9 | 타입 안정성 |
| **NativeWind** | 4 | Tailwind CSS for React Native |
| **React Native Reanimated** | 4.x | 애니메이션 & 제스처 |
| **TanStack Query** | 5.90 | 서버 상태 관리 |
| **AsyncStorage** | 2.2 | 로컬 데이터 저장 |
| **expo-location** | 1.1 | GPS 위치 추적 |
| **expo-audio** | 1.1 | 오디오 재생 |
| **expo-notifications** | 0.32 | 푸시 알림 |
| **i18next** | - | 한글/영어 다국어 지원 |

### 백엔드
| 기술 | 버전 | 용도 |
|------|------|------|
| **Node.js** | 22.13 | 런타임 |
| **Express** | 4.22 | HTTP 서버 |
| **tRPC** | 11.7 | 타입 안전 RPC |
| **Drizzle ORM** | 0.44 | 데이터베이스 쿼리 빌더 |
| **MySQL 2** | 3.16 | 데이터베이스 드라이버 |
| **GCP Cloud SQL** | - | 관리형 MySQL 데이터베이스 |
| **GCP Cloud Run** | - | 서버리스 배포 |

### AI & 외부 API
| 서비스 | 용도 |
|--------|------|
| **Google Gemini API** | AI 주행 분석, 챗봇, 코칭 |
| **기상청 API** | 실시간 날씨 정보 |
| **Expo Push API** | 푸시 알림 전송 |
| **Google Maps** | 지도 표시 (향후 확장) |

### 개발 도구
| 도구 | 용도 |
|------|------|
| **Vitest** | 단위 테스트 |
| **TypeScript** | 정적 타입 검사 |
| **Prettier** | 코드 포맷팅 |
| **ESLint** | 코드 린팅 |
| **pnpm** | 패키지 관리자 |

---

## 📊 데이터베이스 스키마

### 핵심 테이블
```sql
-- 사용자
users (id, email, name, avatar, role, createdAt, updatedAt)

-- 주행 기록
ridingRecords (id, userId, scooterId, startTime, endTime, distance, 
               duration, maxSpeed, avgSpeed, gpsPointsJson, weatherInfo, 
               batteryStart, batteryEnd, createdAt)

-- 기체 (스쿠터)
scooters (id, userId, name, model, totalDistance, totalRides, 
          batteryType, batteryVoltage, batteryCapacity, createdAt)

-- 커뮤니티 게시글
posts (id, userId, title, content, category, likes, comments, 
       createdAt, updatedAt)

-- 댓글
comments (id, postId, userId, content, likes, createdAt, updatedAt)

-- 그룹 라이딩
groupSessions (id, leaderId, name, status, createdAt, endedAt)
groupMembers (id, sessionId, userId, status, joinedAt)

-- 배터리 분석
chargingRecords (id, userId, scooterId, startSoc, endSoc, chargeTime, 
                 energyAdded, createdAt)

-- 정비 기록
maintenanceRecords (id, userId, scooterId, itemId, notes, cost, createdAt)

-- 설문 & 버그 리포트
surveys (id, question, options, createdAt)
surveyResponses (id, userId, surveyId, response, createdAt)
bugReports (id, userId, title, description, screenshotUrls, status, createdAt)

-- 배지 & 챌린지
badges (id, name, description, icon, criteria)
userBadges (id, userId, badgeId, earnedAt)
challenges (id, name, goal, reward, startDate, endDate)
```

---

## 🔑 주요 기술 결정 사항

### 1. GPS 데이터 관리
- **다운샘플링**: 장거리 주행(1h+) 시 GPS 포인트를 2,000개로 제한 (저장소 용량 절감)
- **RDP 알고리즘**: 주행 경로 압축으로 저장 비용 80% 절감
- **Fallback 저장**: 저장 실패 시 GPS 없이 기본 통계만 저장

### 2. 상태 관리
- **로컬**: AsyncStorage (간단한 상태)
- **서버**: tRPC + TanStack Query (복잡한 데이터)
- **실시간**: WebSocket (그룹 라이딩 위치 공유)

### 3. 배터리 분석
- **SOC 계산**: 배터리 타입별 전압→SOC 변환 테이블
- **연비**: Wh/km 단위 계산
- **AI 분석**: 날씨, 주행 습관, 배터리 사이클 기반 예측

### 4. 다국어 지원
- **i18n 라이브러리**: 한글/영어 지원
- **설정 화면**: 자동/한국어/English 선택 옵션
- **AI 응답**: 언어 설정에 따라 영어/한국어 응답

### 5. 에러 처리
- **Error Boundary**: React 컴포넌트 크래시 방지
- **Retry 로직**: 네트워크 실패 시 자동 재시도 (최대 2회)
- **Fallback UI**: 데이터 로딩 실패 시 에러 화면 표시

### 6. 성능 최적화
- **스켈레톤 UI**: 로딩 중 뼈대 화면 표시
- **이미지 압축**: GPS 포인트 JSON 크기 500KB 제한
- **쿼리 최적화**: N+1 쿼리 제거 (getPosts 63% 개선)

---

## 🎯 운영 방향 & 로드맵

### 현재 단계 (v0.1.8)
- ✅ 핵심 주행 기록 기능
- ✅ 배터리 분석 & AI 코칭
- ✅ 커뮤니티 & 그룹 라이딩
- ✅ 관리자 대시보드
- ✅ 오픈 알파 테스트 (사용자 ~50명)

### 단기 계획 (v0.2.0 ~ v0.3.0)
- [ ] 마켓플레이스 기능 (부품 호환성 DB, 상품 검색)
- [ ] 정비 관리 시스템 (자동 알림, 정비소 검색)
- [ ] 실시간 기능 강화 (WebSocket 채팅 개선)
- [ ] 판매자 시스템 (판매자 대시보드, 주문 관리)

### 장기 계획 (v1.0.0+)
- [ ] 글로벌 확장 (다국어, 해외 결제)
- [ ] 온디바이스 ML 모델 (API 비용 절감)
- [ ] 배터리 충전 네트워크 연동
- [ ] 보험 & 안전 기능 (사고 기록, 보험 청구)

---

## 📝 개발 규칙 & 컨벤션

### 파일 네이밍
- **화면**: `kebab-case.tsx` (예: `ride-detail.tsx`)
- **컴포넌트**: `PascalCase.tsx` (예: `WeatherWidget.tsx`)
- **유틸**: `kebab-case.ts` (예: `gps-utils.ts`)
- **타입**: `types.ts` 또는 파일 내 정의

### 코드 스타일
- **TypeScript**: 모든 함수에 타입 지정
- **React**: 함수형 컴포넌트 + Hooks
- **에러 처리**: try-catch + 사용자 친화적 메시지
- **성능**: useMemo, useCallback 적절히 사용

### 커밋 메시지
```
[Type] Brief description

- Detailed change 1
- Detailed change 2

Related issue: #123
```

**Type**: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`

### 테스트
- **단위 테스트**: Vitest로 핵심 로직 검증
- **통합 테스트**: 실기기 테스트 (iOS/Android)
- **성능 테스트**: 장거리 주행(1h+) 시뮬레이션

### 배포 프로세스
1. **로컬 테스트**: `npm test` 통과
2. **TypeScript 검사**: `npm run check` 통과
3. **체크포인트 생성**: `webdev_save_checkpoint`
4. **GitHub 푸시**: `git push origin main`
5. **APK 빌드**: Expo EAS Build
6. **배포**: 테스터에게 배포 링크 공유

---

## 🔐 보안 & 권한

### 사용자 역할
| 역할 | 권한 |
|------|------|
| **User** | 주행 기록 작성, 커뮤니티 참여 |
| **Admin** | 모든 관리 기능 + 사용자 관리 |
| **Sub-Admin** | 관리 기능 (활동 로그 제외) |

### API 보안
- **JWT 토큰**: 사용자 인증
- **Rate Limiting**: API 남용 방지 (분당 100회)
- **CORS**: 허용된 도메인만 접근
- **환경변수**: API 키는 `.env`에 저장 (Git 제외)

---

## 📞 주요 연락처 & 리소스

### 개발 팀
- **프로젝트 관리자**: pinetreeB (GitHub)
- **기술 스택**: Expo, Node.js, MySQL, GCP

### 외부 API 키 (필수)
- **Gemini API**: Google Cloud Console
- **기상청 API**: 기상청 개발자 포털
- **Expo Push**: Expo 프로젝트 설정

### 배포 환경
- **개발**: `https://8081-*.manus.computer` (로컬)
- **프로덕션**: GCP Cloud Run (asia-northeast3)
- **데이터베이스**: GCP Cloud SQL (MySQL)

---

## 🐛 알려진 이슈 & 해결 방법

### 장거리 주행 저장 오류
**증상**: 1시간 이상 주행 후 "저장 오류" 발생  
**원인**: GPS 포인트 대용량 + AsyncStorage 용량 한계  
**해결**: GPS 다운샘플링(2000개 제한) + Fallback 저장

### 기체 주행거리 0 표시
**증상**: 기체 선택 화면에서 주행거리가 0km로 표시  
**원인**: 서버 통계 재계산 미실행  
**해결**: scooters.list API에서 자동 recalculate 호출

### 커뮤니티 화면 안 뜸 (Galaxy S25)
**증상**: 특정 기기에서 커뮤니티 게시글 미표시  
**원인**: NativeWind Pressable className 비활성화  
**해결**: Pressable → TouchableOpacity 전환 + style prop 사용

---

## 📚 참고 문서

- **Expo 공식 문서**: https://docs.expo.dev
- **React Native 가이드**: https://reactnative.dev
- **tRPC 문서**: https://trpc.io
- **NativeWind**: https://www.nativewind.dev
- **기상청 API**: https://www.data.go.kr

---

**마지막 업데이트**: 2026-02-14  
**현재 버전**: v0.1.8 (GitHub 동기화 완료)
