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
  FolderOpen,
  HardDrive,
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

type WorkspacePayload = {
  active_root: string | null;
  active_name: string | null;
  recent_roots: string[];
};

type ResultBundle = {
  result: CopywritingResultV1;
  review: ProductReviewStateV1 | null;
};

type LibraryFilter = "all" | "review" | "duplicates" | "rejected" | "trash";
type CenterView = "evidence" | "results";

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

function shortFolder(value: string) {
  if (value.length <= 48) return value;
  return `…${value.slice(-47)}`;
}

function jobLabel(job: CopywritingJobV1) {
  if (job.task.kind === "copywriting.tweak") {
    return `Tweak ${job.task.fields.join(", ")}`;
  }
  return "Create listing copy";
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
  const [tweakFields, setTweakFields] = useState<
    Array<"title" | "description" | "tags" | "category">
  >(["title"]);
  const [tweakInstruction, setTweakInstruction] = useState("");
  const [busy, setBusy] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
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
        (filter === "review" &&
          (product.metadataError ||
            product.missingImages.length > 0 ||
            product.results.some((result) => result.reviewStatus === "needs_review"))) ||
        (filter === "duplicates" && product.duplicateCount > 1) ||
        (filter === "rejected" && product.rejected);
      return matchesQuery && matchesFilter;
    });
  }, [filter, products, search]);

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

  useEffect(() => {
    setDescriptionExpanded(false);
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

  const toggleProduct = async (product: ProductSnapshotV1) => {
    try {
      await patchProduct(product.instanceId, { selected: !product.selected });
    } catch (cause) {
      report(cause);
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
                      data-testid={`product-${product.instanceId}`}
                      type="button"
                    >
                      {cover ? (
                        <img src={cover.imageUrl} alt="" />
                      ) : (
                        <span className="image-placeholder">
                          <ImageIcon size={17} />
                        </span>
                      )}
                      <span className="product-copy">
                        <strong>{product.title}</strong>
                        <small>{product.collection}</small>
                        <span className="row-badges">
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
              <small>{products.length} discovered recursively</small>
            </span>
            <button
              onClick={() =>
                void Promise.all(
                  products.map((product) =>
                    patchProduct(product.instanceId, {
                      selected: !product.rejected,
                    }),
                  ),
                )
                  .then(loadProducts)
                  .catch(report)
              }
              type="button"
            >
              Select all
            </button>
          </footer>
        </aside>

        {activeProduct ? (
          <section className="product-workspace">
            <div className="product-toolbar">
              <span>
                {activeProduct.collection} <span>/</span>{" "}
                {activeProduct.folderName}
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
                <span className="eyebrow">
                  Source snapshot · {activeProduct.sourceStatus}
                </span>
                <h1>{activeProduct.title}</h1>
                <p>
                  {activeProduct.price && (
                    <span>Supplier price {activeProduct.price}</span>
                  )}
                  {activeProduct.sourceUrl && (
                    <a
                      className="source-link"
                      href={activeProduct.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open source <ExternalLink size={11} />
                    </a>
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
                          <img src={activeImage.imageUrl} alt={activeImage.alt} />
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
                            <img src={image.imageUrl} alt="" />
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
                        No structured supplier specifications were captured.
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
                        {activeResult.result.warnings.map((warning) => (
                          <article key={`${warning.code}-${warning.message}`}>
                            <strong>{warning.code.replaceAll("_", " ")}</strong>
                            <p>{warning.message}</p>
                          </article>
                        ))}
                        {activeResult.result.conflicts.map((conflict) => (
                          <article key={conflict}>
                            <strong>Source conflict</strong>
                            <p>{conflict}</p>
                          </article>
                        ))}
                      </section>
                    )}

                    <details className="evidence-ledger">
                      <summary>
                        <ListChecks size={15} /> Evidence ledger ·{" "}
                        {activeResult.result.evidence.length} entries
                      </summary>
                      {activeResult.result.evidence.map((entry) => (
                        <article key={entry.id}>
                          <span>{entry.kind.replaceAll("_", " ")}</span>
                          <strong>{entry.field}</strong>
                          <p>
                            {Array.isArray(entry.value)
                              ? entry.value.join(", ")
                              : entry.value}
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
                    src={image.imageUrl}
                    alt=""
                    key={product.instanceId}
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
                <label>
                  <span>Shop name</span>
                  <input
                    value={copySettings.shop_name}
                    onChange={(event) =>
                      updateCopySetting("shop_name", event.target.value)
                    }
                  />
                </label>
                <label>
                  <span>Tagline</span>
                  <textarea
                    value={copySettings.tagline}
                    onChange={(event) =>
                      updateCopySetting("tagline", event.target.value)
                    }
                  />
                </label>
                <label>
                  <span>Brand profile</span>
                  <textarea
                    value={copySettings.brand_profile}
                    onChange={(event) =>
                      updateCopySetting("brand_profile", event.target.value)
                    }
                  />
                </label>
                <label>
                  <span>Voice and vibe</span>
                  <textarea
                    value={copySettings.voice}
                    onChange={(event) =>
                      updateCopySetting("voice", event.target.value)
                    }
                  />
                </label>
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
            <img src={activeImage.imageUrl} alt={activeImage.alt} />
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
