import { mkdir } from "node:fs/promises";
import path from "node:path";
import type { WorkspaceCopywritingSettingsV1 } from "./contracts";
import { STUDIO_SCHEMA_VERSION } from "./contracts";
import { readJson, writeJsonAtomic } from "./fs-utils";

const POLICY_FOOTER = `- Order Adjustments & Cancellations -
We want you to love your space. If you need to cancel your order, please let us know within 5 hours of purchase. Because each of our design-forward pieces is made to order specifically for you, we begin production immediately after this window and cannot halt the process.

- Returns & Damaged Items -
Due to the custom nature of our curated collection, we are only able to accept returns or issue refunds if your item arrives damaged or incorrect. Should an issue arise, please reach out to us right away with a few clear photos of the item so our team can step in and take care of it for you. We deeply appreciate your support of Nookform and your understanding of our studio process.`;

function now() {
  return new Date().toISOString();
}

export function defaultCopywritingSettings(
  timestamp = now(),
): WorkspaceCopywritingSettingsV1 {
  return {
    schema_version: STUDIO_SCHEMA_VERSION,
    updated_at: timestamp,
    shop_name: "Nookform",
    tagline: "Modern furniture for thoughtful spaces. Form for every corner.",
    brand_profile:
      "Nookform is a design-forward furniture and home-interior brand focused on side tables, bedside tables, accent tables, coffee tables, and artistic tabletop accessories. The brand centers thoughtful furniture that brings form, function, and character to overlooked corners and everyday spaces.",
    voice:
      "Warm modern, artistic, welcoming, concise, visually descriptive, tasteful, and quietly confident. Write like a trusted creative friend who understands interiors. Avoid aggressive sales language, excessive adjectives, keyword stuffing, and generic phrases like perfect for every home.",
    description_structure:
      "Open with a short lifestyle-led sentence grounded in supported product evidence. Follow with scannable supported details using hyphen bullets. Keep internal review notes, omitted-field explanations, and evidence caveats out of customer-facing descriptions; store them only in warnings, evidence, and omitted_fields. End with the required policy footer when enabled.",
    formatting_rules:
      "Use clean, flat text. Use a standard hyphen followed by a space for all lists. Do not use bullet symbols, stars, emojis, markdown tables, HTML tags, script notation, or unparsed rich text codes in buyer-facing copy.",
    seo_rules:
      "Front-load titles with the clearest high-intent product phrase. Keep titles natural and under Etsy's 140-character limit. Use exactly 13 tags only when 13 strong evidence-supported tags exist; otherwise use fewer. Each tag must be 20 characters or fewer and should cover distinct shopper intent without filler.",
    banned_language:
      "Do not include wholesale supplier jargon, shipping carrier terminology, platform names such as AliExpress, global transit lines, unsupported luxury claims, or unsupported custom, material, size, capacity, compatibility, safety, performance, package, or origin claims.",
    policy_footer: POLICY_FOOTER,
    require_policy_footer: true,
  };
}

export function settingsPath(root: string) {
  return path.join(root, ".etsy-listing-studio", "settings", "copywriting.json");
}

function cleanText(value: unknown, fallback: string) {
  return typeof value === "string" ? value.trim() : fallback;
}

export async function readCopywritingSettings(root: string) {
  const filePath = settingsPath(root);
  try {
    const saved = await readJson<Partial<WorkspaceCopywritingSettingsV1>>(filePath);
    const defaults = defaultCopywritingSettings();
    return {
      ...defaults,
      ...saved,
      schema_version: STUDIO_SCHEMA_VERSION,
      shop_name: cleanText(saved.shop_name, defaults.shop_name),
      tagline: cleanText(saved.tagline, defaults.tagline),
      brand_profile: cleanText(saved.brand_profile, defaults.brand_profile),
      voice: cleanText(saved.voice, defaults.voice),
      description_structure: cleanText(
        saved.description_structure,
        defaults.description_structure,
      ),
      formatting_rules: cleanText(
        saved.formatting_rules,
        defaults.formatting_rules,
      ),
      seo_rules: cleanText(saved.seo_rules, defaults.seo_rules),
      banned_language: cleanText(saved.banned_language, defaults.banned_language),
      policy_footer: cleanText(saved.policy_footer, defaults.policy_footer),
      require_policy_footer:
        typeof saved.require_policy_footer === "boolean"
          ? saved.require_policy_footer
          : defaults.require_policy_footer,
    } satisfies WorkspaceCopywritingSettingsV1;
  } catch {
    return defaultCopywritingSettings();
  }
}

export async function saveCopywritingSettings(
  root: string,
  patch: Partial<WorkspaceCopywritingSettingsV1>,
) {
  const current = await readCopywritingSettings(root);
  const next: WorkspaceCopywritingSettingsV1 = {
    ...current,
    shop_name: cleanText(patch.shop_name, current.shop_name),
    tagline: cleanText(patch.tagline, current.tagline),
    brand_profile: cleanText(patch.brand_profile, current.brand_profile),
    voice: cleanText(patch.voice, current.voice),
    description_structure: cleanText(
      patch.description_structure,
      current.description_structure,
    ),
    formatting_rules: cleanText(patch.formatting_rules, current.formatting_rules),
    seo_rules: cleanText(patch.seo_rules, current.seo_rules),
    banned_language: cleanText(patch.banned_language, current.banned_language),
    policy_footer: cleanText(patch.policy_footer, current.policy_footer),
    require_policy_footer:
      typeof patch.require_policy_footer === "boolean"
        ? patch.require_policy_footer
        : current.require_policy_footer,
    schema_version: STUDIO_SCHEMA_VERSION,
    updated_at: now(),
  };

  const filePath = settingsPath(root);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeJsonAtomic(filePath, next);
  return next;
}
