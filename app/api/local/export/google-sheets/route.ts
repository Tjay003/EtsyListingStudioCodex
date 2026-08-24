import path from "node:path";
import { NextResponse } from "next/server";
import { apiError, requireActiveWorkspace } from "@/lib/api-utils";
import {
  extractItemNumber,
  formatItemNumber,
  getNextItemNumber,
  getProduct,
  readProductResult,
  updateProductState,
} from "@/lib/product-store";
import { readCopywritingSettings } from "@/lib/workspace-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ExportRequest {
  instanceId?: string;
  instanceIds?: string[];
  product_id?: string;
  payload?: Record<string, unknown>;
}

export async function POST(request: Request) {
  try {
    const root = await requireActiveWorkspace();
    const body = (await request.json()) as ExportRequest;

    const requestedIds = body.instanceIds?.length
      ? body.instanceIds
      : [body.instanceId || body.product_id].filter((id): id is string => Boolean(id));

    if (!requestedIds.length) {
      throw new Error("Missing instanceId or instanceIds in request body.");
    }

    const settings = await readCopywritingSettings(root);
    const webhookUrl = (settings.google_sheets_webhook_url || "").trim();
    if (!webhookUrl) {
      throw new Error(
        "Google Sheets webhook URL is not configured. Please add the Webhook URL in Workspace Settings.",
      );
    }

    const exportItems = [];
    for (const instanceId of requestedIds) {
      const product = await getProduct(root, instanceId);
      if (!product.item_number || product.item_number === "") {
        const nextNum = formatItemNumber(await getNextItemNumber(root));
        await updateProductState(root, instanceId, {
          item_number: nextNum,
        });
        product.item_number = nextNum;
      }
      const resultBundle = await readProductResult(root, instanceId);
      const latestResult = resultBundle?.result;

      const numericItemNum =
        extractItemNumber(String(product.item_number || "")) ??
        extractItemNumber(product.folderName) ??
        0;

      const itemPayload = {
        id: product.item_number || product.folderName,
        item_number: product.item_number ?? "",
        item_numeric: numericItemNum,
        action: "upsert",
        title: product.title,
        scrapedTitle: product.title,
        sourceTitle: product.title,
        link: product.sourceUrl,
        sourceUrl: product.sourceUrl,
        source_url: product.sourceUrl,
        source_product_id: product.sourceProductId,
        source_domain: product.sourceDomain,
        edited_photo_ready: Boolean(product.edited_photos_ready),
        editedPhotoReady: Boolean(product.edited_photos_ready),
        status: product.published
          ? "Published"
          : latestResult
            ? "Approved"
            : "Draft",
        published: Boolean(product.published),
        category: latestResult?.listing.category || "",
        etsyCategory: latestResult?.listing.category || "",
        etsy_title: latestResult?.listing.title || product.title,
        etsyTitle: latestResult?.listing.title || product.title,
        description:
          latestResult?.listing.description || product.descriptionText,
        etsyDescription:
          latestResult?.listing.description || product.descriptionText,
        tags: latestResult?.listing.tags
          ? latestResult.listing.tags.join(", ")
          : "",
        etsyTags: latestResult?.listing.tags
          ? latestResult.listing.tags.join(", ")
          : "",
        tags_array: latestResult?.listing.tags || [],
        aliexpress_price: product.price || "",
        aliexpressPrice: product.price || "",
        supplier_price: product.price || "",
        quotation_price: product.quotation_price ?? "",
        quotationPrice: product.quotation_price ?? "",
        shop_name: settings.shop_name || product.folderName || path.basename(root) || "",
        workspace_name: path.basename(root) || "",
        folder_name: product.folderName,
        sheet_name: (settings.shop_name || "").trim() || product.folderName || path.basename(root) || "Listings",
        target_sheet: (settings.shop_name || "").trim() || product.folderName || path.basename(root) || "Listings",
        relative_folder: product.relativeFolder,
        reference_image: product.referenceImage,
        images_count: product.images.length,
        last_synced: new Date().toISOString(),
        exported_at: new Date().toISOString(),
        ...(body.payload || {}),
      };

      exportItems.push(itemPayload);
    }

    const exportPayload =
      exportItems.length === 1
        ? { ...exportItems[0], items: exportItems }
        : { items: exportItems };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);

    let webhookResponse: Response;
    try {
      webhookResponse = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(exportPayload),
        signal: controller.signal,
      });
    } catch (networkError) {
      clearTimeout(timer);
      const msg =
        networkError instanceof Error ? networkError.message : "Network error";
      throw new Error(`Failed to reach Google Sheets webhook: ${msg}`);
    }
    clearTimeout(timer);

    if (!webhookResponse.ok) {
      const errorText = await webhookResponse.text().catch(() => "");
      throw new Error(
        `Google Sheets webhook error (${webhookResponse.status}): ${errorText || webhookResponse.statusText}`,
      );
    }

    const responseData = await webhookResponse.text().catch(() => "");

    const countLabel =
      exportItems.length === 1
        ? `item #${exportItems[0].item_number || exportItems[0].id}`
        : `${exportItems.length} items`;

    return NextResponse.json({
      success: true,
      message: `Successfully synced ${countLabel} to Google Sheets.`,
      exportedPayload: exportPayload,
      webhookResponse: responseData,
    });
  } catch (error) {
    return apiError(error);
  }
}
