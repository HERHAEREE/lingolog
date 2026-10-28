param(
  [Parameter(Mandatory = $true)][ValidatePattern('^[a-z0-9]{20}$')][string]$ProjectRef,
  [string]$Model = 'gpt-4.1-mini'
)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
# Explicit manual setup only. Does not call OpenAI or deploy the function.
npx.cmd --yes supabase@latest secrets set CORRECTION_MODE=disabled --project-ref $ProjectRef
if ($LASTEXITCODE -ne 0) { throw '서버 비활성 설정 실패. 다음 단계로 진행하지 마세요.' }
$allowedUserId = Read-Host '앱의 Supabase 사용자 UUID'
if ($allowedUserId -notmatch '^[a-fA-F0-9]{8}-(?:[a-fA-F0-9]{4}-){3}[a-fA-F0-9]{12}$') { throw 'UUID를 확인하세요.' }
$openaiModelName = $Model
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
  npx.cmd --yes supabase@latest secrets set --env-file $secretFile --project-ref $ProjectRef
  if ($LASTEXITCODE -ne 0) { throw 'Secrets 등록 실패. 다음 단계로 진행하지 마세요.' }
} finally {
  if ($keyPointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($keyPointer) }
  if (Test-Path -LiteralPath $secretFile) { Remove-Item -LiteralPath $secretFile -Force }
  Remove-Variable openaiKeyText, secretLines -ErrorAction SilentlyContinue
  $openaiKeySecure.Dispose()
}
