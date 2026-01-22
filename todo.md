# Project TODO

- [x] 테마 컬러 설정 (SCOOP 브랜드 컬러 적용)
- [x] 탭 네비게이션 구성 (홈, 히스토리, 프로필)
- [x] 아이콘 매핑 추가
- [x] 홈 화면 개발 (통계 카드, 주행 시작 버튼)
- [x] 주행 화면 개발 (속도계, 거리, 시간 표시)
- [x] 주행 로직 구현 (타이머, 거리 계산)
- [x] 히스토리 화면 개발 (주행 기록 리스트)
- [x] 프로필 화면 개발 (설정, 통계)
- [x] 주행 데이터 로컬 저장 (AsyncStorage)
- [x] 제공된 SCOOP 로고 적용 (주황색 브랜드 컬러)

- [x] expo-location 패키지 설치 및 GPS 권한 설정
- [x] 실시간 GPS 위치 추적 기능 구현
- [x] GPS 기반 실제 속도/거리 계산
- [x] 주행 경로 좌표 저장 기능
- [x] GPX 파일 생성 유틸리티 구현
- [x] GPX 파일 다운로드/공유 기능
- [x] 히스토리 화면에 GPX 다운로드 버튼 추가

- [x] GPS 속도 필터링 - 정지 상태에서 잘못된 속도 표시 버그 수정

- [x] GPS 기록이 전혀 되지 않는 문제 수정
- [x] 원본 LOOP 앱 UI 참고하여 디자인 개선

- [x] GPS 필터링 강화 - 시속 1km/h 이하 기록 제외
- [x] GPS 필터링 강화 - 위치가 뒤로 이동하거나 튀는 것 방지
- [x] react-native-maps 설치 및 설정
- [x] 주행 중 실시간 지도 표시
- [x] 주행 기록 상세 화면 (지도에 경로 시각화)
- [x] 백그라운드 GPS 추적 기능
- [x] LOOP 앱 스타일 홈 화면 UI 개선
- [x] LOOP 앱 스타일 트래킹 관리 화면 (프로필 화면으로 통합)

- [x] react-native-maps 제거 (Expo Go 호환성 문제)
- [x] WebView 기반 지도 컴포넌트로 교체 (OpenStreetMap + Leaflet)
- [x] 주행 화면 및 상세 화면 지도 업데이트

- [x] 백엔드 인증 API 구현 (회원가입/로그인)
- [x] 로그인 화면 UI 구현
- [x] 회원가입 화면 UI 구현
- [x] 인증 상태 관리 (Context/Hook)
- [x] 로그인 필수 라우팅 적용

- [x] 프로필 화면에 로그인한 사용자 정보 표시
- [x] 프로필 화면에 로그아웃 버튼 추가
- [x] 주행 기록 클라우드 동기화 (서버 저장)
- [x] 로컬 기록과 서버 기록 병합 로직
- [x] 비밀번호 찾기 화면 UI
- [x] 비밀번호 재설정 이메일 발송 API
- [x] 구글 OAuth 로그인 연동

- [x] 로그인 문제 확인 및 수정 (JWT 토큰에 appId, name 필드 추가)
- [x] 로그인 화면에 SCOOP 로고 이미지 적용
- [x] 지도 부드러움 개선 (애니메이션 루프, lerp 보간)
- [x] 네비게이션 스타일 - 진행 방향이 위로 오도록 회전
- [x] 내 위치 마커를 화살표 모양으로 변경
- [x] 기체 관리 기능 (킥보드 모델명, 누적 거리 등록)
- [x] 푸시 알림 기능 (주행 완료 알림 등)

- [x] 로그아웃 버그 수정 (쿠키 삭제 로직 개선)
- [x] 지도 회전 개선 - 화살표가 항상 화면 위쪽을 가리키도록 지도 자체 회전
- [x] 기체 관리 기능 (킥보드 모델명, 누적 거리 등록) - DB 스키마, API, UI 구현
- [x] 푸시 알림 기능 (주행 완료 알림 등) - 알림 설정 화면 추가
- [ ] Google OAuth 클라이언트 ID 설정 (사용자가 직접 설정 필요)

- [x] expo-notifications 오류 수정 (Expo Go 호환성) - 조건부 로딩으로 수정
- [x] 주행 기록 상세보기 GPS 데이터 표시 문제 수정 - getRidingRecordWithGps 사용
- [x] 주행 기록에 사용 기체 연결 기능 - 기체 선택 화면 추가
- [x] 기체별 통계 분석 기능 - 기체 통계 화면 추가

- [x] 로그인/로그아웃 화면 전환 문제 수정 (AuthContext 전역 상태 관리)
- [x] 주행 경로 공유 기능 (expo-sharing 사용)
- [x] 목표 설정 기능 (일간/주간 목표, 달성률 표시)
- [x] 기체 정비 알림 기능 (주행거리 기준 정비 알림)
- [x] 커뮤니티 탭 구현 (글 작성, 댓글, 주행 기록 공유, 좋아요)

- [x] 친구 기능 DB 스키마 (친구 요청 테이블) - friendRequests, friends 테이블
- [x] 친구 검색 기능 (닉네임으로 검색) - searchUsers API
- [x] 친구 요청 보내기/수락/거절 기능 - friends 화면
- [x] 친구 목록 화면 - app/friends.tsx
- [x] 팔로우/팔로워 시스템 - follows 테이블, user-profile 화면
- [x] 커뮤니티 이미지 첨부 기능 - expo-image-picker, S3 업로드
- [x] 주행 랭킹 기능 (주간/월간) - app/ranking.tsx

- [x] 커뮤니티 탭 인스타 스타일로 개선 (정보량 증가, 이미지 갤러리)
- [x] 좋아요 반응 속도 개선 (Optimistic Update 적용)
- [x] 조회수 중복 방지 (postViews 테이블로 1계정당 1카운트)
- [x] 랭킹 시스템 메인 화면으로 이동 (통계 아래 배치)
- [x] 프로필 사진 설정 기능 (edit-profile 화면)
- [x] 알림 센터 구현 (notifications-center 화면)
- [x] 주행 챌린지 기능 (challenges, create-challenge, challenge-detail 화면)

- [x] 프로필 사진 업로드 즉시 반영 (AuthContext refreshUser 호출)
- [x] 레벨 설명 팝업 (? 버튼 클릭 시 모달 표시)
- [x] 커뮤니티 버튼 동작 수정 (공유, 더보기 기능 추가)
- [x] 게시글 터치 영역 확대 (Pressable로 전체 감싸기)
- [x] 친구 실시간 위치 표시 (friends-map 화면, liveLocations API)
- [x] 메인 화면 알림 버튼 추가 (헤더에 알림/친구위치 버튼)
- [x] 챌린지 초대 기능 (challenge-detail에서 친구 초대 모달)
- [x] 주행 경로 지도 미리보기 (RoutePreview 컴포넌트)
- [x] 업적/배지 시스템 (badges 화면, 자동 배지 부여)

- [x] 프로필 사진 적용 문제 수정 (업로드 후 즉시 반영) - refreshUser forceRefresh 적용
- [x] 커뮤니티 주행기록 UI 오버플로우 수정 - RoutePreview overflow hidden 적용
- [x] 랭킹에서 친구요청 시 실제 사용자에게 요청되도록 수정 - userId 파라미터 지원
- [x] 레벨 네이밍 통일 (내 정보와 레벨 설명 팝업) - level-system.ts 모듈로 통일
- [x] 레벨 시스템 주행거리 10배 증가 (마지막 10만키로 이상) - 7단계 레벨 시스템
- [ ] 친구 실시간 위치 - 프로필 사진으로 표시
- [ ] 위치 공유 설정 (온/오프로 전체 지도 표시)
- [ ] 친구 요청 시 메시지 작성 기능
- [ ] 다크모드 토글
- [ ] 주행 음성 안내
- [ ] 친구 주행 기록 비교

- [x] 프로필 사진 등록 시 로그아웃 되는 버그 수정 - try-catch로 오류 처리
- [x] 커뮤니티 게시글 상세에서 사진 안 뜨는 문제 수정 - 이미지 섹션 추가
- [x] 업적/배지 시스템 수치 10배 증가 및 실제 동작 확인 - DB 및 UI 업데이트
- [x] 커뮤니티 댓글 답글 기능 추가 - parentId 기반 답글 시스템
- [x] 레벨 시스템 팝업 거리 표시 형식 수정 (5천km → 5,000km) - toLocaleString 사용
- [x] 친구 실시간 위치 프로필 사진으로 표시 - profileImageUrl 추가
- [x] 위치 공유 온/오프 설정 추가 - 프로필 설정에 토글 추가
- [x] 친구 요청 메시지 기능 추가 - message 필드 및 모달 UI

- [x] 다크모드 토글 기능 (설정에서 라이트/다크 모드 전환) - ThemeProvider 개선, 프로필 설정 UI
- [x] 주행 음성 안내 기능 (속도, 거리, 시간 TTS 안내) - expo-speech, voice-settings 화면
- [x] 친구 주행 기록 비교 화면 (친구와 나의 통계 비교) - compare-records 화면
- [x] 주행 지도 회전 취소 (네비게이션 스타일 → 자연스러운 표시) - 마커만 회전

- [x] 실제 친구 통계 연동 - 서버에서 친구 주행 통계 가져오기 (getFriendStats, getMyStats API)
- [x] 음성 안내 언어 선택 - 한국어/영어 지원 (voice-guidance.ts, voice-settings.tsx)
- [x] 친구 주행 시작 알림 기능 (liveLocation.update에서 isStarting 시 알림)
- [x] 친구 실시간 위치 지도 보기 (주행중인 친구 클릭 시 지도 모달 표시)
- [x] 주간 랭킹 실시간 데이터 연동 수정 (riding.tsx에서 주행 완료 시 서버 동기화)

- [x] 클라우드 동기화 오류 수정 (ridingRecords 테이블 스키마 문제) - scooterId 기본값 처리
- [x] 친구 위치 지도에 실제 지도 표시 (OpenStreetMap 연동) - FriendLocationMap 컴포넌트
- [x] 자전거 아이콘 → 킥보드 아이콘으로 변경 - electric-scooter 아이콘
- [x] 접속 시 자동 클라우드 동기화 (1회) - 홈 화면에서 자동 동기화
- [x] 기록 삭제 시 클라우드에서도 삭제 - deleteRecordEverywhere 함수
- [x] 최고속도 클릭 시 해당 구간 표시 - 최고속도 모달 및 기록 연결
- [x] 프로필 탭 → 설정 탭으로 이름 변경 - settings 아이콘
- [x] 레벨 진행도 실시간 업데이트 - 현재 거리 및 다음 레벨 표시

- [x] 프로필 사진 변경 시 로그아웃 문제 재수정 - refreshUser 호출 제거
- [x] 주간 랭킹 실시간 데이터 반영 문제 재수정 - 주행 완료 후 랭킹 쿼리 무효화
- [x] 주행 중 정지 시 일시정지/휴식시간 기능 - 자동 일시정지 및 휴식시간 카운트
- [x] GPX 파일 경로 따라가기 기능 - saved-routes, follow-route 화면
- [x] 테마 설정 버튼 개별 동작으로 변경 - 자동/라이트/다크 버튼 분리
- [x] 주행 경로 히트맵 기능 - route-heatmap 화면
- [x] 그룹 라이딩 기능 - group-riding 화면
- [x] 주행 통계 위젯 - 홈 화면에 주간/월간 통계 위젯

- [x] expo-document-picker 모듈 설치 및 오류 수정
- [x] GPX 경로 따라가기 시 자동 라이딩 시작 + 지도에 경로 표시
- [x] 구글 로그인 설정 방법 안내

- [x] Google Cloud Console OAuth 동의 화면 설정
- [x] OAuth 클라이언트 ID 생성 (웹, Android)
- [x] 앱에 환경 변수 설정 및 구글 로그인 테스트

- [x] ridingRecords 클라우드 동기화 INSERT 오류 수정

- [x] Google OAuth redirect_uri 오류 수정 (Expo Go에서는 exp:// 스키마 제한으로 불가, APK 빌드 후 정상 작동 예정)
- [x] 주행 완료 후 자동 동기화 확인 및 개선
- [x] 오프라인 모드 개선 (네트워크 연결 시 자동 동기화)
- [x] 동기화 상태 표시 (주행 기록 목록에 클라우드 아이콘 표시)
- [x] EAS CLI 설정 및 APK 빌드 준비
- [x] 앱 업데이트 알림 기능 구현
- [x] 업데이트 다운로드 기능 구현



- [x] APK 빌드에 Google OAuth 환경 변수 포함 (EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID)
- [x] APK에서 회원가입/로그인 안 되는 문제 수정 (서버 URL 설정)
- [x] Manus 클라우드 배포 (https://scoopride-xqsh52mn.manus.space)
- [x] 배포된 서버 URL로 APK 재빌드 (v1.0.0 빌드 완료)
- [x] 새 SCOOP 로고 적용 (앱 아이콘, 스플래시, 로그인 화면)
