# Badge Rendering & Open Badges Baking — Merge Guide

**Audience:** the engineer merging this into `awsugmdu-launcher`.
**Status:** reference implementation complete and verified; not yet merged into `badges-crud`.
**Reference code:** `tools/badge-renderer/` (see [Part 1.1](#11-getting-the-source) — it is currently gitignored).

This guide covers, in order: what exists today and what is broken, what was built, how each
piece works, and the exact merge steps. Every line reference was checked against the
working tree.

---

## Table of contents

- [Part 0 — Summary](#part-0--summary)
- [Part 1 — What was built](#part-1--what-was-built)
- [Part 2 — The spec (why "baking" has exact rules)](#part-2--the-spec-why-baking-has-exact-rules)
- [Part 3 — Bugs in the current codebase](#part-3--bugs-in-the-current-codebase)
- [Part 4 — The font pipeline](#part-4--the-font-pipeline)
- [Part 5 — The renderer](#part-5--the-renderer)
- [Part 6 — The gopuram crest](#part-6--the-gopuram-crest)
- [Part 7 — The two bakers](#part-7--the-two-bakers)
- [Part 8 — Per-user personalisation](#part-8--per-user-personalisation)
- [Part 9 — Merge plan, step by step](#part-9--merge-plan-step-by-step)
- [Part 10 — Rendering PNG inside Lambda](#part-10--rendering-png-inside-lambda)
- [Part 11 — Automated awarding](#part-11--automated-awarding)
- [Part 12 — How to verify](#part-12--how-to-verify)
- [Part 13 — Licensing and attribution](#part-13--licensing-and-attribution)
- [Part 14 — Open decisions](#part-14--open-decisions)

---

## Part 0 — Summary

### What this delivers

A badge renderer producing spec-conformant, cryptographically self-describing Open Badges
v2.0 credentials in the AWS User Group Madurai visual identity, personalised per recipient,
with the assertion **baked into both the SVG and the PNG**.

Baking means the assertion JSON is embedded in the image file itself. The image becomes the
credential: it verifies from a downloaded file, an email attachment, or an offline wallet,
with no call back to your API.

### Current output

10 badges, 21 document sets, all SVG and PNG round-trips passing, validated against
Mozilla's reference extractor with negative controls.

| id | badge | layout | notes |
|---|---|---|---|
| `c1` | AWS User Group Madurai | crest | gopuram illustration + tracked caption |
| `r1` | Speaker | type | |
| `r2` | Supporter | type | role has descenders |
| `r3` | Volunteer | type | |
| `b1` | Sprint Champion | type | |
| `b3` | AWS Certified | type | |
| `b7` | Speaker Star | type | |
| `b8` | Security Expert | type | + optional rim caption |
| `n1` | Volunteer | type | stress: long name, shrinks to fit |
| `n2` | Speaker | type | stress: Tamil script name |

`b1/b3/b7/b8` mirror `BADGE_DEFINITIONS` in `badges-crud/index.js`. `r1–r3` are the
community role badges. `c1` is the Madurai crest. `n1/n2` exist only to prove the
recipient-name path handles real registrations.

### Three things to know before reading further

1. **`POST /ob2/assertions` exists and nothing calls it.** `badges-crud/index.js:396`. Its
   own comment says *"called internally when badge is awarded"*. A grep of `src/` finds no
   callers. No badge has ever been issued — not automatically, not manually.
2. **No badge has ever been baked.** `buildSvg` accepts an `assertionUrl` but the only call
   site passes `null` (`index.js:359`).
3. **Custom badges cannot get a BadgeClass or an assertion.** Both paths look up the
   hardcoded `BADGE_DEFINITIONS` and 404 on anything else.

None of these are regressions. The plumbing was built and left unwired, which means there is
no legacy award path to migrate — a clean starting point.

---

## Part 1 — What was built

### 1.1 Getting the source

`tools/badge-renderer/` is in `.gitignore` (line 26). To hand it over, pick one:

```bash
# Option A — commit it as a reference module (recommended)
#   remove the "tools/badge-renderer/" line from .gitignore, then:
git add tools/badge-renderer/badge-template.js tools/badge-renderer/gopuram.js \
        tools/badge-renderer/build-badges.js tools/badge-renderer/prepare-fonts.py \
        tools/badge-renderer/package.json tools/badge-renderer/fonts.generated.json
# do NOT commit: out/  node_modules/  .venv/  package-lock.json

# Option B — move it to a permanent home first
mkdir -p tools/badge-renderer && git mv tools/badge-renderer/*.js tools/badge-renderer/*.py tools/badge-renderer/
```

`fonts.generated.json` (52 KB) **should** be committed. It is a build artifact, but
committing it means the Lambda build does not need network access or Python.

### 1.2 File inventory

| File | Lines | Purpose |
|---|---|---|
| `badge-template.js` | ~660 | Hexagon frame, both layouts, type engine, SVG baker |
| `gopuram.js` | ~300 | Madurai gopuram crest illustration |
| `build-badges.js` | ~450 | Pipeline: OB2 docs → render → raster → PNG baker → verify |
| `prepare-fonts.py` | ~155 | Font download → subset → metrics → base64 |
| `fonts.generated.json` | 52 KB | Generated. Embedded webfaces + advance widths |

### 1.3 Third-party dependencies

Nothing was copied from GitHub into the shipping code.

| Package | Licence | Ships? |
|---|---|---|
| `openbadges-bakery` 1.0.5 | Mozilla, open source | **No** — verification only |
| `fontTools` | MIT | **No** — build-time only |
| **Inter** font | **SIL OFL 1.1** | **Yes** — embedded in every badge |
| **Noto Sans Tamil** font | **SIL OFL 1.1** | **Yes** — embedded in every badge |

Algorithms implemented from published references rather than copied: `mulberry32` PRNG,
`FNV-1a` hash, and the PNG CRC-32 table (polynomial `0xEDB88320`, from the PNG spec).

See [Part 13](#part-13--licensing-and-attribution) for the licensing action item.

### 1.4 Pipeline shape

```
badge definition
  → BadgeClass JSON      OB2, hosted, with populated alignment[]
  → Assertion JSON       OB2, salted sha256 recipient, evidence → /u/{slug}
  → branded hex SVG      badge-template.js (+ gopuram.js for crest badges)
  → baked SVG            <openbadges:assertion> + CDATA
  → 600×600 PNG          rasterised, transparent background
  → baked PNG            iTXt chunk, keyword "openbadges", uncompressed
  → verify               round-trip extraction on both formats
```

---

## Part 2 — The spec (why "baking" has exact rules)

Source: [Open Badges Baking Specification](https://www.imsglobal.org/sites/default/files/Badges/OBv2p0Final/baking/index.html),
1EdTech, IMS Final Release. Free to implement. *(Rules paraphrased below for licensing
compliance; read the spec for normative text.)*

### 2.1 PNG

- One `iTXt` chunk with keyword `openbadges`
- Text is the assertion JSON, or a signature
- **Compression must not be used** — `compressionFlag` must be `0`
- At most one such chunk per file
- On extraction, read until the first matching chunk

### 2.2 SVG

- `xmlns:openbadges="http://openbadges.org"` on the `<svg>` tag
- `<openbadges:assertion>` **directly after** the `<svg>` tag, with a `verify` attribute
- Assertion JSON in the element body, wrapped in `<![CDATA[ ... ]]>`
- If there is **no body**, `verify` is read as a **signature** — not a URL
- Only one such element per file

### 2.3 Verified against the reference implementation

The prose was cross-checked against `mozilla/openbadges-bakery/test/baked.svg`:

```xml
<svg xmlns="http://www.w3.org/2000/svg"
     xmlns:openbadges="http://openbadges.org"
     viewBox="0 0 512 512">
  <openbadges:assertion verify="http://example.org">
    <![CDATA[
             {"verify":{"url":"http://example.org"}}
    ]]>
  </openbadges:assertion>
```

Namespace is `http://openbadges.org`. The element is a direct child of `<svg>`, not nested
in `<metadata>`. This matters for [Part 3.2](#32-baking-markup-is-non-conformant-on-four-points).

---

## Part 3 — Bugs in the current codebase

All five were found by building the pipeline end to end. Line numbers are from the current
working tree.

### 3.1 Badges are never baked

**`badges-crud/index.js:181` / `:359`**

```js
function buildSvg(badgeId, assertionUrl) { ... }   // :181  accepts the URL
const svgContent = buildSvg(badgeId, null);        // :359  always passes null
```

The `metaBlock` that carries the assertion is only emitted when `assertionUrl` is truthy, so
it never renders. **No badge you have ever served is baked.**

**Fix:** thread the assertion URL through. Note this route serves the *generic* BadgeClass
image, which per [Part 8](#part-8--per-user-personalisation) should stay unbaked — so the
correct fix is a **new** personalised route that bakes, not a change to this one.

### 3.2 Baking markup is non-conformant on four points

**`badges-crud/index.js:191–192`**

```js
? `  <metadata xmlns:openbadges="https://w3id.org/openbadges/v2">
    <openbadges:assertion verify="${esc(assertionUrl)}" />
```

| Spec requires | Current code |
|---|---|
| `xmlns:openbadges="http://openbadges.org"` | `https://w3id.org/openbadges/v2` |
| namespace declared on the `<svg>` tag | declared on `<metadata>` |
| element is a direct child of `<svg>` | nested inside `<metadata>` |
| assertion JSON in a CDATA body | self-closing, URL only |

Mozilla's extractor is regex-based and **lenient** — it finds this tag anyway and returns
the URL. So the markup is not inert, it is non-conformant. A strict validator applies the
extraction rule *no body ⇒ `verify` holds a signature*, tries to parse a JWS, and fails.

It also forfeits the point of baking: with only a URL, the image still needs a live HTTP
call. With the assertion in CDATA, the image **is** the credential.

Note `OB2_CONTEXT` at `:38` is `https://w3id.org/openbadges/v2` — that value is **correct**
for the JSON-LD `@context`. It is only wrong as the *XML namespace*. Do not "fix" both.

### 3.3 Custom badges cannot be issued at all

**`badges-crud/index.js:105–107`, `:405`**

```js
function buildBadgeClass(badgeId, imageUrl) {
  const def = BADGE_DEFINITIONS[badgeId];
  if (!def) return null;                       // :107
```

```js
const def = BADGE_DEFINITIONS[badgeId];        // :405  inside POST /ob2/assertions
if (!def) return json(404, { error: 'Badge not found' });
```

`BADGE_DEFINITIONS` is a hardcoded `b1`–`b8` map. Badges created via `POST /badges` get a
`b-{timestamp}` id and are stored in `BADGES_TABLE` — `:460` even filters for them when
listing. But:

- `GET /ob2/badges/{id}.json` returns **404** for them
- `POST /ob2/assertions` returns **404** for them

So an assertion for a custom badge cannot be created, and if one existed its `badge` field
would point at a dead URL and verification would fail.

**Fix:** read `BADGES_TABLE` first, fall back to `BADGE_DEFINITIONS`. Keep the
built-in-protection checks at `:513` and `:539` as they are — those correctly prevent
editing or deleting `b1`–`b8`.

### 3.4 The verifier rejects Credly's own badges

**`badges-crud/index.js:238`**

```js
[assertion.verification?.type === 'HostedBadge', 'verification is HostedBadge'],
```

Your own assertions emit `HostedBadge` (`:139`), which is fine. But Credly — and therefore
every AWS certification badge — emits `hosted`. Both are valid OB2. Verified live:

```bash
curl -H "Accept: application/json" \
  https://www.credly.com/api/v1/obi/v2/badge_assertions/f9701a36-dd05-484c-a6a4-68e2492b1454
# → "verification": { "type": "hosted" }
```

If `/ob2/verify` is ever pointed at an external badge, it fails. **Fix:** accept both.

### 3.5 The issuer profile advertises a 404

**`badges-crud/index.js`** — `buildIssuer()` sets `image` to `${BASE_URL}/logo.png`.
`public/` has no `logo.png`. Also `favicon.ico`, `favicon.png` and `og-image.png` are all
exactly 66,314 bytes — the same placeholder three times. A strict OB validator flags the
dead image reference.

### 3.6 Blocker, unrelated to badges but gating this work

**`src/components/auth/ProtectedRoute.tsx:8`**

```js
const ENABLE_AUTH_CHECK = false;
```

Every protected route, `/admin` included, renders for anonymous visitors. The backend still
enforces via `shared/auth.js`, so this is an exposure of the admin UI and its data shapes
rather than full write access. It must be `true` before shipping credential issuance tied to
real identities and recipient names.

---

## Part 4 — The font pipeline

`prepare-fonts.py`. Run once; the build only needs `fonts.generated.json`.

### 4.1 Why embed at all

A badge is a portable artifact. If the SVG names a font family, it renders in whatever the
viewer has installed — so the same badge looks different in Chrome on macOS, in a Linux CI
rasteriser, and in LinkedIn's preview crawler. Embedding the outlines makes it render
identically everywhere and removes any dependency on system fonts.

### 4.2 Font choice

**Amazon Ember cannot be used.** It is proprietary and not redistributable, so it cannot be
embedded, and it is not installed on build machines.

**Inter** (SIL OFL 1.1) stands in: a UI-first sans with comparable apertures, a full weight
range, and a licence that explicitly permits embedding.

**Noto Sans Tamil** (SIL OFL 1.1) is **required, not optional**. Recipient names come
straight from registration, the group is in Madurai, and Inter has zero Tamil coverage. Had
the Latin-only subset shipped, every Tamil-script member would have received a credential
full of tofu boxes.

### 4.3 Subsetting

```
subsetting Inter (Latin) -> woff2
  weight 300:  318.1 KB ttf ->   7.9 KB woff2 subset  (2.5%)  90 advances
  weight 500:  317.7 KB ttf ->   8.1 KB woff2 subset  (2.6%)  90 advances
  weight 700:  318.8 KB ttf ->   8.2 KB woff2 subset  (2.6%)  90 advances
subsetting Noto Sans Tamil -> woff2
  weight 500:   75.9 KB ttf ->   7.4 KB woff2 subset  (9.8%)  74 advances
  weight 700:   76.0 KB ttf ->   7.7 KB woff2 subset (10.1%)  74 advances
wrote fonts.generated.json  (52.4 KB base64 total)
```

Weight usage: **300** issuer lockup, **500** recipient name, **700** role and captions.

### 4.4 Mixed-script handling

Both families are emitted under the **same family name** (`AWSUGMDU Sans`), with the Tamil
faces carrying a restricted `unicode-range`:

```css
@font-face{font-family:'AWSUGMDU Sans';font-weight:500;
           unicode-range:U+0B80-0BFF, U+200C-200D;
           src:url(data:font/woff2;base64,...) format('woff2')}
```

The renderer then resolves **per character**, so a mixed name like `Logesh லோகேஷ்` works
inside a single `<text>` element — no span splitting, no markup changes.

Two ordering details that are easy to get wrong:

- **Tamil rules are emitted first.** The Latin faces declare no `unicode-range`, so they
  would otherwise shadow the narrower Tamil declaration.
- `U+200C`/`U+200D` (ZWNJ/ZWJ) are included in the subset. Tamil conjuncts depend on them.

### 4.5 Real metrics, not estimates

`prepare-fonts.py` also reads the font's `hmtx` advance widths, `unitsPerEm`, `capHeight`,
`ascender` and `descender` into `fonts.generated.json`. The renderer measures text exactly
instead of guessing from an average-advance multiplier. This is what makes wrapping,
shrink-to-fit and baseline placement correct rather than approximate.

### 4.6 Note on Python

System Python is externally managed (PEP 668). Use a scoped venv:

```bash
cd tools/badge-renderer
python3 -m venv .venv
./.venv/bin/pip install fonttools brotli
./.venv/bin/python prepare-fonts.py
```

---

## Part 5 — The renderer

`badge-template.js`. One export does the work: `renderBadgeSvg(opts)`.

### 5.1 Geometry, derived not traced

The reference art is 531×615. That ratio is 0.863; a regular pointy-top hexagon is exactly
√3/2 ≈ 0.866. So it is regular, and the six vertices are computed:

```js
const r    = h / 2;                     // centre -> top/bottom vertex
const half = (Math.sqrt(3) / 2) * r;    // centre -> left/right flat side
```

Two hexagons: an outer one filled with the violet gradient, an inner one 20px smaller filled
with the navy vignette. **The gap between them is the rim** — no stroke, so no
stroke-alignment artifacts at the vertices.

### 5.2 `fieldHalfAt(dy)` — the load-bearing function

Returns the field's half-width at any vertical offset from centre. Everything positional
derives from it: type width targets, mark placement, cloud cropping, the crest overflow
assertion.

This is the answer to "fill the badge properly": in a hexagon, usable width is a **function
of height**, not a constant. A single conservative constant either wastes the middle or
clips the ends.

### 5.3 Palette

```js
field: '#1B2333'   fieldDeep: '#141B29'   rim: '#A375F0'
rimBright: '#C6A6FF'   accent: '#A375F0'   ink: '#FFFFFF'
```

Matched by eye from the reference PNGs. Overridable per badge via `opts.palette` — crest
badges use a lifted field (`#2C313F` / `#242936`) so white line art holds contrast.

### 5.4 Type engine

Three functions:

- **`measure(text, size, weight, tracking)`** — exact advance width from real metrics,
  script-aware, with tracking applied *between* glyphs and not after the last one.
- **`fitBlock(...)`** — shrink-to-fit within `[minSize, maxSize]`, honouring explicit `\n`
  breaks and re-wrapping only segments that cannot fit even at the minimum. Returns
  `{ lines, size, cap, height, descent }`.
- **`drawBlock(...)`** — places baselines from the font's actual cap height.

**Shrink-to-fit, not grow-to-fill.** Matching the reference means a consistent type scale
(light 56 / bold 54). Letting short roles inflate to the full width made "Speaker" tower
over the issuer line.

Two bugs were fixed here and both are worth knowing:

```js
// BUG 1 — tracking folded into a "width at size 100" figure.
// Tracking is a fixed pixel cost and does NOT scale with size, so 44px vanished
// from every fit. Correct form solves for it separately:
const unit    = (s) => measure(s, 1, weight, 0);
const sizeFor = (s) => (targetWidth - Math.max(0, s.length - 1) * tracking) / unit(s);

// BUG 2 — an absolute y passed where fieldHalfAt() wants an offset from centre.
// Returned 0, made targetWidth negative, and put every caption word on its own
// line. Now guarded:
if (!(targetWidth > 0)) throw new Error(`fitBlock: targetWidth must be positive, got ${targetWidth}`);
```

**Descenders.** `height` measures cap-top to last baseline — no ink below the baseline. A
rule placed a fixed gap under "Supporter" cut through its two `p`s. `fitBlock` now returns
`descent` from the font's `descender` metric, and callers clear it:

```js
const afterRole = roleTop + roleBlock.height + roleBlock.descent;
```

### 5.5 Two layouts

```
type layout                          crest layout
─────────────                        ────────────
AWS User Group   light 300 white     ┌────────────────┐
   Madurai                           │   gopuram      │  full-field illustration
──────────       violet rule         │   line art     │
  Supporter      bold 700 violet     └────────────────┘
  ─ ─ ─ ─        dashed hairline      AWS USER GROUP    tracked caption
  Logesh S       medium 500 white         MADURAI
```

Selected by whether `opts.crest` is set. Both share the frame, the font embedding and the
baker.

### 5.6 Decoration

**Seeded, not random.** FNV-1a hash of the badge id feeds `mulberry32`. Same id, same
scatter, forever — no diff churn on rebuild.

**Collisions handled two ways:**

- `clampMark(x, y, size, cx, cy)` pulls a mark inward until it fits the field at **every y
  it spans**. Hand-placed absolute coordinates do not survive the hexagon — near the
  vertices the field narrows fast and a mark that looks fine at centre gets sliced.
- A **measured type zone** drops any mark landing on glyphs. Dropping, not repositioning: a
  missing mark is invisible, a colliding one is not.

**Clouds sit on the field edge** so the clip path crops them — that partial crop is what
gives the reference art its depth. `cloudAtEdge()` measures the field at the **narrowest y
the cloud spans**, not at its origin. Measuring only at the origin sliced clouds below
centre diagonally, leaving a hook.

### 5.7 API

```js
renderBadgeSvg({
  id,                 // seeds decoration
  role,               // "Supporter"
  wordmarkText,       // default 'AWS User Group\nMadurai'; \n forces a break
  recipientName,      // personalised assertion image only — see Part 8
  description,        // <desc> for screen readers
  footer,             // optional rim caption
  palette,            // per-badge overrides
  crest,              // raw SVG <g>, switches to crest layout
  crestTransform,     // placement transform
  caption,            // tracked caption under a crest
  embedFont,          // default true; false to serve fonts from CDN instead
})
```

### 5.8 On the AWS wordmark

The issuer lockup is **plain text**, not the AWS smile logo. This is the safer choice, not a
workaround. The [AWS Trademark Guidelines](https://aws.amazon.com/trademark-guidelines/)
permit fair-use references in plain text making true factual statements (§13), while
restricting logo reproduction (§9) and imitation of AWS trade dress (§10). "AWS User Group
Madurai" is the group's own sanctioned name. *(Guidelines paraphrased.)*

`opts.wordmarkHref` still accepts a licensed image asset if one is ever provided — the
layout measures an `<image>` block instead of wrapping text and re-centres itself.

> **Flag for review:** the existing `buildSvg()` in `badges-crud` renders `#FF9900`
> (AWS orange) on concentric rings with an "AWS UG MADURAI" ring label. The org *name* is
> presumably sanctioned via the AWS user group programme, but the AWS-orange,
> AWS-badge-shaped design is a separate §10 trade-dress question. Worth raising with whoever
> owns that programme relationship. This is a reading of published guidelines, not legal
> advice.

---

## Part 6 — The gopuram crest

`gopuram.js`. Parametric, not traced path data.

```js
towerTop: 300,  towerBottom: 600,   // 300 tall
halfTop: 100,   halfBottom: 280,    // taper
tiers: 6,  crownFlare: 30,  crownH: 26,  kudus: 11,  pillars: 8,  reliefRows: 3
```

Anatomy, bottom to top: mandapam colonnade → 6 tapering talas with double cornices and
relief dashes → central spine with accent blocks growing downward → flared crown cap with
kudu ticks → 9 kalasams → medallion boss.

### Three things that make it read correctly

**Proportions.** The structure is **wider than tall (~1.35:1)**. A gopuram reads as squat
and massive; building it slender is the single easiest way to get it wrong.

**The crown flare.** A cornice that oversails the tier below it, widening *upward* against
the tower taper. Without it, the silhouette is just a pyramid.

**An opaque backdrop.** Line art has a transparent interior, so clouds drawn behind bled
through and turned the tower to mush. `renderGopuram({ backdrop: field })` fills the
silhouette first. The medallion uses the same trick — drawn **last** over its own opaque
disc, so tier cornices do not run through the emblem.

### Placement is asserted, not eyeballed

The mandapam is the widest part and sits low, where the hexagon has already tapered. So
`build-badges.js` computes the field half-width at exactly that `y` and throws:

```js
if (needed > available) {
  throw new Error(`crest overflows the hexagon at its base: needs ${needed}, hex allows ${available}`);
}
```

Change any gopuram dimension and the build fails loudly instead of silently clipping.

---

## Part 7 — The two bakers

### 7.1 SVG — `bakeSvg(svg, assertionUrl, assertion)`

Three edits, plus two guards:

```js
// 1. namespace onto the <svg> tag
tag = tag.replace(/\s*>$/, '\n     xmlns:openbadges="http://openbadges.org">');

// 2. assertion block as the first child
const block = `<openbadges:assertion verify="${url}">
    <![CDATA[\n${JSON.stringify(assertion, null, 2)}\n    ]]>
  </openbadges:assertion>`;

// 3. spliced immediately after the <svg> tag

// guards
if (svg.includes('<openbadges:assertion')) throw new Error('already baked');
if (json.includes(']]>')) throw new Error('assertion would break out of CDATA');
```

### 7.2 PNG — `bakePng(png, assertion)`

**No dependency required.** A PNG is a signature followed by length-prefixed, CRC-checked
chunks.

```
IHDR  IDAT ×n  iTXt(900)  IEND
                └── keyword "openbadges" + the assertion JSON
```

Chunk payload layout:

```
6f 70 65 6e 62 61 64 67 65 73 00 00 00 00 00 7b 0a 20 20 22 40 63 6f ...
└──────── "openbadges" ────────┘ │  │  │  │  └─ "{\n  \"@co..."  the JSON
                          NUL ───┘  │  │  └─ translatedKeyword "" + NUL
             compressionFlag = 0 ───┘  └─ languageTag "" + NUL
                    compressionMethod = 0
```

Implementation notes:

- `compressionFlag` **must** be `0`. This is the spec's one non-obvious requirement.
- Every chunk needs CRC-32 over `type + data`, polynomial `0xEDB88320`.
- Insert **immediately before `IEND`** — `IEND` must remain last.
- Drop any pre-existing `openbadges` chunk; the spec allows only one.
- Cost: **+895 bytes**.

### 7.3 Rasterise from the *unbaked* SVG

The PNG gets its own `iTXt` assertion. Rasterising the baked SVG would embed the assertion
twice, giving two copies that can drift apart.

---

## Part 8 — Per-user personalisation

### 8.1 The rule that decides the architecture

Adding a recipient name makes the image **per-assertion**, not per-badge. In Open Badges
these are different objects and must not be conflated:

```
BadgeClass.image   →  generic, shared by EVERY earner, NO name
Assertion image    →  personalised, one per user, WITH name
```

Putting a name on `BadgeClass.image` breaks the spec — validators and Credly treat
BadgeClass as the template for all earners.

So **two route families**, not one:

```
GET /ob2/badge-images/{badgeId}.svg                generic,  unbaked, no name
GET /ob2/assertion-images/{badgeId}-{userId}.svg   personal, baked,   with name
GET /ob2/assertion-images/{badgeId}-{userId}.png   personal, baked,   with name
```

Only the personalised pair is baked. That pair is what goes in the download button, the
email, and the OG tags.

### 8.2 No schema change needed

The render input is already stored. `awsug-ob2-assertions` records carry `recipientName`,
`userSlug`, `badgeName`, `criteria` and `issuedOn` (`badges-crud/index.js:396–425`).
**The assertion record is the render input.**

`user-profile-creation` requires `name` at signup and writes it to `awsug-users`, and
`src/lib/profileSlug.ts` already derives `poobalan-pitchandi-a1b2` from it.

### 8.3 Name rendering

`fitBlock` handles the variance. Names run from `Raj` to
`Lakshmi Venkataraman Subramanian`, so the name block gets a wide shrink range (34 → 17px)
and a target width taken from `fieldHalfAt(150)` — narrower than the role, because the name
sits lower where the hexagon has begun to taper.

Verified with two stress cases:

- `n1` — `Lakshmi Venkataraman Subramanian` shrinks onto one line
- `n2` — `லோகேஷ்` renders with correct conjuncts and vowel signs, no tofu

### 8.4 Caching — generate once, at award time

Personalised images must not be rendered per request. Social crawlers hammer OG URLs and
need a stable target.

```
award event
  → render SVG (with name) → bake → raster PNG → bake
  → s3://<bucket>/assertions/{badgeId}-{userId}.{svg,png}
  → serve via CloudFront
```

`/ob2/assertion-images/...` then becomes an S3 origin or a redirect, CloudFront-cached and
effectively free. Regenerate only when a user changes their display name.

### 8.5 Privacy

The name is PII on a public, permanently shareable image. Once shared to LinkedIn it cannot
be recalled. Use the user's **chosen display name**, state at signup that it appears on
credentials, and consider a profile toggle. Not a blocker, but decide deliberately rather
than by default.

---

## Part 9 — Merge plan, step by step

Ordered so each step is independently shippable and verifiable.

### Step 0 — Blocker

```
src/components/auth/ProtectedRoute.tsx:8    ENABLE_AUTH_CHECK = false → true
```

Verify `/admin` redirects to `/login` when signed out. Do not skip this before Step 5.

### Step 1 — Fix BadgeClass lookup (unblocks custom badges)

`badges-crud/index.js`

```js
// buildBadgeClass(): read BADGES_TABLE first, fall back to BADGE_DEFINITIONS
async function resolveBadge(badgeId) {
  if (BADGE_DEFINITIONS[badgeId]) return BADGE_DEFINITIONS[badgeId];
  const r = await db.send(new GetCommand({ TableName: BADGES_TABLE, Key: { id: badgeId } }));
  return r.Item || null;
}
```

Apply at `:106` (`buildBadgeClass`), `:182` (`buildSvg`) and `:405` (`POST /ob2/assertions`).
`buildBadgeClass` becomes `async` — update its callers. Leave `:513` and `:539` alone.

**Verify:** create a badge via `POST /badges`, then `GET /ob2/badges/{newId}.json` returns
200 with a valid BadgeClass.

### Step 2 — Port the renderer

```
infrastructure/terraform/lambda/badges-crud/
├── render/badge-template.js     from tools/badge-renderer/
├── render/gopuram.js            from tools/badge-renderer/
└── render/fonts.generated.json  from tools/badge-renderer/
```

Two adaptations:

- `badges-crud` is CommonJS already — no change needed. The `tools/badge-renderer/package.json`
  with `"type": "commonjs"` exists only because the repo root sets `"type": "module"`.
- Replace `buildSvg()` with `renderBadgeSvg()`. Keep the old function until Step 3 is done
  so nothing breaks mid-merge.

**Verify:** `GET /ob2/badge-images/{badgeId}.svg` returns the new hexagon, unbaked, no name.

### Step 3 — Add the personalised routes

New Terraform resources in `badges.tf` mirroring the existing `ob2_badge_images` pattern:

```
/ob2/assertion-images/{assertionFile}    GET → badges-crud
```

Handler: parse `{badgeId}-{userId}.{svg|png}`, load the assertion record, render with
`recipientName`, bake, return.

**Verify:** `GET /ob2/assertion-images/b3-{userId}.svg` contains
`<openbadges:assertion` with a CDATA body.

### Step 4 — Fix the verifier

`badges-crud/index.js:238`

```js
[['HostedBadge', 'hosted'].includes(assertion.verification?.type),
 'verification is hosted'],
```

**Verify:** `/ob2/verify?url=https://www.credly.com/api/v1/obi/v2/badge_assertions/{uuid}`
passes the verification step.

### Step 5 — Wire the award path

`POST /ob2/assertions` already works. It needs a caller. Two things to add:

```js
// Idempotency — a plain PutCommand silently re-awards and re-notifies on every retry.
ConditionExpression: 'attribute_not_exists(assertionId)'
```

Only on a successful conditional write do side effects fire: award points
(`type: 'badge'` is already valid in `points-crud`), append to the activity feed, render and
upload the images, send the SES email.

### Step 6 — Fix the issuer image

Add a real `public/logo.png`. Currently `favicon.ico`, `favicon.png` and `og-image.png` are
the same 66,314-byte placeholder, and `buildIssuer()` points `image` at a non-existent
`/logo.png`.

### Step 7 — Automated awarding

See [Part 11](#part-11--automated-awarding).

---

## Part 10 — Rendering PNG inside Lambda

The reference pipeline used **Chrome headless** locally. That will not work in Lambda without
a heavy layer. Checked and unavailable on the build machine: `rsvg-convert`, `cairosvg`,
`inkscape`, `magick`, `sharp`.

### Recommendation: `@resvg/resvg-js`

Rust, native SVG→PNG, Linux x64 prebuilds, fits a Lambda layer comfortably.

**Critical gotcha:** resvg does **not** reliably honour base64 `@font-face` inside the SVG.
You must register fonts with its `fontdb` explicitly:

```js
const { Resvg } = require('@resvg/resvg-js');
const svg = renderBadgeSvg({ ..., embedFont: false });   // skip the inline faces for raster
const png = new Resvg(svg, {
  font: {
    fontFiles: [
      '/opt/fonts/Inter-Light.ttf',
      '/opt/fonts/Inter-Medium.ttf',
      '/opt/fonts/Inter-Bold.ttf',
      '/opt/fonts/NotoSansTamil-Medium.ttf',
      '/opt/fonts/NotoSansTamil-Bold.ttf',
    ],
    defaultFontFamily: 'Inter',
    loadSystemFonts: false,
  },
}).render().asPng();
```

Note `embedFont: false` for the raster path (resvg reads from fontdb) but `true` for the
served SVG (browsers read the inline faces). Two different consumers, two settings.

`@napi-rs/canvas`, already used in `api/og/`, **cannot** help here — it does not parse SVG.

### Size budget

Embedding pushes each SVG from ~4 KB to ~58 KB. Fine for a portable credential — that is
the point. For the web app pass `embedFont: false` and serve the woff2 once from CloudFront.

---

## Part 11 — Automated awarding

### 11.1 What is missing

1. **Criteria are prose, not rules.** `criteria: 'Complete 5 skill sprints'` is a human
   sentence. Nothing can evaluate it.
2. **No metrics resolver.**
3. **No trigger.**
4. **`awsug-users` has no `earnedBadges`.** The assertions table has a `userId-index` GSI so
   badges *can* be queried, but the profile has no link.

### 11.2 Criteria model

Keep both — one for humans, one for machines:

```js
b1: {
  criteria: 'Complete 5 skill sprints',                       // → BadgeClass.criteria
  rule: { metric: 'sprintsCompleted', op: '>=', value: 5 },   // → evaluator
  autoAward: true,
}
```

**Two of the eight cannot be automated.** `b4` Community Helper
(*"Awarded for outstanding community support"*) and `b6` Early Adopter are judgement calls.
Give them `rule: null, autoAward: false` and keep them admin-only. Be deliberate about this
rather than inventing a proxy metric.

### 11.3 Trigger — use both

**DynamoDB Streams → one `badge-evaluator` Lambda.** Streams on `awsug-sprints`,
`awsug-meetups`, `awsug-circles`, `awsug-colleges`, `awsug-kironomics`, `awsug-spotlight`.
On a relevant change, recompute that user's metrics and evaluate every rule. Near-instant,
and it means **none of the 22 existing Lambdas are touched**.

**Plus a nightly EventBridge reconciliation sweep.** Catches backfills, replays, and badges
that become earnable when a rule *changes*. This pattern already exists twice in the repo —
`circle-digest.tf` and `meetup-reminder.tf`.

### 11.4 Ship with a dry-run flag

The first run against real data will award a large batch of retroactive badges at once. Add
`DRY_RUN=true` so the evaluator logs what it *would* award. Review that list before members
receive email.

### 11.5 Rough shape

```
awsug-badges            + rule (structured), autoAward (bool)
awsug-users             + earnedBadges[] (denormalised, fast profile render)
lambda/badge-evaluator    metrics resolver + rule engine + conditional award
lambda/badge-renderer     resvg layer, SVG→PNG, fonts via fontdb
badge-evaluator.tf        stream mappings + nightly EventBridge + IAM
```

---

## Part 12 — How to verify

### 12.1 Run the reference build

```bash
cd tools/badge-renderer
npm install
node build-badges.js
open out/index.html          # contact sheet: all badges + palette swatches
```

Expected tail:

```
10 badge(s), 21 document set(s), all round-trips PASS
```

### 12.2 Independent validation

Round-trip checks in `build-badges.js` only prove self-consistency. Also run Mozilla's
extractor — an implementation neither of us wrote:

```bash
node validate.js
```

Expected, including **negative controls**:

```
out/svg/*-baked.svg    -> OK  Assertion   (×10)
out/png/*-baked.png    -> OK  Assertion   (×10)
out/svg/r1-unbaked.svg -> NO BADGE DATA
out/png/r1-unbaked.png -> NO BADGE DATA
```

The negative controls matter. If unbaked files also "passed", the extractor would be finding
phantoms.

### 12.3 Inspect the PNG chunk

```bash
python3 -c "
import struct
d=open('out/png/r2-baked.png','rb').read(); off=8
while off<len(d):
    n=struct.unpack('>I',d[off:off+4])[0]; t=d[off+4:off+8].decode()
    kw=d[off+8:off+8+n].split(b'\x00')[0].decode('latin1','replace') if t in ('iTXt','tEXt') else ''
    print(f'{t:6} {n:<8} {kw}')
    off+=12+n"
```

### 12.4 Third-party validator

Upload a baked PNG to [openbadgesvalidator.imsglobal.org](https://openbadgesvalidator.imsglobal.org/).

Expect **baking to pass** and the **hosted lookup to fail** while the assertion IDs are
sample values that do not exist in `awsug-ob2-assertions`. Swap in a real assertion ID and
it should go green. Baking and resolution are separate checks — do not read one failure as
both.

### 12.5 Manual checks after merge

| Check | Expected |
|---|---|
| `/admin` signed out | redirects to `/login` |
| `GET /ob2/badges/{customId}.json` | 200, valid BadgeClass (not 404) |
| `GET /ob2/badge-images/{id}.svg` | hexagon, **no** recipient name, unbaked |
| `GET /ob2/assertion-images/{id}-{uid}.svg` | name present, `<openbadges:assertion>` with CDATA |
| `/ob2/verify` on a Credly AWS badge | verification step passes |
| Award the same badge twice | second is a no-op, no second email |
| Tamil display name | renders glyphs, not boxes |

---

## Part 13 — Licensing and attribution

**Action item.** Two fonts are embedded in every badge artifact:

| Font | Licence |
|---|---|
| Inter | SIL Open Font License 1.1 |
| Noto Sans Tamil | SIL Open Font License 1.1 |

OFL 1.1 explicitly permits embedding in documents and imposes no attribution requirement on
rendered output. To stay clean:

1. Keep `fonts.generated.json` — it carries `source`, `license` and `licenseUrl` fields.
2. Add the OFL 1.1 text to the repo, e.g. `licenses/OFL-1.1.txt`.
3. Note both fonts in `THIRD-PARTY-NOTICES` if you maintain one.

`openbadges-bakery` (verification) and `fontTools` (build) are **dev-only** and never reach
production artifacts.

---

## Part 14 — Open decisions

Needing a call from the team, not from code:

1. **Trade dress.** The AWS-orange concentric-ring badge design in the current
   `buildSvg()`. Raise with whoever owns the AWS user group programme relationship.
2. **Recipient name PII.** Display name vs registered name; opt-in or default; signup
   copy.
3. **Which badges stay manual.** `b4` and `b6` have no measurable criteria. Confirm the
   list before the evaluator ships.
4. **Retroactive awarding.** Do existing members receive backdated badges on first
   evaluator run? If yes, `issuedOn` should reflect when the criterion was *met*, not when
   the evaluator ran — which requires historical data that may not exist.
5. **Font strategy for the web app.** Embed everywhere (simple, +54 KB per SVG) or serve
   from CloudFront for web and embed only for downloads (faster, two code paths).

---

## Appendix — Quick reference

### Files to add

```
infrastructure/terraform/lambda/badges-crud/render/badge-template.js
infrastructure/terraform/lambda/badges-crud/render/gopuram.js
infrastructure/terraform/lambda/badges-crud/render/fonts.generated.json
tools/badge-renderer/prepare-fonts.py          (build-time only)
licenses/OFL-1.1.txt
```

### Files to change

| File | Change |
|---|---|
| `src/components/auth/ProtectedRoute.tsx:8` | `ENABLE_AUTH_CHECK` → `true` |
| `badges-crud/index.js:106,182,405` | resolve badge from `BADGES_TABLE` first |
| `badges-crud/index.js:238` | accept `hosted` and `HostedBadge` |
| `badges-crud/index.js:359` | keep generic image unbaked; add personalised route |
| `badges-crud/index.js` `buildIssuer()` | real `logo.png` |
| `infrastructure/terraform/badges.tf` | `/ob2/assertion-images/{assertionFile}` |
| `public/logo.png` | add (currently missing) |

### Environment variables already in place

```
ASSERTIONS_TABLE       = awsug-ob2-assertions
BADGES_TABLE           = awsug-badges
BADGE_IMAGES_BUCKET    = (set in badges.tf)
BASE_URL               = https://www.awsugmdu.in
AWS_REGION             = ap-south-1 (default in badges-crud/index.js:31)
```
