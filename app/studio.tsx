"use client";

/* eslint-disable @next/next/no-img-element, react-hooks/set-state-in-effect, react-hooks/exhaustive-deps -- product selection intentionally synchronizes editor state */

import {
  AlertTriangle,
  ArchiveRestore,
  ArrowRight,
  BadgeCheck,
  BookOpenText,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  Clock3,
  Copy,
  ExternalLink,
  FileSpreadsheet,
  FolderOpen,
  HardDrive,
  Hash,
  ImageIcon,
  ListChecks,
  LoaderCircle,
  Maximize2,
  RefreshCw,
  Search,
  Settings2,
  ShieldAlert,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  CopywritingJobV1,
  CopywritingResultV1,
  ImageRole,
  ProductReviewStateV1,
  ProductSnapshotV1,
  WorkspaceCopywritingSettingsV1,
} from "@/lib/contracts";
import type { TrashEntryV1 } from "@/lib/product-store";
import { GOOGLE_APPS_SCRIPT_TEMPLATE } from "@/lib/google-apps-script-template";

type WorkspacePayload = {
  active_root: string | null;
  active_name: string | null;
  recent_roots: string[];
};

type ResultBundle = {
  result: CopywritingResultV1;
  review: ProductReviewStateV1 | null;
};

type LibraryFilter =
  | "all"
  | "unlisted"
  | "listed"
  | "review"
  | "duplicates"
  | "rejected"
  | "trash";
type CenterView = "evidence" | "results";
type CompanionView = "images" | "evidence" | "tweak";
type TweakField = "title" | "description" | "tags" | "category";

const TWEAK_FIELDS: TweakField[] = ["title", "description", "tags", "category"];

type SettingsPayload = {
  settings: WorkspaceCopywritingSettingsV1;
};

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const body = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(body.error || "The local operation failed.");
  }
  return body;
}

function pathBasename(pathString: string) {
  const parts = pathString.split(/[/\\]/).filter(Boolean);
  return parts[parts.length - 1] || pathString;
}

function shortFolder(value: string) {
  if (value.length <= 48) return value;
  return `…${value.slice(-47)}`;
}

function jobLabel(job: CopywritingJobV1) {
  const folder = job.product.relative_folder
    ? pathBasename(job.product.relative_folder)
    : "";
  const folderSuffix = folder ? ` (${folder})` : "";
  if (job.task.kind === "copywriting.tweak") {
    return `Tweak ${job.task.fields.join(", ")}${folderSuffix}`;
  }
  return `Create listing copy${folderSuffix}`;
}

function tagsText(result: CopywritingResultV1) {
  return result.listing.tags.join(", ");
}

function fullListingText(result: CopywritingResultV1) {
  return [
    "TITLE:",
    result.listing.title,
    "",
    "CATEGORY:",
    result.listing.category,
    "",
    "TAGS:",
    tagsText(result),
    "",
    "DESCRIPTION:",
    result.listing.description,
    "",
  ].join("\n");
}

function readableValue(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map(readableValue).filter(Boolean).join(", ");
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    if ("message" in record) return readableValue(record.message);
    if ("resolution" in record) return readableValue(record.resolution);
    if ("value" in record) return readableValue(record.value);
    return Object.entries(record)
      .map(([key, entry]) => `${key}: ${readableValue(entry)}`)
      .join("; ");
  }
  return String(value);
}

function conflictTitle(conflict: unknown): string {
  if (conflict && typeof conflict === "object" && "field" in conflict) {
    return `Source conflict: ${readableValue((conflict as { field?: unknown }).field)}`;
  }
  return "Source conflict";
}

function isImageSourcePath(value: string | null) {
  return Boolean(value && /\.(avif|gif|jpe?g|png|webp)$/i.test(value));
}

function sizedImageUrl(image: { imageUrl: string }, width: number) {
  const separator = image.imageUrl.includes("?") ? "&" : "?";
  return `${image.imageUrl}${separator}w=${width}`;
}

export function Studio() {
  const [workspace, setWorkspace] = useState<WorkspacePayload>({
    active_root: null,
    active_name: null,
    recent_roots: [],
  });
  const [products, setProducts] = useState<ProductSnapshotV1[]>([]);
  const [trash, setTrash] = useState<TrashEntryV1[]>([]);
  const [jobs, setJobs] = useState<CopywritingJobV1[]>([]);
  const [copySettings, setCopySettings] =
    useState<WorkspaceCopywritingSettingsV1 | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<LibraryFilter>("all");
  const [centerView, setCenterView] = useState<CenterView>("evidence");
  const [galleryRole, setGalleryRole] = useState<ImageRole>("main");
  const [activeImageId, setActiveImageId] = useState<string | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [workspaceDialog, setWorkspaceDialog] = useState(false);
  const [workspacePath, setWorkspacePath] = useState("");
  const [instruction, setInstruction] = useState("");
  const [noteDraft, setNoteDraft] = useState("");
  const [results, setResults] = useState<ResultBundle[]>([]);
  const [activeResultId, setActiveResultId] = useState<string | null>(null);
  const [tweakFields, setTweakFields] = useState<TweakField[]>(["title"]);
  const [tweakInstruction, setTweakInstruction] = useState("");
  const [busy, setBusy] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const [companionView, setCompanionView] = useState<CompanionView>("images");
  const [scriptCopied, setScriptCopied] = useState(false);
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");

  const notify = (message: string) => {
    setError("");
    setToast(message);
  };

  const report = (cause: unknown) => {
    setToast("");
    setError(cause instanceof Error ? cause.message : "Something went wrong.");
  };

  const copyAppsScript = async () => {
    try {
      await navigator.clipboard.writeText(GOOGLE_APPS_SCRIPT_TEMPLATE);
      setScriptCopied(true);
      notify("Google Apps Script (v2) copied to clipboard!");
      setTimeout(() => setScriptCopied(false), 2500);
    } catch {
      notify("Failed to copy script to clipboard.");
    }
  };

  const loadWorkspace = useCallback(async () => {
    const data = await requestJson<WorkspacePayload>("/api/local/workspaces");
    setWorkspace(data);
    if (data.active_root) setWorkspacePath(data.active_root);
    return data;
  }, []);

  const loadProducts = useCallback(async () => {
    const data = await requestJson<{
      products: ProductSnapshotV1[];
      trash: TrashEntryV1[];
    }>("/api/local/products");
    setProducts(data.products);
    setTrash(data.trash);
    setActiveId((current) => {
      if (current && data.products.some((product) => product.instanceId === current)) {
        return current;
      }
      return data.products[0]?.instanceId ?? null;
    });
    return data.products;
  }, []);

  const loadJobs = useCallback(async () => {
    const data = await requestJson<{ jobs: CopywritingJobV1[] }>(
      "/api/local/jobs",
    );
    setJobs(data.jobs);
  }, []);

  const loadSettings = useCallback(async () => {
    const data = await requestJson<SettingsPayload>(
      "/api/local/workspace-settings",
    );
    setCopySettings(data.settings);
    return data.settings;
  }, []);

  const refreshAll = useCallback(async () => {
    if (!workspace.active_root) return;
    await Promise.all([loadProducts(), loadJobs(), loadSettings()]);
  }, [loadJobs, loadProducts, loadSettings, workspace.active_root]);

  useEffect(() => {
    void loadWorkspace()
      .then((current) => {
        if (!current.active_root) {
          setWorkspaceDialog(true);
          return;
        }
        return Promise.all([loadProducts(), loadJobs(), loadSettings()]);
      })
      .catch(report);
  }, [loadJobs, loadProducts, loadSettings, loadWorkspace]);

  useEffect(() => {
    if (!workspace.active_root) return;
    const timer = window.setInterval(() => {
      void Promise.all([loadProducts(), loadJobs()]).catch(() => undefined);
    }, 4000);
    return () => window.clearInterval(timer);
  }, [loadJobs, loadProducts, workspace.active_root]);

  const activeProduct =
    products.find((product) => product.instanceId === activeId) ?? null;

  useEffect(() => {
    setNoteDraft(activeProduct?.notes ?? "");
    setGalleryRole("main");
    setActiveImageId(
      activeProduct?.images.find(
        (image) => image.relativePath === activeProduct.referenceImage,
      )?.id ??
        activeProduct?.images[0]?.id ??
        null,
    );
    setCenterView(
      activeProduct?.results.length ? "results" : "evidence",
    );
  }, [activeProduct?.instanceId]);

  useEffect(() => {
    if (!activeProduct) return;
    const toPreload = activeProduct.images
      .filter((img) => img.exists)
      .slice(0, 8);
    for (const img of toPreload) {
      const thumb = new Image();
      thumb.src = sizedImageUrl(img, 120);
      if (
        img.role === "main" ||
        img.relativePath === activeProduct.referenceImage
      ) {
        const hero = new Image();
        hero.src = sizedImageUrl(img, 960);
      }
    }
  }, [activeProduct?.instanceId]);

  const prefetchProduct = useCallback((product: ProductSnapshotV1) => {
    const cover =
      product.images.find(
        (img) => img.relativePath === product.referenceImage && img.exists,
      ) ?? product.images.find((img) => img.role === "main" && img.exists);
    if (cover) {
      const hero = new Image();
      hero.src = sizedImageUrl(cover, 960);
    }
  }, []);

  const loadResults = useCallback(async (instanceId: string) => {
    const data = await requestJson<{ results: ResultBundle[] }>(
      `/api/local/products/${encodeURIComponent(instanceId)}/results`,
    );
    setResults(data.results);
    setActiveResultId((current) => {
      if (
        current &&
        data.results.some((bundle) => bundle.result.result_id === current)
      ) {
        return current;
      }
      return data.results[0]?.result.result_id ?? null;
    });
  }, []);

  useEffect(() => {
    if (!activeProduct?.instanceId || activeProduct.results.length === 0) {
      setResults([]);
      setActiveResultId(null);
      return;
    }
    void loadResults(activeProduct.instanceId).catch(report);
  }, [
    activeProduct?.instanceId,
    activeProduct?.results.length,
    loadResults,
  ]);

  const selectedProducts = products.filter(
    (product) => product.selected && !product.rejected,
  );
  const selectedSourceKeys = selectedProducts
    .map((product) => product.sourceKey)
    .filter(Boolean) as string[];
  const duplicateSelection =
    new Set(selectedSourceKeys).size !== selectedSourceKeys.length;
  const unnumberedCount = products.filter(
    (product) => !product.item_number || product.item_number === "",
  ).length;

  const filteredProducts = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return products.filter((product) => {
      const matchesQuery =
        !query ||
        product.title.toLocaleLowerCase().includes(query) ||
        product.folderName.toLocaleLowerCase().includes(query) ||
        product.collection.toLocaleLowerCase().includes(query) ||
        product.sourceProductId.includes(query);
      const matchesFilter =
        filter === "all" ||
        (filter === "unlisted" && product.results.length === 0) ||
        (filter === "listed" && product.results.length > 0) ||
        (filter === "review" &&
          (product.metadataError ||
            product.missingImages.length > 0 ||
            product.results.some((result) => result.reviewStatus === "needs_review"))) ||
        (filter === "duplicates" && product.duplicateCount > 1) ||
        (filter === "rejected" && product.rejected);
      return matchesQuery && matchesFilter;
    });
  }, [filter, products, search]);
  const visibleSelectableProducts = filteredProducts.filter(
    (product) => !product.rejected,
  );
  const visibleWithoutListings = visibleSelectableProducts.filter(
    (product) => product.results.length === 0,
  );
  const visibleWithListings = visibleSelectableProducts.filter(
    (product) => product.results.length > 0,
  );
  const visibleSelectedCount = visibleSelectableProducts.filter(
    (product) => product.selected,
  ).length;

  const galleryImages =
    activeProduct?.images.filter((image) => image.role === galleryRole) ?? [];
  const activeImage =
    activeProduct?.images.find((image) => image.id === activeImageId) ??
    galleryImages[0] ??
    activeProduct?.images[0] ??
    null;
  const activeResult =
    results.find((bundle) => bundle.result.result_id === activeResultId) ??
    results[0] ??
    null;
  const resultEvidenceImagePaths = new Set(
    activeResult?.result.evidence
      .map((entry) => entry.source_path)
      .filter(isImageSourcePath) ?? [],
  );
  const resultInspectedImagePaths = new Set(
    activeResult?.result.inspected_images.map((image) => image.relative_path) ??
      [],
  );
  const companionImages =
    activeProduct?.images.filter(
      (image) =>
        resultInspectedImagePaths.has(image.relativePath) ||
        resultEvidenceImagePaths.has(image.relativePath),
    ) ?? [];
  const referenceImage = activeProduct?.images.find(
    (image) => image.relativePath === activeProduct?.referenceImage,
  );
  const companionAllImages = activeProduct?.images ?? [];
  const companionVariationImages =
    activeProduct?.images.filter((image) => image.role === "variation") ?? [];
  const companionDimensionImages =
    activeProduct?.images.filter((image) =>
      activeResult?.result.evidence.some(
        (entry) =>
          entry.source_path === image.relativePath &&
          entry.field.toLocaleLowerCase().includes("dimension"),
      ),
    ) ?? [];
  const companionPrimaryImages = [
    ...(referenceImage ? [referenceImage] : []),
    ...companionImages.filter(
      (image) => image.relativePath !== referenceImage?.relativePath,
    ),
  ];

  useEffect(() => {
    setDescriptionExpanded(false);
    setCompanionView("images");
  }, [activeResultId]);

  const openWorkspace = async (action: "pick" | "open", selectedPath?: string) => {
    setBusy("workspace");
    try {
      const data = await requestJson<
        WorkspacePayload & { cancelled?: boolean; product_count?: number }
      >("/api/local/workspaces", {
        method: "POST",
        body: JSON.stringify({ action, path: selectedPath }),
      });
      if (data.cancelled) return;
      setWorkspace(data);
      setWorkspacePath(data.active_root ?? "");
      setWorkspaceDialog(false);
      await Promise.all([loadProducts(), loadJobs(), loadSettings()]);
      notify(`${data.product_count ?? 0} product folders discovered.`);
    } catch (cause) {
      report(cause);
    } finally {
      setBusy("");
    }
  };

  const patchProduct = async (
    instanceId: string,
    patch: Record<string, unknown>,
  ) => {
    const data = await requestJson<{ product: ProductSnapshotV1 }>(
      `/api/local/products/${encodeURIComponent(instanceId)}`,
      { method: "PATCH", body: JSON.stringify(patch) },
    );
    setProducts((current) =>
      current.map((product) =>
        product.instanceId === instanceId ? data.product : product,
      ),
    );
    return data.product;
  };

  const syncToGoogleSheets = async (target: string | string[]) => {
    try {
      setBusy("sync-sheets");
      const isArray = Array.isArray(target);
      const instanceIds = isArray ? target : [target];
      if (!instanceIds.length) {
        notify("No products selected to sync.");
        return;
      }
      const data = await requestJson<{ message?: string }>(
        "/api/local/export/google-sheets",
        {
          method: "POST",
          body: JSON.stringify(
            isArray ? { instanceIds } : { instanceId: target },
          ),
        },
      );
      notify(data.message || "Synced listing(s) to Google Sheets successfully!");
    } catch (cause) {
      report(cause);
    } finally {
      setBusy("");
    }
  };

  const handleAutoNumberAll = async () => {
    try {
      setBusy("auto-number");
      const data = await requestJson<{ message?: string; assignedCount?: number }>(
        "/api/local/products/auto-number",
        { method: "POST" },
      );
      await loadProducts();
      notify(data.message || "Assigned sequential item numbers successfully.");
    } catch (cause) {
      report(cause);
    } finally {
      setBusy("");
    }
  };

  const toggleProduct = async (product: ProductSnapshotV1) => {
    try {
      await patchProduct(product.instanceId, { selected: !product.selected });
    } catch (cause) {
      report(cause);
    }
  };

  const bulkSetSelection = async (
    targetProducts: ProductSnapshotV1[],
    selected: boolean,
    label: string,
  ) => {
    const targets = targetProducts.filter(
      (product) => !product.rejected && product.selected !== selected,
    );
    if (!targets.length) {
      notify(`No visible products to ${selected ? "select" : "clear"}.`);
      return;
    }
    setBusy(`bulk-${label}`);
    try {
      await Promise.all(
        targets.map((product) =>
          patchProduct(product.instanceId, { selected }),
        ),
      );
      await loadProducts();
      notify(
        `${targets.length} product${targets.length === 1 ? "" : "s"} ${
          selected ? "selected" : "cleared"
        }.`,
      );
    } catch (cause) {
      report(cause);
    } finally {
      setBusy("");
    }
  };

  const saveNotes = async () => {
    if (!activeProduct || noteDraft === activeProduct.notes) return;
    try {
      await patchProduct(activeProduct.instanceId, { notes: noteDraft });
      notify("Product note saved locally.");
    } catch (cause) {
      report(cause);
    }
  };

  const queueJobs = async () => {
    if (duplicateSelection) {
      report(new Error("Choose only one folder from each duplicate group."));
      return;
    }
    setBusy("queue");
    try {
      const data = await requestJson<{
        batch: { batch_id: string };
        jobs: CopywritingJobV1[];
      }>("/api/local/jobs", {
        method: "POST",
        body: JSON.stringify({
          instanceIds: selectedProducts.map((product) => product.instanceId),
          instruction,
        }),
      });
      setInstruction("");
      await loadJobs();
      notify(
        `${data.jobs.length} copywriting job${data.jobs.length === 1 ? "" : "s"} queued. Ask Codex to process queued jobs.`,
      );
    } catch (cause) {
      report(cause);
    } finally {
      setBusy("");
    }
  };

  const updateCopySetting = (
    key: keyof WorkspaceCopywritingSettingsV1,
    value: string | boolean,
  ) => {
    setCopySettings((current) =>
      current ? { ...current, [key]: value } : current,
    );
  };

  const saveCopySettings = async () => {
    if (!copySettings) return;
    setBusy("settings");
    try {
      const data = await requestJson<SettingsPayload>(
        "/api/local/workspace-settings",
        {
          method: "PATCH",
          body: JSON.stringify(copySettings),
        },
      );
      setCopySettings(data.settings);
      notify("Workspace copywriting memory saved.");
    } catch (cause) {
      report(cause);
    } finally {
      setBusy("");
    }
  };

  const resetCopySettings = async () => {
    setBusy("settings");
    try {
      const data = await requestJson<SettingsPayload>(
        "/api/local/workspace-settings",
        { method: "DELETE" },
      );
      setCopySettings(data.settings);
      notify("Workspace voice reset to a fresh, non-branded default.");
    } catch (cause) {
      report(cause);
    } finally {
      setBusy("");
    }
  };

  const copyToClipboard = async (label: string, value: string) => {
    const text = value.trim();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      notify(`${label} copied to clipboard.`);
    } catch {
      report(new Error("Clipboard copy failed. Select the text and copy it manually."));
    }
  };

  const jobAction = async (job: CopywritingJobV1, action: "cancel" | "retry") => {
    try {
      await requestJson(`/api/local/jobs/${encodeURIComponent(job.job_id)}`, {
        method: "PATCH",
        body: JSON.stringify({ action }),
      });
      await loadJobs();
      notify(action === "cancel" ? "Cancellation requested." : "Job re-queued.");
    } catch (cause) {
      report(cause);
    }
  };

  const reviewResult = async (status: "approved" | "rejected") => {
    if (!activeProduct || !activeResult) return;
    try {
      await requestJson(
        `/api/local/products/${encodeURIComponent(activeProduct.instanceId)}/review`,
        {
          method: "POST",
          body: JSON.stringify({
            resultId: activeResult.result.result_id,
            status,
          }),
        },
      );
      await Promise.all([
        loadResults(activeProduct.instanceId),
        loadProducts(),
      ]);
      notify(status === "approved" ? "Listing approved." : "Listing rejected.");
    } catch (cause) {
      report(cause);
    }
  };

  const queueTweak = async () => {
    if (!activeProduct || !activeResult) return;
    setBusy("tweak");
    try {
      await requestJson(
        `/api/local/products/${encodeURIComponent(activeProduct.instanceId)}/tweaks`,
        {
          method: "POST",
          body: JSON.stringify({
            parentResultId: activeResult.result.result_id,
            fields: tweakFields,
            instruction: tweakInstruction,
          }),
        },
      );
      setTweakInstruction("");
      await loadJobs();
      notify("Targeted copy tweak queued without an image rescan.");
    } catch (cause) {
      report(cause);
    } finally {
      setBusy("");
    }
  };

  const moveToTrash = async () => {
    if (!activeProduct) return;
    const confirmed = window.confirm(
      `Move "${activeProduct.title}" to the recoverable Studio trash?`,
    );
    if (!confirmed) return;
    try {
      await requestJson(
        `/api/local/products/${encodeURIComponent(activeProduct.instanceId)}`,
        { method: "DELETE" },
      );
      await loadProducts();
      notify("Product moved to local Studio trash.");
    } catch (cause) {
      report(cause);
    }
  };

  const restoreTrash = async (entry: TrashEntryV1) => {
    try {
      await requestJson(
        `/api/local/products/${encodeURIComponent(entry.instanceId)}/restore`,
        { method: "POST" },
      );
      await loadProducts();
      notify("Product restored to its original folder.");
    } catch (cause) {
      report(cause);
    }
  };

  return (
    <main className="studio-shell">
      <header className="topbar">
        <div className="brand">
          <span>
            <strong>Etsy Listing Studio</strong>
            <small>Local workspace</small>
          </span>
        </div>

        <nav aria-label="Workspace views">
          <button
            className={centerView === "evidence" ? "nav-item is-active" : "nav-item"}
            onClick={() => setCenterView("evidence")}
            type="button"
          >
            Review
          </button>
          <button
            className={centerView === "results" ? "nav-item is-active" : "nav-item"}
            onClick={() => setCenterView("results")}
            type="button"
          >
            Listings <span>{activeProduct?.results.length ?? 0}</span>
          </button>
        </nav>

        <div className="top-actions">
          <button
            className="workspace-settings-btn"
            onClick={() => setSettingsModalOpen(true)}
            title="Workspace Settings & Google Sheets Webhook"
            type="button"
          >
            <Settings2 size={13} />
            <span>Workspace Settings</span>
          </button>
          <span className="local-pill">
            <HardDrive size={13} /> Local only
          </span>
          <button
            className="icon-button"
            onClick={() => void refreshAll().catch(report)}
            aria-label="Refresh workspace"
            type="button"
          >
            <RefreshCw size={16} />
          </button>
        </div>
      </header>

      <section className="workspace-grid">
        <aside className="library-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Workspace</span>
              <h2>Product library</h2>
            </div>
            {unnumberedCount > 0 && (
              <button
                className="auto-number-btn"
                onClick={() => void handleAutoNumberAll()}
                disabled={busy === "auto-number"}
                title={`Assign sequential item numbers to ${unnumberedCount} unnumbered products`}
                type="button"
              >
                {busy === "auto-number" ? (
                  <LoaderCircle className="spin" size={11} />
                ) : (
                  <Hash size={11} />
                )}
                <span>Auto-number ({unnumberedCount})</span>
              </button>
            )}
          </div>

          <button
            className="workspace-card"
            onClick={() => setWorkspaceDialog(true)}
            data-testid="workspace-button"
            type="button"
          >
            <span className="workspace-icon">
              <HardDrive size={17} />
            </span>
            <span>
              <strong>{workspace.active_name ?? "Choose a folder"}</strong>
              <small>
                {workspace.active_root
                  ? shortFolder(workspace.active_root)
                  : "No product root selected"}
              </small>
            </span>
            <ChevronDown size={14} />
          </button>

          <label className="search-field">
            <Search size={15} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search products"
              aria-label="Search products"
            />
            <kbd>{products.length}</kbd>
          </label>

          <div className="filter-row" aria-label="Product filters">
            {(
              [
                ["all", "All"],
                ["unlisted", "No listings"],
                ["listed", "Has listings"],
                ["review", "Review"],
                ["duplicates", "Duplicates"],
                ["rejected", "Rejected"],
                ["trash", "Trash"],
              ] as Array<[LibraryFilter, string]>
            ).map(([value, label]) => (
              <button
                className={filter === value ? "is-active" : ""}
                key={value}
                onClick={() => setFilter(value)}
                type="button"
              >
                {label}
              </button>
            ))}
          </div>

          <div className="product-list" data-testid="product-list">
            {filter === "trash" ? (
              trash.length ? (
                trash.map((entry) => (
                  <article className="trash-row" key={entry.instanceId}>
                    <div>
                      <span className="product-folder-tag" title={entry.originalRelativeFolder}>
                        <FolderOpen size={10} />
                        <span>{pathBasename(entry.originalRelativeFolder)}</span>
                      </span>
                      <strong>{entry.title}</strong>
                      <small>{entry.originalRelativeFolder}</small>
                    </div>
                    <button
                      onClick={() => void restoreTrash(entry)}
                      aria-label={`Restore ${entry.title}`}
                      type="button"
                    >
                      <ArchiveRestore size={14} />
                    </button>
                  </article>
                ))
              ) : (
                <div className="empty-list">Studio trash is empty.</div>
              )
            ) : filteredProducts.length ? (
              filteredProducts.map((product) => {
                const cover = product.images.find(
                  (image) =>
                    image.relativePath === product.referenceImage && image.exists,
                );
                return (
                  <article
                    className={`product-row ${
                      product.instanceId === activeId ? "is-active" : ""
                    } ${product.rejected ? "is-rejected" : ""}`}
                    key={product.instanceId}
                  >
                    <label className="check-control">
                      <input
                        checked={product.selected}
                        disabled={product.rejected}
                        onChange={() => void toggleProduct(product)}
                        type="checkbox"
                        aria-label={`Select ${product.title}`}
                      />
                      <span>
                        <Check size={11} />
                      </span>
                    </label>
                    <button
                      className="product-select"
                      onClick={() => setActiveId(product.instanceId)}
                      onMouseEnter={() => prefetchProduct(product)}
                      data-testid={`product-${product.instanceId}`}
                      type="button"
                    >
                      {cover ? (
                        <img
                          src={sizedImageUrl(cover, 96)}
                          alt=""
                          loading="lazy"
                          decoding="async"
                        />
                      ) : (
                        <span className="image-placeholder">
                          <ImageIcon size={17} />
                        </span>
                      )}
                      <span className="product-copy">
                        <span className="product-folder-tag" title={product.relativeFolder}>
                          <FolderOpen size={10} />
                          <span>{product.folderName}</span>
                        </span>
                        <strong title={product.title}>{product.title}</strong>
                        <small title={product.relativeFolder}>{product.relativeFolder}</small>
                        <span className="row-badges">
                          {product.item_number != null && (
                            <span className="mini-badge item-no">
                              #{product.item_number}
                            </span>
                          )}
                          <span
                            className={`mini-badge photos-${
                              product.edited_photos_ready ? "ready" : "pending"
                            }`}
                          >
                            {product.edited_photos_ready
                              ? "Photos Ready"
                              : "Photos Pending"}
                          </span>
                          {product.published && (
                            <span className="mini-badge published">
                              Published
                            </span>
                          )}
                          {product.duplicateCount > 1 && (
                            <span className="mini-badge duplicate">
                              Duplicate
                            </span>
                          )}
                          {product.results[0] && (
                            <span className="mini-badge result">
                              v{product.results[0].version}
                            </span>
                          )}
                          {product.metadataError && (
                            <span className="mini-badge warning">Invalid</span>
                          )}
                        </span>
                      </span>
                    </button>
                  </article>
                );
              })
            ) : (
              <div className="empty-list">
                No matching products.
              </div>
            )}
          </div>

          <footer className="library-footer">
            <span>
              <strong>{selectedProducts.length} selected</strong>
              <small>
                {filter === "trash"
                  ? `${trash.length} in trash`
                  : `${filteredProducts.length} visible · ${products.length} discovered`}
              </small>
            </span>
            {filter !== "trash" && (
              <div className="bulk-actions" aria-label="Bulk selection">
                <button
                  disabled={!visibleSelectableProducts.length || busy.startsWith("bulk-")}
                  onClick={() =>
                    void bulkSetSelection(
                      visibleSelectableProducts,
                      true,
                      "visible",
                    )
                  }
                  type="button"
                >
                  Select visible
                </button>
                <button
                  disabled={!visibleWithoutListings.length || busy.startsWith("bulk-")}
                  onClick={() =>
                    void bulkSetSelection(
                      visibleWithoutListings,
                      true,
                      "unlisted",
                    )
                  }
                  type="button"
                >
                  No listings
                </button>
                <button
                  disabled={!visibleWithListings.length || busy.startsWith("bulk-")}
                  onClick={() =>
                    void bulkSetSelection(
                      visibleWithListings,
                      true,
                      "listed",
                    )
                  }
                  type="button"
                >
                  Has listings
                </button>
                <button
                  disabled={!visibleSelectedCount || busy.startsWith("bulk-")}
                  onClick={() =>
                    void bulkSetSelection(
                      visibleSelectableProducts,
                      false,
                      "clear",
                    )
                  }
                  type="button"
                >
                  Clear visible
                </button>
                {visibleSelectedCount > 0 && (
                  <button
                    className="bulk-sync-sheets-btn"
                    disabled={busy.startsWith("bulk-") || busy === "sync-sheets"}
                    onClick={() =>
                      void syncToGoogleSheets(
                        selectedProducts.map((p) => p.instanceId),
                      )
                    }
                    type="button"
                    title={`Sync ${visibleSelectedCount} selected products to Google Sheets`}
                  >
                    {busy === "sync-sheets" ? (
                      <LoaderCircle className="spin" size={12} />
                    ) : (
                      <FileSpreadsheet size={12} />
                    )}
                    Sync ({visibleSelectedCount})
                  </button>
                )}
              </div>
            )}
          </footer>
        </aside>

        {activeProduct ? (
          <section className="product-workspace">
            <div className="product-toolbar">
              <span className="toolbar-folder-path" title={activeProduct.relativeFolder}>
                <FolderOpen size={13} />
                <strong>{activeProduct.folderName}</strong>
                <span className="sep">/</span>
                <span>{activeProduct.relativeFolder}</span>
              </span>
              <div>
                <button
                  className="quiet-button"
                  onClick={() =>
                    void patchProduct(activeProduct.instanceId, {
                      rejected: !activeProduct.rejected,
                      selected: activeProduct.rejected,
                    }).catch(report)
                  }
                  type="button"
                >
                  <CircleAlert size={14} />
                  {activeProduct.rejected ? "Restore to review" : "Reject"}
                </button>
                <button
                  className="quiet-button danger"
                  onClick={() => void moveToTrash()}
                  type="button"
                >
                  <Trash2 size={14} /> Delete
                </button>
              </div>
            </div>

            <header className="product-title">
              <div>
                <div className="product-folder-banner">
                  <span className="folder-pill-large" title={activeProduct.relativeFolder}>
                    <FolderOpen size={12} />
                    <span>Folder: <strong>{activeProduct.folderName}</strong></span>
                  </span>
                  <span className="eyebrow">
                    Source snapshot · {activeProduct.sourceStatus}
                  </span>
                </div>
                <h1>{activeProduct.title}</h1>
                <p>
                  {activeProduct.price && (
                    <span>Supplier price {activeProduct.price}</span>
                  )}
                  {activeProduct.sourceUrl && (
                    <span className="source-link-group">
                      <a
                        className="source-link"
                        href={activeProduct.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open source <ExternalLink size={11} />
                      </a>
                      <button
                        className="source-copy-btn"
                        onClick={() =>
                          void copyToClipboard(
                            "Source URL",
                            activeProduct.sourceUrl,
                          )
                        }
                        type="button"
                        title="Copy source URL"
                        aria-label="Copy source URL"
                      >
                        <Copy size={11} />
                        <span>Copy link</span>
                      </button>
                    </span>
                  )}
                </p>
              </div>
              <div className="title-badges">
                {activeProduct.duplicateCount > 1 && (
                  <span className="warning-pill">
                    <AlertTriangle size={13} />
                    {activeProduct.duplicateCount} snapshots
                  </span>
                )}
                <span className="source-id">
                  {activeProduct.sourceProductId || "Legacy source"}
                </span>
              </div>
            </header>

            <div className="product-lifecycle-bar">
              <div className="lifecycle-left">
                <label className="lifecycle-input-group item-no-input-group" title="Item Number / SKU (e.g. 001)">
                  <span>Item #</span>
                  <input
                    placeholder="001"
                    style={{ width: "65px", fontWeight: 750, color: "var(--accent-primary, #4338ca)" }}
                    value={activeProduct.item_number || ""}
                    onChange={(event) =>
                      void patchProduct(activeProduct.instanceId, {
                        item_number: event.target.value,
                      })
                    }
                  />
                </label>
                <span
                  className={`lifecycle-badge ${
                    activeProduct.edited_photos_ready ? "is-ready" : "is-pending"
                  }`}
                >
                  {activeProduct.edited_photos_ready ? (
                    <BadgeCheck size={13} />
                  ) : (
                    <Clock3 size={13} />
                  )}
                  Edited Photos:{" "}
                  <strong>
                    {activeProduct.edited_photos_ready ? "Ready" : "Pending"}
                  </strong>
                </span>
              </div>

              <div className="lifecycle-controls">
                <label className="lifecycle-input-group">
                  <span>Quotation Price</span>
                  <input
                    placeholder="$0.00"
                    value={activeProduct.quotation_price || ""}
                    onChange={(event) =>
                      void patchProduct(activeProduct.instanceId, {
                        quotation_price: event.target.value,
                      })
                    }
                  />
                </label>

                <button
                  className={`lifecycle-toggle-btn ${
                    activeProduct.published ? "is-published" : ""
                  }`}
                  onClick={() =>
                    void patchProduct(activeProduct.instanceId, {
                      published: !activeProduct.published,
                    })
                  }
                  type="button"
                  title={
                    activeProduct.published
                      ? "Mark as unpublished"
                      : "Mark as published to Etsy"
                  }
                >
                  {activeProduct.published ? (
                    <BadgeCheck size={14} />
                  ) : (
                    <CircleAlert size={14} />
                  )}
                  <span>
                    {activeProduct.published
                      ? "Published to Etsy"
                      : "Draft (Unpublished)"}
                  </span>
                </button>

                <button
                  className="lifecycle-sync-btn"
                  disabled={busy === "sync-sheets"}
                  onClick={() => void syncToGoogleSheets(activeProduct.instanceId)}
                  type="button"
                  title="Sync this listing to Google Sheets via webhook"
                >
                  {busy === "sync-sheets" ? (
                    <LoaderCircle className="spin" size={14} />
                  ) : (
                    <FileSpreadsheet size={14} />
                  )}
                  <span>Sync to Sheets</span>
                </button>
              </div>
            </div>

            {centerView === "evidence" ? (
              <>
                <section className="reference-section">
                  <div className="section-heading">
                    <div>
                      <span className="step-number">01</span>
                      <div>
                        <h3>Review product images</h3>
                        <p>Choose the strongest image as the visual reference.</p>
                      </div>
                    </div>
                    <div className="image-tabs">
                      {(["main", "description", "variation"] as ImageRole[]).map(
                        (role) => (
                          <button
                            className={galleryRole === role ? "is-active" : ""}
                            key={role}
                            onClick={() => {
                              setGalleryRole(role);
                              setActiveImageId(
                                activeProduct.images.find(
                                  (image) => image.role === role,
                                )?.id ?? null,
                              );
                            }}
                            type="button"
                          >
                            {role}{" "}
                            <span>
                              {
                                activeProduct.images.filter(
                                  (image) => image.role === role,
                                ).length
                              }
                            </span>
                          </button>
                        ),
                      )}
                    </div>
                  </div>

                  <div className="image-review">
                    <div className="hero-image">
                      {activeImage?.exists ? (
                        <button
                          className="viewer-trigger"
                          onClick={() => setViewerOpen(true)}
                          type="button"
                          aria-label="Open image viewer"
                        >
                          <img
                            src={sizedImageUrl(activeImage, 960)}
                            alt={activeImage.alt}
                            decoding="async"
                          />
                          <Maximize2 size={17} />
                        </button>
                      ) : (
                        <div className="missing-image">
                          <ImageIcon size={28} /> Image unavailable
                        </div>
                      )}
                      {activeImage?.relativePath === activeProduct.referenceImage && (
                        <span className="reference-ribbon">
                          <BadgeCheck size={14} /> Current reference
                        </span>
                      )}
                    </div>

                    <div className="thumbnail-grid">
                      {galleryImages.map((image) => (
                        <button
                          className={image.id === activeImage?.id ? "is-active" : ""}
                          key={image.id}
                          onClick={() => setActiveImageId(image.id)}
                          type="button"
                          aria-label={`View ${image.fileName}`}
                        >
                          {image.exists ? (
                            <img
                              src={sizedImageUrl(image, 120)}
                              alt=""
                              loading="lazy"
                              decoding="async"
                            />
                          ) : (
                            <ImageIcon size={16} />
                          )}
                          {image.relativePath === activeProduct.referenceImage && (
                            <CheckCircle2 size={16} />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="reference-actions">
                    <span>{activeImage?.relativePath ?? "No image selected"}</span>
                    <button
                      disabled={!activeImage?.exists}
                      onClick={() =>
                        activeImage &&
                        void patchProduct(activeProduct.instanceId, {
                          referenceImage: activeImage.relativePath,
                        })
                          .then(() => notify("Reference image saved."))
                          .catch(report)
                      }
                      type="button"
                    >
                      <BadgeCheck size={14} /> Use as reference
                    </button>
                  </div>
                </section>

                <section className="evidence-section">
                  <div className="section-heading">
                    <div>
                      <span className="step-number">02</span>
                      <div>
                        <h3>Supplier evidence</h3>
                        <p>Explicit source claims are retained with their origin.</p>
                      </div>
                    </div>
                    <span className="evidence-count">
                      {activeProduct.specs.length} specifications
                    </span>
                  </div>

                  {activeProduct.metadataError && (
                    <div className="inline-warning">
                      <ShieldAlert size={16} />
                      {activeProduct.metadataError}
                    </div>
                  )}
                  {activeProduct.missingImages.length > 0 && (
                    <div className="inline-warning">
                      <ImageIcon size={16} />
                      {activeProduct.missingImages.length} declared image
                      {activeProduct.missingImages.length === 1 ? " is" : "s are"} missing.
                    </div>
                  )}

                  <div className="fact-grid">
                    <article className="fact-card" key="local-folder">
                      <span>Local product folder</span>
                      <strong>{activeProduct.folderName}</strong>
                      <small>
                        <FolderOpen size={12} /> {activeProduct.relativeFolder}
                      </small>
                    </article>
                    {activeProduct.specs.map((spec) => (
                      <article className="fact-card" key={spec.label}>
                        <span>{spec.label}</span>
                        <strong>{spec.value || "Not provided"}</strong>
                        <small>
                          <CheckCircle2 size={12} /> Supplier metadata
                        </small>
                      </article>
                    ))}
                    {!activeProduct.specs.length && (
                      <div className="empty-facts">
                        No additional structured supplier specifications were captured.
                      </div>
                    )}
                  </div>
                </section>

                <section className="notes-section">
                  <div>
                    <h3>Detected variations</h3>
                    <p>Variation labels remain evidence, not generated options.</p>
                    <div className="variation-row">
                      {activeProduct.variations.map((variation) => (
                        <span key={`${variation.index}-${variation.name}`}>
                          {variation.exists ? <Check size={12} /> : <X size={12} />}
                          {variation.name}
                        </span>
                      ))}
                      {!activeProduct.variations.length && (
                        <small>No variations detected.</small>
                      )}
                    </div>
                  </div>
                  <label>
                    <span>Special instruction for this product</span>
                    <textarea
                      value={noteDraft}
                      onChange={(event) => setNoteDraft(event.target.value)}
                      onBlur={() => void saveNotes()}
                      placeholder="Keep this concise; Codex reads it with the job."
                    />
                  </label>
                </section>

                {(activeProduct.legacyListing || activeProduct.legacyFacts) && (
                  <details className="legacy-section">
                    <summary>
                      <Clock3 size={14} /> Read-only legacy output
                    </summary>
                    <p>
                      Earlier workflow data is available for reference but will
                      never be overwritten or treated as a current Studio result.
                    </p>
                    <pre>
                      {JSON.stringify(
                        {
                          etsy_listing: activeProduct.legacyListing,
                          product_facts: activeProduct.legacyFacts,
                        },
                        null,
                        2,
                      )}
                    </pre>
                  </details>
                )}
              </>
            ) : (
              <section className="results-workspace">
                {activeResult ? (
                  <>
                    <div className="result-header">
                      <div>
                        <span className="eyebrow">Copywriting history</span>
                        <h2>Version {activeResult.result.version}</h2>
                        <p>
                          {new Date(
                            activeResult.result.created_at,
                          ).toLocaleString()}
                          {activeResult.result.parent_result_id
                            ? " · Targeted tweak"
                            : " · First draft"}
                        </p>
                      </div>
                      <select
                        value={activeResult.result.result_id}
                        onChange={(event) => setActiveResultId(event.target.value)}
                        aria-label="Choose result version"
                      >
                        {results.map((bundle) => (
                          <option
                            key={bundle.result.result_id}
                            value={bundle.result.result_id}
                          >
                            Version {bundle.result.version} ·{" "}
                            {bundle.review?.status ?? "needs_review"}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="result-review-layout">
                      <div className="result-copy-column">
                    <div className="result-review-card">
                      <div className="review-state">
                        <span
                          className={`review-badge ${
                            activeResult.review?.status ?? "needs_review"
                          }`}
                        >
                          {activeResult.review?.status === "approved" ? (
                            <BadgeCheck size={14} />
                          ) : (
                            <CircleAlert size={14} />
                          )}
                          {(activeResult.review?.status ?? "needs_review").replace(
                            "_",
                            " ",
                          )}
                        </span>
                        <div>
                          {activeResult.review?.status !== "approved" && (
                            <button
                              onClick={() => void reviewResult("approved")}
                              type="button"
                            >
                              Approve
                            </button>
                          )}
                          {activeResult.review?.status !== "rejected" && (
                            <button
                              onClick={() => void reviewResult("rejected")}
                              type="button"
                            >
                              {activeResult.review?.status === "approved"
                                ? "Mark rejected"
                                : "Reject"}
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="listing-field">
                        <div className="field-label-row">
                          <span>Title</span>
                          <button
                            onClick={() =>
                              void copyToClipboard(
                                "Title",
                                activeResult.result.listing.title,
                              )
                            }
                            type="button"
                          >
                            <Copy size={13} /> Copy
                          </button>
                        </div>
                        <h3>{activeResult.result.listing.title}</h3>
                        <small>
                          {activeResult.result.listing.title.length}/140 characters
                        </small>
                      </div>
                      <div className="listing-field">
                        <div className="field-label-row">
                          <span>Category</span>
                          <button
                            onClick={() =>
                              void copyToClipboard(
                                "Category",
                                activeResult.result.listing.category,
                              )
                            }
                            type="button"
                          >
                            <Copy size={13} /> Copy
                          </button>
                        </div>
                        <strong>{activeResult.result.listing.category}</strong>
                      </div>
                      <div className="listing-field">
                        <div className="field-label-row">
                          <span>Tags</span>
                          <button
                            onClick={() =>
                              void copyToClipboard(
                                "Tags",
                                tagsText(activeResult.result),
                              )
                            }
                            type="button"
                          >
                            <Copy size={13} /> Copy
                          </button>
                        </div>
                        <div className="tag-list">
                          {activeResult.result.listing.tags.map((tagValue) => (
                            <span key={tagValue}>{tagValue}</span>
                          ))}
                        </div>
                      </div>
                      <div className="listing-field description">
                        <div className="field-label-row">
                          <span>Description</span>
                          <button
                            onClick={() =>
                              void copyToClipboard(
                                "Description",
                                activeResult.result.listing.description,
                              )
                            }
                            type="button"
                          >
                            <Copy size={13} /> Copy
                          </button>
                        </div>
                        <div
                          className={`description-content ${
                            descriptionExpanded ? "is-expanded" : ""
                          }`}
                        >
                          <p>{activeResult.result.listing.description}</p>
                        </div>
                        {activeResult.result.listing.description.length > 520 && (
                          <button
                            className="description-toggle"
                            onClick={() =>
                              setDescriptionExpanded((current) => !current)
                            }
                            type="button"
                          >
                            {descriptionExpanded
                              ? "Collapse description"
                              : "Show full description"}
                          </button>
                        )}
                      </div>
                    </div>

                    {activeResult.review?.status === "approved" ? (
                      <section className="handoff-card">
                        <div>
                          <span className="eyebrow">Approved handoff</span>
                          <h3>Ready to paste into Etsy</h3>
                          <p>
                            Copy each field separately, or grab the full listing
                            bundle for your own records.
                          </p>
                        </div>
                        <div className="handoff-actions">
                          <button
                            onClick={() =>
                              void copyToClipboard(
                                "Full listing",
                                fullListingText(activeResult.result),
                              )
                            }
                            type="button"
                          >
                            <Copy size={15} /> Copy full listing
                          </button>
                          <button
                            onClick={() =>
                              void copyToClipboard(
                                "Title",
                                activeResult.result.listing.title,
                              )
                            }
                            type="button"
                          >
                            Title
                          </button>
                          <button
                            onClick={() =>
                              void copyToClipboard(
                                "Description",
                                activeResult.result.listing.description,
                              )
                            }
                            type="button"
                          >
                            Description
                          </button>
                          <button
                            onClick={() =>
                              void copyToClipboard(
                                "Tags",
                                tagsText(activeResult.result),
                              )
                            }
                            type="button"
                          >
                            Tags
                          </button>
                          <button
                            onClick={() =>
                              void copyToClipboard(
                                "Category",
                                activeResult.result.listing.category,
                              )
                            }
                            type="button"
                          >
                            Category
                          </button>
                          <button
                            className="sync-sheets-btn"
                            disabled={busy === "sync-sheets"}
                            onClick={() =>
                              void syncToGoogleSheets(activeProduct.instanceId)
                            }
                            type="button"
                          >
                            {busy === "sync-sheets" ? (
                              <LoaderCircle className="spin" size={15} />
                            ) : (
                              <FileSpreadsheet size={15} />
                            )}
                            Sync to Sheets
                          </button>
                        </div>
                      </section>
                    ) : (
                      <section className="handoff-card is-locked">
                        <div>
                          <span className="eyebrow">Handoff locked</span>
                          <h3>Approve this version to reveal final copy buttons</h3>
                          <p>
                            You can still copy individual fields above while
                            reviewing.
                          </p>
                        </div>
                      </section>
                    )}

                    {(activeResult.result.warnings.length > 0 ||
                      activeResult.result.conflicts.length > 0) && (
                      <section className="warning-section">
                        <h3>
                          <ShieldAlert size={17} /> Review warnings
                        </h3>
                        {activeResult.result.warnings.map((warning, i) => (
                          <article key={`warning-${i}`}>
                            <strong>
                              {typeof warning === "object" && warning && "code" in warning
                                ? readableValue(warning.code).replaceAll("_", " ")
                                : "Review note"}
                            </strong>
                            <p>{readableValue(warning)}</p>
                          </article>
                        ))}
                        {activeResult.result.conflicts.map((conflict, i) => (
                          <article key={`conflict-${i}`}>
                            <strong>{conflictTitle(conflict)}</strong>
                            <p>{readableValue(conflict)}</p>
                          </article>
                        ))}
                      </section>
                    )}

                    <details className="evidence-ledger">
                      <summary>
                        <ListChecks size={15} /> Evidence ledger ·{" "}
                        {activeResult.result.evidence.length} entries
                      </summary>
                      {activeResult.result.evidence.map((entry, i) => (
                        <article key={entry.id ?? `evidence-${i}`}>
                          <span>{entry.kind?.replaceAll("_", " ") ?? "Unknown"}</span>
                          <strong>{entry.field}</strong>
                          <p>
                            {readableValue(entry.value)}
                          </p>
                          <small>
                            {entry.source_path ?? "No source path"}{" "}
                            {entry.excerpt && `· ${entry.excerpt}`}
                          </small>
                        </article>
                      ))}
                    </details>

                    <section className="tweak-card">
                      <div>
                        <span className="eyebrow">Append a new version</span>
                        <h3>Targeted copy tweak</h3>
                        <p>
                          Reuse this evidence and change only the selected fields.
                        </p>
                      </div>
                      <div className="field-checks">
                        {(
                          [
                            "title",
                            "description",
                            "tags",
                            "category",
                          ] as const
                        ).map((field) => (
                          <label key={field}>
                            <input
                              checked={tweakFields.includes(field)}
                              onChange={() =>
                                setTweakFields((current) =>
                                  current.includes(field)
                                    ? current.filter((item) => item !== field)
                                    : [...current, field],
                                )
                              }
                              type="checkbox"
                            />
                            <span>{field}</span>
                          </label>
                        ))}
                      </div>
                      <textarea
                        value={tweakInstruction}
                        onChange={(event) =>
                          setTweakInstruction(event.target.value)
                        }
                        placeholder="Describe exactly what should change."
                      />
                      <button
                        disabled={
                          busy === "tweak" ||
                          !tweakInstruction.trim() ||
                          tweakFields.length === 0
                        }
                        onClick={() => void queueTweak()}
                        type="button"
                      >
                        {busy === "tweak" ? (
                          <LoaderCircle className="spin" size={15} />
                        ) : (
                          <Copy size={15} />
                        )}
                        Queue targeted tweak
                      </button>
                    </section>
                      </div>

                      <aside className="review-companion">
                        <div className="companion-header">
                          <div>
                            <span className="eyebrow">Review companion</span>
                            <h3>Cross-check panel</h3>
                          </div>
                          <div
                            className="companion-tabs"
                            aria-label="Review companion mode"
                          >
                            {(
                              [
                                ["images", "Images"],
                                ["evidence", "Evidence"],
                                ["tweak", "Tweak"],
                              ] as const
                            ).map(([mode, label]) => (
                              <button
                                className={
                                  companionView === mode ? "is-active" : ""
                                }
                                key={mode}
                                onClick={() => setCompanionView(mode)}
                                type="button"
                              >
                                {label}
                              </button>
                            ))}
                          </div>
                        </div>

                        {companionView === "images" && (
                          <div className="companion-pane">
                            <div className="companion-section-heading">
                              <strong>Used while writing</strong>
                              <span>
                                {companionPrimaryImages.length} image
                                {companionPrimaryImages.length === 1 ? "" : "s"}
                              </span>
                            </div>
                            {companionPrimaryImages.length ? (
                              <div className="companion-image-grid">
                                {companionPrimaryImages.map((image) => (
                                  <button
                                    key={`${image.role}-${image.index}-${image.relativePath}`}
                                    onClick={() => {
                                      setActiveImageId(image.id);
                                      setViewerOpen(true);
                                    }}
                                    type="button"
                                  >
                                    <img
                                      src={sizedImageUrl(image, 180)}
                                      alt={image.alt}
                                      loading="lazy"
                                      decoding="async"
                                    />
                                    <span>
                                      {image.relativePath ===
                                      referenceImage?.relativePath
                                        ? "Reference"
                                        : resultInspectedImagePaths.has(
                                              image.relativePath,
                                            )
                                          ? "Inspected"
                                          : "Evidence"}
                                    </span>
                                    <Maximize2 size={13} />
                                  </button>
                                ))}
                              </div>
                            ) : (
                              <p className="companion-empty">
                                No inspected images were recorded for this
                                version.
                              </p>
                            )}

                            <div className="companion-subtabs">
                              <span>Quick sets</span>
                              <button
                                disabled={!referenceImage}
                                onClick={() => {
                                  if (!referenceImage) return;
                                  setActiveImageId(referenceImage.id);
                                  setViewerOpen(true);
                                }}
                                type="button"
                              >
                                Reference
                              </button>
                              <button
                                disabled={!companionDimensionImages.length}
                                onClick={() => {
                                  const image = companionDimensionImages[0];
                                  if (!image) return;
                                  setActiveImageId(image.id);
                                  setViewerOpen(true);
                                }}
                                type="button"
                              >
                                Dimensions
                              </button>
                              <button
                                disabled={!companionVariationImages.length}
                                onClick={() => {
                                  const image = companionVariationImages[0];
                                  if (!image) return;
                                  setActiveImageId(image.id);
                                  setViewerOpen(true);
                                }}
                                type="button"
                              >
                                Variations
                              </button>
                            </div>

                            <details className="companion-all-images">
                              <summary>
                                All product images ({companionAllImages.length})
                              </summary>
                              <div className="companion-thumb-strip">
                                {companionAllImages.map((image) => (
                                  <button
                                    key={`all-${image.role}-${image.index}-${image.relativePath}`}
                                    onClick={() => {
                                      setActiveImageId(image.id);
                                      setViewerOpen(true);
                                    }}
                                    type="button"
                                  >
                                    <img
                                      src={sizedImageUrl(image, 96)}
                                      alt={image.alt}
                                      loading="lazy"
                                      decoding="async"
                                    />
                                  </button>
                                ))}
                              </div>
                            </details>
                          </div>
                        )}

                        {companionView === "evidence" && (
                          <div className="companion-pane">
                            <div className="companion-section-heading">
                              <strong>Evidence ledger</strong>
                              <span>
                                {activeResult.result.evidence.length} entries
                              </span>
                            </div>
                            <div className="companion-evidence-list">
                              {activeResult.result.evidence.map((entry, i) => {
                                const evidenceImage = activeProduct?.images.find(
                                  (image) =>
                                    image.relativePath === entry.source_path,
                                );
                                return (
                                  <article key={entry.id ?? `evidence-companion-${i}`}>
                                    <span>
                                      {entry.kind?.replaceAll("_", " ") ?? "Unknown"}
                                    </span>
                                    <strong>{entry.field}</strong>
                                    <p>{readableValue(entry.value)}</p>
                                    <small>
                                      {entry.source_path ?? "No source path"}
                                      {entry.excerpt && ` - ${entry.excerpt}`}
                                    </small>
                                    {evidenceImage && (
                                      <button
                                        onClick={() => {
                                          setActiveImageId(evidenceImage.id);
                                          setViewerOpen(true);
                                        }}
                                        type="button"
                                      >
                                        Open source image
                                      </button>
                                    )}
                                  </article>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {companionView === "tweak" && (
                          <div className="companion-pane companion-tweak">
                            <div className="companion-section-heading">
                              <strong>Targeted tweak</strong>
                              <span>New version</span>
                            </div>
                            <p>
                              Reuse this result&apos;s evidence and change only
                              the selected fields.
                            </p>
                            <div className="field-checks">
                              {TWEAK_FIELDS.map((field) => (
                                <label key={field}>
                                  <input
                                    checked={tweakFields.includes(field)}
                                    onChange={() =>
                                      setTweakFields((current) =>
                                        current.includes(field)
                                          ? current.filter(
                                              (item) => item !== field,
                                            )
                                          : [...current, field],
                                      )
                                    }
                                    type="checkbox"
                                  />
                                  <span>{field}</span>
                                </label>
                              ))}
                            </div>
                            <textarea
                              value={tweakInstruction}
                              onChange={(event) =>
                                setTweakInstruction(event.target.value)
                              }
                              placeholder="Example: dimensions should use inches only, or remove unsupported weather wording."
                            />
                            <button
                              disabled={
                                busy === "tweak" ||
                                !tweakInstruction.trim() ||
                                tweakFields.length === 0
                              }
                              onClick={() => void queueTweak()}
                              type="button"
                            >
                              {busy === "tweak" ? (
                                <LoaderCircle className="spin" size={15} />
                              ) : (
                                <Copy size={15} />
                              )}
                              Queue targeted tweak
                            </button>
                          </div>
                        )}
                      </aside>
                    </div>
                  </>
                ) : (
                  <div className="empty-results">
                    <h2>
                      {activeProduct.results.length
                        ? "Loading copywriting history"
                        : "No copywriting result yet"}
                    </h2>
                    <p>
                      {activeProduct.results.length
                        ? "Reading the saved local result versions."
                        : "Queue this product, then ask Codex to process queued jobs."}
                    </p>
                    {!activeProduct.results.length && (
                      <button
                        onClick={() => setCenterView("evidence")}
                        type="button"
                      >
                        Return to product review
                      </button>
                    )}
                  </div>
                )}
              </section>
            )}
          </section>
        ) : (
          <section className="product-workspace empty-workspace">
            <h2>Choose your product root</h2>
            <p>Studio will recursively find every folder with metadata.json.</p>
            <button onClick={() => setWorkspaceDialog(true)} type="button">
              Select local folder
            </button>
          </section>
        )}

        <aside className="job-builder">
          <div className="builder-heading">
            <div>
              <span className="eyebrow">Local jobs</span>
              <h2>Copywriting queue</h2>
            </div>
          </div>

          <div className="selected-summary">
            <div className="avatar-stack">
              {selectedProducts.slice(0, 3).map((product, index) => {
                const image = product.images.find(
                  (item) => item.relativePath === product.referenceImage,
                );
                return image ? (
                  <img
                    src={sizedImageUrl(image, 80)}
                    alt=""
                    key={product.instanceId}
                    loading="lazy"
                    decoding="async"
                    style={{ zIndex: 3 - index }}
                  />
                ) : null;
              })}
              {selectedProducts.length > 3 && (
                <span>+{selectedProducts.length - 3}</span>
              )}
            </div>
            <div>
              <strong>{selectedProducts.length} selected</strong>
              <small>One independent job per product</small>
            </div>
          </div>

          {duplicateSelection && (
            <div className="builder-warning">
              <AlertTriangle size={15} />
              Choose only one snapshot from each duplicate group.
            </div>
          )}

          <div className="task-list">
            <article className="is-enabled">
              <span className="task-icon task-copy">
                <BookOpenText size={18} />
              </span>
              <div>
                <strong>Listing copy</strong>
                <small>Evidence, title, category, description and tags</small>
              </div>
              <CheckCircle2 size={18} className="task-ready" />
            </article>
            <article className="is-disabled">
              <span className="task-icon task-image">
                <ImageIcon size={18} />
              </span>
              <div>
                <strong>Image workflows</strong>
                <small>Main showcase and variation images are coming later</small>
              </div>
              <span className="coming-soon">Later</span>
            </article>
          </div>

          <section className="settings-card">
            <button
              className="settings-toggle"
              onClick={() => setSettingsOpen((current) => !current)}
              type="button"
            >
              <span>
                <Settings2 size={15} />
                Workspace voice
              </span>
              <ChevronDown size={14} />
            </button>
            <p>
              Saved inside this product root. Switching folders switches the
              copywriting vibe and policy.
            </p>
            {settingsOpen && copySettings && (
              <div className="settings-fields">
                <div className="settings-section-title">
                  Workspace identity
                  <small>Saved only in this selected product root.</small>
                </div>
                <label>
                  <span>Shop name</span>
                  <input
                    placeholder="Fresh workspace"
                    value={copySettings.shop_name}
                    onChange={(event) =>
                      updateCopySetting("shop_name", event.target.value)
                    }
                  />
                </label>
                <label>
                  <span>Tagline</span>
                  <textarea
                    placeholder="Optional brand tagline for this workspace."
                    value={copySettings.tagline}
                    onChange={(event) =>
                      updateCopySetting("tagline", event.target.value)
                    }
                  />
                </label>
                <label>
                  <span>Brand profile</span>
                  <textarea
                    placeholder="Describe this workspace's brand, audience, products, and mood."
                    value={copySettings.brand_profile}
                    onChange={(event) =>
                      updateCopySetting("brand_profile", event.target.value)
                    }
                  />
                </label>
                <label>
                  <span>Voice and vibe</span>
                  <textarea
                    placeholder="Describe how listings should sound for this workspace."
                    value={copySettings.voice}
                    onChange={(event) =>
                      updateCopySetting("voice", event.target.value)
                    }
                  />
                </label>
                <div className="settings-section-title">
                  Copywriting defaults
                  <small>Shared guardrails for clean Etsy-ready copy.</small>
                </div>
                <label>
                  <span>Description structure</span>
                  <textarea
                    value={copySettings.description_structure}
                    onChange={(event) =>
                      updateCopySetting(
                        "description_structure",
                        event.target.value,
                      )
                    }
                  />
                </label>
                <label>
                  <span>Formatting rules</span>
                  <textarea
                    value={copySettings.formatting_rules}
                    onChange={(event) =>
                      updateCopySetting("formatting_rules", event.target.value)
                    }
                  />
                </label>
                <label>
                  <span>SEO and tags</span>
                  <textarea
                    value={copySettings.seo_rules}
                    onChange={(event) =>
                      updateCopySetting("seo_rules", event.target.value)
                    }
                  />
                </label>
                <label>
                  <span>Banned language</span>
                  <textarea
                    value={copySettings.banned_language}
                    onChange={(event) =>
                      updateCopySetting("banned_language", event.target.value)
                    }
                  />
                </label>
                <label>
                  <span>Policy footer</span>
                  <textarea
                    value={copySettings.policy_footer}
                    onChange={(event) =>
                      updateCopySetting("policy_footer", event.target.value)
                    }
                  />
                </label>
                <label className="toggle-line">
                  <input
                    checked={copySettings.require_policy_footer}
                    onChange={(event) =>
                      updateCopySetting(
                        "require_policy_footer",
                        event.target.checked,
                      )
                    }
                    type="checkbox"
                  />
                  <span>Append policy footer to every description</span>
                </label>
                <div className="settings-section-title">
                  Integrations & Webhooks
                  <small>Export approved listings automatically to Google Sheets.</small>
                </div>
                <label>
                  <span>Google Sheets Webhook URL</span>
                  <input
                    placeholder="https://script.google.com/macros/s/... or Zapier/Make URL"
                    value={copySettings.google_sheets_webhook_url || ""}
                    onChange={(event) =>
                      updateCopySetting(
                        "google_sheets_webhook_url",
                        event.target.value,
                      )
                    }
                  />
                  <small className="settings-field-hint">
                    Endpoint receiving the formatted JSON payload when syncing listings.
                  </small>
                </label>
                <div className="apps-script-helper-box">
                  <div className="apps-script-helper-header">
                    <div className="apps-script-helper-title">
                      <FileSpreadsheet size={14} />
                      <span>Apps Script Webhook (v2)</span>
                    </div>
                    <button
                      type="button"
                      className="apps-script-copy-btn"
                      onClick={() => void copyAppsScript()}
                    >
                      {scriptCopied ? <Check size={13} /> : <Copy size={13} />}
                      <span>{scriptCopied ? "Copied Script!" : "Copy Script"}</span>
                    </button>
                  </div>
                  <p className="apps-script-helper-desc">
                    Routes listings to each shop&apos;s tab (creates new tabs automatically), updates existing rows in-place, and keeps items sorted in order (e.g. item 6 above 7).
                  </p>
                  <ol className="apps-script-steps">
                    <li>Google Sheet &gt; <strong>Extensions &gt; Apps Script</strong>.</li>
                    <li>Paste script &gt; <strong>Deploy &gt; New deployment &gt; Web app</strong>.</li>
                    <li>Set <em>Execute as: Me</em> &amp; <em>Who has access: Anyone</em>.</li>
                    <li>Paste the deployed URL above.</li>
                  </ol>
                </div>
                <div className="settings-actions">
                  <button
                    className="settings-save"
                    disabled={busy === "settings"}
                    onClick={() => void saveCopySettings()}
                    type="button"
                  >
                    {busy === "settings" ? (
                      <LoaderCircle className="spin" size={15} />
                    ) : (
                      <Check size={15} />
                    )}
                    Save workspace voice
                  </button>
                  <button
                    className="settings-reset"
                    disabled={busy === "settings"}
                    onClick={() => void resetCopySettings()}
                    type="button"
                  >
                    <RefreshCw size={14} />
                    Start fresh
                  </button>
                </div>
              </div>
            )}
          </section>

          <label className="instruction-field">
            <span>
              Batch instruction <small>optional</small>
            </span>
            <textarea
              value={instruction}
              onChange={(event) => setInstruction(event.target.value)}
              placeholder="Example: Keep the tone warm, practical, and minimal."
            />
          </label>

          <div className="privacy-note">
            <HardDrive size={16} />
            <p>
              <strong>Nothing uploads automatically.</strong>
              Jobs stay in this workspace until you ask Codex to process them.
            </p>
          </div>

          <button
            className="queue-button"
            onClick={() => void queueJobs()}
            disabled={
              selectedProducts.length === 0 ||
              duplicateSelection ||
              busy === "queue"
            }
            data-testid="queue-button"
            type="button"
          >
            <span>
              {busy === "queue"
                ? "Creating local jobs…"
                : `Queue ${selectedProducts.length} product${
                    selectedProducts.length === 1 ? "" : "s"
                  }`}
            </span>
            {busy === "queue" ? (
              <LoaderCircle className="spin" size={18} />
            ) : (
              <ArrowRight size={18} />
            )}
          </button>

          <section className="job-monitor">
            <div>
              <span className="eyebrow">Local status files</span>
              <h3>Recent jobs</h3>
            </div>
            {jobs.length ? (
              jobs.slice(0, 6).map((job) => (
                <article key={job.job_id}>
                  <span className={`job-dot ${job.status}`} />
                  <div>
                    <strong>{jobLabel(job)}</strong>
                    <small className="job-folder-path" title={job.product.relative_folder}>
                      <FolderOpen size={10} /> {job.product.relative_folder}
                    </small>
                    <small>{job.progress.message}</small>
                    <span className="progress-track">
                      <span style={{ width: `${job.progress.percent}%` }} />
                    </span>
                  </div>
                  {["queued", "processing"].includes(job.status) && (
                    <button
                      onClick={() => void jobAction(job, "cancel")}
                      type="button"
                      aria-label="Cancel job"
                    >
                      <X size={13} />
                    </button>
                  )}
                  {["failed", "cancelled"].includes(job.status) && (
                    <button
                      onClick={() => void jobAction(job, "retry")}
                      type="button"
                      aria-label="Retry job"
                    >
                      <RefreshCw size={13} />
                    </button>
                  )}
                </article>
              ))
            ) : (
              <p className="empty-jobs">No local jobs yet.</p>
            )}
          </section>

          <div className="codex-prompt">
            <span>Next step</span>
            <strong>“Process my queued jobs.”</strong>
          </div>
        </aside>
      </section>

      {workspaceDialog && (
        <div className="modal-backdrop" role="presentation">
          <section
            className="workspace-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="workspace-dialog-title"
          >
            <button
              className="modal-close"
              onClick={() => workspace.active_root && setWorkspaceDialog(false)}
              aria-label="Close folder selection"
              type="button"
            >
              <X size={17} />
            </button>
            <h2 id="workspace-dialog-title">Choose your product root</h2>
            <p>
              Studio recursively finds every product folder containing a
              metadata.json file.
            </p>
            <button
              className="picker-button"
              disabled={busy === "workspace"}
              onClick={() => void openWorkspace("pick")}
              type="button"
            >
              {busy === "workspace" ? (
                <LoaderCircle className="spin" size={17} />
              ) : (
                <FolderOpen size={17} />
              )}
              Open Windows folder picker
            </button>
            <div className="path-divider">
              <span>or paste a path</span>
            </div>
            <label className="path-input">
              <input
                value={workspacePath}
                onChange={(event) => setWorkspacePath(event.target.value)}
                placeholder="C:\\Products\\AliExpressQueue"
                data-testid="workspace-path"
              />
              <button
                disabled={!workspacePath.trim() || busy === "workspace"}
                onClick={() => void openWorkspace("open", workspacePath)}
                type="button"
              >
                Open
              </button>
            </label>
            {workspace.recent_roots.length > 0 && (
              <div className="recent-roots">
                <span>Recent folders</span>
                {workspace.recent_roots.map((root) => (
                  <button
                    key={root}
                    onClick={() => void openWorkspace("open", root)}
                    type="button"
                  >
                    <HardDrive size={13} />
                    {root}
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {viewerOpen && activeImage && (
        <div className="modal-backdrop image-modal" role="presentation">
          <section role="dialog" aria-modal="true" aria-label="Product image viewer">
            <button
              className="modal-close"
              onClick={() => setViewerOpen(false)}
              aria-label="Close image viewer"
              type="button"
            >
              <X size={18} />
            </button>
            <img src={activeImage.imageUrl} alt={activeImage.alt} decoding="async" />
            <footer>
              <span>{activeImage.relativePath}</span>
              {activeImage.relativePath === activeProduct?.referenceImage && (
                <strong>
                  <BadgeCheck size={14} /> Reference
                </strong>
              )}
            </footer>
          </section>
        </div>
      )}

      {settingsModalOpen && copySettings && (
        <div className="modal-backdrop" role="presentation">
          <section
            className="workspace-dialog settings-modal-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-dialog-title"
          >
            <button
              className="modal-close"
              onClick={() => setSettingsModalOpen(false)}
              aria-label="Close settings"
              type="button"
            >
              <X size={17} />
            </button>
            <h2 id="settings-dialog-title">Workspace Settings & Integrations</h2>
            <p>
              Configure shop identity, AI copywriting guidelines, and your Google Sheets Webhook URL.
            </p>

            <div className="settings-fields" style={{ maxHeight: "60vh", overflowY: "auto", paddingRight: 6 }}>
              <div className="settings-section-title">
                Integrations & Webhooks
                <small>Export approved listings directly to Google Sheets.</small>
              </div>
              <label>
                <span>Google Sheets Webhook URL</span>
                <input
                  placeholder="https://script.google.com/macros/s/.../exec"
                  value={copySettings.google_sheets_webhook_url || ""}
                  onChange={(event) =>
                    updateCopySetting(
                      "google_sheets_webhook_url",
                      event.target.value,
                    )
                  }
                />
                <small className="settings-field-hint">
                  Your deployed Google Apps Script Web App URL.
                </small>
              </label>

              <div className="apps-script-helper-box">
                <div className="apps-script-helper-header">
                  <div className="apps-script-helper-title">
                    <FileSpreadsheet size={15} />
                    <span>Google Apps Script (v2 — Multi-Shop &amp; Auto-Sort)</span>
                  </div>
                  <button
                    type="button"
                    className="apps-script-copy-btn"
                    onClick={() => void copyAppsScript()}
                  >
                    {scriptCopied ? <Check size={13} /> : <Copy size={13} />}
                    <span>{scriptCopied ? "Copied Script!" : "Copy Webhook Script"}</span>
                  </button>
                </div>
                <p className="apps-script-helper-desc">
                  Automatically routes listings to each shop&apos;s tab (or folder name), <strong>creates new tabs automatically</strong>, updates existing rows in-place, and keeps items strictly sorted (e.g. item 6 placed above 7).
                </p>
                <ol className="apps-script-steps">
                  <li>In your Google Sheet, open <strong>Extensions &gt; Apps Script</strong>.</li>
                  <li>Replace existing code with this script and click <strong>Deploy &gt; New deployment</strong>.</li>
                  <li>Select type <strong>Web app</strong>, set <em>Execute as: Me</em> &amp; <em>Who has access: Anyone</em>.</li>
                  <li>Copy your Web app URL and paste it into the field above.</li>
                </ol>
              </div>

              <div className="settings-section-title">
                Workspace Identity
                <small>Brand name and voice applied to listings in this folder.</small>
              </div>
              <label>
                <span>Shop name</span>
                <input
                  placeholder="e.g. Modern Craft Co"
                  value={copySettings.shop_name}
                  onChange={(event) =>
                    updateCopySetting("shop_name", event.target.value)
                  }
                />
              </label>
              <label>
                <span>Tagline</span>
                <textarea
                  placeholder="Optional brand tagline."
                  value={copySettings.tagline}
                  onChange={(event) =>
                    updateCopySetting("tagline", event.target.value)
                  }
                />
              </label>
              <label>
                <span>Brand profile</span>
                <textarea
                  placeholder="Describe your brand, target audience, and style."
                  value={copySettings.brand_profile}
                  onChange={(event) =>
                    updateCopySetting("brand_profile", event.target.value)
                  }
                />
              </label>
              <label>
                <span>Voice and vibe</span>
                <textarea
                  placeholder="e.g. Warm, artisanal, minimalist, persuasive."
                  value={copySettings.voice}
                  onChange={(event) =>
                    updateCopySetting("voice", event.target.value)
                  }
                />
              </label>

              <div className="settings-section-title">
                Copywriting Defaults & Policy
              </div>
              <label>
                <span>Description structure</span>
                <textarea
                  value={copySettings.description_structure}
                  onChange={(event) =>
                    updateCopySetting(
                      "description_structure",
                      event.target.value,
                    )
                  }
                />
              </label>
              <label>
                <span>Formatting rules</span>
                <textarea
                  value={copySettings.formatting_rules}
                  onChange={(event) =>
                    updateCopySetting("formatting_rules", event.target.value)
                  }
                />
              </label>
              <label>
                <span>Policy footer</span>
                <textarea
                  value={copySettings.policy_footer}
                  onChange={(event) =>
                    updateCopySetting("policy_footer", event.target.value)
                  }
                />
              </label>
              <label className="toggle-line">
                <input
                  checked={copySettings.require_policy_footer}
                  onChange={(event) =>
                    updateCopySetting(
                      "require_policy_footer",
                      event.target.checked,
                    )
                  }
                  type="checkbox"
                />
                <span>Append policy footer to every description</span>
              </label>
            </div>

            <div className="settings-actions" style={{ marginTop: 16 }}>
              <button
                className="settings-save"
                disabled={busy === "settings"}
                onClick={async () => {
                  await saveCopySettings();
                  setSettingsModalOpen(false);
                }}
                type="button"
              >
                {busy === "settings" ? (
                  <LoaderCircle className="spin" size={15} />
                ) : (
                  <Check size={15} />
                )}
                Save Settings
              </button>
              <button
                className="settings-reset"
                disabled={busy === "settings"}
                onClick={() => void resetCopySettings()}
                type="button"
              >
                <RefreshCw size={14} />
                Reset Defaults
              </button>
            </div>
          </section>
        </div>
      )}

      {(toast || error) && (
        <div className={`toast ${error ? "is-error" : ""}`} role="status">
          {error ? <CircleAlert size={17} /> : <CheckCircle2 size={17} />}
          <span>{error || toast}</span>
          <button
            onClick={() => {
              setToast("");
              setError("");
            }}
            aria-label="Dismiss message"
            type="button"
          >
            <X size={15} />
          </button>
        </div>
      )}
    </main>
  );
}
