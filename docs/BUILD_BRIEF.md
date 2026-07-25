# Build Brief

## Vision
Create a local product listing workspace that combines a practical UI with Codex's ability to inspect files, reason about incomplete product evidence, write high-quality listing copy, and direct image generation.

The user should spend time making product decisions, not maintaining a large AI prompt configuration system.

## Why This Project Exists
The original Etsy automation application proved the workflow but accumulated complexity because it needed smaller API models to behave consistently. This project explores a different operating model:

- Codex acts as the skilled operator.
- The UI captures user intent and displays local results.
- Structured job files connect the UI and Codex.
- Product images and metadata remain local.
- Defaults are strong, but individual products can be customized.

## Primary User
An Etsy seller processing many supplier-sourced products who needs:

- Fast product intake from existing local folders or scraped metadata
- Reliable product evidence review
- Etsy-ready titles, descriptions, categories, and 13 useful tags
- Conservative handling of unsupported details
- Batch variation images with consistent treatment
- Several strong main showcase images
- Easy reference-image selection
- Targeted copy and image tweaks
- Clear progress, errors, cancellation, and completion notifications

## Proposed V1 Experience

### Library
- Choose a local workspace folder.
- Discover product folders and supported metadata files.
- Show each product with source URL, images, variations, status, and outputs.
- Allow select, reject, delete, and bulk selection.

### Product Review
- Inspect all source images without opening browser tabs.
- Mark the preferred product reference image.
- Review extracted source facts and mark uncertain information.
- Add concise user notes for special handling.

### Job Builder
- Choose Copywriting, Main Images, Variation Images, or a combination.
- Use strong defaults with optional per-product overrides.
- Set image count, reference, staging direction, and custom instruction.
- Write a versioned job manifest under `jobs/queued/`.

### Codex Processing
- Read queued manifests and local product evidence.
- Update status as work progresses.
- Produce structured copywriting output.
- Generate or edit images when an available Codex image workflow supports the request.
- Preserve parent/reference lineage for every generated image.
- Write actionable failures without discarding successful partial work.

### Review
- Preview listing copy and generated images.
- Tweak only the selected copy fields or one selected image.
- Save manual price and approval state.
- Keep prior results instead of replacing them silently.

## Initial Local Contracts

Suggested folders:

```text
workspace/
  products/
  jobs/
    queued/
    processing/
    completed/
    failed/
  outputs/
  logs/
```

Suggested job shape:

```json
{
  "schema_version": 1,
  "job_id": "generated-id",
  "created_at": "ISO-8601 timestamp",
  "products": ["product-folder"],
  "tasks": {
    "copywriting": true,
    "main_images": {
      "enabled": true,
      "count": 4
    },
    "variation_images": {
      "enabled": true,
      "mode": "each_selected_variation"
    }
  },
  "preferences": {
    "quality": "high",
    "image_aspect_ratio": "1:1",
    "custom_instruction": ""
  }
}
```

This contract is a starting point, not a promise. Validate it against the first real UI workflow before expanding it.

## Copywriting Standard
- Use explicit source facts and clearly scoped visual observations.
- Do not invent material, dimensions, capacity, compatibility, performance, production, safety, or environmental claims.
- Titles must be natural, Etsy-compatible, and avoid supplier fragments or unnecessary sizes.
- Use up to 13 distinct, relevant tags at Etsy-compatible lengths.
- Descriptions should read naturally, then present supported details in a scannable format.
- Avoid filler and omit empty or uncertain detail fields.
- Flag conflicts for the user instead of choosing one silently.
- Keep final price manual.

## Image Standard
- Preserve the exact product identity, shape, color, hardware, texture, and structural details.
- Use the strongest selected reference, not automatically the first image.
- Process every selected variation source independently.
- Use staging that fits the detected product category, such as furniture in an appropriate room or kitchen tools in a kitchen.
- Main images should showcase the product; variation images should prioritize consistency and accuracy.
- Append tweaked outputs with lineage instead of overwriting originals.

## Explicit Non-Goals For V1
- Hosted multi-user storage
- Marketplace insights
- Fully autonomous browser publishing to Etsy
- Permanent cloud image storage
- A giant configurable prompt editor
- Automatic unattended invocation of the Codex desktop task

## First Build Milestone
Build a local read-only product library and job-manifest creator using fixture product folders. Do not implement AI generation until the product selection, reference selection, and job request flow feel correct.

