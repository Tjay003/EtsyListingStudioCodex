// Helper to extract productId from AliExpress product detail URLs
function getProductIdFromUrl(url) {
  if (!url) return null;
  const match = url.match(/\/item\/(\d+)\.html/i);
  return match ? match[1] : null;
}

function cleanProductSourceUrl(url) {
  if (!url) return "";
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    const isAliExpress = host.endsWith("aliexpress.com") || host.endsWith("aliexpress.us");
    if (!isAliExpress) return "";

    const productId = getProductIdFromUrl(url);
    if (productId) {
      return `${parsed.protocol}//${parsed.host}/item/${productId}.html`;
    }
    return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
  } catch (e) {
    return "";
  }
}

function getSourceDomain(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch (e) {
    return "";
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  // Tabs navigation elements
  const tabBtnGen = document.getElementById("tab-btn-generator");
  const tabBtnSettings = document.getElementById("tab-btn-settings");
  const panelGen = document.getElementById("panel-generator");
  const panelSettings = document.getElementById("panel-settings");

  // Queue elements
  const btnSendQueue = document.getElementById("btn-send-queue");
  const statusContainer = document.getElementById("status-container");
  const statusText = document.getElementById("status-text");
  const errorContainer = document.getElementById("error-container");

  // Checkboxes
  const chkMain = document.getElementById("chk-main");
  const chkVariation = document.getElementById("chk-variation");
  const chkDescription = document.getElementById("chk-description");
  const chkText = document.getElementById("chk-text");
  const chkSelectAll = document.getElementById("chk-select-all");

  // Badges
  const badgeMain = document.getElementById("badge-main");
  const badgeVariation = document.getElementById("badge-variation");
  const badgeDescription = document.getElementById("badge-description");

  // Settings elements
  const inputServerUrl = document.getElementById("input-server-url");
  const inputUserToken = document.getElementById("input-user-token");
  const btnSaveSettings = document.getElementById("btn-save-settings");
  const settingsSaveStatus = document.getElementById("settings-save-status");

  function sanitizeUserToken(value) {
    return String(value || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);
  }

  // Load Settings on start
  let serverUrl = "http://localhost:3000";
  let userToken = "";
  chrome.storage.local.get(["serverUrl", "userToken"], (result) => {
    if (result.serverUrl) {
      serverUrl = result.serverUrl;
    }
    if (inputServerUrl) {
      inputServerUrl.value = serverUrl;
    }
    if (result.userToken) {
      userToken = sanitizeUserToken(result.userToken);
      if (inputUserToken) {
        inputUserToken.value = userToken;
      }
    }
  });

  // Save Settings
  function saveSettings(showStatus = false) {
    const url = (inputServerUrl ? inputServerUrl.value.trim() : "") || "http://localhost:3000";
    const token = sanitizeUserToken(inputUserToken ? inputUserToken.value.trim() : "");
    if (inputUserToken) {
      inputUserToken.value = token;
    }
    chrome.storage.local.set({ serverUrl: url, userToken: token }, () => {
      serverUrl = url;
      userToken = token;
      if (showStatus && settingsSaveStatus) {
        settingsSaveStatus.classList.remove("hidden");
        setTimeout(() => settingsSaveStatus.classList.add("hidden"), 2000);
      }
    });
  }

  if (btnSaveSettings) {
    btnSaveSettings.addEventListener("click", () => {
      saveSettings(true);
    });
  }
  if (inputServerUrl) {
    inputServerUrl.addEventListener("change", () => saveSettings());
  }
  if (inputUserToken) {
    inputUserToken.addEventListener("change", () => saveSettings());
  }

  // Switch tabs
  if (tabBtnGen && tabBtnSettings && panelGen && panelSettings) {
    tabBtnGen.addEventListener("click", () => {
      tabBtnGen.classList.add("active");
      tabBtnSettings.classList.remove("active");
      panelGen.classList.add("active");
      panelSettings.classList.remove("active");
    });

    tabBtnSettings.addEventListener("click", () => {
      tabBtnSettings.classList.add("active");
      tabBtnGen.classList.remove("active");
      panelSettings.classList.add("active");
      panelGen.classList.remove("active");
    });
  }

  // Select All Logic
  const allChecks = [chkMain, chkVariation, chkDescription, chkText].filter(Boolean);

  if (chkSelectAll) {
    chkSelectAll.addEventListener("change", (e) => {
      const isChecked = e.target.checked;
      allChecks.forEach((chk) => {
        if (chk) chk.checked = isChecked;
      });
    });
  }

  allChecks.forEach((chk) => {
    if (!chk) return;
    chk.addEventListener("change", () => {
      if (chkSelectAll) {
        chkSelectAll.checked = allChecks.every((c) => c && c.checked);
      }
    });
  });

  // Helper displays
  function showStatus(text) {
    if (statusText) statusText.textContent = text;
    if (statusContainer) statusContainer.classList.remove("hidden");
    if (errorContainer) errorContainer.classList.add("hidden");
  }

  function hideMessage() {
    if (statusContainer) statusContainer.classList.add("hidden");
    if (errorContainer) errorContainer.classList.add("hidden");
  }

  function showError(msg) {
    if (errorContainer) {
      errorContainer.textContent = msg;
      errorContainer.classList.remove("hidden");
    }
    if (statusContainer) statusContainer.classList.add("hidden");
  }

  function updateBadge(badge, count) {
    if (!badge) return;
    badge.classList.remove("loading");
    badge.textContent = count;
    if (count === 0) {
      badge.classList.add("empty");
    } else {
      badge.classList.remove("empty");
    }
  }

  // --- INITIALIZE (Detect Active Workspace & Preview Counts) ---
  const shopNameEl = document.getElementById("active-shop-name");
  const statusDotEl = document.getElementById("workspace-status-dot");

  async function checkActiveWorkspace() {
    try {
      const res = await fetch(`${serverUrl}/api/local/workspaces`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (shopNameEl) {
        shopNameEl.textContent = data.active_name || "No workspace opened";
      }
      if (statusDotEl) {
        statusDotEl.style.background = data.active_root ? "#10b981" : "#f59e0b";
      }
    } catch {
      if (shopNameEl) {
        shopNameEl.textContent = "Studio offline (localhost:3000)";
      }
      if (statusDotEl) {
        statusDotEl.style.background = "#ef4444";
      }
    }
  }

  void checkActiveWorkspace();

  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs && tabs.length > 0) {
      const activeTab = tabs[0];
      if (activeTab.url && (activeTab.url.includes("aliexpress.com") || activeTab.url.includes("aliexpress.us"))) {
        // Inject content script if not already loaded
        try {
          await chrome.scripting.executeScript({
            target: { tabId: activeTab.id },
            files: ["content.js"],
          });
        } catch (e) {}

        // Get DOM-visible counts from content script
        chrome.tabs.sendMessage(activeTab.id, { action: "getPreviewCounts" }, (response) => {
          if (chrome.runtime.lastError) {
            if (badgeMain) badgeMain.textContent = "Error";
            if (badgeVariation) badgeVariation.textContent = "Error";
            if (badgeDescription) badgeDescription.textContent = "Error";
            return;
          }
          if (response && response.success) {
            updateBadge(badgeMain, response.counts.main);
            updateBadge(badgeVariation, response.counts.variation);

            // ALSO ask background for intercepted description images (validating matching tabUrl)
            chrome.runtime.sendMessage({ action: "get_desc_images", tabId: activeTab.id, tabUrl: activeTab.url }, (bgRes) => {
              const bgDescCount = bgRes && bgRes.images ? bgRes.images.length : 0;
              const domDescCount = response.counts.description;
              const totalDesc = Math.max(bgDescCount, domDescCount);
              console.log(`[Popup] Badge: DOM desc=${domDescCount}, Background intercepted=${bgDescCount}, showing=${totalDesc}`);
              updateBadge(badgeDescription, totalDesc);
            });
          }
        });
      } else {
        if (badgeMain) badgeMain.textContent = "-";
        if (badgeVariation) badgeVariation.textContent = "-";
        if (badgeDescription) badgeDescription.textContent = "-";
      }
    }
  } catch (e) {
    console.error("Initialization error:", e);
  }

  // --- ADD TO QUEUE / INGEST PRODUCT ---
  if (btnSendQueue) {
    btnSendQueue.addEventListener("click", async () => {
      hideMessage();
      userToken = sanitizeUserToken((inputUserToken ? inputUserToken.value.trim() : "") || userToken);
      if (inputUserToken) inputUserToken.value = userToken;

      btnSendQueue.disabled = true;
      const origText = btnSendQueue.textContent;
      btnSendQueue.textContent = "Scraping & Sending...";
      showStatus("Scraping page elements from active tab...");

      try {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tabs || tabs.length === 0) {
          showError("Could not detect active browser tab.");
          btnSendQueue.disabled = false;
          btnSendQueue.textContent = origText;
          return;
        }
        const activeTab = tabs[0];

        if (!activeTab.url || !(activeTab.url.includes("aliexpress.com") || activeTab.url.includes("aliexpress.us"))) {
          showError("Please navigate to an AliExpress product page and try again.");
          btnSendQueue.disabled = false;
          btnSendQueue.textContent = origText;
          return;
        }

        chrome.tabs.sendMessage(activeTab.id, { action: "scrapeProduct" }, async (response) => {
          if (!response || !response.success) {
            showError("Failed to scrape page DOM details.");
            btnSendQueue.disabled = false;
            btnSendQueue.textContent = origText;
            return;
          }

          let scrapedData = response.data;

          // Retrieve intercepted description images from background
          showStatus("Retrieving intercepted description images...");
          let interceptedDescImages = [];
          try {
            interceptedDescImages = await new Promise((resolve) => {
              chrome.runtime.sendMessage({ action: "get_desc_images", tabId: activeTab.id, tabUrl: activeTab.url }, (res) => {
                if (chrome.runtime.lastError) { resolve([]); return; }
                resolve(res && res.images ? res.images : []);
              });
            });
            console.log(`[Popup] Background returned ${interceptedDescImages.length} intercepted desc images.`);
          } catch (e) {
            console.error("Background image fetch failed:", e);
          }

          if (chkDescription && chkDescription.checked && scrapedData.description_images.length === 0 && interceptedDescImages.length === 0) {
            showStatus("Description images not cached. Trying lazy-load fallback...");
            try {
              const fallbackData = await new Promise((resolve) => {
                chrome.tabs.sendMessage(activeTab.id, { action: "loadDescriptionImages" }, (fallbackResponse) => {
                  if (chrome.runtime.lastError || !fallbackResponse || !fallbackResponse.success) {
                    resolve(null);
                    return;
                  }
                  resolve(fallbackResponse.data);
                });
              });

              if (fallbackData) {
                scrapedData = fallbackData;
                interceptedDescImages = await new Promise((resolve) => {
                  chrome.runtime.sendMessage({ action: "get_desc_images", tabId: activeTab.id, tabUrl: activeTab.url }, (res) => {
                    if (chrome.runtime.lastError) { resolve([]); return; }
                    resolve(res && res.images ? res.images : []);
                  });
                });
                console.log(`[Popup] Fallback found DOM=${scrapedData.description_images.length}, intercepted=${interceptedDescImages.length}.`);
              }
            } catch (e) {
              console.warn("Lazy-load fallback failed:", e);
            }
          }

          // Merge images
          const mainSet = new Set(scrapedData.main_images || []);
          const varSet = new Set((scrapedData.variation_images || []).map((v) => (typeof v === "object" ? v.url : v)));
          const descriptionSet = new Set(scrapedData.description_images || []);

          interceptedDescImages.forEach((img) => {
            if (!mainSet.has(img) && !varSet.has(img)) {
              descriptionSet.add(img);
            }
          });

          const finalDescImages = Array.from(descriptionSet);
          console.log(`[Popup] Final description image count: ${finalDescImages.length}`);

          showStatus("Transmitting scraped details to local Etsy Listing Studio...");

          const payload = {
            title: (!chkText || chkText.checked) ? scrapedData.title : "Untitled Product",
            price: (!chkText || chkText.checked) ? scrapedData.price : "",
            specs: (!chkText || chkText.checked) ? scrapedData.specs : {},
            description_text: (!chkText || chkText.checked) ? scrapedData.description_text : "",
            source_url: cleanProductSourceUrl(activeTab.url),
            source_product_id: getProductIdFromUrl(activeTab.url) || "",
            source_domain: getSourceDomain(activeTab.url),
            main_images: (!chkMain || chkMain.checked) ? scrapedData.main_images : [],
            variation_images: (!chkVariation || chkVariation.checked) ? scrapedData.variation_images : [],
            description_images: (!chkDescription || chkDescription.checked) ? finalDescImages : [],
          };

          const targetUrl = `${serverUrl.replace(/\/+$/, "")}/api/local/ingest-product`;
          console.log(`[Popup] ✅ SENDING payload to ${targetUrl}: main=${payload.main_images.length}, variation=${payload.variation_images.length}, description=${payload.description_images.length}`);

          const headers = {
            "Content-Type": "application/json",
          };
          if (userToken) {
            headers["X-User-Token"] = userToken;
          }

          fetch(targetUrl, {
            method: "POST",
            headers,
            body: JSON.stringify(payload),
          })
            .then(async (res) => {
              if (!res.ok) {
                const errText = await res.text();
                throw new Error(`Server error ${res.status}: ${errText}`);
              }
              return res.json();
            })
            .then((data) => {
              const msg = data.message || "Successfully imported product to Etsy Listing Studio!";
              showStatus(msg);
              setTimeout(() => hideMessage(), 3000);
              btnSendQueue.disabled = false;
              btnSendQueue.textContent = origText;
            })
            .catch((err) => {
              showError(`Connection failed: ${err.message}. Make sure Etsy Listing Studio is running on ${serverUrl}.`);
              btnSendQueue.disabled = false;
              btnSendQueue.textContent = origText;
            });
        });
      } catch (err) {
        showError(`Error sending details: ${err.message}`);
        btnSendQueue.disabled = false;
        btnSendQueue.textContent = origText;
      }
    });
  }
});
