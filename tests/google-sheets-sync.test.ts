import assert from "node:assert/strict";
import test from "node:test";

interface SheetMock {
  name: string;
  rows: (string | number | boolean)[][];
  getName: () => string;
  setName: (name: string) => void;
  getLastRow: () => number;
  getLastColumn: () => number;
  getRange: (row: number, col: number, numRows?: number, numCols?: number) => {
    getValues: () => (string | number | boolean)[][];
    setValues: (values: (string | number | boolean)[][]) => void;
    setFontWeight: (weight: string) => void;
    setBackground: (color: string) => void;
    setFontColor: (color: string) => void;
    setHorizontalAlignment: (align: string) => void;
    insertCheckboxes: () => void;
    setDataValidation: (rule: unknown) => void;
    sort: (options: { column: number; ascending: boolean }) => void;
  };
  insertRowBefore: (rowIndex: number) => void;
  setFrozenRows: (rows: number) => void;
  setColumnWidth: (col: number, width: number) => void;
}

interface SpreadsheetMock {
  sheets: SheetMock[];
  getSheets: () => SheetMock[];
  getSheetByName: (name: string) => SheetMock | null;
  getActiveSheet: () => SheetMock;
  insertSheet: (name: string) => SheetMock;
}

function createSheetMock(name = "Sheet1"): SheetMock {
  const sheet: SheetMock = {
    name,
    rows: [],
    getName() {
      return sheet.name;
    },
    setName(nextName: string) {
      sheet.name = nextName;
    },
    getLastRow() {
      return sheet.rows.length;
    },
    getLastColumn() {
      return sheet.rows.length > 0 ? sheet.rows[0].length : 0;
    },
    getRange(row: number, col: number, numRows = 1, numCols = 1) {
      return {
        getValues() {
          const result: (string | number | boolean)[][] = [];
          for (let r = 0; r < numRows; r++) {
            const rowIndex = row - 1 + r;
            const rowData: (string | number | boolean)[] = [];
            for (let c = 0; c < numCols; c++) {
              const colIndex = col - 1 + c;
              rowData.push(sheet.rows[rowIndex]?.[colIndex] ?? "");
            }
            result.push(rowData);
          }
          return result;
        },
        setValues(values: (string | number | boolean)[][]) {
          for (let r = 0; r < values.length; r++) {
            const targetRow = row - 1 + r;
            while (sheet.rows.length <= targetRow) {
              sheet.rows.push([]);
            }
            for (let c = 0; c < values[r].length; c++) {
              const targetCol = col - 1 + c;
              sheet.rows[targetRow][targetCol] = values[r][c];
            }
          }
        },
        setFontWeight() {},
        setBackground() {},
        setFontColor() {},
        setHorizontalAlignment() {},
        insertCheckboxes() {},
        setDataValidation() {},
        sort(options: { column: number; ascending: boolean }) {
          const start = row - 1;
          const count = numRows;
          const slice = sheet.rows.slice(start, start + count);
          const colIdx = options.column - 1;
          slice.sort((a, b) => {
            const numA = parseInt(String(a[colIdx]).replace(/\D/g, ""), 10) || 0;
            const numB = parseInt(String(b[colIdx]).replace(/\D/g, ""), 10) || 0;
            return options.ascending ? numA - numB : numB - numA;
          });
          sheet.rows.splice(start, count, ...slice);
        },
      };
    },
    insertRowBefore(rowIndex: number) {
      const idx = rowIndex - 1;
      sheet.rows.splice(idx, 0, new Array(sheet.getLastColumn()).fill(""));
    },
    setFrozenRows() {},
    setColumnWidth() {},
  };
  return sheet;
}

function createSpreadsheetMock(): SpreadsheetMock {
  const initialSheet = createSheetMock("Sheet1");
  const spreadsheet: SpreadsheetMock = {
    sheets: [initialSheet],
    getSheets() {
      return spreadsheet.sheets;
    },
    getSheetByName(name: string) {
      return spreadsheet.sheets.find((s) => s.name === name) || null;
    },
    getActiveSheet() {
      return spreadsheet.sheets[0];
    },
    insertSheet(name: string) {
      const newSheet = createSheetMock(name);
      spreadsheet.sheets.push(newSheet);
      return newSheet;
    },
  };
  return spreadsheet;
}

const SCHEMA_COLUMNS = [
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
  { key: "last_synced", header: "Last Synced" },
];

function sanitizeTabName(raw: unknown): string {
  let name = String(raw || "").trim();
  if (!name) name = "Listings";
  name = name.replace(/[\\/?*:[\]]/g, "-").trim();
  if (name.length > 100) name = name.substring(0, 100).trim();
  return name || "Listings";
}

function getOrCreateSheetForShop(spreadsheet: SpreadsheetMock, item: Record<string, unknown>): SheetMock {
  const rawName = item.sheet_name || item.target_sheet || item.shop_name || item.workspace_name || item.folder_name || "Listings";
  const tabName = sanitizeTabName(rawName);

  const existing = spreadsheet.getSheetByName(tabName);
  if (existing) return existing;

  const allSheets = spreadsheet.getSheets();
  for (let i = 0; i < allSheets.length; i++) {
    if (allSheets[i].getName().trim().toLowerCase() === tabName.toLowerCase()) {
      return allSheets[i];
    }
  }

  if (allSheets.length === 1 && (allSheets[0].getName() === "Sheet1" || allSheets[0].getName() === "Sheet 1")) {
    const first = allSheets[0];
    if (first.getLastRow() <= 1 && first.getLastColumn() <= 1) {
      first.setName(tabName);
      return first;
    }
  }

  return spreadsheet.insertSheet(tabName);
}

function ensureHeaderRow(sheet: SheetMock) {
  if (sheet.getLastRow() === 0 || sheet.getLastColumn() === 0) {
    const headers = SCHEMA_COLUMNS.map((col) => col.header);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  }
}

function parseNumericItemNumber(val: unknown): number {
  if (val === null || val === undefined || val === "") return 999999;
  if (typeof val === "number") return val;
  const str = String(val).trim();
  const match = str.match(/(\d+)/);
  if (match) {
    const parsed = parseInt(match[1], 10);
    if (!isNaN(parsed)) return parsed;
  }
  return 999999;
}

function isItemNumberMatch(valA: unknown, valB: unknown): boolean {
  if (valA === valB) return true;
  const strA = String(valA || "").trim();
  const strB = String(valB || "").trim();
  if (strA.toLowerCase() === strB.toLowerCase()) return true;

  const numA = parseNumericItemNumber(valA);
  const numB = parseNumericItemNumber(valB);
  if (numA !== 999999 && numB !== 999999 && numA === numB) {
    return true;
  }
  return false;
}

function formatItemRow(sheet: SheetMock, item: Record<string, unknown>): (string | number | boolean)[] {
  const idVal = (item.id || item.item_number || "") as string;
  const titleVal = (item.sourceTitle || item.scrapedTitle || item.title || "") as string;
  const linkVal = (item.source_url || item.sourceUrl || item.link || "") as string;
  const photoReadyVal = Boolean(item.edited_photos_ready || item.editedPhotoReady);
  const statusVal = (item.status || (item.published ? "Published" : "Draft")) as string;
  const categoryVal = (item.etsyCategory || item.category || "") as string;
  const etsyTitleVal = (item.etsyTitle || item.etsy_title || item.title || "") as string;
  const descVal = (item.etsyDescription || item.description || "") as string;
  const tagsVal = (item.etsyTags || item.tags || (Array.isArray(item.tags_array) ? item.tags_array.join(", ") : "")) as string;
  const aliPriceVal = (item.supplier_price || item.aliexpressPrice || item.aliexpress_price || item.price || "") as string;
  const quotPriceVal = (item.quotation_price || item.quotationPrice || "") as string;
  const folderVal = (item.folder_name || item.folderName || item.relative_folder || "") as string;
  const syncedVal = (item.exported_at || item.last_synced || "2026-08-25 04:00:00") as string;

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
    syncedVal,
  ];
}

function syncSingleItem(sheet: SheetMock, item: Record<string, unknown>) {
  const itemNum = (item.id || item.item_number || "") as string;
  const targetNumeric = parseNumericItemNumber(itemNum);
  const rowValues = formatItemRow(sheet, item);
  const numCols = rowValues.length;

  const lastRow = sheet.getLastRow();

  if (lastRow <= 1) {
    sheet.getRange(2, 1, 1, numCols).setValues([rowValues]);
    return { action: "inserted", row: 2, item_number: itemNum };
  }

  const dataRange = sheet.getRange(2, 1, lastRow - 1, 1).getValues();

  // 1. Update in-place
  for (let i = 0; i < dataRange.length; i++) {
    const existingVal = dataRange[i][0];
    if (isItemNumberMatch(existingVal, itemNum)) {
      const targetRow = i + 2;
      sheet.getRange(targetRow, 1, 1, numCols).setValues([rowValues]);
      return { action: "updated", row: targetRow, item_number: itemNum };
    }
  }

  // 2. Insert in-order
  let insertRowIndex = -1;
  for (let j = 0; j < dataRange.length; j++) {
    const rowNum = parseNumericItemNumber(dataRange[j][0]);
    if (rowNum > targetNumeric) {
      insertRowIndex = j + 2;
      break;
    }
  }

  if (insertRowIndex !== -1) {
    sheet.insertRowBefore(insertRowIndex);
    sheet.getRange(insertRowIndex, 1, 1, numCols).setValues([rowValues]);
    return { action: "inserted_in_order", row: insertRowIndex, item_number: itemNum };
  } else {
    const newRow = lastRow + 1;
    sheet.getRange(newRow, 1, 1, numCols).setValues([rowValues]);
    return { action: "appended", row: newRow, item_number: itemNum };
  }
}

function processSpreadsheetSync(spreadsheet: SpreadsheetMock, payload: Record<string, unknown> | Record<string, unknown>[]) {
  const items = Array.isArray(payload)
    ? payload
    : payload.items && Array.isArray(payload.items)
      ? (payload.items as Record<string, unknown>[])
      : [payload];

  const results = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const sheet = getOrCreateSheetForShop(spreadsheet, item);
    ensureHeaderRow(sheet);
    const res = syncSingleItem(sheet, item);
    results.push({ ...res, sheet_name: sheet.getName() });
  }

  return results;
}

test("Google Sheets sync: verifies exact 13-column schema and interactive field values", () => {
  const spreadsheet = createSpreadsheetMock();

  const item1 = {
    id: "001",
    sourceTitle: "Ceramic Coffee Mug Original",
    source_url: "https://aliexpress.com/item/123",
    edited_photos_ready: true,
    status: "Draft",
    category: "Home & Living > Kitchen & Dining > Drinkware > Mugs",
    etsy_title: "Handmade Ceramic Mug | Minimalist Coffee Cup",
    description: "Handcrafted rustic mug for daily coffee.",
    tags: "ceramic mug, coffee cup, handmade pottery, rustic mug",
    supplier_price: "$8.50",
    quotation_price: "$24.00",
    folder_name: "[001] ceramic-mug",
    last_synced: "2026-08-25 04:00:00",
    shop_name: "testingFolder1",
  };

  const res1 = processSpreadsheetSync(spreadsheet, item1);
  assert.equal(res1[0].action, "inserted");

  const sheet = spreadsheet.getSheetByName("testingFolder1")!;
  assert.ok(sheet);

  // Check header row (Row 1)
  const headers = sheet.rows[0];
  assert.deepEqual(headers, [
    "ID",
    "Title",
    "Link",
    "Edited Photo Ready?",
    "Status",
    "Category",
    "Etsy Title",
    "Description",
    "Tags",
    "Aliexpress Price",
    "Quotation Price",
    "Folder Name",
    "Last Synced",
  ]);

  // Check data row (Row 2)
  const data = sheet.rows[1];
  assert.equal(data[0], "001");                                       // ID
  assert.equal(data[1], "Ceramic Coffee Mug Original");              // Title
  assert.equal(data[2], "https://aliexpress.com/item/123");          // Link
  assert.equal(data[3], true);                                       // Edited Photo Ready? (boolean for checkbox)
  assert.equal(data[4], "Draft");                                    // Status (for dropdown)
  assert.equal(data[5], "Home & Living > Kitchen & Dining > Drinkware > Mugs"); // Category
  assert.equal(data[6], "Handmade Ceramic Mug | Minimalist Coffee Cup"); // Etsy Title
  assert.equal(data[7], "Handcrafted rustic mug for daily coffee."); // Description
  assert.equal(data[8], "ceramic mug, coffee cup, handmade pottery, rustic mug"); // Tags
  assert.equal(data[9], "$8.50");                                     // Aliexpress Price
  assert.equal(data[10], "$24.00");                                  // Quotation Price
  assert.equal(data[11], "[001] ceramic-mug");                       // Folder Name
  assert.equal(data[12], "2026-08-25 04:00:00");                     // Last Synced
});

test("Google Sheets sync: updating existing item modifies row in-place without duplicating", () => {
  const spreadsheet = createSpreadsheetMock();

  const item1 = {
    item_number: "001",
    title: "Handmade Wooden Spoon v1",
    quotation_price: "$15.00",
    status: "Draft",
    shop_name: "testingFolder1",
  };
  processSpreadsheetSync(spreadsheet, item1);

  const targetSheet = spreadsheet.getSheetByName("testingFolder1")!;
  assert.equal(targetSheet.rows.length, 2);

  // Re-sync same item -> must update in-place without duplicating
  const item1Updated = {
    item_number: "001",
    title: "Handmade Wooden Spoon v2 (Approved)",
    quotation_price: "$22.50",
    status: "Approved",
    shop_name: "testingFolder1",
  };
  const res2 = processSpreadsheetSync(spreadsheet, item1Updated);
  assert.equal(res2[0].action, "updated");
  assert.equal(targetSheet.rows.length, 2); // Still 2 rows!
  assert.equal(targetSheet.rows[1][1], "Handmade Wooden Spoon v2 (Approved)");
  assert.equal(targetSheet.rows[1][4], "Approved");
  assert.equal(targetSheet.rows[1][10], "$22.50");
});

test("Google Sheets sync: inserting 7 then 6 inserts 6 above 7 in exact numerical order", () => {
  const spreadsheet = createSpreadsheetMock();

  processSpreadsheetSync(spreadsheet, { item_number: "001", title: "Item One", shop_name: "testShop" });
  processSpreadsheetSync(spreadsheet, { item_number: "007", title: "Item Seven", shop_name: "testShop" });

  const sheet = spreadsheet.getSheetByName("testShop")!;
  assert.equal(sheet.rows.length, 3);
  assert.equal(sheet.rows[1][0], "001");
  assert.equal(sheet.rows[2][0], "007");

  // Insert item 6 -> must insert directly before item 7
  const res6 = processSpreadsheetSync(spreadsheet, { item_number: "006", title: "Item Six", shop_name: "testShop" });
  assert.equal(res6[0].action, "inserted_in_order");
  assert.equal(res6[0].row, 3);

  assert.equal(sheet.rows.length, 4);
  assert.equal(sheet.rows[1][0], "001");
  assert.equal(sheet.rows[2][0], "006");
  assert.equal(sheet.rows[3][0], "007");
});

test("Google Sheets sync: multi-shop tab routing and auto-creating tabs", () => {
  const spreadsheet = createSpreadsheetMock();

  processSpreadsheetSync(spreadsheet, {
    item_number: "001",
    title: "Item in Shop 1",
    shop_name: "testingFolder1",
  });
  assert.ok(spreadsheet.getSheetByName("testingFolder1"));

  processSpreadsheetSync(spreadsheet, {
    item_number: "001",
    title: "Item in Shop 2",
    shop_name: "",
    workspace_name: "PhoneCases",
    folder_name: "[001] Case",
  });
  assert.ok(spreadsheet.getSheetByName("PhoneCases"));

  const sheet1 = spreadsheet.getSheetByName("testingFolder1")!;
  const sheet2 = spreadsheet.getSheetByName("PhoneCases")!;

  assert.equal(sheet1.rows[1][1], "Item in Shop 1");
  assert.equal(sheet2.rows[1][1], "Item in Shop 2");
});
