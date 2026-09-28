---
name: Family Roofing, Los Angeles & Orange County
description: Category-standard residential roofer site, sunlit paper and slate with one amber action voice, built to hold the owner's real proof.
colors:
  paper: "#f6f5f1"
  white: "#ffffff"
  ink: "#15222b"
  ink-2: "#44535d"
  line: "#dcd9d0"
  slate: "#1f3a4d"
  slate-deep: "#13283a"
  slate-2: "#2d5068"
  slate-tint: "#e7edf0"
  on-slate: "#f3f6f7"
  on-slate-2: "#c3d1d9"
  amber: "#f2b544"
  amber-deep: "#dc9a1f"
  error: "#b3261e"
  ok: "#1d6b45"
  field-stroke: "#b9bfc2"
  placeholder-text: "#6b7780"
  ph-fill: "#fff3cf"
  ph-ink: "#6b4a00"
  ph-stroke: "#c9941c"
  ph-ink-on-slate: "#ffe2a6"
typography:
  display:
    fontFamily: "'Archivo Variable', 'Archivo', system-ui, sans-serif"
    fontSize: "clamp(2.5rem, 5.2vw, 4.4rem)"
    fontWeight: 760
    lineHeight: 1.06
    letterSpacing: "-0.03em"
    fontVariation: "'wdth' 88"
  headline:
    fontFamily: "'Archivo Variable', 'Archivo', system-ui, sans-serif"
    fontSize: "clamp(2rem, 3.4vw, 2.9rem)"
    fontWeight: 760
    lineHeight: 1.06
    letterSpacing: "-0.02em"
    fontVariation: "'wdth' 88"
  title:
    fontFamily: "'Archivo Variable', 'Archivo', system-ui, sans-serif"
    fontSize: "1.4rem"
    fontWeight: 760
    lineHeight: 1.15
    letterSpacing: "-0.01em"
    fontVariation: "'wdth' 88"
  lede:
    fontFamily: "'Source Sans 3 Variable', 'Source Sans 3', system-ui, sans-serif"
    fontSize: "clamp(1.15rem, 1.6vw, 1.3rem)"
    fontWeight: 400
    lineHeight: 1.6
  body:
    fontFamily: "'Source Sans 3 Variable', 'Source Sans 3', system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "'Source Sans 3 Variable', 'Source Sans 3', system-ui, sans-serif"
    fontSize: "0.98rem"
    fontWeight: 650
    lineHeight: 1.3
  button:
    fontFamily: "'Archivo Variable', 'Archivo', system-ui, sans-serif"
    fontSize: "1.05rem"
    fontWeight: 700
    lineHeight: 1.1
    fontVariation: "'wdth' 92"
  number:
    fontFamily: "'Archivo Variable', 'Archivo', system-ui, sans-serif"
    fontSize: "1.1rem"
    fontWeight: 750
    lineHeight: 1.15
    fontFeature: "'tnum' 1"
rounded:
  chip: "4px"
  control: "6px"
  circle: "50%"
spacing:
  gutter: "clamp(1rem, 4vw, 2.5rem)"
  section: "clamp(4rem, 9vw, 7.5rem)"
  max: "76rem"
  section-head-gap: "clamp(2rem, 4vw, 3.25rem)"
  card-pad: "clamp(1.5rem, 3vw, 2.25rem)"
components:
  button-primary:
    backgroundColor: "{colors.amber}"
    textColor: "{colors.ink}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    padding: "0.75rem 1.4rem"
    height: "3.25rem"
  button-primary-hover:
    backgroundColor: "{colors.amber-deep}"
    textColor: "{colors.ink}"
  button-slate:
    backgroundColor: "{colors.slate}"
    textColor: "{colors.white}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    padding: "0.75rem 1.4rem"
    height: "3.25rem"
  button-slate-hover:
    backgroundColor: "{colors.slate-deep}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.slate}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    padding: "0.75rem 1.4rem"
    height: "3.25rem"
  button-ghost-hover:
    backgroundColor: "{colors.slate-tint}"
  input-text:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "0.65rem 0.85rem"
    height: "3.1rem"
  estimate-card:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "{spacing.card-pad}"
  placeholder-chip:
    backgroundColor: "{colors.ph-fill}"
    textColor: "{colors.ph-ink}"
    rounded: "{rounded.chip}"
    padding: "0 0.35em"
  photo-slot:
    backgroundColor: "{colors.slate-2}"
    textColor: "{colors.on-slate}"
    rounded: "0"
    padding: "1.5rem"
  icon-medallion:
    backgroundColor: "{colors.slate-tint}"
    textColor: "{colors.slate}"
    rounded: "{rounded.circle}"
    size: "2.5rem"
  step-number:
    backgroundColor: "{colors.slate}"
    textColor: "{colors.white}"
    rounded: "{rounded.circle}"
    size: "2.75rem"
---

# Design System: Family Roofing, Los Angeles & Orange County

## Overview

**Creative North Star: "The Job-Site Clipboard"**

A local family roofer's site, played straight at the craft level of the best in the category. Everything a homeowner needs to act is on the page and nothing is ornamental: a sunlit paper ground, deep slate ink and slate brand fields, and a single warm amber that means "do this now." Trust is carried by checkable facts laid out on hairline-ruled lists, by square photo frames that will hold the crew's real work, and by a white estimate card that sits on every slate field as the primary action.

The system is honest about what it does not yet have. Every business fact the owner still has to supply renders as a dashed amber placeholder chip, and every missing photo renders as a labeled slate slot with a camera icon. These are first-class parts of the system, not scaffolding to hide: they keep invented proof out of the build and tell the owner exactly what to fill in.

Density is comfortable and phone-first: 18px body, generous section rhythm, large tap targets (48px-plus controls), and a persistent call/estimate bar on small screens.

**Key Characteristics:**
- Light paper and white surfaces alternating by section; slate fields for the hero, inner-page header band, and closing CTA.
- One amber action voice; slate for everything brand and structural.
- Archivo semi-condensed, heavy, tight-tracked headings over Source Sans 3 reading text.
- Square photo frames, 6px controls, 1px hairline rules instead of card boxes.
- Lucide line icons at one stroke weight (1.9).
- Visible, labeled placeholders for every unsupplied fact and photo.

## Colors

A cool slate-and-paper palette warmed by one amber, used sparingly for action and attention.

### Primary
- **Roof Slate** (slate): the brand field. Hero and page-hero backgrounds, closing CTA band, default (non-primary) button fill, links, step-number discs, the brand mark tile, `accent-color` for native controls, and the `theme-color`.
- **Night Slate** (slate-deep): footer ground, slate-button hover, and the base of the hero photo scrim.
- **Weathered Slate** (slate-2): link hover, section icons, and the photo-slot fill.
- **Slate Wash** (slate-tint): icon medallion fill, ghost and nav hover, neutral form status.

### Secondary
- **Porch-Light Amber** (amber): the action and attention signal. Primary button fill, the focus ring, text selection, the current-page nav underline, and the accent on secondary action links over slate.
- **Deep Amber** (amber-deep): primary-button hover and review stars.

### Neutral
- **Sunlit Paper** (paper): page ground and alternate section ground.
- **White** (white): alternate section ground, header, mobile bar, estimate card, inputs.
- **Slate Ink** (ink): all body and heading text on light grounds.
- **Muted Ink** (ink-2): ledes, secondary copy, captions, optional-field hints.
- **Hairline** (line): 1px rules, header and bar borders, list dividers.
- **On-Slate** (on-slate) and **On-Slate Muted** (on-slate-2): primary and secondary text on slate fields.
- **Field Stroke** (field-stroke) and **Placeholder Text** (placeholder-text): input borders (1.5px) and placeholder copy.

### Status
- **Error Red** (error): invalid-field border and message text; invalid inputs get a #fff8f7 wash.
- **Check Green** (ok): checklist tick icons on light grounds.

### Placeholder
- **Placeholder Cream / Umber / Brass** (ph-fill, ph-ink, ph-stroke): the placeholder chip on light grounds. On slate the chip turns to a 16% amber wash with ph-ink-on-slate text and a 70% amber dashed stroke.

### Named Rules
**The One Warm Voice Rule.** Amber is the only warm hue and it signals action or attention: primary buttons, focus, current page, the booking link accent. It is never a section or card background. Everything structural is slate.

**The Slate Carries The Brand Rule.** Brand presence comes from full-width slate fields (hero, page header, CTA band, footer), not from colored text or tinted cards on light sections.

## Typography

**Display Font:** Archivo Variable (with Archivo, system-ui)
**Body Font:** Source Sans 3 Variable (with Source Sans 3, system-ui)

**Character:** A semi-condensed, heavy grotesque that reads like job-site signage, paired with a plain, warm humanist sans for reading. Contractor-direct without shouting.

### Hierarchy
- **Display** (760, clamp(2.5rem, 5.2vw, 4.4rem), 1.06, -0.03em, width 88%): H1 only; hero and page-hero titles, capped near 16ch in the hero.
- **Headline** (760, clamp(2rem, 3.4vw, 2.9rem), 1.06, -0.02em): section H2s. One statement H2 per page may scale to clamp(2.2rem, 4.2vw, 3.5rem) with a ~13ch cap.
- **Title** (760, 1.4rem, 1.15, -0.01em): H3 and card/step titles; service titles run 1.6rem with a leading slate-2 icon.
- **Lede** (400, clamp(1.15rem, 1.6vw, 1.3rem), 1.6): the one supporting paragraph under a section heading, max 60ch, in ink-2 (on-slate-2 on slate).
- **Body** (400, 1.125rem, 1.6): reading text; prose blocks max 68ch.
- **Label** (650, 0.98rem): form labels, trust-row items (600), definition terms (700).
- **Button** (Archivo 700, 1.05rem, width 92%): all buttons.
- **Number** (Archivo 750-780, tabular figures): phone numbers and step numerals.

All headings use `text-wrap: balance`; paragraphs use `text-wrap: pretty`.

### Named Rules
**The Sentence-Case Rule.** No uppercase labels, eyebrows, or tracked-out small caps anywhere. Headings are sentence case and stand alone; the H2 plus one lede is the whole section head.

## Layout

A single centered container (`width: min(100% - 2 × gutter, 76rem)`) with fluid gutters (clamp(1rem, 4vw, 2.5rem)). Sections are full-bleed bands with fluid vertical padding (clamp(4rem, 9vw, 7.5rem)), alternating paper and white, with slate reserved for the hero, inner-page header band, and closing CTA band. Section heads are a max-44rem stack of H2 and lede, spaced clamp(2rem, 4vw, 3.25rem) from content.

Two-column splits are the default composition: copy against form (hero, CTA band: roughly 1fr to a 30-32rem form column), photo against copy (0.9fr / 1.1fr), statement H2 against copy. Services run two-up with photo above text; process steps four-up. Everything collapses to one column around 900-1020px; the estimate form's two-field grid collapses at 480px.

The sticky white header (4.75rem tall) hides the phone text below 1180px, swaps to a menu toggle below 1020px, and drops the tagline and phone below 520px. Below 760px a fixed bottom bar offers Call (ghost) and Free estimate (primary) at a 1 : 1.4 split, with safe-area padding.

## Elevation & Depth

Flat by default. Structure comes from hairline rules and the contrast of paper, white, and slate bands. Real elevation is reserved for the estimate card, which floats over slate, and for chrome that sits over scrolling content.

### Shadow Vocabulary
- **Card lift** (`box-shadow: 0 1px 2px rgb(0 0 0 / 0.08), 0 14px 32px -10px rgb(0 0 0 / 0.28)`): the estimate form card only.
- **Amber glow** (`box-shadow: 0 1px 0 rgb(0 0 0 / 0.08), 0 6px 16px -6px rgb(220 154 31 / 0.6)`): primary buttons.
- **Header scrolled** (`box-shadow: 0 8px 24px -16px rgb(0 0 0 / 0.3)`): sticky header after 8px of scroll.
- **Bar and drawer** (`0 -8px 24px -16px` / `0 24px 32px -24px`, `rgb(0 0 0 / 0.35)`): mobile bottom bar and the open mobile nav.

### Named Rules
**The Hairline Over Box Rule.** Lists of facts, steps, reviews, FAQs, and city lists are separated by 1px `line` rules (a top border per item), never boxed into shadowed cards.

## Shapes

Three radii: square (0) for photo frames and full-bleed bands, 6px for every control and container (buttons, inputs, estimate card, nav hover, notes, badge slots), 4px for inline placeholder chips. Circles are used only for icon medallions and step-number discs. Borders are 1px hairlines; inputs use a 1.5px stroke; ghost buttons a 2px currentColor stroke. Dashed strokes mean "placeholder": chips, photo-slot insets, and unsupplied badge slots.

**The Square Photo Rule.** Photo frames are never rounded, never bordered, and fill their frame with `object-fit: cover` at a declared aspect ratio (4/3 default, 16/10 service, 4/5 portrait).

## Components

### Buttons
Solid, confident, and large.
- **Shape:** gently rounded (6px), min height 3.25rem, 2px transparent border.
- **Primary:** amber fill, ink text, amber glow shadow; the estimate action everywhere. Hover deepens to amber-deep.
- **Slate (default):** slate fill, white text; hover slate-deep.
- **Ghost:** transparent with a 2px currentColor border in slate; hover slate-tint. On slate it flips to on-slate/white text with a 10% white hover. Used for Call and secondary routes.
- **States:** 180ms ease-out transitions; active nudges down 1px; busy/disabled at 65% opacity with a progress cursor. Leading or trailing Lucide icons at 1.2em.
- **Arrow link:** 650-weight text link with a trailing arrow that slides 3px on hover; used for "More about" and "See all" routes.

### Inputs / Fields
- **Style:** white fill, 1.5px field-stroke border, 6px radius, min height 3.1rem, 1.05rem text. Labels sit above at 650 weight; "(optional)" hints in 400 ink-2.
- **Hover / Focus:** hover border slate-2; focus border slate plus a 3px 55% amber ring (no outline).
- **Error:** error-red border, #fff8f7 wash, 600-weight red message below; validated on blur.
- **Select:** native select with appearance removed and a Lucide chevron at right.

### Estimate Card (signature)
The primary action on every page: a white card, 6px radius, card-lift shadow, fluid padding, heading at clamp(1.5rem, 2.2vw, 1.85rem) with a short ink-2 subline, a two-up field grid, full-width primary submit (3.5rem), and a "Rather talk? Call" line beneath. Compact variant (hero) drops email, details, and contact preference. It stays white with light-ground placeholder chips even inside slate sections. Status messages sit in tinted 6px panels: green (#e5f3eb / #154d32), red (#fbeae8 / #7d1a14), cream offline (#fff3cf / #5c3f00).

### Placeholder Chip
The owner-facing fill-in marker. Any unsupplied business fact (company name, phone, license, certification, hours, review text) renders through the Fill component: the real value when present, otherwise an inline chip with cream fill, umber text at 600 weight, a 1px dashed brass border, 4px radius, `0 0.35em` padding, no wrapping, and a tooltip naming where to add it. On slate it switches to the translucent amber variant. Never replace a chip with invented copy.

### Photo Slot
The Photo frame renders a real image when given `src`; until then a slate-2 slot with a 1px dashed 35% white inset outline (10px in), a 2rem on-slate-2 camera icon, a bold Archivo label naming the intended shot, and the hint "Your project photo goes here." As a full-bleed hero background it tucks the label into the bottom-right corner and sits under a slate scrim (dark on the copy side, opening toward the form; vertical on mobile). Hero backgrounds settle from scale 1.05 over 1400ms.

### Navigation
White sticky header with a hairline bottom border. Brand mark (slate tile, amber roof stroke) plus Archivo 780 name and a small ink-2 tagline. Nav links at 600 weight, 1.02rem, with 6px slate-tint hover fills; the current page is slate text over a 2px amber underline. Right side: a phone block (slate-tint circular icon medallion, "Call now" label, tabular Archivo number) and the primary Free estimate button. On mobile the nav drops as a white drawer of hairline-ruled rows at 1.15rem with the estimate button at the end; Escape closes it.

### Trust Row and Proof List
Trust row: an inline wrap of 600-weight items each led by a 1.25rem Lucide icon (slate on light, on-slate-2 on slate). Proof list: a definition list of checkable facts, bold term column (9-14rem) and ink-2 value column, each row ruled with a hairline, with placeholder chips standing in for missing values and a direct verification link where one exists.

### Icon Medallion and Step Disc
Circular slate-tint medallions (2.5-3rem, ~0.6rem padding, slate icon) front phone and contact routes; on slate they become 10% white. Process and financing steps use solid slate discs (2.75rem) with a white Archivo 780 numeral.

### Review Slot
Reviews sit in an auto-fit grid (min 19rem), each separated by a top hairline, with amber-deep stars, 1.15rem quote, and an ink-2 caption. Until real reviews exist, each slot shows placeholder chips for quote, name, city, and source with guidance text; stars are omitted rather than invented.

## Do's and Don'ts

### Do:
- **Do** use amber only for primary actions and attention states (focus, current page, selection).
- **Do** route every unsupplied business fact through Fill so it shows as a placeholder chip until the owner provides it.
- **Do** use the Photo component with a descriptive label for every image position; pass `src` only for the owner's real photos.
- **Do** keep controls at least 3rem tall and body text at 1.125rem.
- **Do** separate lists of facts, steps, and reviews with 1px hairline rules.
- **Do** use Lucide icons through the Icon component at stroke 1.9.
- **Do** keep the estimate card white, even on slate.

### Don't:
- **Don't** put stock photography, invented reviews, star ratings, review counts, stats, or certifications in place of a placeholder.
- **Don't** fill a section or card background with amber.
- **Don't** round photo frames or put borders around them.
- **Don't** add uppercase eyebrows, kickers, or tracked-out labels above headings.
- **Don't** use dashed borders for anything that is not a placeholder.
- **Don't** box content into shadowed cards; the only lifted card is the estimate form.
