# Etsy Listing Studio Codex - Project Memory

## Purpose
Build a separate, Windows-first, local-only product listing studio where the user chooses products in a UI, then explicitly asks Codex to perform evidence-led copywriting against local files.

This is intentionally separate from `EtsyListingsAutomation`. Do not merge the two projects or copy the old application wholesale.

## Product Direction
- Quality is more important than raw speed.
- Product data and generated assets stay on the user's computer.
- The UI should support decisions, previews, approvals, rejection, deletion, and targeted tweaks.
- Simple products can use good defaults; difficult products must remain highly customizable.
- Copywriting must be useful for Etsy while remaining natural enough for Google and Pinterest discovery.
- Unknown product details should be omitted instead of invented.
- Descriptions may open with natural shopper-facing storytelling, followed by supported product details.
- Final prices remain manual.
- Image contracts may anticipate future work, but image generation is disabled in the current milestone.
- Workspace copywriting memory is stored per product root in `.etsy-listing-studio/settings/copywriting.json`; use it for shop voice, storytelling style, formatting rules, banned language, SEO preferences, and policy footer. Fresh roots are intentionally unbranded unless the workspace has saved identity and policy settings.

## Intended Workflow
1. The user selects or imports one or more local product folders.
2. The UI displays source metadata, product images, variations, and prior outputs.
3. The user rejects unwanted products, chooses a reference image, and configures copywriting work.
4. The UI writes a structured local job request rather than embedding a giant prompt.
5. The user asks Codex to process queued jobs.
6. Codex reads the local evidence, performs the requested work, and writes structured results and progress locally.
7. The UI reloads the results for review, targeted tweaks, approval, or deletion.

## Codex Runtime Boundary
A normal local webpage cannot silently invoke the current Codex desktop conversation. The first version is operator-triggered: the UI prepares jobs, then the user asks Codex to run them. Fully unattended one-click execution would require an API-backed worker or a capable local model.

Do not pretend this boundary does not exist. Design the UI so the operator-triggered workflow still feels coherent.

## Architecture Principles
- Run as a standard Next.js Node server bound to `127.0.0.1`; do not restore Cloudflare or vinext.
- Treat the active root as untrusted input. Resolve and validate all requested paths beneath it and reject traversal or symlink escapes.
- Recursively discover product folders by `metadata.json`, ignoring Studio-owned output and control directories.
- Prefer structured JSON contracts for products, jobs, results, status, and errors.
- Keep original source files immutable; write outputs separately.
- Preserve lineage for generated images and copy tweaks.
- Make long-running jobs resumable where practical.
- Avoid hidden prompts and scattered behavioral rules.
- Keep canonical safety and schema requirements in code; keep editable style preferences visible.
- Do not make paid model calls automatically during tests.
- Add abstractions only after the workflow demonstrates the need.

## Local Commands
- `pnpm dev` starts the loopback-only Studio.
- `pnpm test` runs isolated filesystem and contract tests.
- `pnpm typecheck`, `pnpm lint`, and `pnpm build` validate the app.
- `pnpm jobs -- <command>` drives deterministic job lifecycle transitions.
- Invoke `$process-etsy-jobs` or say “Process my queued jobs” to process the active queue.

## Legacy Reference
The previous implementation remains available for study:

- Repository: `..\EtsyListingsAutomation`
- Stable public app: `main`
- Copywriting V2 checkpoint branch: `codex/copywriting-refactor-v2`
- Copywriting V2 commit: `66658f8`

Useful concepts to reuse selectively:
- Chrome extension scraping and source URL cleanup
- File-backed product folder and `metadata.json` concepts
- Workspace token isolation when sharing one backend
- Reference-image selection
- Generated-image lineage and tweak flow
- Pipeline cancellation and progress events
- Evidence-first copywriting and deterministic validation

Avoid carrying forward:
- The entire old dashboard without re-evaluating it
- Large duplicated prompt layers
- Settings that only compensate for weak model behavior
- Cloud storage assumptions for heavy image generation

## Context Maintenance
- Keep this file concise and architectural.
- Put detailed workflows in `docs/`.
- Record only durable decisions and important checkpoints.
- Never store API keys, tokens, private product data, or machine credentials in memory files.
