# 실제 OpenAI 교정 설정 (개발용 허용 사용자 전용)

저장소의 `YOUR_PROJECT_REF`는 본인 Supabase 프로젝트 참조 ID로 바꾸세요. 실제 키와 세션은 커밋하지 않으며 `.env.local`과 서버 Secrets에서만 관리합니다. 키 등록 스크립트는 `-ProjectRef` 인자로 지정하거나 실행 시 프롬프트에 입력할 수 있습니다.

기존에는 `CORRECTION_MODE=mock`만 동작했고 모델 호출이 없었습니다. 이제 `model` 모드에서 서버의 Responses API로 영어·일본어를 교정하고 한국어로 설명합니다. 기본값은 여전히 `disabled`이며 앱 플래그도 기본 false입니다. 배포나 유료 API 호출은 이번 코드 변경 과정에서 실행하지 않았습니다.

OpenAI 공식 [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses)와 [Responses API](https://developers.openai.com/api/reference/resources/responses/methods/create)에 맞춰 `text.format`의 엄격한 JSON Schema, `store:false`, `max_output_tokens`를 사용합니다. 실제 반환된 `usage.input_tokens / output_tokens / total_tokens`를 기록합니다. 예시 모델은 `gpt-4.1-mini`이며 본인 OpenAI 프로젝트에서 사용 가능한 Responses/Structured Outputs 지원 모델을 선택하세요. 모델명은 서버 Secret로 변경할 수 있습니다.

## 환경변수와 변경 대상

| 위치 | 이름 | 값 |
| --- | --- | --- |
| 함수 Secrets | `CORRECTION_MODE` | `disabled` / `mock` / **`model`** |
| 함수 Secrets | `OPENAI_API_KEY` | 본인의 OpenAI 프로젝트 API 키; 앱·채팅·Git에 넣지 않음 |
| 함수 Secrets | `OPENAI_MODEL` | 예: `gpt-4.1-mini`; 미설정이면 호출 차단 |
| 함수 Secrets | `OPENAI_MAX_OUTPUT_TOKENS` | 기본 3000, 허용 128–4096; 추론 토큰을 포함한 출력 상한 |
| 함수 Secrets | `OPENAI_ALLOWED_USER_IDS` | 허용할 Supabase Auth UUID; 쉼표 구분. 최초에는 본인 ID 하나만 등록 |
| 함수 Secrets | `LINGOLOG_SUPABASE_PUBLISHABLE_KEY` | 기존 값 유지 |
| 앱 `.env.local` | `EXPO_PUBLIC_SERVER_CORRECTION_ENABLED` | 검증을 시작할 때 `true` |
| 앱 `.env.local` | `EXPO_PUBLIC_SERVER_CORRECTION_MODE` | 서버와 동일한 `model`; 기본 `mock` |

`OPENAI_*`를 `EXPO_PUBLIC_*`로 만들지 마세요. 공개 모드 변수는 UI/응답 검증용이며 서버의 모델 실행 권한을 부여하지 않습니다. 새 앱은 요청 헤더에도 기대 모드를 전달해 설정이 다른 경우 모델 호출 전에 거부합니다. 모의 검증 스크립트도 `mock` 헤더를 보내므로 실제 모드에서 유료 호출하지 않습니다.

추가 migration: `20261010000200_openai_usage.sql`. 비공개 스키마에 `correction_model_attempts` 테이블과 service_role 전용 `start_diary_model_attempt`, `record_diary_model_usage` RPC를 추가합니다. 기존 일기·학습·복습 데이터, 기존 요청 제한 테이블은 삭제하거나 초기화하지 않습니다. 기존 JWT 검증과 Auth.getUser 검증을 유지하며, 검증된 사용자 ID만 allowlist/제한/사용량 기록에 사용합니다.

## 0. 프로젝트와 본인 사용자 ID 확인

아래 명령은 프로젝트 루트의 Windows PowerShell에서 순서대로 실행하세요. CLI가 이미 로그인·연결되어 있으면 login/link는 생략할 수 있습니다.

```powershell
Set-Location 'C:\Users\heri9\Desktop\haeree\sideproject\lingolog'
npx.cmd --yes supabase@latest login
npx.cmd --yes supabase@latest link --project-ref YOUR_PROJECT_REF
```

변경된 앱을 우선 기존 mock 설정으로 실행하고 **일기 교정 → 서버 모드**에서 선택 가능한 **테스트 허용 설정용 사용자 ID**를 복사하세요. 이 값은 Supabase Authentication → Users의 동일한 사용자 UUID여야 합니다. 토큰이나 API 키가 아닙니다. `verify:supabase` 스크립트는 앱과 다른 익명 사용자를 쓰므로 그 사용자를 등록하지 마세요. 앱 세션을 지우거나 재설치하지 않아야 현재 ID가 유지됩니다.

## 1. API 키·모델·허용 ID를 서버 Secrets에 등록

먼저 서버를 disabled로 두면 migration을 적용하는 동안 실제 요청이 나가지 않습니다. `<...>` 대신 복사한 앱 사용자 UUID를 입력하세요. API 키는 프롬프트에서 직접 입력하며 명령 기록에 키를 쓰지 않습니다.

```powershell
npx.cmd --yes supabase@latest secrets set CORRECTION_MODE=disabled --project-ref YOUR_PROJECT_REF
if ($LASTEXITCODE -ne 0) { throw '서버 비활성 설정 실패. 다음 단계로 진행하지 마세요.' }
$allowedUserId = Read-Host '앱의 Supabase 사용자 UUID'
if ($allowedUserId -notmatch '^[a-fA-F0-9]{8}-(?:[a-fA-F0-9]{4}-){3}[a-fA-F0-9]{12}$') { throw 'UUID를 확인하세요.' }
$openaiModelName = 'gpt-4.1-mini'
$openaiKeySecure = Read-Host 'OpenAI API key (화면에 표시되지 않음)' -AsSecureString
$secretFolder = Join-Path (Get-Location) '.expo'
New-Item -ItemType Directory -Path $secretFolder -Force | Out-Null
$secretFile = Join-Path $secretFolder ('openai-secrets-' + [guid]::NewGuid().ToString('N') + '.env')
$keyPointer = [IntPtr]::Zero
try {
  $keyPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($openaiKeySecure)
  $openaiKeyText = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($keyPointer)
  if ([string]::IsNullOrWhiteSpace($openaiKeyText) -or $openaiKeyText -match '[\r\n]') { throw 'API 키를 확인하세요.' }
  $secretLines = @(
    "OPENAI_API_KEY=$openaiKeyText"
    "OPENAI_MODEL=$openaiModelName"
    'OPENAI_MAX_OUTPUT_TOKENS=3000'
    "OPENAI_ALLOWED_USER_IDS=$allowedUserId"
  )
  [IO.File]::WriteAllLines($secretFile, $secretLines, [Text.UTF8Encoding]::new($false))
  npx.cmd --yes supabase@latest secrets set --env-file $secretFile --project-ref YOUR_PROJECT_REF
  if ($LASTEXITCODE -ne 0) { throw 'Secrets 등록 실패. 다음 단계로 진행하지 마세요.' }
} finally {
  if ($keyPointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($keyPointer) }
  if (Test-Path -LiteralPath $secretFile) { Remove-Item -LiteralPath $secretFile -Force }
  Remove-Variable openaiKeyText, secretLines -ErrorAction SilentlyContinue
  $openaiKeySecure.Dispose()
}
```

임시 파일은 Git에서 제외된 `.expo`에 생성하고 즉시 삭제합니다. 키를 파일에 잠시 쓰는 대신 Supabase Dashboard → **Edge Functions → Secrets**에서 위 네 값을 직접 입력해도 됩니다. OpenAI API 프로젝트의 결제/사용 한도와 모델 접근 권한도 직접 확인하세요. 키는 채팅으로 전달할 필요가 없습니다.

위 키 등록 블록은 `scripts/set-openai-secrets.ps1`로도 제공했습니다. 아래 명령은 **동일한 등록 작업**을 수행하므로 둘 중 하나만 실행하면 됩니다. 모델을 바꾸려면 `-Model '모델명'`을 덧붙이세요. 실행 정책은 이 PowerShell 프로세스에만 적용됩니다.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\set-openai-secrets.ps1
```

## 2. 실제 모드 선택

아직 배포 전이므로 아래 명령 자체로 모델을 호출하지 않습니다. 기존 배포 함수는 model 모드를 지원하지 않아 비활성 응답을 내며, 새 함수에서는 migration까지 완료되어야 요청을 처리할 수 있습니다.

```powershell
npx.cmd --yes supabase@latest secrets set CORRECTION_MODE=model --project-ref YOUR_PROJECT_REF
if ($LASTEXITCODE -ne 0) { throw '모드 설정 실패' }
```

`.env.local`의 기존 공개 Supabase URL과 publishable key를 유지하고 아래 두 값을 설정하세요. 파일 전체를 새 템플릿으로 덮어쓰지 마세요.

```dotenv
EXPO_PUBLIC_SERVER_CORRECTION_ENABLED=true
EXPO_PUBLIC_SERVER_CORRECTION_MODE=model
```

## 3. migration 검토·적용과 함수 재배포

```powershell
npx.cmd --yes supabase@latest migration list --linked
npx.cmd --yes supabase@latest db push --linked --dry-run
# 기존 00100은 적용되어 있고, 새 00200_openai_usage.sql이 대상인지 확인한 뒤:
npx.cmd --yes supabase@latest db push --linked
if ($LASTEXITCODE -ne 0) { throw 'Migration 실패. 배포하지 마세요.' }
npx.cmd --yes supabase@latest functions deploy correct-diary --project-ref YOUR_PROJECT_REF --use-api
if ($LASTEXITCODE -ne 0) { throw '함수 배포 실패' }
```

처음 연결하는 다른 DB라면 00100과 00200 모두 적용합니다. Data API 노출 스키마에 `lingolog_private`를 추가하지 않습니다. `verify_jwt`와 기존 익명 Auth 설정은 유지하며 `--no-verify-jwt`를 사용하지 않습니다. 이 명령들은 모델을 호출하지 않습니다.

## 4. 본인이 실제 교정 확인 (여기부터 요청할 때 비용 발생)

```powershell
npx.cmd expo start --clear
```

1. 영어 일기를 저장하고 **교정하기 → 서버 모드 · AI 교정 → 교정 요청**을 누릅니다. 예: `Yesterday I go to the park. I enjoyed the sunshine.`
2. **AI 교정 결과**, 원문 보존, 교정문, 문법/선택 제안 구분과 한국어 설명을 확인합니다. 실제 응답이므로 고정 교정문과 정확히 일치할 필요는 없습니다.
3. 일본어에서도 예: `昨日、公園に行きます。楽しかったです。`로 확인합니다. 표현 저장·TTS·복습 연결도 확인합니다.
4. 같은 원문 버전으로 재요청하면 교정 시각이 같고 새 모델 사용량 행이 없어야 합니다. 기존 mock 결과가 있으면 요청 후 model 결과로 교체됩니다. 수정하면 이전 결과는 수정 전 교정으로 표시됩니다.
5. 미허용 사용자, 네트워크 실패, 출력 한도 초과에서도 원문과 기존 결과가 남는지 확인합니다. 실패는 샘플 성공으로 바꾸지 않습니다.

Supabase SQL Editor에서 아래 조회로 실제 토큰 기록을 확인합니다. 사용자 UUID를 넣으세요. 비밀키·토큰·원문을 조회할 필요가 없습니다.

```sql
select created_at, model, status, input_tokens, output_tokens, total_tokens, response_id
from lingolog_private.correction_model_attempts
where user_id = '여기에-앱-사용자-UUID'::uuid
order by created_at desc;

select (created_at at time zone 'UTC')::date as usage_day,
       count(*) as actual_attempts, sum(input_tokens) as input_tokens,
       sum(output_tokens) as output_tokens, sum(total_tokens) as total_tokens,
       count(*) filter (where status <> 'reported') as unknown_attempts
from lingolog_private.correction_model_attempts
where user_id = '여기에-앱-사용자-UUID'::uuid
group by 1 order by 1 desc;
```

## 제한·실패·보관 동작

- 기존 사용자당 UTC 하루 5개 고유 요청/동시 처리 1개에 더해, 실패 후 명시적 재시도를 포함한 **실제 모델 호출도 하루 5번**으로 원자적으로 제한합니다. 완료된 요청의 캐시 반환은 호출 횟수를 쓰지 않습니다.
- 요청 해시는 모의/실제 정책, 모델명, 출력 상한으로 구분합니다. 모델/상한 변경 또는 원문 버전 변경은 새 요청이므로 다시 비용이 발생할 수 있습니다.
- 원문 2,000 Unicode 코드포인트/요청 바디 16,000바이트 제한 유지. 모델 호출+응답 읽기 25초, 각 DB/Auth 통신 10초, 예약 임대 90초, 앱 대기 60초입니다. OpenAI 자동 재시도는 없습니다.
- 완료/잘림/거부/검증 실패 응답의 실제 토큰 사용량도 저장합니다. 사용량을 받지 못한 경우 `unknown`, NULL로 보관하며 0이나 추정치로 기록하지 않습니다. 사용량 저장 실패 시 성공으로 표시하지 않습니다.
- `started` 또는 `unknown`으로 남은 동일 요청은 자동 재호출을 차단합니다. 서버 중단·네트워크 끊김은 실제 과금 여부가 불확실할 수 있으므로 OpenAI 프로젝트 Usage와 해당 시각/사용자/모델 기록을 대조하세요. 임의로 행을 삭제하거나 0으로 바꾸지 마세요. 관리자 재조정 자동화는 이번 범위에 없습니다. 알려진 사용량이 기록된 실패의 명시적 재시도는 다시 비용이 발생할 수 있으며 하루 실제 호출 제한에 포함됩니다.
- allowlist가 비었거나 모델/키 설정이 없으면 실제 요청을 차단합니다. 앱을 재설치해 사용자 ID가 달라지면 새 ID는 자동 허용되지 않습니다.
- 원문·키·토큰·제공자 오류를 로그에 출력하지 않습니다. 명시적으로 요청한 교정의 원문/결과는 기존 DB 응답 캐시에 보관합니다. `store:false`는 Responses 조회용 저장을 끄는 설정이며 별도의 데이터 보관 정책 전체를 뜻하지 않습니다. 일기 자동 업로드/서버 동기화는 추가하지 않았습니다.

실제 교정을 중지하려면:

```powershell
npx.cmd --yes supabase@latest secrets set CORRECTION_MODE=disabled --project-ref YOUR_PROJECT_REF
# .env.local의 EXPO_PUBLIC_SERVER_CORRECTION_ENABLED도 false로 바꾸고 앱 재시작
```

모의 테스트로 돌아갈 때는 서버 `CORRECTION_MODE=mock`, 앱 `EXPO_PUBLIC_SERVER_CORRECTION_MODE=mock`을 함께 설정하세요. 로컬 `npm.cmd run test:openai`는 전부 주입한 가짜 전송과 로컬 PostgreSQL을 사용하며 API 키나 유료 호출이 필요 없습니다.
