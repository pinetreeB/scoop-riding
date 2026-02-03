# 기상청 단기예보 API 정보

## 개요
- **API명**: 기상청_단기예보 ((구)_동네예보) 조회서비스
- **제공기관**: 기상청
- **비용**: 무료
- **트래픽**: 개발계정 10,000회/일, 운영계정 활용사례 등록 시 증가 가능

## 사용할 API
**초단기실황조회 (getUltraSrtNcst)**
- 요청주소: http://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getUltraSrtNcst
- 실시간 날씨 정보 제공 (매 정시 업데이트)

## 요청 파라미터
| 파라미터 | 설명 | 필수 |
|---------|------|------|
| ServiceKey | 공공데이터포털 인증키 | 필수 |
| pageNo | 페이지 번호 | 필수 |
| numOfRows | 한 페이지 결과 수 | 필수 |
| dataType | 응답 형식 (XML/JSON) | 옵션 |
| base_date | 발표일자 (YYYYMMDD) | 필수 |
| base_time | 발표시각 (HHMM, 정시단위) | 필수 |
| nx | 예보지점 X 좌표 | 필수 |
| ny | 예보지점 Y 좌표 | 필수 |

## 응답 데이터 (category 코드)
| 코드 | 설명 |
|------|------|
| T1H | 기온 (℃) |
| RN1 | 1시간 강수량 (mm) |
| UUU | 동서바람성분 (m/s) |
| VVV | 남북바람성분 (m/s) |
| REH | 습도 (%) |
| PTY | 강수형태 (0:없음, 1:비, 2:비/눈, 3:눈, 5:빗방울, 6:빗방울눈날림, 7:눈날림) |
| VEC | 풍향 (deg) |
| WSD | 풍속 (m/s) |

## 좌표 변환
- 위경도(WGS84) → 격자좌표(nx, ny) 변환 필요
- 기상청 격자: 5km x 5km

## Python 샘플코드
```python
import requests

url = 'http://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getUltraSrtNcst'
params = {
    'serviceKey': '서비스키',
    'pageNo': '1',
    'numOfRows': '1000',
    'dataType': 'JSON',
    'base_date': '20210628',
    'base_time': '0600',
    'nx': '55',
    'ny': '127'
}

response = requests.get(url, params=params)
print(response.content)
```
