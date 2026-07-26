# Etsy Listing Studio

A Windows-first, local-only Next.js app for reviewing scraped product evidence, queueing Etsy copywriting work, and reviewing versioned Codex results. Source metadata and images stay unchanged on your computer.

## Start

Double-click `Start Etsy Listing Studio.cmd`. It installs dependencies when needed, starts the server on `http://127.0.0.1:3000`, and opens the app.

Or run:

```powershell
pnpm install
pnpm dev
```

## Workflow

1. Select the product root with the Windows folder picker, paste a path, or choose a recent workspace.
2. Review recursively discovered products, images, specs, variations, source warnings, and Legacy data.
3. Pick a reference image, add notes, select products, and queue a copywriting batch.
4. In Codex, invoke `$process-etsy-jobs` or say “Process my queued jobs.”
5. Watch job progress in the app, then review, approve, reject, or queue a targeted field tweak.

Image workflows are intentionally disabled in this milestone.

## Local data

- Product state: `<product>/.etsy-studio.json`
- Versioned copy: `<product>/studio_outputs/copywriting/vNNNN/`
- Jobs, batches, logs, cache, and trash: `<root>/.etsy-listing-studio/`
- Machine-local active-workspace config: `.etsy-studio.local.json`

Product discovery supports the current scraper schema and older mixed metadata. Folders are found by `metadata.json`, regardless of nesting or renamed folder labels.

## Validation

```powershell
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

Project decisions live in [docs/BUILD_BRIEF.md](docs/BUILD_BRIEF.md), while durable agent instructions live in [.agents/AGENTS.md](.agents/AGENTS.md).
