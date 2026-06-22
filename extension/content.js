const MHFA_PRICE_PER_SQM = 500;
let mhfaState = {
  invoiceId: null,
  invoice: null,
  customer: null,
  mode: "overview",
  editPositionId: null
};

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "openPanel") {
    openAssistantPanel();
    sendResponse({ ok: true });
  }
  return false;
});

(function initFakturaAssistant() {
  openAssistantPanel();
})();

function openAssistantPanel() {
  const invoiceId = getInvoiceId(window.location.pathname);
  if (!invoiceId) {
    return;
  }

  mhfaState.invoiceId = invoiceId;

  const existingPanel = document.getElementById("mhfa-panel");
  if (existingPanel) {
    existingPanel.hidden = false;
    if (mhfaState.invoice) {
      renderOverview();
    } else {
      loadInvoice(invoiceId);
    }
    return;
  }

  const panel = document.createElement("aside");
  panel.id = "mhfa-panel";
  panel.innerHTML = `
    <header class="mhfa-header">
      <div>
        <strong>Faktura Assistent</strong>
        <span>Rechnung ${escapeHtml(invoiceId)}</span>
      </div>
      <div class="mhfa-header-actions">
        <button type="button" id="mhfa-settings" class="mhfa-tool-button" title="Zugangsdaten" aria-label="Zugangsdaten">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="7.5" cy="15.5" r="5.5"></circle>
            <path d="m21 2-9.6 9.6"></path>
            <path d="m15.5 7.5 3 3"></path>
            <path d="m17 5 3 3"></path>
          </svg>
        </button>
        <button type="button" id="mhfa-refresh" class="mhfa-tool-button" title="Neu laden" aria-label="Neu laden">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"></path>
            <path d="M3 21v-5h5"></path>
            <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"></path>
            <path d="M21 3v5h-5"></path>
          </svg>
        </button>
        <button type="button" id="mhfa-close" class="mhfa-tool-button" title="Schließen" aria-label="Schließen">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M18 6 6 18"></path>
            <path d="m6 6 12 12"></path>
          </svg>
        </button>
      </div>
    </header>
    <section id="mhfa-content" class="mhfa-content">
      <p class="mhfa-muted">Rechnung wird geladen...</p>
    </section>
  `;

  document.body.appendChild(panel);
  document.getElementById("mhfa-settings")?.addEventListener("click", () => renderSettings());
  document.getElementById("mhfa-refresh")?.addEventListener("click", () => loadInvoice(invoiceId));
  document.getElementById("mhfa-close")?.addEventListener("click", () => {
    panel.hidden = true;
  });
  loadInvoice(invoiceId);
}

function getInvoiceId(pathname) {
  const match = pathname.match(/^\/billing\/edit\/(\d+)\/?$/);
  return match ? match[1] : null;
}

function loadInvoice(invoiceId) {
  const content = document.getElementById("mhfa-content");
  if (!content) return;

  content.innerHTML = `<p class="mhfa-muted">Rechnung wird geladen...</p>`;

  chrome.storage.local.get(["clientId", "clientPassword"], (config) => {
    if (!config.clientId || !config.clientPassword) {
      renderSettings("Bitte client_id und API-Key eintragen.");
      return;
    }

    chrome.runtime.sendMessage({ type: "getInvoice", invoiceId }, (response) => {
      if (chrome.runtime.lastError) {
        renderError(content, chrome.runtime.lastError.message);
        return;
      }

      if (!response?.ok) {
        renderError(content, response?.error || "Unbekannter Fehler.");
        return;
      }

      mhfaState = {
        ...mhfaState,
        invoice: response.data.invoice,
        customer: response.data.customer,
        mode: "overview",
        editPositionId: null
      };
      renderOverview();
    });
  });
}

function renderOverview() {
  const content = document.getElementById("mhfa-content");
  if (!content || !mhfaState.invoice) return;

  const invoice = mhfaState.invoice;
  const positions = getPositions(invoice);
  const roofPositions = positions.filter(isRoofSlopePosition);
  const invoiceNumber = invoice.invoice_number || `Entwurf ${invoice.id}`;

  content.innerHTML = `
    <section class="mhfa-section mhfa-section-first">
      <dl class="mhfa-facts">
        <div>
          <dt>Rechnung</dt>
          <dd>${escapeHtml(invoiceNumber)}</dd>
        </div>
        <div>
          <dt>Kunde</dt>
          <dd>${escapeHtml(invoice.customer_name || "-")}</dd>
        </div>
        <div>
          <dt>Projekt</dt>
          <dd>${escapeHtml(invoice.construction_name || "-")}</dd>
        </div>
      </dl>
    </section>

    <section class="mhfa-section">
      <div class="mhfa-section-title">
        <h2>Dachschraegenregale</h2>
        <button type="button" id="mhfa-add" class="mhfa-icon-button" title="Position hinzufuegen">+</button>
      </div>
      ${roofPositions.length
        ? `<div class="mhfa-position-list">${roofPositions.map(renderRoofPositionButton).join("")}</div>`
        : `<p class="mhfa-muted">Noch keine Dachschraegenregal-Position in dieser Rechnung.</p>`}
    </section>

    <section class="mhfa-section">
      <h2>Rechnung</h2>
      <dl class="mhfa-totals">
        <div><dt>Positionen</dt><dd>${positions.length}</dd></div>
        <div><dt>Netto</dt><dd>${formatMoney(invoice.net_amount)}</dd></div>
        <div><dt>Brutto</dt><dd>${formatMoney(invoice.gross_amount)}</dd></div>
      </dl>
    </section>
  `;

  document.getElementById("mhfa-add")?.addEventListener("click", () => renderEditor());
  for (const button of content.querySelectorAll("[data-mhfa-position-id]")) {
    button.addEventListener("click", () => renderEditor(button.dataset.mhfaPositionId));
  }
}

function renderSettings(message = "") {
  const content = document.getElementById("mhfa-content");
  if (!content) return;

  chrome.storage.local.get(["clientId", "clientPassword"], (config) => {
    content.innerHTML = `
      <section class="mhfa-section mhfa-section-first">
        <h2>API-Zugangsdaten</h2>
        ${message ? `<p class="mhfa-muted">${escapeHtml(message)}</p>` : ""}
      </section>

      <form id="mhfa-settings-form" class="mhfa-form">
        <label>
          client_id
          <input name="clientId" autocomplete="off" value="${escapeHtml(config.clientId || "")}" required>
        </label>
        <label>
          API-Key / client_password
          <input name="clientPassword" type="password" autocomplete="off" value="${escapeHtml(config.clientPassword || "")}" required>
        </label>
        <div class="mhfa-actions">
          <button type="submit">Speichern</button>
        </div>
      </form>
    `;

    document.getElementById("mhfa-settings-form")?.addEventListener("submit", (event) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      chrome.storage.local.set({
        clientId: String(data.get("clientId") || "").trim(),
        clientPassword: String(data.get("clientPassword") || "").trim()
      }, () => {
        loadInvoice(mhfaState.invoiceId);
      });
    });
  });
}

function renderRoofPositionButton(position) {
  const dimensions = parseRoofDimensions(position.description);
  const detail = dimensions
    ? `${dimensions.widthCm}cm B, ${dimensions.outerHeightCm}cm H außen, ${dimensions.innerHeightCm}cm H innen`
    : "Abmessungen nicht erkannt";

  return `
    <button type="button" class="mhfa-position" data-mhfa-position-id="${escapeHtml(position.id || position.sort_order)}">
      <span>${escapeHtml(position.description.split("\n")[0] || "Dachschraegenregal")}</span>
      <small>${escapeHtml(detail)} · ${formatMoney(position.net_amount || position.unit_price)}</small>
    </button>
  `;
}

function renderEditor(positionId = null) {
  const content = document.getElementById("mhfa-content");
  if (!content || !mhfaState.invoice) return;

  const position = positionId ? findPosition(positionId) : null;
  const dimensions = position ? parseRoofDimensions(position.description) : null;

  mhfaState.mode = "editor";
  mhfaState.editPositionId = positionId;

  content.innerHTML = `
    <section class="mhfa-section mhfa-section-first">
      <button type="button" id="mhfa-back">Zurueck</button>
      <h2>${position ? "Dachschraegenregal bearbeiten" : "Dachschraegenregal hinzufuegen"}</h2>
    </section>

    <form id="mhfa-calculator" class="mhfa-form">
      <label>
        Breite in cm
        <input name="widthCm" type="number" min="1" step="1" value="${escapeHtml(dimensions?.widthCm ?? "")}" required>
      </label>
      <label>
        Hoehe außen in cm
        <input name="outerHeightCm" type="number" min="0" step="1" value="${escapeHtml(dimensions?.outerHeightCm ?? "")}" required>
      </label>
      <label>
        Hoehe innen in cm
        <input name="innerHeightCm" type="number" min="0" step="1" value="${escapeHtml(dimensions?.innerHeightCm ?? "")}" required>
      </label>

      <div class="mhfa-preview">
        <svg viewBox="0 0 260 150" role="img" aria-label="Korpusform">
          <polygon id="mhfa-shape" points="24,126 236,126 236,24 24,126"></polygon>
        </svg>
        <dl class="mhfa-totals">
          <div><dt>Flaeche</dt><dd id="mhfa-area">-</dd></div>
          <div><dt>Preis netto</dt><dd id="mhfa-price">-</dd></div>
        </dl>
      </div>

      <div class="mhfa-actions">
        <button type="submit">Speichern</button>
      </div>
    </form>
  `;

  const form = document.getElementById("mhfa-calculator");
  document.getElementById("mhfa-back")?.addEventListener("click", renderOverview);
  form?.addEventListener("input", updateCalculatorPreview);
  form?.addEventListener("submit", saveRoofPosition);
  updateCalculatorPreview();
}

function updateCalculatorPreview() {
  const form = document.getElementById("mhfa-calculator");
  if (!form) return;

  const dimensions = readDimensions(form);
  const calculation = calculateRoofSlope(dimensions);
  const shape = document.getElementById("mhfa-shape");

  document.getElementById("mhfa-area").textContent = `${formatNumber(calculation.areaSqm)} m²`;
  document.getElementById("mhfa-price").textContent = formatMoney(calculation.price);

  if (shape) {
    const leftTopY = mapHeightToSvgY(dimensions.outerHeightCm, calculation.maxHeightCm);
    const rightTopY = mapHeightToSvgY(dimensions.innerHeightCm, calculation.maxHeightCm);
    shape.setAttribute("points", `24,126 236,126 236,${rightTopY} 24,${leftTopY}`);
  }
}

function saveRoofPosition(event) {
  event.preventDefault();

  const form = event.currentTarget;
  const dimensions = readDimensions(form);
  const calculation = calculateRoofSlope(dimensions);
  const positions = getPositions(mhfaState.invoice).map(toUpdatePosition);
  const updatedPosition = {
    description: buildRoofDescription(dimensions),
    quantity: 1,
    unit: "Stk",
    unit_price: roundMoney(calculation.price),
    tax_rate: 19
  };

  const existingIndex = mhfaState.editPositionId
    ? positions.findIndex((position, index) => getOriginalPositionKey(getPositions(mhfaState.invoice)[index]) === mhfaState.editPositionId)
    : -1;

  if (existingIndex >= 0) {
    positions[existingIndex] = updatedPosition;
  } else {
    positions.push(updatedPosition);
  }

  setSaving(true);
  chrome.runtime.sendMessage({
    type: "updateInvoicePositions",
    invoiceId: mhfaState.invoiceId,
    positions
  }, (response) => {
    setSaving(false);

    if (chrome.runtime.lastError) {
      renderSaveError(chrome.runtime.lastError.message);
      return;
    }

    if (!response?.ok) {
      renderSaveError(response?.error || "Speichern fehlgeschlagen.");
      return;
    }

    window.location.reload();
  });
}

function setSaving(isSaving) {
  const button = document.querySelector("#mhfa-calculator button[type='submit']");
  if (!button) return;
  button.disabled = isSaving;
  button.textContent = isSaving ? "Speichert..." : "Speichern";
}

function renderSaveError(message) {
  const form = document.getElementById("mhfa-calculator");
  if (!form) return;

  let error = document.getElementById("mhfa-save-error");
  if (!error) {
    error = document.createElement("p");
    error.id = "mhfa-save-error";
    error.className = "mhfa-error";
    form.appendChild(error);
  }
  error.textContent = message;
}

function readDimensions(form) {
  const data = new FormData(form);
  return {
    widthCm: Math.max(0, Number(data.get("widthCm")) || 0),
    outerHeightCm: Math.max(0, Number(data.get("outerHeightCm")) || 0),
    innerHeightCm: Math.max(0, Number(data.get("innerHeightCm")) || 0)
  };
}

function calculateRoofSlope({ widthCm, outerHeightCm, innerHeightCm }) {
  const areaSqm = (widthCm / 100) * (((outerHeightCm + innerHeightCm) / 2) / 100);
  return {
    areaSqm,
    price: areaSqm * MHFA_PRICE_PER_SQM,
    maxHeightCm: Math.max(outerHeightCm, innerHeightCm, 1)
  };
}

function mapHeightToSvgY(heightCm, maxHeightCm) {
  const usableHeight = 102;
  return 126 - (heightCm / maxHeightCm) * usableHeight;
}

function buildRoofDescription({ widthCm, outerHeightCm, innerHeightCm }) {
  return [
    "Dachschrägenregal",
    `Abbmessungen: ${widthCm}cm Breite, ${outerHeightCm}cm Höhe außen, ${innerHeightCm}cm Höhe innen`
  ].join("\n");
}

function parseRoofDimensions(description = "") {
  const match = description.match(/(\d+(?:[,.]\d+)?)\s*cm\s+Breite,\s*(\d+(?:[,.]\d+)?)\s*cm\s+H(?:oe|ö)he\s+außen,\s*(\d+(?:[,.]\d+)?)\s*cm\s+H(?:oe|ö)he\s+innen/i);
  if (!match) return null;

  return {
    widthCm: parseGermanNumber(match[1]),
    outerHeightCm: parseGermanNumber(match[2]),
    innerHeightCm: parseGermanNumber(match[3])
  };
}

function parseGermanNumber(value) {
  return Number(String(value).replace(",", "."));
}

function isRoofSlopePosition(position) {
  return String(position.description || "").toLowerCase().includes("dachschraegenregal")
    || String(position.description || "").toLowerCase().includes("dachschrägenregal");
}

function findPosition(positionId) {
  return getPositions(mhfaState.invoice).find((position) => getOriginalPositionKey(position) === positionId) || null;
}

function getOriginalPositionKey(position) {
  return String(position.id || position.sort_order || "");
}

function getPositions(invoice) {
  return Array.isArray(invoice?.positions) ? invoice.positions : [];
}

function toUpdatePosition(position) {
  return {
    description: position.description || "",
    quantity: Number(position.quantity) || 1,
    unit: position.unit || "",
    unit_price: Number(position.unit_price) || 0,
    tax_rate: Number(position.tax_rate) || 19
  };
}

function renderError(content, message) {
  content.innerHTML = `
    <p class="mhfa-error">${escapeHtml(message)}</p>
    <button type="button" id="mhfa-options">Zugangsdaten bearbeiten</button>
  `;
  document.getElementById("mhfa-options")?.addEventListener("click", () => {
    renderSettings();
  });
}

function formatMoney(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return "-";
  }

  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR"
  }).format(number);
}

function formatNumber(value) {
  return new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Number(value) || 0);
}

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
