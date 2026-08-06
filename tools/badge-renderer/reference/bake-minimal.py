#!/usr/bin/env python3
"""
Open Badges v2.0 baking demo — PNG (iTXt) + SVG (openbadges:assertion).
Spec: https://www.imsglobal.org/sites/default/files/Badges/OBv2p0Final/baking/index.html
Uses the real assertion shape emitted by badges-crud/index.js buildAssertion().
"""
import json, struct, zlib, hashlib, re, sys

BASE = "https://www.awsugmdu.in"
BADGE_ID = "b3"
USER_ID = "9f3c1a7e-4b21-4d0a-9c88-2e5f7a10bd44"
EMAIL = "logesh@example.com"
NAME = "Logesh S"
SLUG = "logesh-s-4f2a"
ASSERTION_ID = f"{BADGE_ID}-{USER_ID}"
ASSERTION_URL = f"{BASE}/ob2/assertions/{ASSERTION_ID}.json"
SALT = f"awsugmdu-{USER_ID[:8]}"
HASHED = "sha256$" + hashlib.sha256((EMAIL.lower().strip() + SALT).encode()).hexdigest()

# ---- the assertion (matches buildAssertion() in badges-crud/index.js) -------
ASSERTION = {
    "@context": "https://w3id.org/openbadges/v2",
    "id": ASSERTION_URL,
    "type": "Assertion",
    "recipient": {"type": "email", "hashed": True, "salt": SALT, "identity": HASHED},
    "badge": f"{BASE}/ob2/badges/{BADGE_ID}.json",
    "verification": {"type": "HostedBadge"},
    "issuedOn": "2026-08-06T00:00:00.000Z",
    "evidence": [{
        "type": "Evidence",
        "id": f"{BASE}/u/{SLUG}",
        "name": f"{NAME}'s AWS UG Madurai Profile",
        "description": f"View {NAME}'s full profile and achievements.",
    }],
    "narrative": f'{NAME} earned the "AWS Certified" badge from AWS User Group Madurai '
                 f'for: Earn at least 1 AWS certification',
}
ASSERTION_JSON = json.dumps(ASSERTION, indent=2)

# ============================ SVG BAKING ====================================
# Spec: xmlns:openbadges="http://openbadges.org" on <svg>; <openbadges:assertion>
# DIRECTLY after the <svg> tag; assertion JSON in body wrapped in CDATA.
def bake_svg(svg: str, assertion_url: str, assertion_json: str) -> str:
    if "<openbadges:assertion" in svg:
        raise ValueError("already baked - spec allows only one tag")
    m = re.search(r"<svg\b[^>]*>", svg)
    if not m:
        raise ValueError("no <svg> tag")
    tag = m.group(0)
    if "xmlns:openbadges" not in tag:
        tag = tag[:-1].rstrip() + '\n     xmlns:openbadges="http://openbadges.org">'
    block = (f'\n  <openbadges:assertion verify="{assertion_url}">\n'
             f'    <![CDATA[\n{assertion_json}\n    ]]>\n'
             f'  </openbadges:assertion>')
    return svg[:m.start()] + tag + block + svg[m.end():]

def extract_svg(svg: str):
    m = re.search(r"<openbadges:assertion[^>]*verify=\"([^\"]+)\"[^>]*>(.*?)</openbadges:assertion>", svg, re.S)
    if not m:
        return None, None
    body = re.search(r"<!\[CDATA\[(.*?)\]\]>", m.group(2), re.S)
    return m.group(1), (json.loads(body.group(1)) if body else None)

# ============================ PNG BAKING ====================================
# Spec: iTXt chunk, keyword "openbadges", compression MUST NOT be used.
def _chunk(ctype: bytes, data: bytes) -> bytes:
    return (struct.pack(">I", len(data)) + ctype + data
            + struct.pack(">I", zlib.crc32(ctype + data) & 0xFFFFFFFF))

def bake_png(png: bytes, assertion_json: str) -> bytes:
    if png[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError("not a PNG")
    # keyword \0 compressionFlag compressionMethod languageTag \0 translatedKeyword \0 text
    itxt = (b"openbadges\x00" + b"\x00" + b"\x00" + b"\x00" + b"\x00"
            + assertion_json.encode("utf-8"))
    chunk = _chunk(b"iTXt", itxt)
    out, off, inserted = bytearray(png[:8]), 8, False
    while off < len(png):
        ln = struct.unpack(">I", png[off:off + 4])[0]
        ctype = png[off + 4:off + 8]
        raw = png[off:off + 12 + ln]
        if ctype in (b"iTXt", b"tEXt") and raw[off and 0 or 8:].startswith(b"openbadges\x00"):
            off += 12 + ln          # drop any pre-existing openbadges chunk
            continue
        if ctype == b"IEND" and not inserted:
            out += chunk            # must land before IEND
            inserted = True
        out += raw
        off += 12 + ln
    return bytes(out)

def extract_png(png: bytes):
    off = 8
    while off < len(png):
        ln = struct.unpack(">I", png[off:off + 4])[0]
        ctype = png[off + 4:off + 8]
        payload = png[off + 8:off + 8 + ln]
        if ctype == b"iTXt" and payload.startswith(b"openbadges\x00"):
            rest = payload[len(b"openbadges\x00"):]
            return json.loads(rest[3:].split(b"\x00", 1)[1].decode("utf-8"))
        if ctype == b"tEXt" and payload.startswith(b"openbadges\x00"):
            return {"_legacy_url": payload.split(b"\x00", 1)[1].decode()}
        off += 12 + ln
    return None

# ============================== RUN =========================================
d = "/tmp/badge-bake-demo/"

# 1. The badge SVG exactly as buildSvg() renders it today (unbaked)
unbaked_svg = '''<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200"
     role="img" aria-label="AWS Certified badge">
  <title>AWS Certified</title>
  <desc>Earned an AWS certification</desc>
  <circle cx="100" cy="100" r="96" fill="#FF9900"/>
  <circle cx="100" cy="100" r="88" fill="#1a1a2e"/>
  <circle cx="100" cy="100" r="80" fill="none" stroke="#FF9900" stroke-width="2" stroke-dasharray="8 4"/>
  <text x="100" y="90" text-anchor="middle" dominant-baseline="middle" font-size="48">&#128220;</text>
  <text x="100" y="118" text-anchor="middle" font-size="13" font-weight="bold" fill="#FFFFFF">AWS Certified</text>
  <text x="100" y="172" text-anchor="middle" font-size="9" fill="#FF9900" letter-spacing="1">AWS UG MADURAI</text>
</svg>'''
open(d + "awsug-b3-UNBAKED.svg", "w").write(unbaked_svg)

baked_svg = bake_svg(unbaked_svg, ASSERTION_URL, ASSERTION_JSON)
open(d + "awsug-b3-BAKED.svg", "w").write(baked_svg)

png_in = open(d + "unbaked-reference.png", "rb").read()
baked_png = bake_png(png_in, ASSERTION_JSON)
open(d + "awsug-b3-BAKED.png", "wb").write(baked_png)

print("=" * 74)
print("BAKED SVG — first 30 lines (note namespace + tag position)")
print("=" * 74)
print("\n".join(baked_svg.splitlines()[:30]))

print()
print("=" * 74)
print("ROUND-TRIP EXTRACTION (this is what a verifier does)")
print("=" * 74)
u, a = extract_svg(baked_svg)
print(f"SVG  verify attr : {u}")
print(f"SVG  assertion id: {a['id']}")
print(f"SVG  recipient   : {a['recipient']['identity'][:34]}...")
print(f"SVG  round-trip   : {'PASS' if a == ASSERTION else 'FAIL'}")
p = extract_png(baked_png)
print(f"PNG  assertion id: {p['id']}")
print(f"PNG  round-trip   : {'PASS' if p == ASSERTION else 'FAIL'}")

print()
print("=" * 74)
print("PNG CHUNKS AFTER BAKING")
print("=" * 74)
off = 8
while off < len(baked_png):
    ln = struct.unpack(">I", baked_png[off:off + 4])[0]
    ct = baked_png[off + 4:off + 8].decode("latin1")
    pl = baked_png[off + 8:off + 8 + ln]
    note = ""
    if ct in ("iTXt", "tEXt"):
        kw = pl.split(b"\x00")[0].decode("latin1", "replace")
        note = f"  keyword={kw!r}" + ("   <<< THE BAKED ASSERTION" if kw == "openbadges" else "")
    print(f"  {ct:6} len={ln:<7}{note}")
    off += 12 + ln
print(f"\n  size: {len(png_in)} B unbaked -> {len(baked_png)} B baked  (+{len(baked_png)-len(png_in)} B)")
