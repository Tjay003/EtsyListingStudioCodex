# Google Sheets Multi-Shop Integration Guide (v2)

This guide explains how to connect Etsy Listing Studio to Google Sheets with automatic multi-shop tab routing, automatic tab creation, row deduplication (updates existing rows in place), and in-order numerical insertion (e.g., item `6` is placed directly above item `7`).

---

## 1. Features

- **Multi-Shop Tab Routing**: Automatically routes listings to the sheet tab matching your **Shop Name** (e.g. `testingFolder1`). If no shop name is set, it falls back to the product's parent **folder name**.
- **Automatic Tab Creation**: If the target shop tab does not exist in your spreadsheet, it **automatically creates a new tab with styled, frozen headers**. You do NOT have to create sheets manually!
- **Default Sheet1 Auto-Rename**: If your workbook starts with a blank `Sheet1`, it renames `Sheet1` to your shop name on the first sync so you don't end up with empty leftover tabs.
- **Row Deduplication / In-Place Update**: If you re-sync an item (e.g. Item #001), it updates the existing row in-place rather than creating a duplicate row.
- **In-Order Sorted Placement**: If you sync item #7, and later sync item #6, item #6 is inserted directly above item #7 so your sheet stays in 1, 2, 3, 4, 5, 6, 7 numerical order.
- **Automatic Fallback Sorting**: Keeps all data rows strictly ascending by Item # per shop tab.

---

## 2. Setup Instructions (5-Minute Step-by-Step)

### Step 1: Open Google Sheets
1. Create a new Google Spreadsheet or open your existing listing tracker sheet.
2. In the top navigation menu, click **Extensions** > **Apps Script**.

### Step 2: Paste the Webhook Script
1. Delete any sample code inside the Apps Script code editor.
2. Copy the complete script from [scripts/google-sheets-apps-script.js](../scripts/google-sheets-apps-script.js) (or click **Copy Webhook Script** in the Studio Settings modal).
3. Paste it into the editor and click the **Save** icon (diskette).

### Step 3: Deploy as Web App
1. In the top right corner of Apps Script, click the blue **Deploy** button > **New deployment**.
2. Click the gear icon next to "Select type" and choose **Web app**.
3. Configure the deployment settings:
   - **Description**: `Etsy Listing Studio Sync`
   - **Execute as**: `Me (<your-email>)`
   - **Who has access**: `Anyone` *(Crucial: must be "Anyone" so your local Next.js studio can post to it)*
4. Click **Deploy**.
5. If prompted by Google for authorization:
   - Click **Authorize access**
   - Select your Google account
   - Click **Advanced** > **Go to Untitled project (unsafe)**
   - Click **Allow**
6. Copy the generated **Web app URL** (format: `https://script.google.com/macros/s/.../exec`).

### Step 4: Add Webhook to Etsy Listing Studio
1. Open Etsy Listing Studio.
2. Click **Workspace Settings** (gear icon).
3. Under **Integrations & Webhooks**, paste the URL into **Google Sheets Webhook URL**.
4. Set your **Shop name** (e.g. `testingFolder1`).
5. Click **Save workspace voice**.

---

## 3. How to Sync Listings

- **Single Product**: Click the green **Sync to Sheets** button on the product toolbar or in the handoff card.
- **Bulk Selection**: Select multiple products in the left sidebar and click **Sync (N)** in the sidebar footer.
