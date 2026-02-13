# Loop Platform - API Specification v2.0

**Base URL:** `https://api.loopandloopy.com/v1`  
**Authentication:** JWT Bearer Token  
**Content-Type:** `application/json`

---

## 🤔 API Design Thinking Process

### Step 1: User Journey Analysis

**Q1: 신규 사용자가 앱을 처음 켰을 때 어떤 API가 필요한가?**

```
앱 실행
  ↓
1. GET /health - 서버 상태 확인
2. GET /app/config - 앱 설정 (버전, 강제 업데이트 여부)
3. POST /auth/login OR /auth/register
  ↓ 로그인 성공
4. GET /users/me - 내 프로필 조회
5. GET /users/me/onboarding-status - 온보딩 상태
  ↓ 온보딩 미완료 시
6. GET /device-types - 기기 타입 목록
7. GET /brands?type={id} - 브랜드 목록
8. GET /device-catalog/search - 기기 검색
9. POST /devices - 기기 등록
10. PATCH /users/me/onboarding - 온보딩 완료
```

**발견:** 온보딩 전용 API 엔드포인트 필요!

---

### Step 2: Core Feature Flows

#### 2.1 그룹 라이딩 생성부터 완료까지

```
Phase 1: 생성
  POST /groups - 그룹 생성
  → Response: {group_id}

Phase 2: 초대 (선택)
  POST /groups/{id}/invites - 친구 초대
  → Push notification to friends

Phase 3: 참가자 모집
  GET /groups - 근처 그룹 검색
  POST /groups/{id}/join - 참가 신청
  → Creator receives notification
  
  (승인 필요 시)
  GET /groups/{id}/pending-participants - 대기자 목록
  POST /groups/{id}/approve/{user_id} - 승인

Phase 4: 라이딩 시작
  POST /groups/{id}/start - 라이딩 시작
  → Status: ongoing
  → 모든 참가자 위치 공유 강제 활성화

Phase 5: 실시간 추적
  POST /live-locations - 위치 업데이트 (30초마다)
  GET /groups/{id}/live-locations - 그룹 멤버 위치
  
  (채팅)
  WS /groups/{id}/chat - WebSocket 연결
  POST /groups/{id}/messages - 메시지 전송

Phase 6: 종료
  POST /groups/{id}/complete - 라이딩 완료
  → 자동으로 rides 기록 생성
  POST /groups/{id}/rate - 평가하기
```

**발견:** 
- WebSocket for 실시간 채팅 필요
- 라이딩 자동 종료 API (시간 초과 시)

---

#### 2.2 부품 구매 플로우

```
Step 1: 검색
  GET /products/search?device_id={id}&q=배터리
  → 내 기기 호환 부품만 표시

Step 2: 상세 조회
  GET /products/{id}
  GET /products/{id}/compatibility?device_id={my_device}
  → 호환율 표시 (100%, 95%, 90%)
  
  GET /products/{id}/questions - Q&A 조회
  GET /products/{id}/reviews - 리뷰 조회

Step 3: 장바구니
  POST /cart/items - 장바구니 담기
  GET /cart - 장바구니 조회
  PATCH /cart/items/{id} - 수량 변경
  DELETE /cart/items/{id} - 삭제

Step 4: 주문
  POST /orders/preview - 주문 미리보기 (배송비 계산)
  POST /orders - 주문 생성
  → Stripe payment intent 생성
  
Step 5: 결제
  POST /orders/{id}/confirm-payment - 결제 확인
  → Stripe webhook으로 최종 확인

Step 6: 배송 추적
  GET /orders/{id} - 주문 상태 조회
  GET /orders/{id}/tracking - 배송 추적
  
Step 7: 수령 확인 & 리뷰
  POST /orders/{id}/confirm-delivery - 수령 확인
  POST /orders/{id}/reviews - 리뷰 작성
```

**발견:**
- 주문 미리보기 API 필요 (배송비 계산)
- Stripe webhook 엔드포인트 필요
- 배송 추적 외부 API 연동

---

#### 2.3 정비 알림 플로우

```
자동 트리거:
  POST /rides (주행 완료 시)
  → devices.odometer 자동 업데이트
  → maintenance_alerts 체크
  → 조건 충족 시 알림 생성

사용자 조회:
  GET /devices/{id}/maintenance-alerts
  → Priority별 정렬

알림 처리:
  POST /maintenance-records - 정비 완료 기록
  → Alert status: 'completed'
  → 다음 알림 자동 생성
  
  DELETE /maintenance-alerts/{id} - 알림 무시
  → Status: 'dismissed'
```

**발견:**
- 알림 자동 생성 크론잡 필요
- 정비 기록 시 영수증 OCR API (미래)

---

### Step 3: Real-time & WebSocket APIs

**Q: 실시간 기능이 필요한 곳은?**

```
1. 그룹 라이딩 채팅
   WS /groups/{id}/chat
   - 메시지 실시간 수신
   - 참가자 입장/퇴장 알림

2. 실시간 위치 (그룹 라이딩 중)
   WS /groups/{id}/locations
   - 30초마다 위치 브로드캐스트
   - 지도에 실시간 표시

3. 1:1 채팅
   WS /messages
   - 친구와 실시간 메시지

4. 알림
   WS /notifications
   - 푸시 대신 WebSocket으로 실시간 수신
```

---

### Step 4: Missing Features Discovery

**Q: 아직 API가 없는데 필요한 기능은?**

```
✅ 발견 1: 검색 히스토리
  - GET /search/history
  - POST /search/history
  - 사용자가 자주 검색하는 부품 추천

✅ 발견 2: 위시리스트
  - POST /wishlist/items
  - GET /wishlist
  - 나중에 살 부품 저장

✅ 발견 3: 가격 알림
  - POST /products/{id}/price-alerts
  - 가격 떨어지면 알림

✅ 발견 4: 그룹 템플릿
  - POST /group-templates (자주 하는 라이딩 저장)
  - GET /group-templates/mine
  - 템플릿으로 빠른 생성

✅ 발견 5: 라이딩 통계 (대시보드)
  - GET /stats/riding (총 거리, 평균 속도 등)
  - GET /stats/groups (참여한 그룹 수)
  - GET /stats/purchases (구매 통계)

✅ 발견 6: 리더보드
  - GET /leaderboard/distance (이번 달 주행 거리)
  - GET /leaderboard/groups (그룹 주최 횟수)
  - 게임화 요소

✅ 발견 7: 배지/업적
  - GET /achievements
  - "첫 그룹 라이딩", "100km 달성"
```

---

### Step 5: Admin APIs

**Q: 관리자가 필요한 API는?**

```
✅ 사용자 관리
  - GET /admin/users
  - PATCH /admin/users/{id}/suspend
  - GET /admin/reports

✅ 판매자 관리
  - GET /admin/sellers/pending
  - POST /admin/sellers/{id}/verify
  - PATCH /admin/sellers/{id}/tier

✅ 상품 관리
  - GET /admin/products/flagged
  - DELETE /admin/products/{id}
  - POST /admin/products/{id}/verify-compatibility

✅ 기기 카탈로그 관리
  - POST /admin/device-catalog
  - POST /admin/brands
  - POST /admin/compatibility-groups

✅ 정비소 관리
  - POST /admin/shops
  - PATCH /admin/shops/{id}/partner

✅ 통계 & 분석
  - GET /admin/stats/dau
  - GET /admin/stats/gmv
  - GET /admin/stats/retention
```

---

## 📋 Complete API Endpoints

### 1. Authentication & Users (인증 & 사용자)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/auth/register` | 회원가입 (이메일) | No |
| POST | `/auth/login` | 로그인 (이메일) | No |
| POST | `/auth/social/{provider}` | 소셜 로그인 (Google, Kakao, Apple) | No |
| POST | `/auth/refresh` | 토큰 갱신 | Refresh Token |
| POST | `/auth/logout` | 로그아웃 | Yes |
| POST | `/auth/verify-phone` | 휴대폰 인증 | Yes |
| POST | `/auth/verify-email` | 이메일 인증 | Yes |
| GET | `/users/me` | 내 프로필 조회 | Yes |
| PATCH | `/users/me` | 프로필 수정 | Yes |
| DELETE | `/users/me` | 회원 탈퇴 | Yes |
| GET | `/users/{id}` | 다른 사용자 프로필 (공개 범위 내) | Yes |
| GET | `/users/search` | 사용자 검색 (@username) | Yes |
| GET | `/users/me/onboarding-status` | 온보딩 상태 | Yes |
| PATCH | `/users/me/onboarding` | 온보딩 단계 업데이트 | Yes |
| POST | `/users/me/default-device` | 기본 기기 설정 | Yes |

---

### 2. Friends & Social (친구 & 소셜)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/friends` | 친구 목록 | Yes |
| POST | `/friends/requests` | 친구 요청 | Yes |
| GET | `/friends/requests/received` | 받은 친구 요청 | Yes |
| POST | `/friends/requests/{id}/accept` | 친구 수락 | Yes |
| POST | `/friends/requests/{id}/reject` | 친구 거절 | Yes |
| DELETE | `/friends/{id}` | 친구 삭제 | Yes |
| GET | `/friends/suggestions` | 친구 추천 | Yes |
| POST | `/blocks` | 차단하기 | Yes |
| GET | `/blocks` | 차단 목록 | Yes |
| DELETE | `/blocks/{id}` | 차단 해제 | Yes |

---

### 3. Devices (기기)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/device-types` | 기기 타입 목록 | No |
| GET | `/brands` | 브랜드 목록 | No |
| GET | `/brands?type={id}` | 타입별 브랜드 | No |
| GET | `/device-catalog/search` | 기기 카탈로그 검색 | No |
| GET | `/device-catalog/{id}` | 기기 상세 | No |
| GET | `/devices` | 내 기기 목록 | Yes |
| POST | `/devices` | 기기 등록 | Yes |
| GET | `/devices/{id}` | 기기 상세 | Yes |
| PATCH | `/devices/{id}` | 기기 정보 수정 | Yes |
| DELETE | `/devices/{id}` | 기기 삭제 | Yes |
| GET | `/devices/{id}/ownership-history` | 소유권 이력 | Yes |
| POST | `/devices/{id}/transfer` | 소유권 이전 | Yes |

---

### 4. Groups (그룹 라이딩)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/groups` | 그룹 검색 (근처, 필터) | Yes |
| POST | `/groups` | 그룹 생성 | Yes |
| GET | `/groups/{id}` | 그룹 상세 | Yes |
| PATCH | `/groups/{id}` | 그룹 수정 | Yes (Creator) |
| DELETE | `/groups/{id}` | 그룹 취소 | Yes (Creator) |
| POST | `/groups/{id}/join` | 참가 신청 | Yes |
| DELETE | `/groups/{id}/leave` | 참가 취소 | Yes |
| GET | `/groups/{id}/participants` | 참가자 목록 | Yes |
| GET | `/groups/{id}/pending-participants` | 대기자 목록 | Yes (Creator) |
| POST | `/groups/{id}/approve/{user_id}` | 참가 승인 | Yes (Creator) |
| POST | `/groups/{id}/reject/{user_id}` | 참가 거절 | Yes (Creator) |
| POST | `/groups/{id}/start` | 라이딩 시작 | Yes (Creator) |
| POST | `/groups/{id}/complete` | 라이딩 완료 | Yes (Creator) |
| GET | `/groups/{id}/live-locations` | 실시간 위치 | Yes (Participant) |
| POST | `/groups/{id}/rate` | 그룹 평가 | Yes (Participant) |
| GET | `/groups/my-upcoming` | 내 예정 그룹 | Yes |
| GET | `/groups/my-history` | 내 참여 이력 | Yes |
| POST | `/group-templates` | 템플릿 저장 | Yes |
| GET | `/group-templates` | 내 템플릿 | Yes |

---

### 5. Live Locations (실시간 위치)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/live-locations` | 위치 업데이트 | Yes |
| GET | `/live-locations/nearby` | 근처 라이더 | Yes |
| PATCH | `/live-locations/visibility` | 공개 설정 변경 | Yes |
| DELETE | `/live-locations` | 위치 공유 중단 | Yes |

---

### 6. Products (상품)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/products/search` | 상품 검색 | No |
| GET | `/products/{id}` | 상품 상세 | No |
| GET | `/products/{id}/compatibility` | 호환성 확인 | Yes |
| GET | `/products/{id}/reviews` | 리뷰 목록 | No |
| GET | `/products/{id}/questions` | Q&A 목록 | No |
| POST | `/products/{id}/questions` | 질문하기 | Yes |
| POST | `/products/{id}/price-alerts` | 가격 알림 설정 | Yes |
| POST | `/products` | 상품 등록 | Yes (Seller) |
| PATCH | `/products/{id}` | 상품 수정 | Yes (Seller) |
| DELETE | `/products/{id}` | 상품 삭제 | Yes (Seller) |

---

### 7. Cart & Orders (장바구니 & 주문)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/cart` | 장바구니 조회 | Yes |
| POST | `/cart/items` | 장바구니 담기 | Yes |
| PATCH | `/cart/items/{id}` | 수량 변경 | Yes |
| DELETE | `/cart/items/{id}` | 삭제 | Yes |
| DELETE | `/cart` | 전체 비우기 | Yes |
| POST | `/orders/preview` | 주문 미리보기 (배송비 계산) | Yes |
| POST | `/orders` | 주문 생성 | Yes |
| POST | `/orders/{id}/confirm-payment` | 결제 확인 | Yes |
| GET | `/orders/{id}` | 주문 상세 | Yes |
| GET | `/orders` | 주문 내역 | Yes |
| POST | `/orders/{id}/cancel` | 주문 취소 | Yes |
| POST | `/orders/{id}/confirm-delivery` | 수령 확인 | Yes |
| POST | `/orders/{id}/reviews` | 리뷰 작성 | Yes |
| POST | `/orders/{id}/disputes` | 분쟁 제기 | Yes |

---

### 8. Seller Dashboard (판매자)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/sellers` | 판매자 등록 | Yes |
| GET | `/sellers/me` | 내 판매자 정보 | Yes (Seller) |
| PATCH | `/sellers/me` | 판매자 정보 수정 | Yes (Seller) |
| GET | `/sellers/me/orders` | 주문 관리 | Yes (Seller) |
| POST | `/sellers/me/orders/{id}/ship` | 배송 처리 (송장 입력) | Yes (Seller) |
| GET | `/sellers/me/stats` | 판매 통계 | Yes (Seller) |
| GET | `/sellers/me/products` | 내 상품 목록 | Yes (Seller) |
| POST | `/sellers/me/promotions` | 프로모션 생성 | Yes (Seller) |

---

### 9. Maintenance (정비)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/maintenance-types` | 정비 유형 목록 | Yes |
| GET | `/devices/{id}/maintenance-alerts` | 정비 알림 | Yes |
| GET | `/devices/{id}/maintenance-records` | 정비 이력 | Yes |
| POST | `/maintenance-records` | 정비 기록 추가 | Yes |
| PATCH | `/maintenance-records/{id}` | 정비 기록 수정 | Yes |
| DELETE | `/maintenance-alerts/{id}` | 알림 무시 | Yes |
| GET | `/shops/nearby` | 근처 정비소 | Yes |
| GET | `/shops/{id}` | 정비소 상세 | Yes |
| POST | `/shops/{id}/reviews` | 정비소 리뷰 | Yes |

---

### 10. Rides (주행 기록)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/rides` | 주행 기록 생성 | Yes |
| GET | `/rides` | 내 주행 이력 | Yes |
| GET | `/rides/{id}` | 주행 상세 | Yes |
| GET | `/devices/{id}/rides` | 기기별 주행 이력 | Yes |
| GET | `/stats/riding` | 주행 통계 | Yes |

---

### 11. Messages & Notifications (메시지 & 알림)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/messages` | 메시지 목록 | Yes |
| GET | `/messages/conversations` | 대화 목록 | Yes |
| GET | `/messages/conversations/{user_id}` | 특정 대화 조회 | Yes |
| POST | `/messages` | 메시지 전송 | Yes |
| PATCH | `/messages/{id}/read` | 읽음 표시 | Yes |
| GET | `/notifications` | 알림 목록 | Yes |
| PATCH | `/notifications/{id}/read` | 알림 읽음 | Yes |
| PATCH | `/notifications/read-all` | 전체 읽음 | Yes |
| GET | `/notification-preferences` | 알림 설정 조회 | Yes |
| PATCH | `/notification-preferences` | 알림 설정 변경 | Yes |

---

### 12. Credits & Promotions (크레딧 & 프로모션)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/credits` | 크레딧 잔액 | Yes |
| GET | `/credits/transactions` | 거래 내역 | Yes |
| POST | `/promo-codes/validate` | 프로모션 코드 확인 | Yes |
| POST | `/orders/{id}/apply-promo` | 프로모션 적용 | Yes |

---

### 13. Search & Recommendations (검색 & 추천)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/search/history` | 검색 히스토리 | Yes |
| POST | `/search/history` | 검색 기록 저장 | Yes |
| DELETE | `/search/history` | 검색 기록 삭제 | Yes |
| GET | `/recommendations/products` | 상품 추천 | Yes |
| GET | `/recommendations/groups` | 그룹 추천 | Yes |
| POST | `/wishlist/items` | 위시리스트 추가 | Yes |
| GET | `/wishlist` | 위시리스트 조회 | Yes |
| DELETE | `/wishlist/items/{id}` | 위시리스트 삭제 | Yes |

---

### 14. Gamification (게임화)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/achievements` | 업적/배지 | Yes |
| GET | `/leaderboard/distance` | 거리 리더보드 | Yes |
| GET | `/leaderboard/groups` | 그룹 주최 리더보드 | Yes |

---

### 15. Reports & Support (신고 & 지원)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/reports` | 신고하기 | Yes |
| GET | `/reports/mine` | 내 신고 내역 | Yes |
| POST | `/support/tickets` | 고객지원 티켓 | Yes |
| GET | `/support/tickets` | 티켓 목록 | Yes |
| GET | `/support/faq` | FAQ | No |

---

### 16. Admin APIs (관리자)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/admin/users` | 사용자 관리 | Admin |
| PATCH | `/admin/users/{id}/suspend` | 계정 정지 | Admin |
| GET | `/admin/sellers/pending` | 승인 대기 판매자 | Admin |
| POST | `/admin/sellers/{id}/verify` | 판매자 인증 | Admin |
| POST | `/admin/device-catalog` | 기기 카탈로그 추가 | Admin |
| POST | `/admin/brands` | 브랜드 추가 | Admin |
| GET | `/admin/stats/dau` | DAU 통계 | Admin |
| GET | `/admin/stats/gmv` | GMV 통계 | Admin |
| GET | `/admin/reports` | 신고 관리 | Admin |

---

### 17. WebSocket Endpoints

| Type | Endpoint | Description |
|------|----------|-------------|
| WS | `/ws/groups/{id}/chat` | 그룹 채팅 |
| WS | `/ws/groups/{id}/locations` | 그룹 실시간 위치 |
| WS | `/ws/messages` | 1:1 채팅 |
| WS | `/ws/notifications` | 실시간 알림 |

---

### 18. Webhooks (외부 서비스)

| Provider | Endpoint | Description |
|----------|----------|-------------|
| Stripe | `/webhooks/stripe` | 결제 이벤트 |
| Delivery | `/webhooks/delivery/{carrier}` | 배송 추적 |

---

### 19. Utility APIs (유틸리티)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/health` | 서버 상태 | No |
| GET | `/app/config` | 앱 설정 | No |
| GET | `/app/version` | 최소 지원 버전 | No |
| POST | `/upload/image` | 이미지 업로드 | Yes |
| POST | `/upload/receipt` | 영수증 업로드 | Yes |

---

## 🔐 Authentication

**Header:**
```
Authorization: Bearer {access_token}
```

**Token Types:**
- Access Token: 15분 만료
- Refresh Token: 7일 만료

**Refresh Flow:**
```http
POST /auth/refresh
Content-Type: application/json

{
  "refresh_token": "..."
}

Response:
{
  "access_token": "new_access_token",
  "refresh_token": "new_refresh_token"
}
```

---

## 📊 Common Response Format

**Success:**
```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "timestamp": "2026-02-13T10:30:00Z",
    "version": "v1"
  }
}
```

**Pagination:**
```json
{
  "success": true,
  "data": [...],
  "pagination": {
    "page": 1,
    "per_page": 20,
    "total": 156,
    "total_pages": 8
  }
}
```

**Error:**
```json
{
  "success": false,
  "error": {
    "code": "INVALID_INPUT",
    "message": "이메일 형식이 올바르지 않습니다",
    "field": "email"
  }
}
```

---

## 🚨 Error Codes

| Code | HTTP | Description |
|------|------|-------------|
| INVALID_INPUT | 400 | 잘못된 입력 |
| UNAUTHORIZED | 401 | 인증 필요 |
| FORBIDDEN | 403 | 권한 없음 |
| NOT_FOUND | 404 | 리소스 없음 |
| CONFLICT | 409 | 중복 (이미 존재) |
| RATE_LIMIT | 429 | 요청 제한 초과 |
| SERVER_ERROR | 500 | 서버 오류 |

---

## 📈 Rate Limiting

| Endpoint Type | Limit |
|---------------|-------|
| Auth (login, register) | 5 req/min |
| Regular APIs | 100 req/min |
| Search APIs | 50 req/min |
| Upload APIs | 10 req/min |

**Headers:**
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1676284800
```

---

**Total Endpoints:** 150+  
**Last Updated:** 2026-02-13
