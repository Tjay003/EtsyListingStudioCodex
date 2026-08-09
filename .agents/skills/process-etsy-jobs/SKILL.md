---
name: process-etsy-jobs
description: Process queued Etsy Listing Studio copywriting and targeted-tweak jobs against the active local workspace. Use when the user invokes $process-etsy-jobs, asks to process queued Etsy jobs, or says "Process my queued jobs."
---

# Process Etsy Jobs

Process local copywriting jobs sequentially through the repository's deterministic lifecycle CLI. Treat source metadata and images as immutable evidence, preserve successful work when another job fails, and never generate images or publish listings.

## Before processing

1. Read `.agents/AGENTS.md` and `docs/BUILD_BRIEF.md`.
2. Read `references/etsy-search-copywriting.md` before writing or tweaking listing copy. Apply its official Etsy guidance subject to the evidence rules below.
3. Run `pnpm jobs -- list`. If no active workspace is configured, stop and ask the user to select one in the Studio.
4. Do not modify `metadata.json`, source images, `.etsy-studio.json`, or an existing result version directly.
5. Never make paid API calls. The current Codex task performs the judgment work.

## Process the queue

Repeat until `claim-next` reports that the queue is empty:

1. Claim exactly one job with `pnpm jobs -- claim-next`.
2. Run `pnpm jobs -- context <job-id>` and read the returned metadata and normalized evidence before inspecting images.
3. Run `pnpm jobs -- settings <job-id>` and apply the active workspace's brand voice, formatting rules, SEO preferences, banned language, and policy footer.
4. Run `pnpm jobs -- check-cancel <job-id>`. If cancellation is requested, run `pnpm jobs -- cancelled <job-id>` and continue to the next job.
5. For a normal copywriting job, run `pnpm jobs -- prepare-evidence <job-id>`. Inspect the selected reference and generated contact sheet first. Open original images only when needed to resolve a missing or conflicting fact. Record every original image actually inspected.
6. For a targeted tweak, do not rescan images. Reuse the parent result's evidence ledger, warnings, conflicts, inspected image list, and omitted fields. Change only the requested fields.
7. Update visible progress between stages with `pnpm jobs -- progress <job-id> <stage> <percent> "<message>"`.
8. Check cancellation again before writing the result.
9. Write a `CopywritingResultDraftV1` JSON file to the job's reported staging location, then run `pnpm jobs -- complete <job-id> <draft-json-path>`.

If a job fails, run `pnpm jobs -- fail <job-id> "<actionable error>"` and continue. Never discard completed sibling jobs.

## Copywriting standard

- Classify evidence with the authoritative `EvidenceKind` values in `lib/contracts.ts`; use `supplier_fact`, `printed_image_fact`, `visual_observation`, `conflict`, or `unknown`.
- Do not infer materials, measurements, capacity, compatibility, safety, performance, package contents, or origin from appearance.
- When sources disagree, record the conflict and omit the disputed claim unless the user explicitly resolves it.
- Follow the title, description, category, attribute, and tag strategy in `references/etsy-search-copywriting.md`.
- Follow the active workspace copywriting settings from `pnpm jobs -- settings <job-id>`. If enabled, append the policy footer exactly at the bottom of the description.
- Keep buyer-facing copy free of platform names, supplier jargon, and banned language from the workspace settings.
- Write buyer-facing copy as customer-ready shop text, not an evidence report. Do not place internal review notes, source-attribution phrases, omitted-field explanations, missing-evidence caveats, or phrases like "according to supplier specifications", "supplier metadata", "source evidence says", "not provided in the source evidence", or "intentionally omitted" in the buyer-facing description. Put those only in `warnings`, `omitted_fields`, `conflicts`, or `notes`.
- Omit non-selling supplier fields such as "not customized", "folded: no", "with rollers: no", "no high-concerned chemical", or similar negatives unless the user explicitly asks for them. If size, material, assembly, capacity, compatibility, care, package contents, or customization details are unclear or not useful to a buyer, omit the section instead of explaining why.
- Choose a defensible category and keep `price` set to `null`.
- Surface possible trademarks, copyrighted characters, or branded terms as visible non-blocking warnings.
- Omit unknown details rather than guessing.

The draft must contain `listing`, `evidence`, `inspected_images`, `conflicts`, `omitted_fields`, and `warnings`. Use `lib/contracts.ts` as the authoritative contract. The completion command adds `validation_issues`, applies deterministic limits, and creates the immutable version plus `listing.txt`.

## Completion report

Report the batch and per-job outcomes, including failures, cancellations, warnings, and the paths of newly created listing versions. Remind the user that the Studio will pick up the results automatically.
