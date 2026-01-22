# Google OAuth 설정 정보

## Android 클라이언트 설정
- **패키지 이름**: `space.manus.scoop.riding.t20250121142951`
- **SHA-1 인증서 지문**: `FA:C6:17:45:DC:09:03:78:6F:B9:ED:E6:2A:96:2B:39:9F:73:48:F0`
- **클라이언트 ID**: `447637248249-hm0k8figug49i4t0ej2n6l667nmp2b0g.apps.googleusercontent.com`

## 문제점
현재 APK의 패키지 이름이 `space.manus.scoop.riding.t20260121093006`인데,
Google Cloud Console에 등록된 패키지 이름은 `space.manus.scoop.riding.t20250121142951`입니다.

**패키지 이름이 일치하지 않아 Google OAuth가 작동하지 않습니다.**

## 해결 방법
Google Cloud Console에서 Android 클라이언트의 패키지 이름을 현재 APK의 패키지 이름으로 변경해야 합니다.
