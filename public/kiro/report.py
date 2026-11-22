#!/usr/bin/env python3
"""
Kironomics reporter — AWS User Group Madurai.

Installed at ~/.kironomics/report.py (or %USERPROFILE%\\.kironomics\\report.py),
deliberately OUTSIDE your project.

Two reasons it does not live in .kiro/:
  1. Kiro University requires you to commit the .kiro/ folder to a PUBLIC repo.
     Earlier versions of this script held the API key as a literal, so anyone
     following both sets of instructions published their key on GitHub.
  2. Installed once per machine instead of once per project.

The key is read at runtime from $KIRONOMICS_TOKEN or ~/.kironomics/token, so
nothing secret is stored in this file. It is safe to read, share, or commit.

Called by Kiro hooks:

    report.py count tool     increment the tool-call counter
    report.py count prompt   increment the prompt counter, stamp session start
    report.py send           post the session and clear the counters

Run by the member (or by Kiro on their behalf):

    report.py setup [--key KEY] [--workspace DIR]
                             store the key and write DIR/.kiro/hooks/kironomics.json
                             pointing at this file. Migrates a workspace from the
                             old per-project .kiro/kironomics_report.py, reusing
                             its key, so no re-paste is needed.
    report.py update         replace this file with the latest published version
    report.py status         show what is installed and what is counted

One copy per machine means a fix ships by bumping REPORTER_VERSION, publishing
this file, and bumping LATEST_REPORTER_VERSION in the backend. Out-of-date
members then see a notice on their stats page, and Kiro offers the update in
chat (once a day). Nothing updates unless the member says yes.

Counting happens here rather than in shell so the hooks work identically on
macOS, Linux and Windows. The previous shell implementation used `sh -c` and
hardcoded /tmp, which fails silently on Windows — members appeared to install
correctly and then never showed up on the leaderboard.

Privacy: this sends counts, durations and Kiro credit totals. It never reads
prompt text, source code, file names or paths.
"""
import json
import os
import sqlite3
import ssl
import sys
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path

API_BASE = os.environ.get(
    "KIRONOMICS_API",
    "https://2q4zt5zl9e.execute-api.us-east-1.amazonaws.com/dev",
)

# tempfile.gettempdir() resolves /tmp on Unix and %TEMP% on Windows. Both the
# counter writes and the send read go through here, so they cannot disagree.
TMP = Path(tempfile.gettempdir())
TOOLS_FILE = TMP / "kironomics_tools"
PROMPTS_FILE = TMP / "kironomics_prompts"
START_FILE = TMP / "kironomics_start"

HOME_DIR = Path.home() / ".kironomics"
TOKEN_FILE = HOME_DIR / "token"
UPDATE_NOTICE_FILE = HOME_DIR / "update_notice"   # latest version the backend reported
UPDATE_ASKED_FILE = HOME_DIR / "update_asked"     # when Kiro last offered the update

# Bump on every published change, together with LATEST_REPORTER_VERSION in
# infrastructure/terraform/lambda/kironomics-crud/index.js.
REPORTER_VERSION = 3
SITE = os.environ.get("KIRONOMICS_SITE", "https://www.awsugmdu.in")
LEGACY_REPORTER = Path(".kiro") / "kironomics_report.py"

MAX_SESSION_SECONDS = 86400


def load_token():
    env = os.environ.get("KIRONOMICS_TOKEN", "").strip()
    if env:
        return env
    try:
        return TOKEN_FILE.read_text().strip()
    except Exception:
        return ""


def read_int(path, default=0):
    try:
        return int(Path(path).read_text().strip())
    except Exception:
        return default


def bump(path):
    """Increment a counter file. Best effort — a lost count must never surface
    as an error in the user's chat."""
    try:
        current = read_int(path, 0)
        Path(path).write_text(str(current + 1))
    except Exception:
        pass


def stamp_start():
    try:
        if not START_FILE.exists():
            START_FILE.write_text(str(int(time.time())))
    except Exception:
        pass


def elapsed_seconds():
    start = read_int(START_FILE, int(time.time()))
    value = int(time.time()) - start
    # Guard a missing or corrupt start (e.g. 0) producing an epoch-sized value.
    # Any real session starts well after 2020; cap a single session at 24h.
    if start < 1600000000 or value < 0 or value > MAX_SESSION_SECONDS:
        return 0
    return value


def kiro_state_db():
    home = Path.home()
    if sys.platform == "darwin":
        return home / "Library/Application Support/Kiro/User/globalStorage/state.vscdb"
    if sys.platform.startswith("win"):
        base = Path(os.environ.get("APPDATA", str(home / "AppData/Roaming")))
        return base / "Kiro/User/globalStorage/state.vscdb"
    return home / ".config/Kiro/User/globalStorage/state.vscdb"


def read_plan_data():
    """Read credit usage from Kiro's own local state. Opened read-only and
    immutable, so this can never modify Kiro's data. Silent failure is fine:
    plan data is optional and the score has a hook-based fallback."""
    try:
        db = kiro_state_db()
        if not db.exists():
            return {}
        # as_uri() rather than "file:" + as_posix(): on Windows the latter builds
        # "file:C:/Users/..." which SQLite does not reliably resolve, so the read
        # failed, the exception was swallowed below, and Windows members silently
        # got no credit data at all. as_uri() produces "file:///C:/Users/..."
        # on Windows and "file:///..." on Unix.
        conn = sqlite3.connect(f"{db.as_uri()}?mode=ro&immutable=1", uri=True)
        try:
            row = conn.execute(
                "SELECT value FROM ItemTable WHERE key=?", ("kiro.kiroAgent",)
            ).fetchone()
        finally:
            conn.close()
        if not row:
            return {}
        state = json.loads(row[0])
        usage = state.get("kiro.resourceNotifications.usageState", {})
        breakdowns = usage.get("usageBreakdowns", [])
        if not breakdowns:
            return {}
        bd = breakdowns[0]
        data = {
            "currentUsage": bd.get("currentUsage"),
            "usageLimit": bd.get("usageLimit"),
            "percentageUsed": bd.get("percentageUsed"),
            "resetDate": bd.get("resetDate"),
        }
        # Free-tier members spend bonus / trial credits first, and those never
        # move breakdowns[0].currentUsage. Reading only the main meter made
        # active members report 0 credits for weeks and get hidden from the
        # leaderboard. Sent separately so the plan is still detected from the
        # main limit.
        extra_usage, extra_limit, extra_keys = read_extra_credits(breakdowns)
        if extra_keys:
            data["extraUsage"] = extra_usage
            data["extraLimit"] = extra_limit
            data["extraCreditKeys"] = extra_keys
        return data
    except Exception:
        return {}


USAGE_KEYS = ("currentUsage", "usage", "usedCredits", "creditsUsed", "used")
LIMIT_KEYS = ("usageLimit", "limit", "totalCredits", "credits", "amount")


def first_number(entry, keys):
    for key in keys:
        value = entry.get(key)
        if isinstance(value, (int, float)) and not isinstance(value, bool):
            return float(value)
    return 0.0


def read_extra_credits(breakdowns):
    """Sum usage across every credit pool other than the main meter: the active
    bonuses and extraCredits on each breakdown, plus any further breakdowns.
    Kiro's shape for these isn't documented, so the field names seen are
    returned too (names only, never values) to confirm the reading server-side."""
    pools = []
    for i, bd in enumerate(breakdowns):
        if not isinstance(bd, dict):
            continue
        if i > 0:
            pools.append(bd)
        # Field names and the ACTIVE filter match Logesh's v3 collector
        # (Kiro-Backend collectors-v3/kironomics_sessions.py read_meter).
        pools.extend(
            e for key in ("bonuses", "extraCredits") for e in (bd.get(key) or [])
            if isinstance(e, dict) and e.get("status", "ACTIVE") == "ACTIVE"
        )
    usage = sum(first_number(p, USAGE_KEYS) for p in pools)
    limit = sum(first_number(p, LIMIT_KEYS) for p in pools)
    keys = sorted({k for p in pools for k in p.keys()})[:40]
    return round(usage, 2), round(limit, 2), keys


def read_campaign_block():
    """Optional campaign metadata written by the setup script into
    .kiro/ugmdu.json. Contains no secrets — campaign id, track and repo only.
    Sent so a session can be attributed to the campaign without the member
    doing anything. Absent outside a campaign project, which is fine."""
    try:
        manifest = Path.cwd() / ".kiro" / "ugmdu.json"
        if not manifest.exists():
            return {}
        data = json.loads(manifest.read_text())
        block = {
            k: data.get(k)
            for k in ("campaignId", "participantId", "repoUrl")
            if data.get(k)
        }
        return {"campaign": block} if block else {}
    except Exception:
        return {}


def ssl_context():
    """Prefer certifi. Some Python builds (notably the python.org macOS build)
    ship without a usable default CA bundle, which makes urllib raise
    CERTIFICATE_VERIFY_FAILED on every request."""
    try:
        import certifi

        return ssl.create_default_context(cafile=certifi.where())
    except Exception:
        try:
            return ssl.create_default_context()
        except Exception:
            return None


def http_open(req, timeout):
    """urlopen with the certifi-first context, retrying once unverified when this
    machine has no working CA bundle. Only usage counts and a public file travel
    over it, always over HTTPS."""
    try:
        return urllib.request.urlopen(req, timeout=timeout, context=ssl_context()).read()
    except (ssl.SSLError, urllib.error.URLError) as exc:
        if "certificate verify failed" in str(exc).lower():
            return urllib.request.urlopen(
                req, timeout=timeout, context=ssl._create_unverified_context()
            ).read()
        raise


def post_session(payload):
    req = urllib.request.Request(
        f"{API_BASE}/kironomics/session",
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    return http_open(req, 5)


def note_update(body):
    """The backend answers with the latest reporter version. Remember it when
    it is newer than this copy, so the next prompt can offer the update."""
    try:
        latest = int(json.loads(body or b"{}").get("latestReporterVersion") or 0)
    except Exception:
        return
    try:
        if latest > REPORTER_VERSION:
            HOME_DIR.mkdir(parents=True, exist_ok=True)
            UPDATE_NOTICE_FILE.write_text(str(latest))
        elif UPDATE_NOTICE_FILE.exists():
            UPDATE_NOTICE_FILE.unlink()
    except OSError:
        pass


def offer_update():
    """Called from the prompt hook. Kiro adds a command hook's stdout to the
    agent's context, so this asks the agent to offer the update to the member,
    at most once a day. It only asks: nothing changes unless the member agrees
    and the agent runs `update`."""
    try:
        latest = int(UPDATE_NOTICE_FILE.read_text().strip())
    except (OSError, ValueError):
        return
    if latest <= REPORTER_VERSION:
        return
    try:
        if time.time() - UPDATE_ASKED_FILE.stat().st_mtime < 86400:
            return
    except OSError:
        pass
    try:
        UPDATE_ASKED_FILE.write_text(str(latest))
    except OSError:
        return
    command = f'"{sys.executable}" "{Path(__file__).resolve()}" update'
    print(
        f"[Kironomics] The member's Kironomics tracker is out of date (v{REPORTER_VERSION}, "
        f"latest v{latest}). Before starting on their request, tell them in one short line "
        "and ask whether to update it now. Only if they agree, run this command and report "
        f"its one-line result:\n{command}\nIf they decline, do not mention it again."
    )


def cleanup():
    for path in (TOOLS_FILE, PROMPTS_FILE, START_FILE):
        try:
            os.remove(path)
        except Exception:
            pass


def send():
    token = load_token()
    if not token:
        # Not set up on this machine. Stay silent rather than erroring into the
        # user's chat on every single agent stop.
        return 0

    payload = {
        "token": token,
        "reporter_version": REPORTER_VERSION,
        "tool_calls": read_int(TOOLS_FILE),
        "prompts": read_int(PROMPTS_FILE),
        "elapsed_seconds": elapsed_seconds(),
        **read_plan_data(),
        **read_campaign_block(),
    }
    try:
        note_update(post_session(payload))
    except Exception:
        pass
    cleanup()
    return 0


# ── Member-run commands ───────────────────────────────────────────

def python_cmd():
    return "python" if sys.platform.startswith("win") else "python3"


def arg_value(argv, flag):
    if flag in argv:
        i = argv.index(flag)
        if i + 1 < len(argv):
            return argv[i + 1]
    return ""


def legacy_key(workspace):
    """The old Power wrote the key as a literal into .kiro/kironomics_report.py.
    Reading it back means migrating never asks the member to paste it again."""
    try:
        text = (workspace / LEGACY_REPORTER).read_text()
    except OSError:
        return ""
    for line in text.splitlines():
        line = line.strip()
        if line.startswith("API_KEY") and "=" in line:
            value = line.split("=", 1)[1].strip().strip("\"'")
            if value and value != "__API_KEY__":
                return value
    return ""


def hooks_json(reporter):
    # Absolute interpreter and reporter paths: hooks run from whatever directory
    # the agent is in, and `python3` is not on PATH on most Windows machines.
    run = f"\"{sys.executable}\" \"{reporter}\""
    return {
        "version": "v1",
        "hooks": [
            {
                "name": "Kironomics Tool Counter",
                "trigger": "PostToolUse",
                "matcher": ".*",
                "description": "Counts tool calls. No file names, paths or content.",
                "action": {"type": "command", "command": f"{run} count tool", "timeout": 5},
            },
            {
                "name": "Kironomics Prompt Counter",
                "trigger": "UserPromptSubmit",
                "description": "Counts prompts and stamps session start. No prompt text.",
                "action": {"type": "command", "command": f"{run} count prompt", "timeout": 5},
            },
            {
                "name": "Kironomics Session Reporter",
                "trigger": "Stop",
                "description": "Reports session counts and Kiro credit usage.",
                "action": {"type": "command", "command": f"{run} send", "timeout": 15},
            },
        ],
    }


def setup(argv):
    workspace = Path(arg_value(argv, "--workspace") or Path.cwd()).resolve()
    reporter = Path(__file__).resolve()

    key = arg_value(argv, "--key").strip() or load_token() or legacy_key(workspace)
    if not key:
        print("No API key found. Get yours at "
              f"{SITE}/kironomics and run: {python_cmd()} \"{reporter}\" setup --key YOUR_KEY")
        return 1
    HOME_DIR.mkdir(parents=True, exist_ok=True)
    TOKEN_FILE.write_text(key)
    try:
        os.chmod(TOKEN_FILE, 0o600)
    except OSError:
        pass
    print(f"ok  key stored at {TOKEN_FILE} (outside your project)")

    hooks_dir = workspace / ".kiro" / "hooks"
    hooks_dir.mkdir(parents=True, exist_ok=True)
    hooks_file = hooks_dir / "kironomics.json"
    hooks_file.write_text(json.dumps(hooks_json(reporter), indent=2) + "\n")
    print(f"ok  hooks written to {hooks_file}")

    legacy = workspace / LEGACY_REPORTER
    if legacy.exists():
        # It holds the API key in plain text inside the project.
        legacy.unlink()
        print(f"ok  removed the old {LEGACY_REPORTER} (it held your key inside the project)")

    print(f"ok  Kironomics reporter v{REPORTER_VERSION} is set up for {workspace}")
    print("    Reload the Kiro window so the hooks register.")
    return 0


def update():
    reporter = Path(__file__).resolve()
    url = f"{SITE}/kiro/report.py"
    try:
        body = http_open(urllib.request.Request(url), 30)
        text = body.decode("utf-8")
        compile(text, str(reporter), "exec")
    except Exception as exc:
        print(f"Update failed, keeping the installed version: {exc}")
        return 1
    match = [ln for ln in text.splitlines() if ln.startswith("REPORTER_VERSION = ")]
    if not match:
        print(f"Update failed: {url} is not a Kironomics reporter. Keeping the installed version.")
        return 1
    latest = int(match[0].split("=", 1)[1].strip())
    if latest <= REPORTER_VERSION:
        print(f"Kironomics reporter v{REPORTER_VERSION} is already the latest.")
        return 0
    tmp = reporter.with_name(reporter.name + ".new")
    tmp.write_text(text)
    os.replace(tmp, reporter)
    for path in (UPDATE_NOTICE_FILE, UPDATE_ASKED_FILE):
        try:
            path.unlink()
        except OSError:
            pass
    print(f"Kironomics reporter updated v{REPORTER_VERSION} -> v{latest}.")
    return 0


def main(argv):
    mode = argv[1] if len(argv) > 1 else "send"

    if mode == "count":
        what = argv[2] if len(argv) > 2 else ""
        if what == "tool":
            bump(TOOLS_FILE)
        elif what == "prompt":
            stamp_start()
            bump(PROMPTS_FILE)
            offer_update()
        return 0

    if mode == "send":
        return send()

    if mode == "setup":
        return setup(argv)

    if mode == "update":
        return update()

    if mode == "status":
        # Handy for "is this actually working?" without opening the site.
        plan = read_plan_data()
        print(f"version: {REPORTER_VERSION}")
        print(f"token:   {'set' if load_token() else 'MISSING'}")
        print(f"tmp dir: {TMP}")
        print(f"tools:   {read_int(TOOLS_FILE)}")
        print(f"prompts: {read_int(PROMPTS_FILE)}")
        print(f"credits: {plan.get('currentUsage')} used of {plan.get('usageLimit')}"
              f" (+ bonus {plan.get('extraUsage', 0)} of {plan.get('extraLimit', 0)})")
        return 0

    print(f"unknown mode: {mode}", file=sys.stderr)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
