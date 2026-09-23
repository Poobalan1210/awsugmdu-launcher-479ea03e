#!/bin/sh
# Kiro University Build-Along — one-command setup (macOS / Linux)
# AWS User Group Madurai
#
#   sh ugmdu-setup.sh <SETUP_CODE> [project-name]
#
# Creates your project, wires up Kironomics, and registers your repo with us so
# your daily progress is tracked automatically. Nothing to paste afterwards.
#
# Deliberately readable and never piped into a shell. Safe to re-run.

set -e

SITE="${UGMDU_SITE:-https://www.awsugmdu.in}"
API="${UGMDU_API:-https://2q4zt5zl9e.execute-api.us-east-1.amazonaws.com/dev}"

SETUP_CODE="${1:-}"
PROJECT_NAME="${2:-}"

KIRO_HOME="${HOME}/.kironomics"
REPORTER="${KIRO_HOME}/report.py"
TOKEN_FILE="${KIRO_HOME}/token"

say()  { printf '%s\n' "$*"; }
ok()   { printf '  ok    %s\n' "$*"; }
info() { printf '  ..    %s\n' "$*"; }
warn() { printf '  note  %s\n' "$*"; }
die()  { printf '\n  stop  %s\n\n' "$*" >&2; exit 1; }

say ""
say "Kiro University Build-Along — setup"
say "AWS User Group Madurai"
say "-----------------------------------"

# ── 1. Interpreter ────────────────────────────────────────────────
if command -v python3 >/dev/null 2>&1; then PY=python3
elif command -v python >/dev/null 2>&1; then PY=python
else die "Python 3 not found. Install Python 3 and re-run."
fi
command -v curl >/dev/null 2>&1 || die "curl not found. Install curl and re-run."
# git is checked up front because this script runs `git init`, `git add` and
# `git commit`. Without this the first git call fails midway with a raw shell
# error, after the token and reporter have already been written.
command -v git >/dev/null 2>&1 || die "git not found. Install git, then re-run this script."
ok "using $(command -v "$PY")"

# ── 2. Claim the setup code ───────────────────────────────────────
# The code is short-lived and single-use. We exchange it for the permanent
# Kironomics token rather than putting that token in the command line, because
# shell history persists and a screenshotted command would leak it forever.
mkdir -p "${KIRO_HOME}"
chmod 700 "${KIRO_HOME}" 2>/dev/null || true

if [ -n "${SETUP_CODE}" ]; then
  info "claiming your setup code"
  CLAIM="$(curl -fsS -m 20 -X POST "${API}/campaign/setup/claim" \
    -H 'Content-Type: application/json' \
    -d "{\"code\":\"${SETUP_CODE}\"}" 2>/dev/null || echo '')"
else
  CLAIM=''
fi

TOKEN=''
PARTICIPANT_ID=''
CAMPAIGN_ID='kiro-university-2026'

if [ -n "${CLAIM}" ]; then
  TOKEN="$(printf '%s' "${CLAIM}" | "$PY" -c 'import json,sys;d=json.load(sys.stdin);print(d.get("kironomicsToken") or d.get("data",{}).get("kironomicsToken") or "")' 2>/dev/null || echo '')"
  PARTICIPANT_ID="$(printf '%s' "${CLAIM}" | "$PY" -c 'import json,sys;d=json.load(sys.stdin);print(d.get("participantId") or d.get("data",{}).get("participantId") or "")' 2>/dev/null || echo '')"
fi

if [ -n "${TOKEN}" ]; then
  printf '%s' "${TOKEN}" > "${TOKEN_FILE}"
  chmod 600 "${TOKEN_FILE}" 2>/dev/null || true
  ok "Kironomics key stored at ${TOKEN_FILE} (outside your project)"
elif [ -s "${TOKEN_FILE}" ]; then
  ok "existing Kironomics key found — keeping it"
else
  # Interactive paste, never an argument, so it stays out of shell history.
  say ""
  say "  Could not claim a setup code automatically."
  say "  Paste your Kironomics API key from ${SITE}/kiro (input is not echoed):"
  printf '  key: '
  stty -echo 2>/dev/null || true
  read PASTED
  stty echo 2>/dev/null || true
  say ""
  [ -n "${PASTED}" ] || die "No key provided. Get one at ${SITE}/kiro and re-run."
  printf '%s' "${PASTED}" > "${TOKEN_FILE}"
  chmod 600 "${TOKEN_FILE}" 2>/dev/null || true
  ok "Kironomics key stored at ${TOKEN_FILE}"
fi

# ── 3. Reporter, installed once per machine ────────────────────────
if curl -fsSL -m 30 "${SITE}/kiro/report.py" -o "${REPORTER}.new"; then
  mv "${REPORTER}.new" "${REPORTER}"
  chmod 644 "${REPORTER}"
  "$PY" -m py_compile "${REPORTER}" >/dev/null 2>&1 || die "The reporter failed to compile. Tell the AWS UG Madurai team."
  ok "reporter installed at ${REPORTER}"
else
  rm -f "${REPORTER}.new"
  [ -s "${REPORTER}" ] || die "Could not download the reporter from ${SITE}/kiro/report.py"
  warn "download failed — keeping the reporter already installed"
fi

# ── 4. Project directory and repo ─────────────────────────────────
# Eligibility by construction: Kiro requires the first commit to be on or after
# 21 Sep 09:00 PT. A repo created right now cannot violate that, which removes
# the single most common way people lose the whole challenge.
HAVE_GH=0
command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1 && HAVE_GH=1

if git rev-parse --git-dir >/dev/null 2>&1; then
  ok "using the existing repository in $(pwd)"
  OLD="$(git log --before='2026-09-21T09:00:00-07:00' --oneline 2>/dev/null | head -3 || true)"
  if [ -n "${OLD}" ]; then
    say ""
    say "  STOP — this repo has commits from before the challenge window:"
    printf '%s\n' "${OLD}"
    say ""
    say "  Kiro disqualifies any repo with a commit before 21 Sep 09:00 PT, and"
    say "  deleting files does not help — the history is the problem. Start a new"
    say "  project instead:"
    say ""
    say "      cd .. && sh $0 ${SETUP_CODE} my-project"
    say ""
    exit 1
  fi
  ok "no commits before the challenge window"
else
  [ -n "${PROJECT_NAME}" ] || PROJECT_NAME="kiro-university-project"
  if [ -e "${PROJECT_NAME}" ]; then
    die "./${PROJECT_NAME} already exists. Pass a different name: sh $0 ${SETUP_CODE} another-name"
  fi
  mkdir -p "${PROJECT_NAME}"
  cd "${PROJECT_NAME}"
  git init -q
  ok "created ./${PROJECT_NAME} and initialised git"
fi

# ── 5. Kiro hooks — one Python call each, so this works on every OS ─
# The previous shell version used `sh -c` with hardcoded /tmp paths, which fails
# silently on Windows. Routing through the reporter keeps all three platforms on
# one code path and one temp-directory resolution.
mkdir -p .kiro/hooks
cat > .kiro/hooks/kironomics.json <<'HOOKS'
{
  "version": "v1",
  "hooks": [
    {
      "name": "Kironomics Tool Counter",
      "trigger": "PostToolUse",
      "matcher": ".*",
      "description": "Counts tool calls. No file names, paths or content.",
      "action": { "type": "command", "command": "__PY__ \"__REPORTER__\" count tool", "timeout": 5 }
    },
    {
      "name": "Kironomics Prompt Counter",
      "trigger": "UserPromptSubmit",
      "description": "Counts prompts and stamps session start. No prompt text.",
      "action": { "type": "command", "command": "__PY__ \"__REPORTER__\" count prompt", "timeout": 5 }
    },
    {
      "name": "Kironomics Session Reporter",
      "trigger": "Stop",
      "description": "Reports session counts and Kiro credit usage.",
      "action": { "type": "command", "command": "__PY__ \"__REPORTER__\" send", "timeout": 15 }
    }
  ]
}
HOOKS

# sed -i is incompatible between BSD and GNU, so write through a temp file.
sed -e "s|__PY__|${PY}|g" -e "s|__REPORTER__|${REPORTER}|g" \
  .kiro/hooks/kironomics.json > .kiro/hooks/kironomics.json.tmp
mv .kiro/hooks/kironomics.json.tmp .kiro/hooks/kironomics.json
"$PY" -c "import json;json.load(open('.kiro/hooks/kironomics.json'))" \
  || die "Wrote an invalid hooks file. Tell the AWS UG Madurai team."
ok "hooks written to .kiro/hooks/kironomics.json"

# ── 6. Manifest — no secrets, doubles as proof of ownership ────────
if [ ! -f .kiro/ugmdu.json ]; then
  cat > .kiro/ugmdu.json <<MANIFEST
{
  "campaignId": "${CAMPAIGN_ID}",
  "participantId": "${PARTICIPANT_ID}",
  "lessons": [],
  "surfaces": [],
  "notes": {}
}
MANIFEST
  ok "manifest written to .kiro/ugmdu.json"
else
  warn "manifest already exists — left untouched"
fi

# Never let a bare .kiro line hide the artifacts Kiro scores you on.
if [ -f .gitignore ] && grep -qE '^[[:space:]]*\.kiro/?[[:space:]]*$' .gitignore; then
  warn ".gitignore excludes ALL of .kiro — that is how a finished entry scores zero."
  warn "Remove that line before you commit."
fi

# ── 7. First commit and remote ─────────────────────────────────────
git add .kiro >/dev/null 2>&1 || true
if git diff --cached --quiet 2>/dev/null; then
  info "nothing new to commit"
else
  git -c user.email="$(git config user.email 2>/dev/null || echo 'builder@awsugmdu.in')" \
      -c user.name="$(git config user.name 2>/dev/null || echo 'Builder')" \
      commit -q -m "Set up Kiro University project scaffolding" || true
  ok "committed the Kiro scaffolding"
fi

REPO_JSON=''
if [ "${HAVE_GH}" = "1" ]; then
  if git remote get-url origin >/dev/null 2>&1; then
    info "remote already configured"
  else
    NAME="$(basename "$(pwd)")"
    info "creating a public GitHub repo: ${NAME}"
    gh repo create "${NAME}" --public --source=. --push >/dev/null 2>&1 \
      || warn "could not create the repo automatically — create it yourself and re-run"
  fi
  REPO_JSON="$(gh repo view --json id,name,url,owner 2>/dev/null || echo '')"
else
  warn "GitHub CLI not found or not signed in."
  warn "Install it, run 'gh auth login', then re-run this script to finish."
  warn "  macOS: brew install gh    Linux: see https://cli.github.com"
fi

# ── 8. Register the repo with us — participant types nothing ───────
if [ -n "${REPO_JSON}" ]; then
  REG="$(printf '%s' "${REPO_JSON}" | "$PY" -c '
import json,sys
d = json.load(sys.stdin)
print(json.dumps({
    "repoNodeId":  d.get("id"),
    "fullName":    (d.get("owner") or {}).get("login","") + "/" + d.get("name",""),
    "ownerLogin":  (d.get("owner") or {}).get("login",""),
    "repoUrl":     d.get("url"),
}))' 2>/dev/null || echo '')"
  if [ -n "${REG}" ] && [ -n "${SETUP_CODE}" ]; then
    curl -fsS -m 20 -X POST "${API}/campaign/repo" \
      -H 'Content-Type: application/json' \
      -d "$(printf '%s' "${REG}" | "$PY" -c "import json,sys;d=json.load(sys.stdin);d['code']='${SETUP_CODE}';print(json.dumps(d))")" \
      >/dev/null 2>&1 && ok "repository registered — your progress is now tracked" \
      || warn "could not register the repo yet; re-run this script to retry"
    # Record the repo URL in the manifest so a daily sweep can find you even if
    # the call above never succeeds.
    "$PY" - "${REG}" <<'PATCHMANIFEST' 2>/dev/null || true
import json,sys,pathlib
reg = json.loads(sys.argv[1])
p = pathlib.Path(".kiro/ugmdu.json")
data = json.loads(p.read_text())
data["repoUrl"] = reg.get("repoUrl","")
p.write_text(json.dumps(data, indent=2) + "\n")
PATCHMANIFEST
    # The patch above rewrites the manifest AFTER the scaffolding commit, so
    # without this the script always finished leaving the working tree dirty.
    # Every participant would see an uncommitted .kiro/ugmdu.json and have to
    # work out whether that mattered.
    if ! git diff --quiet -- .kiro/ugmdu.json 2>/dev/null; then
      git add .kiro/ugmdu.json >/dev/null 2>&1 || true
      git -c user.email="$(git config user.email 2>/dev/null || echo 'builder@awsugmdu.in')" \
          -c user.name="$(git config user.name 2>/dev/null || echo 'Builder')" \
          commit -q -m "Record campaign repo URL in the Kiro manifest" >/dev/null 2>&1 \
        && ok "manifest updated and committed" \
        || warn "manifest updated but not committed — commit .kiro/ugmdu.json yourself"
    fi
  fi
fi

say ""
say "Done. One thing left:"
say ""
say "  Reload Kiro so it registers the hooks."
say "  Command Palette -> Developer: Reload Window, or restart Kiro."
say ""
say "  Check it is counting:  ${PY} \"${REPORTER}\" status"
say "  Your checklist:        ${SITE}/kiro"
say ""
