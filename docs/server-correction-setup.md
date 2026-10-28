# Supabase 익명 인증과 모의 교정 배포

저장소에는 실제 프로젝트 연결값과 키를 포함하지 않습니다. 아래 `YOUR_PROJECT_REF`와 `sb_publishable_YOUR_PUBLISHABLE_KEY`를 본인 프로젝트 값으로 바꾸고, 실제 환경 설정은 Git에서 제외되는 `.env.local`에 입력하세요.

이 문서는 모의 연결 테스트용입니다. 실제 OpenAI 교정 설정은 [openai-correction-setup.md](./openai-correction-setup.md)를 따라 진행하세요. 실제 모드는 허용 사용자와 서버 Secrets, 사용량 migration이 모두 필요합니다.

대상 개발 프로젝트: `YOUR_PROJECT_REF`, URL `https://YOUR_PROJECT_REF.supabase.co`.
Expo SDK 57에 `@supabase/supabase-js`와 `react-native-url-polyfill`을 Expo install로 추가했습니다. 기존 일기·단어장·복습·집 성장·재사용 데이터는 그대로 유지합니다. 원격 migration/함수 배포와 대시보드 설정은 아직 실행하지 않았습니다.

## 배포 전 변경 대상

| 대상 | 변경 |
| --- | --- |
| 앱 `.env.local` | 제공한 공개 URL/publishable key, `EXPO_PUBLIC_SERVER_CORRECTION_ENABLED=false` |
| Supabase Auth | 익명 로그인 허용: 대시보드에서 직접 설정 |
| `lingolog_private` 스키마 | 신규 제한용 스키마. Data API 노출 스키마에 추가하지 않음 |
| `correction_daily_usage` | 검증된 사용자 ID·UTC 날짜별 5개 고유 요청 집계 |
| `correction_requests` | 요청 해시·처리 상태·90초 임대 ID·완료 응답 캐시 |
| `public.claim_diary_correction` / `finish_diary_correction` | service_role만 실행할 수 있는 원자적 예약/완료 RPC |
| `correct-diary` 함수 | 사용자 JWT 검증, 계약·길이 검증, 제한 RPC, 모의 응답 |
| 함수 Secrets | `CORRECTION_MODE=mock`, `LINGOLOG_SUPABASE_PUBLISHABLE_KEY` |
| `supabase/config.toml` | 함수 `verify_jwt=true`, 로컬 익명 Auth 허용 |

migration은 신규 객체만 추가합니다. 기존 테이블을 삭제하거나 초기화하지 않습니다. 제한용 테이블에 RLS를 켜고 정책을 만들지 않으며, anon/authenticated의 스키마·테이블 접근과 RPC 실행 권한을 모두 제거합니다. DB 관리자 자격 증명은 서버 런타임에서만 사용합니다.

## 1. 대시보드에서 익명 로그인 켜기

[이 프로젝트의 Authentication / Providers](https://supabase.com/dashboard/project/YOUR_PROJECT_REF/auth/providers)에서 **Anonymous Sign-Ins / Allow anonymous sign-ins**를 활성화하고 저장합니다. 메뉴 이름이 **Sign In / Providers**인 경우 같은 Providers 화면으로 들어갑니다. [공식 익명 인증 문서](https://supabase.com/docs/guides/auth/auth-anonymous)

익명 사용자도 `authenticated` 역할과 사용자 JWT를 받습니다. publishable key 자체는 사용자 세션이 아닙니다. 세션은 앱의 독립 AsyncStorage 키에 저장하고 실행 시 먼저 재사용하며, 만료가 가까우면 기존 refresh token으로 갱신합니다. 앱이 백그라운드로 가면 자동 갱신을 멈추고 다시 활성화되면 재개합니다. [React Native 세션 설정](https://supabase.com/docs/guides/auth/quickstarts/react-native)

Auth가 실패해도 로컬 기능은 차단하지 않습니다. 기존 세션이 사라졌거나 갱신에 실패하면 자동으로 새 익명 계정을 만들지 않습니다. 계정 생성 결과가 불확실한 네트워크 실패도 생성 시도 표시를 남겨 반복 계정 생성을 막습니다. 서버 교정 화면에서 **익명 인증 다시 확인**으로 재시도할 수 있습니다. 세션을 복구할 수 없는 경우 로컬 기록은 유지되지만 익명 계정을 다른 기기에서 복구하는 기능은 이번 범위에 없습니다.

현재 CAPTCHA 토큰을 받는 화면은 없으므로 프로젝트가 CAPTCHA를 요구하면 익명 연결은 실패합니다. 공개 운영 시 CAPTCHA·가입 남용 방지를 별도로 연결해야 합니다. 현재 제한은 검증된 **사용자당** 한도이며 재설치 등으로 새 익명 사용자를 만드는 행위까지 기기 단위로 제한하는 구조는 아닙니다.

## 2. 앱 환경 파일 확인

`.env.example`과 Git에서 제외되는 `.env.local`을 제공했습니다. 둘에는 공개 설정만 있습니다. 다른 작업 사본에서 파일이 없으면 다음 명령을 실행합니다.

```powershell
if (-not (Test-Path -LiteralPath '.env.local')) {
  Copy-Item -LiteralPath '.env.example' -Destination '.env.local'
}
```

`EXPO_PUBLIC_SERVER_CORRECTION_ENABLED=false`를 유지하세요. 익명 Auth는 준비되지만 일기·학습 항목을 자동 업로드하지 않으며, 서버 모드는 이 값이 true인 경우에만 **사용자가 교정 요청을 누른 글**을 전송합니다. 관리자 키·service-role 키·모델 키는 어떤 `EXPO_PUBLIC_*`에도 넣지 않습니다. [Expo 공개 환경변수 규칙](https://docs.expo.dev/guides/environment-variables/)

## 3. Windows PowerShell CLI 준비와 프로젝트 연결

프로젝트 루트에서 실행합니다. `npx.cmd --yes supabase@latest`는 CLI를 npm 캐시에 받아 실행하므로 전역 설치가 필요 없습니다. Node.js 20 이상이 필요하며 이 앱의 SDK 57은 Node 22.13 이상을 사용합니다. [CLI 설치·연결 문서](https://supabase.com/docs/guides/local-development/cli/getting-started)

```powershell
Set-Location 'C:\Users\heri9\Desktop\haeree\sideproject\lingolog'
npx.cmd --yes supabase@latest --version
npx.cmd --yes supabase@latest login
npx.cmd --yes supabase@latest link --project-ref YOUR_PROJECT_REF
```

`login`에서 본인 계정으로 인증하고, `link`에서 필요한 DB 비밀번호는 CLI 프롬프트에 입력합니다. 프로젝트 공개 publishable key는 CLI 로그인용 개인 액세스 토큰이나 DB 비밀번호를 대신하지 않습니다. `supabase/config.toml`이 이미 있으므로 `init --force`로 덮어쓰지 않습니다.

## 4. migration 검토·적용

```powershell
npx.cmd --yes supabase@latest migration list --linked
npx.cmd --yes supabase@latest db push --linked --dry-run
```

적용 목록이 `20261010000100_correction_limits.sql`인지 확인하고 파일의 DB 객체·권한을 검토한 뒤 적용합니다. [db push / dry-run 문서](https://supabase.com/docs/reference/cli/supabase-db-push)

```powershell
npx.cmd --yes supabase@latest db push --linked
```

원격 DB reset, 기존 migration 기록 수정, 기존 데이터 삭제 명령은 필요하지 않습니다. 이미 적용된 migration은 CLI 이력으로 관리하므로 다시 적용하지 않습니다.

## 5. 서버 설정과 함수 배포

Dashboard → **Edge Functions → Secrets**에서 아래 두 값을 입력하거나 CLI를 사용합니다.

| 환경변수 | 값 / 위치 |
| --- | --- |
| `CORRECTION_MODE` | 최초 기본값은 `disabled`; 연결 테스트 시 `mock` |
| `LINGOLOG_SUPABASE_PUBLISHABLE_KEY` | 제공한 공개 프로젝트 키; Auth.getUser 호출용 |
| `SUPABASE_URL` | 호스팅 런타임이 제공 |
| `SUPABASE_SECRET_KEYS` 또는 `SUPABASE_SERVICE_ROLE_KEY` | 호스팅 런타임이 제공하는 서버 전용 관리 자격 증명; 앱에 복사하지 않음 |

새 키 환경의 `SUPABASE_SECRET_KEYS` JSON `default` 값을 우선 사용하고, 런타임의 기존 service-role 변수도 지원합니다. `mock`에서는 모델 API 키를 사용하지 않습니다. `model`은 이제 실제 모델 모드이며 별도 안내의 Secrets·허용 ID·migration 설정이 필요합니다. 로컬 함수 테스트용 템플릿은 `supabase/functions/.env.example`이며 실제 `.env`는 Git에서 제외됩니다. [Secrets 공식 문서](https://supabase.com/docs/guides/functions/secrets)

```powershell
npx.cmd --yes supabase@latest secrets set CORRECTION_MODE=mock LINGOLOG_SUPABASE_PUBLISHABLE_KEY=sb_publishable_YOUR_PUBLISHABLE_KEY --project-ref YOUR_PROJECT_REF
npx.cmd --yes supabase@latest functions deploy correct-diary --project-ref YOUR_PROJECT_REF --use-api
```

`--use-api`는 서버에서 번들링하므로 배포만 할 때 Docker가 필요하지 않습니다. [함수 배포 CLI](https://supabase.com/docs/reference/cli/supabase-functions-deploy)

인증은 현재 공식 문서 기준으로 `verify_jwt=true`를 유지하고, 함수 안에서도 `auth.getUser(token)`로 사용자 JWT를 검증합니다. Auth가 돌려준 `user.id`만 제한 RPC에 전달합니다. 본문 `userId`는 허용하지 않습니다. 새로운 `sb_publishable_*` 키는 `apikey` 헤더에, 사용자 JWT만 `Authorization: Bearer`에 넣습니다. 키 자체를 JWT로 해석하거나 `--no-verify-jwt`로 인증 오류를 우회하지 않습니다. [Authorization과 verify_jwt 문서](https://supabase.com/docs/guides/functions/auth-headers)

## 6. 앱을 켜기 전 모의 서버 검증

아래 스크립트는 **직접 실행할 때만** 개발 프로젝트에 접속합니다. 별도의 익명 테스트 세션을 `.expo/supabase-check/`에 저장하고 재사용하며 토큰·본문을 출력하지 않습니다. 앱 세션·기존 일기에는 접근하지 않습니다. 고정 테스트 문장만 전송하고 영어/일본어 각 한 건의 새 요청 한도를 사용합니다. 앱 서버 활성화 플래그가 false여도 이 명시적인 검증 명령은 실행할 수 있습니다.

```powershell
npm.cmd run verify:supabase
# 같은 테스트 사용자에게 총 5건을 예약하고 6번째 거부까지 확인:
npm.cmd run verify:supabase -- --quota
```

성공 항목은 사용자 JWT 없는 요청 401, 본문 사용자 ID 거부, 일반 일기 422, 2,001자 거부, 영어/일본어 모의 계약·중복 재시도, 선택 시 하루 한도입니다. 고정 테스트 ID는 UTC 날짜별로 같아 같은 날 재실행해도 새 요청으로 집계하지 않습니다. 테스트 세션 파일은 민감하므로 Git에 올리거나 공유하지 않습니다. 파일을 지우지 않아야 테스트 사용자도 재사용합니다.

검증 후 `.env.local`의 `EXPO_PUBLIC_SERVER_CORRECTION_ENABLED`를 **true**, `EXPO_PUBLIC_SERVER_CORRECTION_MODE`를 **mock**으로 바꾸고 개발 서버를 다시 실행합니다.

```powershell
npx.cmd expo start --clear
```

실제 기기에서 아래 글을 해당 언어로 저장한 뒤 **교정하기 → 서버 모드 → 교정 요청**을 누릅니다. 글자·구두점까지 정확히 일치해야 합니다.

| 학습 언어 | 테스트 원문 | 모의 교정문 |
| --- | --- | --- |
| 영어 | `Yesterday I go to the park.` | `Yesterday I went to the park.` |
| 일본어 | `昨日、公園に行きます。` | `昨日、公園に行きました。` |

**모의 교정 · 실제 AI가 아닙니다** 표시, 한국어 설명, 표현 저장, TTS를 확인합니다. 일반 일기는 교정 미활성 안내만 반환하며 무관한 교정문을 붙이지 않습니다. 서버 모드를 다시 끄려면 앱 플래그를 false로 바꾸고 재시작하거나 함수 `CORRECTION_MODE=disabled`를 설정합니다.

## 제한과 재시도 동작

- 영어·일본어를 합쳐 **검증된 사용자당 UTC 날짜별 신규 고유 요청 5개**, 처리 중 예약은 **1개**입니다. 집 보상의 기기 현지 날짜와 서버 제한 날짜는 별개입니다.
- 원문 버전·수정 시각·일기 ID·언어·원문·모의 정책 버전을 서버에서 SHA-256 해시로 묶습니다. 동일 완료 요청은 저장된 응답/교정 시각을 그대로 반환하며 새 한도를 사용하지 않습니다.
- 예약과 한도 증가를 하나의 DB 함수 트랜잭션에서 처리하고 사용자별 advisory lock으로 여러 함수 인스턴스를 직렬화합니다. 클라이언트는 제한 테이블이나 예약 RPC를 직접 호출할 수 없습니다.
- 실패/중단 모의 요청도 기존 예약을 사용해 재시도하며 추가 집계하지 않습니다. 90초 임대 만료 후 복구할 수 있고 이전 임대의 작업은 결과를 덮어쓸 수 없습니다. 모의 처리는 즉시 끝나며 DB/Auth 통신에는 각 10초 제한을 둡니다. 실제 모드는 모델 25초 제한과 별도 실제 호출 횟수/사용량 기록을 적용합니다.
- 공백, 미지원 언어·설명 언어, 잘못된 형식, 2,000 코드포인트 초과는 예약 전에 거부합니다. 요청 바디는 스트리밍 중 최대 16,000바이트, 읽기 10초로 제한합니다. 미지원 일반 일기도 예약하지 않습니다.
- 오류에는 안전한 코드·안내만 포함하고 원문·토큰·비밀키를 로그로 쓰지 않습니다. DB에는 명시적으로 요청한 테스트 글의 완료 응답을 재시도 캐시로 보관합니다. 일반 일기를 보관하거나 자동 업로드하지 않습니다.
- 일기 수정 시 기존 교정은 수정 전 결과로 유지하고, 삭제한 일기는 조회되지 않습니다. 서버 테스트 캐시는 일기 삭제 시 자동 삭제하지 않으며 일반 사용자 데이터 보관/삭제·서버 동기화는 이후 단계입니다.

## 로컬 검증과 실제 기기 확인

```powershell
npm.cmd run test:supabase
npm.cmd run test:correction
npm.cmd run test:storage
npm.cmd run test:reuse
npm.cmd run test:speech
npm.cmd run test:calendar
npm.cmd run test:growth
npx.cmd expo lint
npx.cmd tsc --noEmit
npx.cmd --yes --package deno deno check supabase/functions/correct-diary/index.ts
```

`test:supabase`는 PGlite의 실제 PostgreSQL 엔진으로 migration·한도·예약·임대·클라이언트 권한을 실행 검증합니다. 외부 Supabase에는 연결하지 않습니다. 로컬 엔진의 작업은 한 프로세스에서 수행하므로 실제 배포 후 동시 함수 호출도 별도로 확인해야 합니다.

실제 iPhone/Android에서는 앱 재실행 때 Auth 사용자 수가 계속 늘지 않는지, 백그라운드 복귀 후 토큰 갱신·교정 요청이 가능한지, 오프라인에서도 일기·학습 기능이 유지되는지 확인합니다. 서버 완료 후 재요청은 같은 교정 시각이어야 합니다. 일기 수정 후에는 수정 전 결과가 구분되어야 합니다. 서버 요청 실패·한도 초과에도 원문·기존 교정·단어장·복습 기록은 유지되어야 합니다.

동시 요청은 SQL 테스트에서 검증하며 모의 함수가 매우 빠르므로 기기에서 매번 429가 관찰되는 것은 아닙니다. 두 요청이 시간상 겹쳐 처리 중이면 한 요청만 예약되고 다른 요청에는 429/409가 반환됩니다. 한 요청이 완료된 뒤 다음 요청이 시작되면 둘 다 성공할 수 있습니다.
