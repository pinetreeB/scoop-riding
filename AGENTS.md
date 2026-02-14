# AGENTS.md — SCOOP 프로젝트 AI 에이전트 가이드

> 이 문서는 Codex 및 기타 AI 코딩 에이전트가 SCOOP 프로젝트에서 작업할 때 반드시 읽어야 하는 컨텍스트 문서입니다.

---

## 🚨 핵심 상황 인지 (반드시 읽을 것)

### 이 프로젝트에는 인간 개발자가 없습니다

- 프로젝트 관리자(pinetreeB)는 **비개발자**입니다 (전공: 연극영화)
- 코딩 경험이 전혀 없으며, 기획과 방향 설정만 담당합니다
- 모든 코드는 AI(Manus, Claude, GPT Codex 등)가 작성했습니다
- 따라서 코드 수정 시 **다른 부분이 망가지지 않도록 각별히 주의**해야 합니다

### 이것이 의미하는 것

1. **코드 수정 후 반드시 기존 기능이 정상 작동하는지 확인**할 것
2. **수정 내용을 비개발자도 이해할 수 있는 한국어로 설명**할 것
3. **위험한 변경(DB 스키마 변경, 핵심 로직 수정)은 반드시 경고**할 것
4. **한 번에 하나의 문제만 수정**하고, 여러 문제를 한꺼번에 고치지 말 것
5. **불확실한 수정은 하지 말 것** — 확신이 없으면 분석 결과만 보고할 것

---

## 📋 프로젝트 개요

**SCOOP** — 전동킥보드 사용자를 위한 통합 플랫폼
- 주행 기록 추적 (GPS 기반)
- 배터리 분석 & AI 코칭
- 커뮤니티 & 그룹 라이딩
- 랭킹, 배지, 챌린지

**현재 상태**: v0.1.8 / 오픈 알파 테스트 (사용자 약 50명)
**GitHub**: github.com/pinetreeB/scoop-riding

---

## 🛠️ 기술 스택 요약

### 프론트엔드
- **React Native 0.81** + **Expo 54** + **Expo Router 6**
- **TypeScript 5.9**
- **NativeWind 4** (Tailwind CSS for React Native)
- **TanStack Query 5.90** (서버 상태 관리)
- **AsyncStorage** (로컬 데이터)
- 패키지 관리자: **pnpm**

### 백엔드
- **Node.js 22.13** + **Express 4.22**
- **tRPC 11.7** (타입 안전 RPC)
- **Drizzle ORM 0.44** + **MySQL 2**
- **GCP Cloud SQL** (MySQL) + **GCP Cloud Run** (서버리스 배포)

### 외부 API
- **Google Gemini API** — AI 주행 분석, 챗봇
- **기상청 API** — 실시간 날씨
- **Expo Push API** — 푸시 알림

---

## 📁 프로젝트 구조

```
scoop-riding/
├── app/                    # Expo Router 화면 (모바일 앱)
│   ├── (tabs)/             # 탭 네비게이션 (홈, 기록, 커뮤니티, AI, 프로필)
│   ├── riding.tsx          # 주행 화면 (실시간 GPS)
│   ├── admin-dashboard.tsx # 관리자 대시보드
│   └── ...
├── components/             # 재사용 컴포넌트
├── hooks/                  # 커스텀 React Hooks
├── lib/                    # 유틸리티 & 상태 관리
│   ├── riding-store.ts     # 주행 데이터 로컬 저장
│   ├── gps-utils.ts        # GPS 거리 계산 (Haversine)
│   └── trpc.ts             # tRPC 클라이언트
├── server/                 # 백엔드
│   ├── _core/index.ts      # Express 서버 진입점
│   ├── routers.ts          # tRPC 라우터 (모든 API)
│   ├── db.ts               # DB 함수 (Drizzle ORM)
│   └── ...
├── __tests__/              # Vitest 테스트
├── constants/              # 상수, 번역, 테마
└── package.json
```

---

## ⚠️ 작업 시 주의사항

### 절대 하지 말 것
- DB 스키마를 임의로 변경하지 말 것 (마이그레이션 필요 — Manus가 담당)
- 환경변수(.env)를 수정하거나 노출하지 말 것
- 패키지를 임의로 추가/삭제하지 말 것 (의존성 충돌 위험)
- GCP 서버 설정을 변경하지 말 것 (Manus가 담당)
- 여러 파일을 한꺼번에 대규모로 리팩토링하지 말 것

### 반드시 할 것
- 수정 전에 관련 코드를 충분히 읽고 영향 범위를 파악할 것
- TypeScript 타입을 반드시 지킬 것
- try-catch로 에러 처리를 포함할 것
- 수정 후 `npm run check` (TypeScript 검사)가 통과하는지 확인할 것
- 커밋 메시지는 `[Type] 한국어 설명` 형식으로 작성할 것

### 파일 네이밍 규칙
- 화면 파일: `kebab-case.tsx` (예: `ride-detail.tsx`)
- 컴포넌트: `PascalCase.tsx` (예: `WeatherWidget.tsx`)
- 유틸리티: `kebab-case.ts` (예: `gps-utils.ts`)

### 커밋 메시지 형식
```
[fix] 회원가입 화면에서 이메일 입력 후 화면 멈추는 버그 수정

- signup.tsx에서 이메일 유효성 검사 로직 수정
- 빈 이메일 입력 시 예외 처리 추가

Related issue: #123
```
Type: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`

---

## 🐛 알려진 이슈 (참고용)

| 이슈 | 원인 | 상태 |
|------|------|------|
| 장거리 주행(1h+) 저장 오류 | GPS 포인트 대용량 + AsyncStorage 한계 | 해결됨 (다운샘플링) |
| 기체 주행거리 0 표시 | 서버 통계 재계산 미실행 | 해결됨 |
| Galaxy S25 커뮤니티 화면 안 뜸 | NativeWind Pressable className | 해결됨 |

---

## 🔑 주요 기술 결정 사항

- **GPS 다운샘플링**: 장거리 주행 시 GPS 포인트 2,000개 제한 (RDP 알고리즘)
- **상태 관리**: 로컬(AsyncStorage) + 서버(tRPC + TanStack Query) + 실시간(WebSocket)
- **배터리 분석**: 배터리 타입별 전압→SOC 변환, Wh/km 연비 계산
- **다국어**: i18next로 한글/영어 지원
- **에러 처리**: Error Boundary + Retry 로직 (최대 2회) + Fallback UI

---

## 👥 AI 팀 역할 분담

| AI | 담당 업무 |
|----|----------|
| **Codex (GPT)** | 코드 작성, 수정, 버그 수정, GitHub PR 생성 |
| **Claude** | 기획 정리, 코드 리뷰, 아키텍처 설계, 방향 설정 |
| **Gemini** | 이미지 생성, 리서치, 자료 조사 |
| **Manus** | 서버 배포, 앱 빌드(EAS), DB 마이그레이션, GCP 관리 |

### Codex의 역할 범위
- ✅ 코드 수정 및 새 기능 구현
- ✅ 버그 원인 분석 및 수정
- ✅ 코드 리뷰 및 개선 제안
- ✅ 테스트 코드 작성
- ❌ 서버 배포 (→ Manus)
- ❌ 앱 빌드/배포 (→ Manus)
- ❌ DB 스키마 변경 (→ Manus + Claude 검토)
- ❌ GCP 설정 변경 (→ Manus)

---

## 📝 작업 요청 시 응답 형식

작업 완료 후 반드시 다음을 포함해 주세요:

```
## 작업 요약
- 무엇을 수정/추가했는지 (한국어, 비개발자가 이해할 수 있게)

## 수정된 파일
- 파일 경로와 변경 내용

## 영향 범위
- 이 수정으로 영향받을 수 있는 다른 기능

## 테스트 방법
- 수정이 제대로 되었는지 확인하는 방법 (비개발자 기준)

## 주의사항
- 추가로 필요한 작업이 있다면 명시 (배포 필요, DB 변경 필요 등)
```

---

**마지막 업데이트**: 2026-02-14
**프로젝트 버전**: v0.1.8
