export const STUDIO_SCHEMA_VERSION = 1 as const;

export type ImageRole = "main" | "description" | "variation";
export type JobStatus =
  | "queued"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled";
export type ReviewStatus = "needs_review" | "approved" | "rejected";
export type EvidenceKind =
  | "supplier_fact"
  | "printed_image_fact"
  | "visual_observation"
  | "conflict"
  | "unknown";

export interface ProductStudioStateV1 {
  schema_version: typeof STUDIO_SCHEMA_VERSION;
  instance_id: string;
  created_at: string;
  updated_at: string;
  selected: boolean;
  rejected: boolean;
  reference_image: string | null;
  notes: string;
}

export interface ProductImageV1 {
  id: string;
  role: ImageRole;
  index: number;
  relativePath: string;
  fileName: string;
  exists: boolean;
  alt: string;
  title: string;
  sourceUrl: string;
  imageUrl: string;
}

export interface ProductVariationV1 {
  index: number;
  name: string;
  relativePath: string;
  exists: boolean;
}

export interface ProductResultSummaryV1 {
  version: number;
  resultId: string;
  createdAt: string;
  reviewStatus: ReviewStatus;
  title: string;
}

export interface ProductSnapshotV1 {
  schemaVersion: typeof STUDIO_SCHEMA_VERSION;
  instanceId: string;
  sourceKey: string | null;
  duplicateCount: number;
  duplicateInstanceIds: string[];
  relativeFolder: string;
  folderName: string;
  collection: string;
  metadataHash: string;
  metadataError: string | null;
  title: string;
  price: string;
  sourceUrl: string;
  sourceProductId: string;
  sourceDomain: string;
  sourceStatus: string;
  descriptionText: string;
  specs: Array<{ label: string; value: string }>;
  images: ProductImageV1[];
  variations: ProductVariationV1[];
  missingImages: string[];
  unindexedImages: string[];
  selected: boolean;
  rejected: boolean;
  referenceImage: string | null;
  notes: string;
  legacyListing: Record<string, unknown> | null;
  legacyFacts: Record<string, unknown> | null;
  results: ProductResultSummaryV1[];
}

export interface JobProgressV1 {
  stage: string;
  percent: number;
  message: string;
  updated_at: string;
}

export interface CopywritingJobV1 {
  schema_version: typeof STUDIO_SCHEMA_VERSION;
  job_id: string;
  batch_id: string;
  created_at: string;
  updated_at: string;
  status: JobStatus;
  attempt: number;
  task:
    | { kind: "copywriting.create"; instruction: string }
    | {
        kind: "copywriting.tweak";
        instruction: string;
        parent_result_id: string;
        fields: Array<"title" | "description" | "tags" | "category">;
        reuse_evidence: true;
      };
  product: {
    instance_id: string;
    source_key: string | null;
    relative_folder: string;
    metadata_hash: string;
    reference_image: string | null;
  };
  progress: JobProgressV1;
  cancel_requested_at: string | null;
  started_at: string | null;
  finished_at: string | null;
  result_id: string | null;
  error: string | null;
}

export interface CopywritingBatchV1 {
  schema_version: typeof STUDIO_SCHEMA_VERSION;
  batch_id: string;
  created_at: string;
  job_ids: string[];
}

export interface ListingEvidenceV1 {
  id: string;
  field: string;
  value: string | string[] | null;
  kind: EvidenceKind;
  source_path: string | null;
  excerpt: string;
}

export interface ListingWarningV1 {
  code: string;
  severity: "warning" | "blocking";
  field: string | null;
  message: string;
  evidence_ids: string[];
}

export interface ListingValidationIssueV1 {
  code: string;
  field: "title" | "description" | "tags" | "category" | "listing";
  severity: "warning" | "blocking";
  message: string;
}

export interface CopywritingResultDraftV1 {
  listing: {
    title: string;
    description: string;
    tags: string[];
    category: string;
    price: null;
  };
  evidence: ListingEvidenceV1[];
  inspected_images: Array<{
    relative_path: string;
    role: ImageRole;
    purpose: string;
  }>;
  conflicts: string[];
  omitted_fields: string[];
  warnings: ListingWarningV1[];
  notes?: string;
}

export interface CopywritingResultV1 extends CopywritingResultDraftV1 {
  schema_version: typeof STUDIO_SCHEMA_VERSION;
  result_id: string;
  job_id: string;
  product_instance_id: string;
  source_key: string | null;
  metadata_hash: string;
  version: number;
  created_at: string;
  parent_result_id: string | null;
  changed_fields: Array<"title" | "description" | "tags" | "category">;
  validation_issues: ListingValidationIssueV1[];
}

export interface ProductReviewStateV1 {
  schema_version: typeof STUDIO_SCHEMA_VERSION;
  result_id: string;
  status: ReviewStatus;
  note: string;
  updated_at: string;
}

export interface WorkspaceCopywritingSettingsV1 {
  schema_version: typeof STUDIO_SCHEMA_VERSION;
  updated_at: string;
  shop_name: string;
  tagline: string;
  brand_profile: string;
  voice: string;
  description_structure: string;
  formatting_rules: string;
  seo_rules: string;
  banned_language: string;
  policy_footer: string;
  require_policy_footer: boolean;
}

export interface LocalStudioConfigV1 {
  schema_version: typeof STUDIO_SCHEMA_VERSION;
  active_root: string | null;
  recent_roots: string[];
}

const BUYER_COPY_BANNED_PATTERNS: Array<{ code: string; pattern: RegExp }> = [
  {
    code: "source_attribution_in_copy",
    pattern:
      /\b(according to supplier specifications|supplier specifications|supplier metadata|source evidence says|source evidence|listed as|not provided|intentionally omitted)\b/i,
  },
  {
    code: "non_selling_supplier_field_in_copy",
    pattern:
      /\b(not customized|is customized:\s*no|customization:\s*no|folded:\s*no|with rollers:\s*no|no high-concerned chemical|high-concerned chemical:\s*none|hign-concerned chemical:\s*none)\b/i,
  },
];

export function validateCopywritingDraft(
  value: unknown,
): ListingValidationIssueV1[] {
  const issues: ListingValidationIssueV1[] = [];
  const draft = value as Partial<CopywritingResultDraftV1> | null;
  const listing = draft?.listing;

  if (!listing || typeof listing !== "object") {
    return [
      {
        code: "missing_listing",
        field: "listing",
        severity: "blocking",
        message: "The result must include a listing object.",
      },
    ];
  }

  const title = String(listing.title ?? "").trim();
  const description = String(listing.description ?? "").trim();
  const category = String(listing.category ?? "").trim();
  const tags = Array.isArray(listing.tags)
    ? listing.tags.map((tag) => String(tag).trim()).filter(Boolean)
    : [];

  if (!title) {
    issues.push({
      code: "missing_title",
      field: "title",
      severity: "blocking",
      message: "A listing title is required.",
    });
  } else if (title.length > 140) {
    issues.push({
      code: "title_too_long",
      field: "title",
      severity: "blocking",
      message: "The listing title exceeds 140 characters.",
    });
  }

  const titleWords = title.match(/[A-Za-z0-9]+/g)?.length ?? 0;
  if (titleWords > 15) {
    issues.push({
      code: "title_wordy",
      field: "title",
      severity: "warning",
      message: "The title is longer than the preferred 15-word guidance.",
    });
  }

  if (!description) {
    issues.push({
      code: "missing_description",
      field: "description",
      severity: "blocking",
      message: "A listing description is required.",
    });
  } else {
    for (const rule of BUYER_COPY_BANNED_PATTERNS) {
      if (rule.pattern.test(description)) {
        issues.push({
          code: rule.code,
          field: "description",
          severity: "blocking",
          message:
            "Buyer-facing descriptions must be customer-ready and cannot include source-attribution phrases or non-selling supplier fields.",
        });
      }
    }
  }

  if (!category) {
    issues.push({
      code: "missing_category",
      field: "category",
      severity: "blocking",
      message: "A defensible listing category is required.",
    });
  }

  if (tags.length === 0) {
    issues.push({
      code: "missing_tags",
      field: "tags",
      severity: "blocking",
      message: "At least one useful tag is required.",
    });
  }
  if (tags.length > 13) {
    issues.push({
      code: "too_many_tags",
      field: "tags",
      severity: "blocking",
      message: "A listing can contain no more than 13 tags.",
    });
  }

  const seen = new Set<string>();
  for (const tag of tags) {
    const normalized = tag.toLocaleLowerCase();
    if (tag.length > 20) {
      issues.push({
        code: "tag_too_long",
        field: "tags",
        severity: "blocking",
        message: `Tag "${tag}" exceeds 20 characters.`,
      });
    }
    if (seen.has(normalized)) {
      issues.push({
        code: "duplicate_tag",
        field: "tags",
        severity: "blocking",
        message: `Tag "${tag}" is duplicated.`,
      });
    }
    seen.add(normalized);
  }

  if (listing.price !== null) {
    issues.push({
      code: "price_must_be_manual",
      field: "listing",
      severity: "blocking",
      message: "Final price must remain null for manual entry.",
    });
  }

  return issues;
}
