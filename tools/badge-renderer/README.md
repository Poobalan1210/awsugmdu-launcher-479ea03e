# Badge Renderer

Reference implementation for AWS User Group Madurai badge artwork and
**Open Badges v2.0 baking** — the assertion is embedded in the image file itself,
so the image *is* the credential and verifies with no call back to the API.

> **Merging this into `badges-crud`?** Read
> [`docs/badge-baking-merge-guide.md`](../../docs/badge-baking-merge-guide.md) first.
> It documents six bugs in the current `badges-crud/index.js` with line numbers,
> and an eight-step merge plan.

---

## Quick start

```bash
cd tools/badge-renderer
npm install
node build-badges.js        # renders + bakes + verifies everything
open out/index.html         # contact sheet: all 10 badges + palette swatches
node validate.js            # independent check via Mozilla's reference extractor
```

Expected tail:

```
10 badge(s), 21 document set(s), all round-trips PASS
```

Rasterising needs **Google Chrome** installed (headless screenshot). See
[Rendering PNG in production](#rendering-png-in-production) — Lambda uses a
different rasteriser.

## Regenerating the fonts

Only needed if you change the glyph set or add a weight. `fonts.generated.json`
is committed, so the normal build needs neither Python nor network access.

```bash
python3 -m venv .venv
./.venv/bin/pip install fonttools brotli
./.venv/bin/python prepare-fonts.py
```

---

## Files

| File | Purpose |
|---|---|
| `badge-template.js` | Hexagon frame, both layouts, type engine, SVG baker |
| `gopuram.js` | Madurai gopuram crest, parametric |
| `build-badges.js` | Pipeline: OB2 docs → render → raster → PNG baker → verify |
| `prepare-fonts.py` | Font download → subset → metrics → base64 |
| `fonts.generated.json` | **Generated, committed.** Embedded faces + advance widths |
| `validate.js` | Independent verification via `openbadges-bakery` |
| `verify-guide-refs.sh` | Asserts the merge guide's line references still match the code |
| `out/` | **Committed.** Built artifacts — the handover deliverable |
| `reference/` | Research artifacts; see [`reference/`](#reference) below |

## Output

`out/` holds 10 badges × {baked, unbaked} × {svg, png}, plus 21 OB2 JSON
documents and a contact sheet.

| id | badge | layout | why it exists |
|---|---|---|---|
| `c1` | AWS User Group Madurai | crest | gopuram illustration + tracked caption |
| `r1` | Speaker | type | |
| `r2` | Supporter | type | role has descenders — exercises descent clearance |
| `r3` | Volunteer | type | |
| `b1` | Sprint Champion | type | mirrors `BADGE_DEFINITIONS` |
| `b3` | AWS Certified | type | mirrors `BADGE_DEFINITIONS` |
| `b7` | Speaker Star | type | mirrors `BADGE_DEFINITIONS` |
| `b8` | Security Expert | type | + optional rim caption |
| `n1` | Volunteer | type | **stress:** long name, shrinks to fit |
| `n2` | Speaker | type | **stress:** Tamil script name |

`n1` and `n2` are not decorative. Recipient names come straight from
registration, so they cover the two cases real signups produce.

---

## Layouts

```
type layout                          crest layout
─────────────                        ────────────
AWS User Group   light 300 white     ┌────────────────┐
   Madurai                           │    gopuram     │  full-field illustration
──────────       violet rule         │   line art     │
  Supporter      bold 700 violet     └────────────────┘
  ─ ─ ─ ─        dashed hairline      AWS USER GROUP    tracked caption
  Logesh S       medium 500 white         MADURAI
```

Selected by whether `opts.crest` is set. Both share the frame, the embedded
fonts and the baker.

## API

```js
const { renderBadgeSvg, bakeSvg } = require('./badge-template');

const svg   = renderBadgeSvg({ id: 'r2', role: 'Supporter', recipientName: 'Logesh S' });
const baked = bakeSvg(svg, assertion.id, assertion);
```

| Option | Default | Notes |
|---|---|---|
| `id` | — | Seeds the decoration scatter. Required |
| `role` | `''` | The emphasised violet line |
| `wordmarkText` | `'AWS User Group\nMadurai'` | `\n` forces a line break |
| `recipientName` | `''` | **Personalised assertion image only** — see below |
| `description` | `''` | `<desc>` for screen readers |
| `footer` | `''` | Optional tracked rim caption |
| `palette` | `{}` | Per-badge colour overrides |
| `crest` | `null` | Raw SVG `<g>`; switches to crest layout |
| `crestTransform` | `''` | Placement transform for the crest |
| `caption` | `''` | Tracked caption under a crest |
| `embedFont` | `true` | `false` to serve fonts from a CDN instead |

### One rule that must not be broken

`recipientName` makes the image **per-assertion**, not per-badge. In Open Badges
those are different objects:

```
BadgeClass.image   →  generic, shared by EVERY earner, NO name
Assertion image    →  personalised, one per user, WITH name
```

Stamping a name on `BadgeClass.image` breaks the spec — validators and Credly
treat BadgeClass as the template for all earners. Serve two routes, and bake
only the personalised one.

---

## Design notes

**Geometry is derived, not traced.** The reference art is 531×615; that ratio is
0.863 and a regular pointy-top hexagon is exactly √3/2 ≈ 0.866. So the six
vertices are computed. Two hexagons — outer violet, inner navy 20px smaller —
and *the gap between them is the rim*. No stroke, so no vertex artifacts.

**`fieldHalfAt(dy)` is load-bearing.** It returns the field's half-width at any
vertical offset from centre, and everything positional derives from it: type
width targets, mark placement, cloud cropping, the crest overflow assertion. In
a hexagon usable width is a *function of height*; a single constant either wastes
the middle or clips the ends.

**Text is measured, not estimated.** `prepare-fonts.py` extracts real `hmtx`
advance widths, `capHeight` and `descender` into `fonts.generated.json`, so
wrapping, shrink-to-fit and baseline placement are exact. `fitBlock` returns
`descent` because `height` only measures cap-top to last baseline — a rule placed
a fixed gap under "Supporter" would otherwise cut through its two `p`s.

**Decoration is seeded, not random.** FNV-1a of the badge id feeds `mulberry32`.
Same id, same scatter, forever — no diff churn on rebuild. Marks that would
collide with type are *dropped*, not nudged: a missing mark is invisible, a
colliding one is not.

**The crest paints an opaque backdrop.** Line art has a transparent interior, so
clouds drawn behind it bled through. `renderGopuram({ backdrop })` fills the
silhouette first. The medallion uses the same trick, drawn last over its own
opaque disc.

**Crest placement is asserted.** The mandapam is the widest part and sits low,
where the hexagon has tapered. The build computes the field half-width at that
exact `y` and throws if it would overflow — change a gopuram dimension and the
build fails loudly instead of silently clipping.

## Fonts

Amazon Ember is proprietary and cannot be embedded. Substitutes, both SIL OFL 1.1
(see [`licenses/OFL-1.1.txt`](../../licenses/OFL-1.1.txt)):

| Family | Weights | Subset | Covers |
|---|---|---|---|
| Inter | 300 / 500 / 700 | ~8 KB each | Latin, 90 glyphs |
| Noto Sans Tamil | 500 / 700 | ~7.5 KB each | U+0B80–0BFF, 74 glyphs |

52 KB embedded total, down from ~1.1 MB of source TTF.

Tamil is **required, not optional** — Inter has zero Tamil coverage, and a
Madurai member registering as `லோகேஷ்` would otherwise get a credential full of
tofu boxes. Both families are declared under the same CSS family name with the
Tamil faces carrying a restricted `unicode-range`, so a mixed name like
`Logesh லோகேஷ்` resolves per character inside one `<text>` element.

## On the AWS wordmark

The issuer lockup is **plain text**, not the AWS smile logo. This is the safer
option, not a workaround: the
[AWS Trademark Guidelines](https://aws.amazon.com/trademark-guidelines/) permit
fair-use references in plain text making true factual statements (§13) while
restricting logo reproduction (§9) and imitation of AWS trade dress (§10).
"AWS User Group Madurai" is the group's own sanctioned name.
*(Guidelines paraphrased.)*

`opts.wordmarkHref` accepts a licensed image asset if one is ever provided — the
layout measures an `<image>` block instead of wrapping text and re-centres itself.

## Rendering PNG in production

This tool rasterises with **Chrome headless**, which is not practical in Lambda.
Use [`@resvg/resvg-js`](https://github.com/yisibl/resvg-js) there.

Gotcha: resvg does **not** reliably honour base64 `@font-face` inside the SVG.
Render with `embedFont: false` and register the TTFs with its `fontdb`
explicitly. `@napi-rs/canvas`, already used in `api/og/`, cannot help — it does
not parse SVG. Full snippet in the merge guide, Part 10.

---

## `reference/`

Research artifacts. Not used by the build; kept because they are the evidence
behind the merge guide's findings.

| File | What it proves |
|---|---|
| `mozilla-baked-fixture.svg` | Reference baked SVG from `mozilla/openbadges-bakery` — confirms the namespace is `http://openbadges.org` and the element is a direct child of `<svg>` |
| `mozilla-unbaked-fixture.png` | The PNG used as a baking target during development |
| `credly-aws-badgeclass-NOT-baked.png` | AWS's real Credly badge image. Has **no** `openbadges` chunk — correct, because a BadgeClass image is shared by all earners and cannot carry a per-person assertion |
| `bake-minimal.py` | Dependency-free baker in ~60 lines of stdlib Python. Useful for verifying the chunk layout by hand |
| `test-current-buildsvg.js` | Runs the exact markup `badges-crud/buildSvg()` emits through Mozilla's extractor, and prints the four spec deltas |
| `first-proof-{baked,unbaked}.{svg,png}` | The first working baked pair, kept as a before/after diff |

`test-current-buildsvg.js` is worth running before you change anything:

```bash
node reference/test-current-buildsvg.js
```

It shows that the current markup is *tolerated* by Mozilla's lenient regex
extractor but non-conformant on four points — which is a subtler and more
accurate statement than "it's broken".
