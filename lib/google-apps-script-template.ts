/**
 * Google Apps Script v3 template with interactive table layout (checkboxes, status dropdown, exact column order).
 */
export const GOOGLE_APPS_SCRIPT_TEMPLATE = `/**
 * ==============================================================================
 * Etsy Listing Studio Codex — Google Sheets Webhook Script (v3 — Interactive Table)
 * ==============================================================================
 * 
 * COLUMN ORDER:
 * 1. ID
 * 2. Title (Supplier Scraped Title)
 * 3. Link (Supplier / Source URL)
 * 4. Edited Photo Ready? (Interactive Checkbox Tickbox)
 * 5. Status (Interactive Dropdown: Draft, Approved, Published, Archived, Rejected)
 * 6. Category (Etsy Taxonomy Category)
 * 7. Etsy Title (Generated SEO Title)
 * 8. Description (Story & Specifications)
 * 9. Tags (13 SEO Tags)
 * 10. Aliexpress Price (Supplier Price)
 * 11. Quotation Price (Selling Price)
 * 12. Folder Name (Local Product Folder)
 * 13. Last Synced (Sync Timestamp)
 * 
 * FEATURES:
 * - Interactive Tickboxes: Column 4 has native clickable checkboxes.
 * - Interactive Status Dropdown: Column 5 has native dropdown selection.
 * - Multi-Shop Tab Routing: Automatically routes listings to the sheet tab matching
 *   your Shop Name (or folder name if no shop name is set).
 * - Auto Tab Creation: If the shop's tab doesn't exist yet, it automatically creates,
 *   formats, and styles a new tab for that shop.
 * - In-Place Row Updating (Upsert): Re-syncing an existing item updates its row in place
 *   without duplicating rows.
 * - In-Order Insertion: Inserting missing numbers (e.g. 6 when 7 exists) places them
 *   in exact numerical order (above 7).
 * - Automatic Sorting: Keeps all listings sorted 1, 2, 3, 4, 5... ascending per tab.
 * ==============================================================================
 */

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
  } catch (err) {
    return ContentService.createTextOutput(
      JSON.stringify({ success: false, error: "Server busy: " + err.toString() })
    ).setMimeType(ContentService.MimeType.JSON);
  }

  try {
    if (!e || !e.postData || !e.postData.contents) {
      return ContentService.createTextOutput(
        JSON.stringify({ success: false, error: "Empty request body." })
      ).setMimeType(ContentService.MimeType.JSON);
    }

    var payload;
    try {
      payload = JSON.parse(e.postData.contents);
    } catch (parseErr) {
      return ContentService.createTextOutput(
        JSON.stringify({ success: false, error: "Invalid JSON: " + parseErr.message })
      ).setMimeType(ContentService.MimeType.JSON);
    }

    var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    var results = processListingSync(spreadsheet, payload);

    return ContentService.createTextOutput(
      JSON.stringify({
        success: true,
        message: "Successfully synchronized listing(s) to Google Sheets.",
        details: results
      })
    ).setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService.createTextOutput(
      JSON.stringify({ success: false, error: error.toString() })
    ).setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}

function doGet(e) {
  return ContentService.createTextOutput(
    JSON.stringify({
      status: "online",
      message: "Etsy Listing Studio Interactive Webhook is active and ready."
    })
  ).setMimeType(ContentService.MimeType.JSON);
}

var SCHEMA_COLUMNS = [
  { key: "id", header: "ID" },
  { key: "title", header: "Title" },
  { key: "link", header: "Link" },
  { key: "edited_photo_ready", header: "Edited Photo Ready?" },
  { key: "status", header: "Status" },
  { key: "category", header: "Category" },
  { key: "etsy_title", header: "Etsy Title" },
  { key: "description", header: "Description" },
  { key: "tags", header: "Tags" },
  { key: "aliexpress_price", header: "Aliexpress Price" },
  { key: "quotation_price", header: "Quotation Price" },
  { key: "folder_name", header: "Folder Name" },
  { key: "last_synced", header: "Last Synced" }
];

var STATUS_OPTIONS = ["Draft", "Approved", "Published", "Archived", "Rejected"];

function sanitizeTabName(raw) {
  var name = String(raw || "").trim();
  if (!name) name = "Listings";
  name = name.replace(/[\\\\/?*:\\[\\]]/g, "-").trim();
  if (name.length > 100) {
    name = name.substring(0, 100).trim();
  }
  return name || "Listings";
}

function getOrCreateSheetForShop(spreadsheet, item) {
  var rawName = item.sheet_name || item.target_sheet || item.shop_name || item.workspace_name || item.folder_name || "Listings";
  var tabName = sanitizeTabName(rawName);

  var sheet = spreadsheet.getSheetByName(tabName);
  if (sheet) {
    return sheet;
  }

  var allSheets = spreadsheet.getSheets();
  for (var i = 0; i < allSheets.length; i++) {
    if (allSheets[i].getName().trim().toLowerCase() === tabName.toLowerCase()) {
      return allSheets[i];
    }
  }

  if (allSheets.length === 1 && (allSheets[0].getName() === "Sheet1" || allSheets[0].getName() === "Sheet 1")) {
    var firstSheet = allSheets[0];
    if (firstSheet.getLastRow() <= 1 && firstSheet.getLastColumn() <= 1) {
      firstSheet.setName(tabName);
      return firstSheet;
    }
  }

  try {
    sheet = spreadsheet.insertSheet(tabName);
    return sheet;
  } catch (err) {
    return spreadsheet.getActiveSheet();
  }
}

function processListingSync(spreadsheet, payload) {
  var items = [];
  if (Array.isArray(payload)) {
    items = payload;
  } else if (payload.items && Array.isArray(payload.items)) {
    items = payload.items;
  } else {
    items = [payload];
  }

  var modifiedSheets = {};
  var results = [];

  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    var sheet = getOrCreateSheetForShop(spreadsheet, item);
    ensureHeaderRow(sheet);
    var res = syncSingleItem(sheet, item);
    res.sheet_name = sheet.getName();
    results.push(res);
    modifiedSheets[sheet.getName()] = sheet;
  }

  for (var name in modifiedSheets) {
    if (modifiedSheets.hasOwnProperty(name)) {
      sortSheetByItemNumber(modifiedSheets[name]);
      applyColumnFormatting(modifiedSheets[name]);
    }
  }

  return results;
}

function ensureHeaderRow(sheet) {
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();

  if (lastRow === 0 || lastCol === 0) {
    var headers = SCHEMA_COLUMNS.map(function(col) { return col.header; });
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    
    var headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setFontWeight("bold");
    headerRange.setBackground("#1e293b");
    headerRange.setFontColor("#ffffff");
    sheet.setFrozenRows(1);

    sheet.setColumnWidth(1, 80);   // ID
    sheet.setColumnWidth(2, 220);  // Title
    sheet.setColumnWidth(3, 180);  // Link
    sheet.setColumnWidth(4, 150);  // Edited Photo Ready?
    sheet.setColumnWidth(5, 110);  // Status
    sheet.setColumnWidth(6, 140);  // Category
    sheet.setColumnWidth(7, 240);  // Etsy Title
    sheet.setColumnWidth(8, 280);  // Description
    sheet.setColumnWidth(9, 200);  // Tags
    sheet.setColumnWidth(10, 110); // Aliexpress Price
    sheet.setColumnWidth(11, 110); // Quotation Price
    sheet.setColumnWidth(12, 160); // Folder Name
    sheet.setColumnWidth(13, 150); // Last Synced
  }
}

function parseNumericItemNumber(val) {
  if (val === null || val === undefined || val === "") return 999999;
  if (typeof val === "number") return val;
  var str = String(val).trim();
  var match = str.match(/(\\d+)/);
  if (match) {
    var parsed = parseInt(match[1], 10);
    if (!isNaN(parsed)) return parsed;
  }
  return 999999;
}

function isItemNumberMatch(valA, valB) {
  if (valA === valB) return true;
  var strA = String(valA || "").trim();
  var strB = String(valB || "").trim();
  if (strA.toLowerCase() === strB.toLowerCase()) return true;

  var numA = parseNumericItemNumber(valA);
  var numB = parseNumericItemNumber(valB);
  if (numA !== 999999 && numB !== 999999 && numA === numB) {
    return true;
  }
  return false;
}

function formatItemRow(sheet, item) {
  var idVal = item.id || item.item_number || "";
  var titleVal = item.sourceTitle || item.scrapedTitle || item.title || "";
  var linkVal = item.source_url || item.sourceUrl || item.link || "";
  var photoReadyVal = Boolean(item.edited_photos_ready || item.editedPhotoReady);
  var statusVal = item.status || (item.published ? "Published" : "Draft");
  var categoryVal = item.etsyCategory || item.category || "";
  var etsyTitleVal = item.etsyTitle || item.title || "";
  var descVal = item.etsyDescription || item.description || "";
  var tagsVal = item.etsyTags || item.tags || (Array.isArray(item.tags_array) ? item.tags_array.join(", ") : "");
  var aliPriceVal = item.supplier_price || item.aliexpressPrice || item.aliexpress_price || item.price || "";
  var quotPriceVal = item.quotation_price || item.quotationPrice || "";
  var folderVal = item.folder_name || item.folderName || item.relative_folder || "";
  var syncedVal = item.exported_at || item.last_synced || new Date().toISOString().replace("T", " ").substring(0, 19);

  return [
    idVal,
    titleVal,
    linkVal,
    photoReadyVal,
    statusVal,
    categoryVal,
    etsyTitleVal,
    descVal,
    tagsVal,
    aliPriceVal,
    quotPriceVal,
    folderVal,
    syncedVal
  ];
}

function syncSingleItem(sheet, item) {
  var itemNum = item.id || item.item_number || "";
  var targetNumeric = parseNumericItemNumber(itemNum);
  var rowValues = formatItemRow(sheet, item);
  var numCols = rowValues.length;

  var lastRow = sheet.getLastRow();

  if (lastRow <= 1) {
    sheet.getRange(2, 1, 1, numCols).setValues([rowValues]);
    applyRowValidation(sheet, 2);
    return { action: "inserted", row: 2, item_number: itemNum };
  }

  var dataRange = sheet.getRange(2, 1, lastRow - 1, 1).getValues();

  for (var i = 0; i < dataRange.length; i++) {
    var existingVal = dataRange[i][0];
    if (isItemNumberMatch(existingVal, itemNum)) {
      var targetRow = i + 2;
      sheet.getRange(targetRow, 1, 1, numCols).setValues([rowValues]);
      applyRowValidation(sheet, targetRow);
      return { action: "updated", row: targetRow, item_number: itemNum };
    }
  }

  var insertRowIndex = -1;
  for (var j = 0; j < dataRange.length; j++) {
    var rowNum = parseNumericItemNumber(dataRange[j][0]);
    if (rowNum > targetNumeric) {
      insertRowIndex = j + 2;
      break;
    }
  }

  if (insertRowIndex !== -1) {
    sheet.insertRowBefore(insertRowIndex);
    sheet.getRange(insertRowIndex, 1, 1, numCols).setValues([rowValues]);
    applyRowValidation(sheet, insertRowIndex);
    return { action: "inserted_in_order", row: insertRowIndex, item_number: itemNum };
  } else {
    var newRow = lastRow + 1;
    sheet.getRange(newRow, 1, 1, numCols).setValues([rowValues]);
    applyRowValidation(sheet, newRow);
    return { action: "appended", row: newRow, item_number: itemNum };
  }
}

function applyRowValidation(sheet, row) {
  try {
    var checkboxCell = sheet.getRange(row, 4);
    checkboxCell.insertCheckboxes();
    
    var statusCell = sheet.getRange(row, 5);
    var rule = SpreadsheetApp.newDataValidation()
      .requireValueInList(STATUS_OPTIONS, true)
      .setAllowInvalid(false)
      .build();
    statusCell.setDataValidation(rule);
  } catch (err) {}
}

function applyColumnFormatting(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  try {
    var numRows = lastRow - 1;
    var checkboxRange = sheet.getRange(2, 4, numRows, 1);
    checkboxRange.insertCheckboxes();

    var statusRange = sheet.getRange(2, 5, numRows, 1);
    var rule = SpreadsheetApp.newDataValidation()
      .requireValueInList(STATUS_OPTIONS, true)
      .setAllowInvalid(false)
      .build();
    statusRange.setDataValidation(rule);

    sheet.getRange(2, 1, numRows, 1).setHorizontalAlignment("center");
    sheet.getRange(2, 4, numRows, 1).setHorizontalAlignment("center");
    sheet.getRange(2, 5, numRows, 1).setHorizontalAlignment("center");
    sheet.getRange(2, 10, numRows, 2).setHorizontalAlignment("right");
  } catch (err) {}
}

function sortSheetByItemNumber(sheet) {
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow > 2 && lastCol > 0) {
    var range = sheet.getRange(2, 1, lastRow - 1, lastCol);
    range.sort({ column: 1, ascending: true });
  }
}
`;
