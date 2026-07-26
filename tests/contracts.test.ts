import assert from "node:assert/strict";
import test from "node:test";
import { validateCopywritingDraft } from "../lib/contracts";

function validDraft() {
  return {
    listing: {
      title: "Minimal Ceramic Desk Vase",
      description: "A simple vase for a tidy shelf.\n\nDetails:\n- Ceramic finish",
      tags: ["desk vase", "minimal decor"],
      category: "Home & Living > Home Decor > Vases",
      price: null,
    },
    evidence: [],
    inspected_images: [],
    conflicts: [],
    omitted_fields: [],
    warnings: [],
  };
}

test("accepts a conservative Etsy copywriting draft", () => {
  assert.deepEqual(validateCopywritingDraft(validDraft()), []);
});

test("blocks unsupported contract shapes and Etsy limit violations", () => {
  const draft = validDraft();
  draft.listing.title = "x".repeat(141);
  draft.listing.tags = ["this tag is over twenty characters", "Duplicate", "duplicate"];
  draft.listing.price = "12.00" as never;

  const codes = validateCopywritingDraft(draft).map((issue) => issue.code);
  assert.ok(codes.includes("title_too_long"));
  assert.ok(codes.includes("tag_too_long"));
  assert.ok(codes.includes("duplicate_tag"));
  assert.ok(codes.includes("price_must_be_manual"));
});
