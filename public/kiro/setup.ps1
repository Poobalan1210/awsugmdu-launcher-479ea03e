<#
  Kiro University Build-Along - one-command setup (Windows PowerShell)
  AWS User Group Madurai

      powershell -ExecutionPolicy Bypass -File ugmdu-setup.ps1 <SETUP_CODE> [project-name]

  Creates your project, wires up Kironomics, and registers your repo with us so
  your daily progress is tracked automatically. Nothing to paste afterwards.

  Why this file exists at all: the previous Kironomics hooks ran `sh -c` with
  hardcoded /tmp paths. On Windows that fails silently - setup looks successful
  and the member never appears on the leaderboard. These hooks call Python
  directly, so all three platforms share one code path.

  Safe to re-run.
#>
[CmdletBinding()]
param(
  [string]$SetupCode = '',
  [string]$ProjectName = ''
)

$ErrorActionPreference = 'Stop'

$Site = if ($env:UGMDU_SITE) { $env:UGMDU_SITE } else { 'https://www.awsugmdu.in' }
$Api  = if ($env:UGMDU_API)  { $env:UGMDU_API }  else { 'https://2q4zt5zl9e.execute-api.us-east-1.amazonaws.com/dev' }

$KiroHome  = Join-Path $HOME '.kironomics'
$Reporter  = Join-Path $KiroHome 'report.py'
$TokenFile = Join-Path $KiroHome 'token'

function Say  ($m) { Write-Host $m }
function Ok   ($m) { Write-Host "  ok    $m" }
function Info ($m) { Write-Host "  ..    $m" }
function Warn ($m) { Write-Host "  note  $m" -ForegroundColor Yellow }
function Die  ($m) { Write-Host ""; Write-Host "  stop  $m" -ForegroundColor Red; Write-Host ""; exit 1 }

Say ''
Say 'Kiro University Build-Along - setup'
Say 'AWS User Group Madurai'
Say '-----------------------------------'

# -- 1. Interpreter -------------------------------------------------
$Py = $null
foreach ($candidate in @('python', 'python3', 'py')) {
  $cmd = Get-Command $candidate -ErrorAction SilentlyContinue
  if ($cmd) {
    # The Windows Store stub named "python" exits without running anything, so
    # confirm the interpreter actually executes before trusting it.
    try {
      $probe = & $candidate -c "import sys;print(sys.version_info[0])" 2>$null
      if ($probe -and [int]$probe -ge 3) { $Py = $candidate; break }
    } catch { }
  }
}
if (-not $Py) { Die 'Python 3 not found. Install it from python.org (tick "Add to PATH") and re-run.' }
Ok "using $Py"

# -- 2. Claim the setup code ----------------------------------------
# Short-lived and single-use. Exchanged for the permanent Kironomics token so
# that token never lands in command-line history or a screenshot.
if (-not (Test-Path $KiroHome)) { New-Item -ItemType Directory -Force -Path $KiroHome | Out-Null }

$Token = ''
$ParticipantId = ''
$CampaignId = 'kiro-university-2026'

if ($SetupCode) {
  Info 'claiming your setup code'
  try {
    $claim = Invoke-RestMethod -Method Post -Uri "$Api/campaign/setup/claim" `
      -ContentType 'application/json' -Body (@{ code = $SetupCode } | ConvertTo-Json) -TimeoutSec 20
    $payload = if ($claim.data) { $claim.data } else { $claim }
    if ($payload.kironomicsToken) { $Token = $payload.kironomicsToken }
    if ($payload.participantId)   { $ParticipantId = $payload.participantId }
  } catch {
    Warn 'could not claim the setup code automatically'
  }
}

if ($Token) {
  Set-Content -NoNewline -Path $TokenFile -Value $Token
  Ok "Kironomics key stored at $TokenFile (outside your project)"
} elseif ((Test-Path $TokenFile) -and (Get-Item $TokenFile).Length -gt 0) {
  Ok 'existing Kironomics key found - keeping it'
} else {
  Say ''
  Say "  Paste your Kironomics API key from $Site/kiro (input is hidden):"
  $secure = Read-Host -AsSecureString '  key'
  $plain = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
  if (-not $plain) { Die "No key provided. Get one at $Site/kiro and re-run." }
  Set-Content -NoNewline -Path $TokenFile -Value $plain
  Ok "Kironomics key stored at $TokenFile"
}

# Restrict the token to the current user only.
try {
  icacls $TokenFile /inheritance:r /grant:r "$($env:USERNAME):(R,W)" | Out-Null
  Ok 'token permissions restricted to your account'
} catch { Warn 'could not tighten token file permissions' }

# -- 3. Reporter, installed once per machine ------------------------
try {
  Invoke-WebRequest -UseBasicParsing -Uri "$Site/kiro/report.py" -OutFile "$Reporter.new" -TimeoutSec 30
  Move-Item -Force "$Reporter.new" $Reporter
  & $Py -m py_compile $Reporter 2>$null | Out-Null
  if ($LASTEXITCODE -ne 0) { Die 'The reporter failed to compile. Tell the AWS UG Madurai team.' }
  Ok "reporter installed at $Reporter"
} catch {
  if (Test-Path "$Reporter.new") { Remove-Item -Force "$Reporter.new" }
  if (-not (Test-Path $Reporter)) { Die "Could not download the reporter from $Site/kiro/report.py" }
  Warn 'download failed - keeping the reporter already installed'
}

# -- 4. Project directory and repo ----------------------------------
# Eligibility by construction: Kiro requires the first commit to be on or after
# 21 Sep 09:00 PT. A repo created now cannot violate that.
$HaveGh = $false
if (Get-Command gh -ErrorAction SilentlyContinue) {
  gh auth status 2>$null | Out-Null
  if ($LASTEXITCODE -eq 0) { $HaveGh = $true }
}

git rev-parse --git-dir 2>$null | Out-Null
if ($LASTEXITCODE -eq 0) {
  Ok "using the existing repository in $(Get-Location)"
  $old = git log --before='2026-09-21T09:00:00-07:00' --oneline 2>$null | Select-Object -First 3
  if ($old) {
    Say ''
    Say '  STOP - this repo has commits from before the challenge window:'
    $old | ForEach-Object { Say "        $_" }
    Say ''
    Say '  Kiro disqualifies any repo with a commit before 21 Sep 09:00 PT, and'
    Say '  deleting files does not help - the history is the problem. Start a new'
    Say '  project instead:'
    Say ''
    Say "      cd ..; powershell -ExecutionPolicy Bypass -File $PSCommandPath $SetupCode my-project"
    Say ''
    exit 1
  }
  Ok 'no commits before the challenge window'
} else {
  if (-not $ProjectName) { $ProjectName = 'kiro-university-project' }
  if (Test-Path $ProjectName) { Die "./$ProjectName already exists. Pass a different name." }
  New-Item -ItemType Directory -Force -Path $ProjectName | Out-Null
  Set-Location $ProjectName
  git init -q
  Ok "created ./$ProjectName and initialised git"
}

# -- 5. Kiro hooks --------------------------------------------------
# Built as an object and serialised, so the Windows path separators are escaped
# correctly. Hand-templating "C:\Users\..." into JSON produces invalid JSON.
New-Item -ItemType Directory -Force -Path '.kiro/hooks' | Out-Null
$hooks = [ordered]@{
  version = 'v1'
  hooks   = @(
    [ordered]@{
      name = 'Kironomics Tool Counter'; trigger = 'PostToolUse'; matcher = '.*'
      description = 'Counts tool calls. No file names, paths or content.'
      action = [ordered]@{ type = 'command'; command = "$Py `"$Reporter`" count tool"; timeout = 5 }
    },
    [ordered]@{
      name = 'Kironomics Prompt Counter'; trigger = 'UserPromptSubmit'
      description = 'Counts prompts and stamps session start. No prompt text.'
      action = [ordered]@{ type = 'command'; command = "$Py `"$Reporter`" count prompt"; timeout = 5 }
    },
    [ordered]@{
      name = 'Kironomics Session Reporter'; trigger = 'Stop'
      description = 'Reports session counts and Kiro credit usage.'
      action = [ordered]@{ type = 'command'; command = "$Py `"$Reporter`" send"; timeout = 15 }
    }
  )
}
$hooks | ConvertTo-Json -Depth 10 | Set-Content -Path '.kiro/hooks/kironomics.json' -Encoding UTF8
& $Py -c "import json;json.load(open('.kiro/hooks/kironomics.json'))"
if ($LASTEXITCODE -ne 0) { Die 'Wrote an invalid hooks file. Tell the AWS UG Madurai team.' }
Ok 'hooks written to .kiro/hooks/kironomics.json'

# -- 6. Manifest - no secrets, doubles as proof of ownership ---------
if (-not (Test-Path '.kiro/ugmdu.json')) {
  [ordered]@{
    campaignId = $CampaignId; participantId = $ParticipantId
    lessons = @(); surfaces = @(); notes = @{}
  } | ConvertTo-Json -Depth 10 | Set-Content -Path '.kiro/ugmdu.json' -Encoding UTF8
  Ok 'manifest written to .kiro/ugmdu.json'
} else {
  Warn 'manifest already exists - left untouched'
}

if ((Test-Path '.gitignore') -and (Select-String -Path '.gitignore' -Pattern '^\s*\.kiro/?\s*$' -Quiet)) {
  Warn '.gitignore excludes ALL of .kiro - that is how a finished entry scores zero.'
  Warn 'Remove that line before you commit.'
}

# -- 7. First commit and remote -------------------------------------
git add .kiro 2>$null | Out-Null
git diff --cached --quiet 2>$null
if ($LASTEXITCODE -ne 0) {
  git commit -q -m 'Set up Kiro University project scaffolding' 2>$null
  Ok 'committed the Kiro scaffolding'
} else {
  Info 'nothing new to commit'
}

$repoJson = ''
if ($HaveGh) {
  git remote get-url origin 2>$null | Out-Null
  if ($LASTEXITCODE -ne 0) {
    $name = Split-Path -Leaf (Get-Location)
    Info "creating a public GitHub repo: $name"
    gh repo create $name --public --source=. --push 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) { Warn 'could not create the repo automatically - create it yourself and re-run' }
  } else {
    Info 'remote already configured'
  }
  $repoJson = gh repo view --json id,name,url,owner 2>$null
} else {
  Warn 'GitHub CLI not found or not signed in.'
  Warn "Install it, run 'gh auth login', then re-run this script to finish."
  Warn '  winget install --id GitHub.cli'
}

# -- 8. Register the repo with us - participant types nothing --------
if ($repoJson -and $SetupCode) {
  try {
    $r = $repoJson | ConvertFrom-Json
    $body = @{
      code       = $SetupCode
      repoNodeId = $r.id
      fullName   = "$($r.owner.login)/$($r.name)"
      ownerLogin = $r.owner.login
      repoUrl    = $r.url
    }
    Invoke-RestMethod -Method Post -Uri "$Api/campaign/repo" -ContentType 'application/json' `
      -Body ($body | ConvertTo-Json) -TimeoutSec 20 | Out-Null
    Ok 'repository registered - your progress is now tracked'

    # Record the repo URL in the manifest so a daily sweep can still find you
    # even if the call above never succeeds.
    $m = Get-Content '.kiro/ugmdu.json' -Raw | ConvertFrom-Json
    $m | Add-Member -NotePropertyName repoUrl -NotePropertyValue $r.url -Force
    $m | ConvertTo-Json -Depth 10 | Set-Content '.kiro/ugmdu.json' -Encoding UTF8
  } catch {
    Warn 'could not register the repo yet; re-run this script to retry'
  }
}

Say ''
Say 'Done. One thing left:'
Say ''
Say '  Reload Kiro so it registers the hooks.'
Say '  Command Palette -> Developer: Reload Window, or restart Kiro.'
Say ''
Say "  Check it is counting:  $Py `"$Reporter`" status"
Say "  Your checklist:        $Site/kiro"
Say ''
