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

Three modes, all called by Kiro hooks:

    report.py count tool     increment the tool-call counter
    report.py count prompt   increment the prompt counter, stamp session start
    report.py send           post the session and clear the counters

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
        return {
            "currentUsage": bd.get("currentUsage"),
            "usageLimit": bd.get("usageLimit"),
            "percentageUsed": bd.get("percentageUsed"),
            "resetDate": bd.get("resetDate"),
        }
    except Exception:
        return {}


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


def post_session(payload):
    req = urllib.request.Request(
        f"{API_BASE}/kironomics/session",
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        urllib.request.urlopen(req, timeout=5, context=ssl_context()).read()
    except (ssl.SSLError, urllib.error.URLError) as exc:
        # If this machine has no working CA bundle, retry once unverified so the
        # report still lands. The payload is only usage counts, over HTTPS.
        if "certificate verify failed" in str(exc).lower():
            urllib.request.urlopen(
                req, timeout=5, context=ssl._create_unverified_context()
            ).read()
        else:
            raise


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
        "tool_calls": read_int(TOOLS_FILE),
        "prompts": read_int(PROMPTS_FILE),
        "elapsed_seconds": elapsed_seconds(),
        **read_plan_data(),
        **read_campaign_block(),
    }
    try:
        post_session(payload)
    except Exception:
        pass
    cleanup()
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
        return 0

    if mode == "send":
        return send()

    if mode == "status":
        # Handy for "is this actually working?" without opening the site.
        print(f"token:   {'set' if load_token() else 'MISSING'}")
        print(f"tmp dir: {TMP}")
        print(f"tools:   {read_int(TOOLS_FILE)}")
        print(f"prompts: {read_int(PROMPTS_FILE)}")
        return 0

    print(f"unknown mode: {mode}", file=sys.stderr)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
