# Etsy Listing Studio — Automated Copywriting Workflow

An automated, privacy-first studio that transforms raw product photos and supplier data into ready-to-publish Etsy listings using AI.

---

## 1. How It Works (Simple Overview)

```mermaid
graph LR
    A["📁 1. Your Product Folders<br/>(Photos & Specs)"] --> B["🖥️ 2. Studio Dashboard<br/>(Select & Customize)"]
    B --> C["⚡ 3. AI Automation<br/>(Researches & Writes Copy)"]
    C --> D["📋 4. Ready Etsy Listing<br/>(Title, Tags, Story & Specs)"]
    D --> E["✅ 5. Review & Approve<br/>(Instant 1-Click Approval)"]
```

---

## 2. Step-by-Step User Journey

```mermaid
sequenceDiagram
    autonumber
    actor User as 👤 Seller / Operator
    participant UI as 🖥️ Studio App
    participant AI as 🤖 AI Copywriter
    participant Files as 💾 Your Computer

    User->>UI: 1. Opens product folder & picks best photo
    User->>UI: 2. Clicks "Queue Products for AI"
    UI->>Files: 3. Saves task locally on your PC
    User->>AI: 4. Triggers AI ("Process my queued jobs")
    AI->>Files: 5. Reads supplier specs & brand voice
    AI->>AI: 6. Generates SEO title, 13 tags, and story description
    AI->>Files: 7. Saves completed listing draft (v1)
    UI-->>User: 8. Displays preview for instant review
    User->>UI: 9. Clicks "Approve" (or requests 1-click tweak)
```

---

## 3. Key Features & Business Benefits

| Feature | What It Does | Why It Matters |
| :--- | :--- | :--- |
| **🔒 100% Local & Private** | All photos and data stay on your computer. | No cloud monthly database costs, zero data leaks. |
| **🎯 Zero Hallucinations** | AI only writes facts found in your files. | Prevents fake product claims and customer returns. |
| **📈 SEO Optimized** | Formats titles & 13 tags within Etsy's strict rules. | Ranks higher on Etsy, Google, and Pinterest. |
| **🔄 Version History** | Keeps every draft so you can compare and tweak. | Never lose previous copywriting versions. |
| **⚡ Human in the Loop** | You retain 100% final approval on price & copy. | Perfect balance of speed and brand quality. |

---

## 4. What The AI Delivers For Each Product

```text
📁 Your Product Folder
└── 📂 studio_outputs/copywriting/v0001/
    ├── 📄 listing.json   → Etsy Title, Category, 13 SEO Tags, and Description
    ├── 📄 evidence.json  → Fact matrix proving every claim from your supplier data
    └── 📄 review.json    → Your approval status (Approved / Needs Review)
```

---

## 5. Google Sheets Export & Multi-Shop Tracking

```mermaid
graph LR
    A["✅ Approved / Draft Listing<br/>(Studio Dashboard)"] --> B["⚡ 1-Click 'Sync to Sheets'"]
    B --> C["🌐 Webhook API Route<br/>(/api/local/export/google-sheets)"]
    C --> D["📊 Google Apps Script Webhook<br/>(Auto-creates & sorts shop tabs)"]
    D --> E["📋 Interactive Google Sheet Table<br/>(Checkboxes, Status Dropdowns, Upsert)"]
```

- **Multi-Shop Tabs**: Automatically routes to the shop's tab (e.g. `testingFolder1`), creating and formatting new tabs on demand.
- **In-Place Updates**: Re-syncs update existing rows in-place rather than creating duplicates.
- **In-Order Sorting**: Maintains strict numerical ordering (e.g. inserting item 6 automatically places it above item 7).
- **Interactive Controls**: Column 4 has clickable checkboxes for `Edited Photo Ready?`; Column 5 has native dropdown options (`Draft`, `Approved`, `Published`, `Archived`, `Rejected`).

