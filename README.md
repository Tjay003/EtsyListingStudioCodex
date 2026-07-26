# Etsy Listing Studio

Etsy Listing Studio is a Windows-first, local-only Next.js app for reviewing scraped product folders, queueing Etsy copywriting work, and reviewing versioned AI-assisted listing results.

The app is designed around a human operator plus a file-aware AI agent. The webpage prepares structured local jobs. The agent processes those jobs only when explicitly asked.

## Current Scope

In scope:

- Select one local product root at a time.
- Recursively discover product folders containing `metadata.json`.
- Review product images, source metadata, specs, variations, source links, and existing outputs.
- Choose a reference image and add product notes.
- Queue copywriting jobs as versioned JSON manifests.
- Process queued jobs through the deterministic local job lifecycle.
- Save immutable copywriting versions for review, approval, rejection, and targeted field tweaks.
- Keep workspace-specific copywriting voice/settings inside the selected product root.

Out of scope for the current milestone:

- Image generation.
- Etsy publishing.
- Cloud storage.
- Automatic background invocation of Codex or another AI agent from the browser UI.
- Modifying scraper-owned source files.

## Start

Double-click `Start Etsy Listing Studio.cmd`. It installs dependencies when needed, starts the server on `http://127.0.0.1:3000`, and opens the app.

Or run:

```powershell
pnpm install
pnpm dev
```

Production-style local run:

```powershell
pnpm build
pnpm start
```

Both `dev` and `start` bind to `127.0.0.1`.

## Operator Workflow

1. Select the product root with the Windows folder picker, paste a path, or choose a recent workspace.
2. Review recursively discovered products, images, specs, variations, source warnings, and Legacy data.
3. Pick a reference image, add notes, select products, and queue a copywriting batch.
4. In Codex or another file-aware agent, invoke `$process-etsy-jobs` or say `Process my queued jobs.`
5. Watch job progress in the app.
6. Review results, copy fields, approve, reject, delete, or queue a targeted tweak.

The webpage does not directly call the current Codex conversation. It writes local job files and watches status/result files.

## Important Files For Agents

Read these first before making architectural or workflow changes:

- `.agents/AGENTS.md` - durable project instructions for AI coding agents.
- `docs/BUILD_BRIEF.md` - product brief, milestone scope, storage layout, copywriting standard, UI direction, and future image-work boundaries.
- `.agents/skills/process-etsy-jobs/SKILL.md` - required local job-processing workflow.
- `.agents/skills/process-etsy-jobs/references/etsy-search-copywriting.md` - Etsy copywriting guidance used by the processor.
- `lib/contracts.ts` - authoritative TypeScript contracts for products, jobs, results, warnings, evidence, and review state.
- `scripts/job-lifecycle.ts` - CLI entrypoint for deterministic job transitions.

If another AI tool is used, give it access to both this repository and the active product root. The active root is stored in `.etsy-studio.local.json`.

## Local Data Layout

Source product folders are owned by the scraper and should be treated as immutable evidence.

```text
product-folder/
  metadata.json
  main_images/
  description_images/
  variation_images/
  .etsy-studio.json
  studio_outputs/
    copywriting/
      v0001/
        listing.json
        listing.txt
        review.json
```

Workspace control data lives under the selected product root:

```text
.etsy-listing-studio/
  jobs/
    queued/
    processing/
    completed/
    failed/
    cancelled/
  batches/
  cache/
  logs/
  settings/
    copywriting.json
  staging/
  trash/
```

Machine-local active workspace config lives in this repo:

```text
.etsy-studio.local.json
```

Do not commit machine-local workspace paths or real product data unless the user explicitly asks.

## Source Rules

- Never modify `metadata.json`.
- Never modify source images.
- Never silently replace existing generated results.
- Store new copywriting output as a new immutable version under `studio_outputs/copywriting/vNNNN/`.
- Store product review state separately from immutable result versions.
- Move deleted products to Studio trash instead of permanently deleting them.
- Ignore Studio-owned directories during product discovery.
- Validate requested paths against the active root and reject traversal or symlink escapes.

## Copywriting Rules

Copywriting must be evidence-led. Use supplier metadata first, then the selected reference image and contact sheet, then only original images needed to resolve missing or conflicting facts.

Do:

- Distinguish supplier facts, printed image facts, visual observations, conflicts, and unknowns.
- Write one clear Etsy-ready title within 140 characters, normally under 15 words.
- Produce up to 13 useful tags, each 20 characters or fewer.
- Write a natural, scene-led opening followed by supported, scannable details.
- Choose a defensible category.
- Leave price as `null` for manual entry.
- Record warnings, omissions, conflicts, inspected images, and evidence in the result.
- Append the active workspace policy footer exactly when enabled.

Do not:

- Invent materials, measurements, capacity, compatibility, safety, performance, package contents, origin, or care claims.
- Put internal evidence caveats into customer-facing copy.
- Mention supplier platforms or wholesale/logistics language in buyer-facing copy.
- Use image generation for this milestone.
- Make paid API calls from tests.

Workspace copywriting settings are stored at:

```text
<active-root>/.etsy-listing-studio/settings/copywriting.json
```

Switching roots switches the saved brand voice, storytelling style, formatting rules, banned language, SEO preferences, and policy footer.

## Processing Jobs

Use the lifecycle CLI. Do not move job files manually unless repairing corruption with explicit user approval.

Common commands:

```powershell
pnpm jobs -- list
pnpm jobs -- claim-next
pnpm jobs -- context <job-id>
pnpm jobs -- settings <job-id>
pnpm jobs -- prepare-evidence <job-id>
pnpm jobs -- progress <job-id> <stage> <percent> "<message>"
pnpm jobs -- check-cancel <job-id>
pnpm jobs -- complete <job-id> <draft-json-path>
pnpm jobs -- fail <job-id> "<message>"
pnpm jobs -- cancelled <job-id>
```

Processing expectations:

- Claim one job at a time.
- Check cancellation between stages.
- Preserve completed sibling jobs if another child fails.
- For targeted tweaks, reuse the parent evidence ledger and do not rescan images.
- Run completion through `pnpm jobs -- complete`; it performs validation and writes immutable outputs.

## Development Commands

```powershell
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

Use focused tests for scanner, identity, job lifecycle, trash, copywriting contracts, and UI behavior. Tests should use fixtures and deterministic fake results, not real scraper folders.

## Design Direction

The UI should stay restrained and operational:

- Neo-minimal, dense, crisp, and workspace-like.
- Neutral surfaces with a controlled accent.
- No emoji icons.
- Use Lucide icons only where they clarify an action or status.
- Keep the handcrafted CSS system; Tailwind is not required.
- Avoid decorative gradients, oversized cards, marketing hero sections, and ornamental AI motifs.

## Legacy Reference

The previous project is available for ideas only:

```text
..\EtsyListingsAutomation
```

Useful reference point:

```text
branch: codex/copywriting-refactor-v2
commit: 66658f8
```

Do not copy the old app wholesale. Reuse ideas selectively and keep this project centered on local files, explicit job processing, evidence-led copywriting, and versioned review.
