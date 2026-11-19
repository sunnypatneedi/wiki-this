# wiki-this design rules

Public design rules for a generated wiki. This is not a product or payments spec.

## Pipeline

1. Read the named sources (local or readable repos). Drop secrets and personal data.
2. Model sections, terms, articles and guides. Every claim cites a source path.
3. Optionally cross-check public concept names against Wikipedia and Grokipedia.
4. Merge sources into one filterable wiki.
5. Generate a look (colours and one typeface). Never write the seed down.
6. Build local HTML from the shell in `assets/shell/`.
7. Build a local glossary page and a portable lesson with the five-step reading fallback
   and waitlist footer.

A run does not upload text, create accounts, or charge anyone.

## Merge and filter

- One sidebar (or phone chips) lists every source, default All.
- Merge a term only when names or aliases match and meanings fit. Keep one definition
  per source plus a short neutral line.
- The filter lives in `?src=`, never in storage. Empty sections dim, and slugs stay stable.

## Lesson boundary

- Content is a versioned, learner-free LearningPack. Its source IDs map to the wiki's
  existing filters; glossary related terms are not automatically prerequisites.
- The shared LearnerContextKit runtime owns question state, answer checking, assistance
  records and provisional evidence. The wiki adapter owns DOM rendering, source scope,
  controls and explicit checkpoint files. Keep business links in the host.
- Use classic scripts and bundled data so the page works directly under `file://`.
  No fetch, model, account, tracking or automatic source refresh is required.
- Render all pack strings as text. Source links accept only HTTP or HTTPS URLs and open
  when chosen. Keep the plain HTML lesson available if the runtime cannot start.
- Begin with unknown competence. Record support before making any independent-performance
  claim. Immediate, editable self-checks do not establish verified or durable mastery.
- Show source check dates as recorded, or unknown. An offline snapshot is not a live
  freshness check. Source filtering narrows tasks; unavailable coverage has a visible state.
- Store progress in tab memory. Explicit export/import carries a validated checkpoint
  across compatible hosts; no browser-storage or cross-page persistence guarantee.
  Checkpoints contain learner activity and must never ship with public lesson content.

## Design system

- **One type family per look**, for headings, body, labels and numbers (tabular). Generated
  looks choose from Geist, Inter, IBM Plex Sans, Hanken Grotesk or Space Grotesk. The house
  look is Inter. No monospace UI labels and no uppercase tracking in the shell.
- **Scale:** type 12 / 14 / 16 / 20 / 28 / 44 / 64; weights 400 / 500 / 600; spacing
  4 / 8 / 16 / 24 / 32 / 48 / 64; one 4px radius; controls 40px (44px on phones);
  12-column grid with 24px gutters and 48px margins (16px on phones).
- **Contrast (WCAG AAA):** body and muted text at least 7:1 on paper, panel and raised
  surfaces (large text at least 4.5:1); control borders at least 3:1. The accent never
  carries text. It marks bars, the current item, focus rings and term underlines.
- **Dark looks:** elevation comes from a lighter raise surface and hairline borders, never
  bright ink frames. The scrim is black alpha. Diagrams use outlined nodes.
- **Copy:** 3-5 word headlines, one supporting line, then a disclosure for anything longer.
  Each fact appears once per screen.
- **Every control has a real target or state.** Empty sections dim. Search returns live
  term results. The mobile menu is a drawer. Unbuilt actions say "not built yet".
  Destructive actions need a typed confirmation.
