# Design Doc — Visual Language & Marketing Site

**Status:** Draft · **Date:** 2026-09-29 · **Reference:** https://www.haavi.ai/en

This doc describes how haavi.ai is built visually and structurally, and turns that into a design system for this project. We're borrowing its *patterns* — layout, rhythm, type scale, component shapes. We are **not** copying its brand: our logo, product name, copy and accent color stay our own. See [Decisions to make](#9-decisions-to-make).

---

## 1. What the reference does well

haavi.ai is a B2B SaaS landing page (AI for public procurement). Why it works:

- **One strong, calm color system.** Deep navy carries almost everything: text, primary buttons and dark sections. There is a single loud accent (electric yellow-green), used sparingly. Everything else is cool greys.
- **Restrained type.** One typeface (Onest). Headings use medium weight (500), never bold. The hierarchy comes from size, not weight.
- **Proof in the first screen.** Under the hero headline are three big numbers ("92% time savings", "3–5×", "60,000+ weekly").
- **Show the product.** A tabbed showcase swaps product screenshots per feature, so the page doesn't need long prose.
- **A clear story order.** Hero → product showcase → three value sections → testimonial → about → resources → pricing → final CTA → footer.
- **One CTA, repeated everywhere.** "Try free" is the only primary action. It appears in the nav, in each value section and in the final section. The same button style is used each time.

## 2. Design principles

1. **Navy does the work, the accent points.** Use the accent only for the single thing we want the eye to hit on screen, never for decoration.
2. **Size before weight.** Headings are `font-medium`. Reserve `semibold` for small labels, prices and numbers.
3. **Proof over claims.** Every value section pairs a claim with a number, a screenshot or a quote.
4. **One primary action per screen.** Secondary actions are text links or outline buttons.
5. **Generous, consistent whitespace.** Sections breathe. Density lives inside cards, not between them.

## 3. Design tokens

These values come from the reference site's compiled CSS (Tailwind v4 theme). **Our** columns give the proposed mapping. Replace them where we want our own identity.

### 3.1 Color

| Role | Reference name | Hex | Usage on reference |
|---|---|---|---|
| **Primary / ink** | `dark-blue` | `#152749` | Headings, primary buttons, dark sections (most-used color) |
| Body text | `grey-1` | `#415762` | Paragraphs, secondary text (most-used text color) |
| Near-black | `black` | `#1a1a1a` | Rare, high-contrast text |
| Muted text / border | `grey-2` | `#b3bdbd` | Placeholder text, strong borders |
| Border / divider | `grey-3` | `#e5e6e6` | Card borders, dividers, chips |
| Subtle fill | `grey-3-5` | `#f2f3f3` | Tab backgrounds, input fills |
| Section tint | `grey-4` | `#f7f8f8` | Alternating section backgrounds |
| Warm surface | `sand` | `#f9f8f0` | Testimonial and highlight blocks |
| **Accent** | `yellow` | `#f0ff4d` | Highlight CTA on dark sections, badges ("Most popular"), logo on dark |
| Success / positive | `green` | `#397c70` | Checkmarks, positive stats |
| Soft blue | `light-blue` | `#b9cfe0` | Illustration and chart fills |
| Soft green | `light-green` | `#b5d1cc` | Illustration and chart fills |
| Earthy neutral | `mud` | `#938f69` | Tertiary illustration tone |

On dark (`dark-blue`) surfaces, text uses white with opacity steps: `white` for headings, `white/80` for body, `white/70` for secondary text, `white/50` for captions and `white/40` for disabled text. Borders are `white/10`–`white/20`.

**Contrast notes:** `grey-1` on white ≈ 7.6:1 and `dark-blue` on white ≈ 14.8:1, so both pass AA. The accent `#f0ff4d` must **never** be used as text on white (≈1.1:1). Use it only as a fill behind `dark-blue` text, or as text on navy.

### 3.2 Typography

- **Family:** Onest (Google Fonts, variable weight, has Latin-ext subsets), used for everything. Mono falls back to the system monospace font.
- **Weights:** 400 for body, 500 for headings and buttons, 600 for labels, prices and numbers. Bold (700) is effectively unused.

| Token | Size (mobile → desktop) | Weight | Use |
|---|---|---|---|
| Display / H1 | 36px → 48px (`sm`) → 70px (`lg`) | 500 | Hero headline only |
| H2 (section) | 30px → 36px, 48px for key sections | 500 | Section titles |
| H3 | 24px → 30px | 500 | Card and sub-section titles |
| Stat | 36px | 600 | Hero metrics, pricing |
| Body L | 18px / 1.625 | 400 | Section intros |
| Body | 16px / 1.5 | 400 | Default |
| Small | 14px | 400–500 | UI text, buttons, nav (most-used size) |
| Caption / eyebrow | 12px | 500–600 | Eyebrows above H2s, badges, footnotes |

### 3.3 Shape, spacing, layout

- **Radius:** `rounded-xl` (12px) for buttons and inputs, `rounded-2xl` (16px) for cards and screenshot frames, `rounded-full` for pills, tabs, avatars and icon chips. Nothing is square-cornered.
- **Spacing:** Tailwind's 4px base. Sections use `py-20`–`py-28` on desktop and `py-14`–`py-16` on mobile. Headings get `mt-4` below an eyebrow, and CTAs get `mt-10` below body text.
- **Container:** `max-w-7xl` (1280px) with `px-4 sm:px-6 lg:px-8`. Prose is capped at `max-w-2xl`.
- **Motion:** 150ms `cubic-bezier(.4,0,.2,1)` color transitions on hover. Tab and screenshot swaps crossfade. Nothing bouncy.
- **Elevation:** Almost flat. Hierarchy comes from borders (`grey-3`) and tinted fills, with shadows reserved for floating screenshots.

## 4. Components

| Component | Spec (Tailwind) |
|---|---|
| **Primary button** | `rounded-xl bg-dark-blue px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-dark-blue/90`. Nav size: `px-4 py-2`. |
| **Accent button** (dark sections only) | `rounded-xl bg-yellow px-5 py-3 text-sm font-medium text-dark-blue hover:bg-yellow/90` |
| **Secondary / outline** | `rounded-xl border border-dark-blue px-5 py-3 text-sm font-medium text-dark-blue hover:bg-dark-blue/5` |
| **Text link** | `text-sm font-medium text-dark-blue underline-offset-4 hover:underline`, with a trailing → arrow |
| **Eyebrow** | `text-xs font-semibold uppercase tracking-wide text-green` (or `text-grey-1`) |
| **Card** | `rounded-2xl border border-grey-3 bg-white p-6 sm:p-8` |
| **Stat** | Number `text-4xl font-semibold text-dark-blue`, label `text-sm text-grey-1` |
| **Pill tabs** | Container `rounded-full bg-grey-3-5 p-1`. Tab `rounded-full px-4 py-2 text-sm font-medium`. Active tab: `bg-white text-dark-blue shadow-sm`. Scrolls horizontally on mobile. |
| **Badge** | `rounded-full bg-yellow px-3 py-1 text-xs font-semibold text-dark-blue` |
| **Screenshot frame** | `rounded-2xl border border-grey-3 bg-grey-4 p-2 shadow-xl`, with the image inside at `rounded-xl` |
| **Input** | `rounded-xl border border-grey-2 bg-white px-4 py-3 text-sm placeholder:text-grey-2 focus:border-dark-blue focus:outline-none` |

## 5. Page structure (landing page)

Build the page in this order, following the reference's narrative.

1. **Header.** Sticky, white, with a bottom border only after scrolling. Logo on the left and 4–5 nav links in the center. On the right: a language switch, "Log in" as a text link and a primary CTA. On mobile, the nav collapses into a sheet.
2. **Hero.** Eyebrow, H1 (≤ 8 words) and a one-line subhead. Then the primary CTA plus a "no credit card" micro-copy line, and a row of **three stats**.
3. **Product showcase.** Pill tabs, one per feature. Each tab swaps in a screenshot frame and a two-line caption.
4. **Value sections (×3).** Alternating image and text layout, with eyebrow, H2, 2–3 short paragraphs or bullets and a repeated CTA. Each is framed as a *role* the product plays (the reference uses "as Scout / as Analyzer / as Proposal Assistant").
5. **Testimonial.** `bg-sand` block with a large pull quote, headshot, name, title and company logo, plus an optional link to the case study.
6. **About / trust.** Three columns, each with an icon chip, H3 and short copy.
7. **Resources.** A 4-card grid of guides and a "View all" text link.
8. **Pricing.** H2 "Transparent pricing…" and a trust line (trial length, cancel anytime). Three cards; the middle card is highlighted with a `dark-blue` border and a "Most popular" badge. Enterprise is priced as "Contact us".
9. **Final CTA.** Full-bleed `bg-dark-blue` section with a white H2, `white/80` body text and an **accent** button.
10. **Footer.** `bg-dark-blue`. Link columns (Product / Company / Resources), a newsletter input, social icons, the logo in the accent color, and © year.
11. **Chat widget (optional).** A floating button in the bottom-right that opens a small form with name, email and an optional company field.

## 6. Voice & copy

The reference sounds professional, direct and friendly. It uses the second person ("helps you find…"), active verbs and concrete numbers, and avoids hype. Keep headlines to 8 words or fewer, paragraphs to 3 lines or fewer, and CTA labels to 3 words or fewer. Use the same primary CTA label everywhere.

## 7. Responsive & accessibility

- Design mobile-first. Stats stack vertically on mobile, and value sections go to a single column with the image above the text.
- On mobile the pill tabs become a horizontally scrollable row with `snap-x`.
- Hit targets are at least 44px, and focus rings are visible (`focus-visible:ring-2 ring-dark-blue ring-offset-2`).
- Respect `prefers-reduced-motion`: turn off the crossfades.
- All screenshots need meaningful `alt` text.

## 8. Implementation in this repo

Stack: Next.js 16 App Router + Tailwind v4 (already scaffolded).

**`src/app/layout.tsx`**: swap Geist for Onest.

```tsx
import { Onest } from "next/font/google";
const onest = Onest({ variable: "--font-onest", subsets: ["latin", "latin-ext"] });
// <html className={`${onest.variable} h-full antialiased`}>
```

**`src/app/globals.css`**: define the tokens so the classes in §4 work as written.

```css
@import "tailwindcss";

@theme {
  --font-sans: var(--font-onest), ui-sans-serif, system-ui, sans-serif;

  --color-dark-blue: #152749;
  --color-black: #1a1a1a;
  --color-grey-1: #415762;
  --color-grey-2: #b3bdbd;
  --color-grey-3: #e5e6e6;
  --color-grey-3-5: #f2f3f3;
  --color-grey-4: #f7f8f8;
  --color-sand: #f9f8f0;
  --color-yellow: #f0ff4d;   /* replace with our accent */
  --color-green: #397c70;
  --color-light-blue: #b9cfe0;
  --color-light-green: #b5d1cc;
  --color-mud: #938f69;
}

body { @apply bg-white text-grey-1 font-sans; }
```

**Suggested component files:** put `Button`, `Card`, `Stat`, `PillTabs`, `Badge` and `ScreenshotFrame` in `src/components/ui/`. Put one file per section from §5 in `src/components/sections/`. `src/app/page.tsx` then only composes the sections.

## 9. Decisions to make

- **Accent color.** Keep a single high-energy accent, but choose our own rather than `#f0ff4d`, so we don't look like a Haavi clone.
- **Typeface.** Onest is a good fit and free. Alternatives with a similar feel are Inter, Manrope and Geist (already installed).
- **Dark mode.** The reference has none. Do we need one? If so, invert to a `dark-blue` background and reuse the white-opacity scale from §3.1.
- **Content.** Hero stats, the three value "roles", the testimonial and pricing all depend on what this product is. The structure above is ready, but the copy isn't written yet.
