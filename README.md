# MY DIARY 2027

2027년 1월 1일부터 쓰는 개인 다이어리 웹앱. PC와 iPhone 브라우저에서 사용하고, 기록은 노션 **[Main] 2027 Record**에 저장한다.

## 지금 되는 것 (v0.1)
- 표지 → 펼치기
- **월간**: 02_Life 일정, 월요일 시작, 2027 공휴일(우주항공청 월력요항 기준), 이전/다음 달 미니 달력
- 창 크기 자동 조절: 900px 이상은 펼친 두 면(비율대로 축소), 그보다 좁으면 한 면 보기 + 아래 탭 바
- 나머지 탭은 '곧 만들어요' 화면

## 폴더
| 경로 | 내용 |
|---|---|
| `public/` | 화면 (HTML·CSS·JS, 폰트) |
| `functions/api/calendar.js` | 구글 캘린더 일정을 읽어 주는 서버 함수 |
| `lib/ics.js` | 캘린더(iCal) 해석 (반복 일정 포함) |
| `test/` | 해석기 테스트 (`node test/ics.test.mjs`) |

## 처음 설정 (한 번만)

### 1. GitHub에 올리기
비공개 저장소 `diary-2027`을 만들고 이 폴더를 올린다.

### 2. Cloudflare Pages 연결
Cloudflare 대시보드 → Workers & Pages → 만들기 → Pages → **Git에 연결** → `diary-2027` 선택
- 프레임워크: 없음
- 빌드 명령: 비워 둠
- 빌드 출력 디렉터리: `public`

### 3. 캘린더 주소 넣기 (비밀 값)
Pages 프로젝트 → 설정 → **변수 및 비밀** → 추가 (유형: **비밀**)
| 이름 | 값 |
|---|---|
| `LIFE_ICS` | 구글 캘린더 02_Life의 **iCal 형식 비공개 주소** |
| `ROUTINE_ICS` | 구글 캘린더 01_Routine의 **iCal 형식 비공개 주소** |

> 비공개 주소는 구글 캘린더 설정 → 해당 캘린더 → '캘린더 통합'에 있다. 이 주소를 아는 사람은 일정을 볼 수 있으니 대화창·메모 등에 붙이지 말고 여기에만 넣는다.

넣은 뒤 **다시 배포**해야 적용된다.

### 4. 잠금 (Cloudflare Access — 이메일 코드 로그인)
Cloudflare 대시보드 → Zero Trust → Access → Applications → **Add an application → Self-hosted**
- Application domain: `diary-2027.pages.dev` (프로젝트 주소)
- Policy: Action **Allow**, Include → **Emails** → 내 이메일
- 로그인 방법: One-time PIN (이메일로 받은 코드)

설정 후 주소를 열면 이메일 코드를 입력해야 들어갈 수 있다.

## 로컬 미리보기 (선택)
```
npx wrangler pages dev
```
`.dev.vars.example`을 `.dev.vars`로 복사해 주소를 넣으면 실제 일정이 보인다.
