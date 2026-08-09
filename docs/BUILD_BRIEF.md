# Build Brief

## Vision

Etsy Listing Studio is a Windows-first, local-only workflow for reviewing supplier evidence and producing conservative Etsy copy with Codex:

`Select root → Review products → Queue jobs → Ask Codex to process → Review, tweak, and approve`

The UI owns selection, local state, progress, and review. Codex performs the high-judgment writing only after an explicit user request.

## Current Milestone

The copywriting loop is in scope. Image generation, cloud storage, Etsy publishing, and automatic Codex invocation are not.

- Select one active product root with a Windows picker, pasted path, or recent-workspace shortcut.
- Recursively discover folders containing `metadata.json` at any category depth.
- Normalize current scraper metadata while exposing old embedded results as read-only Legacy data.
- Show all indexed source images, missing/unindexed warnings, specs, variations, source links, and product notes.
- Persist product identity and review state in `.etsy-studio.json` without modifying source metadata or images.
- Queue one copywriting job per product under a shared batch.
- Process jobs sequentially through `$process-etsy-jobs`.
- Save immutable results in `studio_outputs/copywriting/vNNNN/`.
- Review versions, approve or reject them, and queue targeted field tweaks without rescanning.
- Move deleted products to recoverable Studio trash and restore them when the original path is free.

## Visual Direction

- Use a restrained neo-minimal interface: neutral surfaces, crisp grid lines, compact spacing, clear hierarchy, and one controlled accent color.
- Favor functional density over decorative cards, gradients, glass effects, oversized rounding, display-serif styling, or ornamental AI motifs.
- Use Lucide icons only when they clarify an action or status. Never use emoji as interface icons, and omit an icon when it adds no information.
- Keep the handcrafted CSS system; Tailwind is not required for this project.

## Local Storage

Each product folder may contain:

```text
product-folder/
  metadata.json
  .etsy-studio.json
  studio_outputs/
    copywriting/
      v0001/
        listing.json
        listing.txt
        review.json
```

Workspace control data is stored beneath `.etsy-listing-studio/`:

```text
.etsy-listing-studio/
  jobs/{queued,processing,completed,failed,cancelled}/
  batches/
  cache/
  settings/
  staging/
  logs/
  trash/
```

Studio-owned directories are excluded from discovery. Lifecycle writes are atomic. Successful child jobs remain intact when another job fails or cancellation is requested.

## Workspace Copywriting Memory

Each active product root may store copywriting settings at:

```text
.etsy-listing-studio/settings/copywriting.json
```

These settings are workspace-scoped. Switching product roots switches the brand voice, storytelling style, formatting rules, banned language, SEO preferences, and policy footer. A fresh root starts unbranded: universal formatting, SEO, and safety rules are present, but shop identity and policy footer fields stay blank until the user edits and saves them in the Studio UI.

## Product Identity and Duplicates

`ProductSnapshotV1` gives each physical folder a stable UUID. Logical duplicates are grouped by `source_domain + source_product_id`, but displayed separately because their metadata or images may differ. The job builder blocks queueing two snapshots from the same logical source in one batch.

## Copywriting Standard

- Follow the official Etsy search guidance summarized in `.agents/skills/process-etsy-jobs/references/etsy-search-copywriting.md`.
- Follow the active workspace settings from `.etsy-listing-studio/settings/copywriting.json`, including the saved shop voice and required policy footer.
- Treat title, description, tags, category, and verified Etsy attributes as complementary signals rather than repeating the same phrase everywhere.
- Separate supplier facts, printed-image facts, visual observations, user instructions, conflicts, and unknowns.
- Never infer material, measurements, capacity, compatibility, safety, performance, package contents, or origin from appearance.
- Use a clear title no longer than 140 characters and normally fewer than 15 words.
- Produce up to 13 useful, non-duplicate tags, each no longer than 20 characters.
- Write a natural opening followed by supported, scannable details.
- Keep buyer-facing copy customer-ready. Do not include source-attribution phrases such as "according to supplier specifications", internal evidence caveats, or non-selling supplier fields such as "not customized", "folded: no", "with rollers: no", or "no high-concerned chemical".
- Choose a defensible category and leave final price manual.
- Surface possible IP or trademark issues as visible, non-blocking warnings.
- Omit unknowns and disputed claims instead of guessing.

Every result contains an evidence ledger, inspected-image list, conflicts, omitted fields, warnings, validation issues, and parent lineage. Deterministic validation runs before an immutable version is committed.

## Processing Boundary

The webpage does not claim to invoke the current Codex task. It only writes structured local jobs and watches status files. The user explicitly invokes `$process-etsy-jobs` or asks “Process my queued jobs.” Cooperative cancellation is checked between processing stages.

Targeted tweaks reuse the parent evidence ledger, do not rescan images, change only selected fields, and create a new version linked by `parent_result_id`.

## Security and Testing

All application routes bind to loopback and validate paths against the active root. Traversal and symlink escapes are rejected. Automated tests use temporary anonymized fixtures and fake deterministic results; they never alter the real scraper library or make paid model calls.

## Future Image Work

Contracts may later support main and variation image tasks. When implemented, product fidelity, per-variation processing, square output, reference lineage, and non-destructive versioning remain mandatory. The current UI labels these workflows as unavailable.

## Legacy Reference

The previous project is a source of ideas, not code to copy wholesale:

- Repository: `..\EtsyListingsAutomation`
- Copywriting checkpoint: branch `codex/copywriting-refactor-v2`, commit `66658f8`
