# JOEYZYC Terminal Cards Design System

## 1. Atmosphere & Identity

A calm hardware-workbench terminal rendered as a 900-unit desktop or 360-unit mobile SVG instrument panel. The signature is a narrow green signal rail that anchors a dark or warm-paper surface while restrained gradients, one luminous data layer, and compact terminal chrome preserve the source composition without impersonating the upstream author's identity.

## 2. Color

### Palette

| Role | Token | Light | Dark | Usage |
|---|---|---|---|---|
| Surface primary | `surface` | `#fcfbf9` | `#0a0c10` | Card canvas |
| Surface bar | `bar` | `#f5f2eb` | `#12151b` | Terminal title bar, pills |
| Surface inset | `inset` | `#f0ead6` | `#0d1015` | Stats panel |
| Text primary | `text` | `#1a1a1a` | `#e6edf3` | Names and values |
| Text secondary | `muted` | `#57606a` | `#8b949e` | Body copy |
| Text dim | `dim` | `#59636e` | `#7d8590` | Small labels and metadata |
| Border default | `border` | `#e5e1d8` | `#30363d` | Card frame and dividers |
| Border subtle | `borderSubtle` | `#d4cdbc` | `#21262d` | Tracks and secondary dividers |
| Accent signal | `accent` | `#16a34a` | `#39d353` | Rail, dots, cursor, and non-text signals |
| Accent text | `accentText` | `#137333` | `#39d353` | Small green text on all declared surfaces |
| Accent calm | `accentSoft` | `#dcfce7` | `#0d2114` | Context pill fill |
| Info | `info` | `#0550ae` | `#79c0ff` | Category marker |
| Warning | `warning` | `#7a4d00` | `#d29922` | Unavailable-state text and marker |

Rules: colors are emitted through each handler's theme token object only. `accent` is never used as small text in light mode; `accentText` provides AA-safe text contrast on surface, bar, inset, and accent-soft backgrounds. `dim` and `warning` are AA-safe on every declared dark or light surface, including the profile inset's translucent light composite. The fixed red, yellow, and green terminal controls are semantic terminal chrome, not profile status.

## 3. Typography

| Level | SVG size | Weight | Usage |
|---|---:|---:|---|
| Display | 34 | 900 | Profile name |
| Value | 20 | 700 | Live statistic value |
| Body strong | 12 | 700 | About lead, focus category |
| Body | 11 | 400 | Supporting copy |
| Label | 10 | 700 | Pills and row labels |
| Overline | 9 | 700 | `//` section labels |

Primary stack: `Consolas, Menlo, 'DejaVu Sans Mono', 'Courier New', monospace`. Windows resolves Consolas, macOS Menlo, and Linux DejaVu Sans Mono; each face keeps the terminal cadence near a 0.6em advance (Consolas 0.55em), so fixed geometry holds across platforms. Weights 600 and 900 render as bold on every listed face.

## 4. Spacing & Layout

Desktop artboards are exactly 900 units wide. Mobile artboards are exactly 360 units wide and selected in the root README at `max-width: 600px`; they are separate compositions, never scaled 900-unit canvases. The 4-unit base is used for micro alignment; desktop gutters are 24 or 28 units and mobile gutters are 20 units. The accent rail is 3 units, terminal bars are 32 or 34 units, and pill height is 20 to 28 units. The desktop profile card holds a 456-unit split; mobile profile is 500 units high with a 19-unit gap after the stats divider, while mobile skills is 468 units high and ends after its focus rows. Mobile cards become one-column vertical reading flows with 11 to 15-unit body text and fewer secondary labels. SVG artboards scale proportionally only within their matching layout class.

## 5. Components

### Terminal Frame
- **Structure**: base surface, title gradient, three control dots, accent rail, border.
- **Variants**: desktop and mobile header/footer with chrome; desktop and mobile section card; desktop and mobile banner inset.
- **Spacing**: desktop 24/28-unit gutter, mobile 20-unit gutter, 3-unit rail, 32/34-unit bar.
- **States**: light and dark theme, each with desktop and mobile artboards.
- **Accessibility**: `<title>` and `<desc>` name every emitted SVG; text uses the shared terminal stack and color pairings target AA contrast.
- **Motion**: title typing/cursor only; reduced-motion users receive the final static line.

### Section Label and Divider
- **Structure**: `// LABEL` plus 0.5-unit rule.
- **Variants**: about, GitHub stats, technical focus, sources.
- **States**: light and dark theme.

### Signal Pill and Focus Row
- **Structure**: accent dot, factual category label or a focus direction derived from the account's public stars, optional supporting technical terms.
- **Variants**: location/focus context pill, skills category row, footer link pill.
- **States**: default; SVG anchors gain a focus/hover stroke where host support permits.
- **Accessibility**: no proficiency or availability claims; anchors also have an external Markdown link equivalent.

### Availability State
- **Structure**: warning-colored value `Unavailable` and a clear English reason beneath the GitHub stat rows.
- **States**: live data available, API unavailable, or deterministic static snapshot (`Static preview omits live GitHub data`) with no network fetch.
- **Accessibility**: status is expressed in text, not color alone.

### Responsive Asset Selection
- **Structure**: root README `<picture>` sources first match combined `max-width: 600px` and color-scheme media queries, followed by desktop color-scheme sources.
- **Variants**: `{name}_{light,dark}.svg` for desktop and `{name}_mobile_{light,dark}.svg` for mobile.
- **Accessibility**: mobile source images retain the same purpose-specific alt text as desktop images.

## 6. Motion & Interaction

The header's prompt cycles through factual focus lines with SMIL opacity at a 12-second total interval; the cursor blinks at 1.1 seconds. `prefers-reduced-motion: reduce` disables both and leaves the first line visible. Footer pills use a stroke change on host-supported hover/focus. No motion is used as decoration or to indicate employment availability.

## 7. Depth & Surface

Strategy: **mixed, border-led terminal material**. A left-to-right title-bar gradient and a low-opacity inset telemetry panel create depth; 0.5/1-unit rules preserve the crisp terminal boundary. The only glow is the dark-theme stat value and is reserved for live telemetry.

## 8. Accessibility Constraints & Accepted Debt

### Constraints
- WCAG 2.2 AA contrast target for text and labels.
- English copy uses explicit line segmentation in SVG to protect the fixed card geometry.
- Every SVG has a title and description, and every footer destination is duplicated as a Markdown link in the profile README because embedded SVG links may be disabled by GitHub.
- Reduced motion is honored inside the SVG stylesheet.

### Accepted Debt

| Item | Location | Why accepted | Owner / Exit |
|---|---|---|---|
| GitHub may not render all SVG SMIL/CSS interaction states | Embedded README images | GitHub sanitization and image embedding control the runtime | Keep the static final state legible; validate hosted behavior after any deployment |
