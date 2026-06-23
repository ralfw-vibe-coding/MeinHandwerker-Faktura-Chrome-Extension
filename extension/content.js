const MHFA_PRICE_PER_SQM = 500;
let mhfaState = {
  pageMode: "edit",
  invoiceId: null,
  constructionId: null,
  invoice: null,
  customer: null,
  mode: "overview",
  editPositionId: null,
  editorSnapshot: ""
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
  const context = getBillingContext(window.location.pathname);
  if (!context) {
    return;
  }

  mhfaState.pageMode = context.mode;
  mhfaState.invoiceId = context.invoiceId || null;
  mhfaState.constructionId = context.constructionId || null;

  const existingPanel = document.getElementById("mhfa-panel");
  if (existingPanel) {
    existingPanel.hidden = false;
    if (mhfaState.pageMode === "create") {
      startCreateMode();
    } else if (mhfaState.invoice) {
      renderOverview();
    } else {
      loadInvoice(mhfaState.invoiceId);
    }
    return;
  }

  const panel = document.createElement("aside");
  panel.id = "mhfa-panel";
  panel.innerHTML = `
    <header class="mhfa-header">
      <div>
        <strong>Faktura Assistent</strong>
        <span>${escapeHtml(getPanelSubtitle())}</span>
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
  document.getElementById("mhfa-refresh")?.addEventListener("click", () => {
    if (mhfaState.pageMode === "create") {
      startCreateMode();
    } else {
      loadInvoice(mhfaState.invoiceId);
    }
  });
  document.getElementById("mhfa-close")?.addEventListener("click", () => {
    if (!confirmDiscardEditorChanges()) {
      return;
    }
    panel.hidden = true;
  });
  if (mhfaState.pageMode === "create") {
    startCreateMode();
  } else {
    loadInvoice(mhfaState.invoiceId);
  }
}

function getBillingContext(pathname) {
  const editMatch = pathname.match(/^\/billing\/edit\/(\d+)\/?$/);
  if (editMatch) {
    return { mode: "edit", invoiceId: editMatch[1] };
  }

  const createMatch = pathname.match(/^\/billing\/create_billing\/(\d+)\/?$/);
  if (createMatch) {
    return { mode: "create", constructionId: createMatch[1] };
  }

  return null;
}

function getPanelSubtitle() {
  if (mhfaState.pageMode === "create") {
    return `Neue Rechnung für Projekt ${mhfaState.constructionId}`;
  }
  return `Rechnung ${mhfaState.invoiceId}`;
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

function startCreateMode() {
  const content = document.getElementById("mhfa-content");
  if (!content) return;

  chrome.storage.local.get(["clientId", "clientPassword"], (config) => {
    if (!config.clientId || !config.clientPassword) {
      renderSettings("Bitte client_id und API-Key eintragen.");
      return;
    }

    mhfaState.invoice = null;
    mhfaState.customer = null;
    renderEditor();
  });
}

function renderOverview() {
  const content = document.getElementById("mhfa-content");
  if (!content || !mhfaState.invoice) return;

  mhfaState.mode = "overview";
  mhfaState.editPositionId = null;
  mhfaState.editorSnapshot = "";

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
        <h2>Dachschrägenregale</h2>
        <button type="button" id="mhfa-add" class="mhfa-icon-button" title="Position hinzufügen">+</button>
      </div>
      ${roofPositions.length
        ? `<div class="mhfa-position-list">${roofPositions.map(renderRoofPositionButton).join("")}</div>`
        : `<p class="mhfa-muted">Noch keine Dachschrägenregal-Position in dieser Rechnung.</p>`}
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
        if (mhfaState.pageMode === "create") {
          startCreateMode();
        } else {
          loadInvoice(mhfaState.invoiceId);
        }
      });
    });
  });
}

function renderRoofPositionButton(position) {
  const dimensions = parseRoofDimensions(position.description);
  const detail = dimensions
    ? `${dimensions.widthCm}cm B, ${dimensions.outerHeightCm}cm H außen ${dimensions.outerSide}, ${dimensions.innerHeightCm}cm H innen`
    : "Abmessungen nicht erkannt";

  return `
    <button type="button" class="mhfa-position" data-mhfa-position-id="${escapeHtml(position.id || position.sort_order)}">
      <span>${escapeHtml(position.description.split("\n")[0] || "Dachschrägenregal")}</span>
      <small>${escapeHtml(detail)} · ${formatMoney(position.net_amount || position.unit_price)}</small>
    </button>
  `;
}

function renderEditor(positionId = null) {
  const content = document.getElementById("mhfa-content");
  if (!content || (mhfaState.pageMode !== "create" && !mhfaState.invoice)) return;

  const position = positionId ? findPosition(positionId) : null;
  const dimensions = position ? parseRoofDimensions(position.description) : null;
  const isCreateMode = mhfaState.pageMode === "create";

  mhfaState.mode = "editor";
  mhfaState.editPositionId = positionId;

  content.innerHTML = `
    <section class="mhfa-section mhfa-section-first">
      <div class="mhfa-section-title">
        <h2>${position ? "Dachschrägenregal bearbeiten" : isCreateMode ? "Erste Position kalkulieren" : "Dachschrägenregal hinzufügen"}</h2>
        <div class="mhfa-editor-actions">
          <button type="submit" form="mhfa-calculator" id="mhfa-save" class="mhfa-tool-button mhfa-save-button" title="Speichern" aria-label="Speichern" disabled>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8A2 2 0 0 1 21 8.8V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"></path>
              <path d="M17 21v-7H7v7"></path>
              <path d="M7 3v5h8"></path>
            </svg>
          </button>
          <button type="button" id="mhfa-back" class="mhfa-tool-button" title="Zurück" aria-label="Zurück">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M18 6 6 18"></path>
              <path d="m6 6 12 12"></path>
            </svg>
          </button>
        </div>
      </div>
    </section>

    <form id="mhfa-calculator" class="mhfa-form">
      <div class="mhfa-measure-row">
        <input name="widthCm" type="number" min="1" step="1" placeholder="Breite cm" value="${escapeHtml(dimensions?.widthCm ?? "")}" required>
        <input name="outerHeightCm" type="number" min="0" step="1" placeholder="H außen cm" value="${escapeHtml(dimensions?.outerHeightCm ?? "")}" required>
        <input name="innerHeightCm" type="number" min="0" step="1" placeholder="H innen cm" value="${escapeHtml(dimensions?.innerHeightCm ?? "")}" required>
      </div>
      <fieldset class="mhfa-chip-field mhfa-side-field">
        <div class="mhfa-chip-row">
          <label class="mhfa-chip">
            <input type="radio" name="outerSide" value="links" ${!dimensions || dimensions.outerSide === "links" ? "checked" : ""}>
            <span>links</span>
          </label>
          <label class="mhfa-chip">
            <input type="radio" name="outerSide" value="rechts" ${dimensions?.outerSide === "rechts" ? "checked" : ""}>
            <span>rechts</span>
          </label>
        </div>
      </fieldset>

      <div class="mhfa-form-divider"></div>
      <input name="compartmentCount" type="number" min="1" step="1" placeholder="Fächer" value="${escapeHtml(dimensions?.compartmentCount ?? 1)}">
      <div class="mhfa-shelf-config">
        <div class="mhfa-small-label">Regalböden je Fach:</div>
        <div id="mhfa-shelf-fields" class="mhfa-shelf-fields"></div>
      </div>

      <div class="mhfa-preview">
        <svg viewBox="0 0 260 150" role="img" aria-label="Korpusform">
          <polygon id="mhfa-shape" points="24,126 236,126 236,24 24,126"></polygon>
          <g id="mhfa-partitions"></g>
          <g id="mhfa-shelves"></g>
        </svg>
        <dl class="mhfa-totals">
          <div><dt>Fläche</dt><dd id="mhfa-area">-</dd></div>
          <div><dt>Einbauten</dt><dd id="mhfa-buildout-price">-</dd></div>
          <div><dt>Preis netto</dt><dd id="mhfa-price">-</dd></div>
        </dl>
        <div id="mhfa-bom" class="mhfa-bom"></div>
      </div>
    </form>
  `;

  const form = document.getElementById("mhfa-calculator");
  document.getElementById("mhfa-back")?.addEventListener("click", () => {
    if (confirmDiscardEditorChanges()) {
      if (mhfaState.pageMode === "create") {
        document.getElementById("mhfa-panel").hidden = true;
      } else {
        renderOverview();
      }
    }
  });
  renderShelfFields(dimensions?.shelvesPerCompartment || [], dimensions?.compartmentCount || 0);
  for (const input of form?.querySelectorAll("input[type='number']") || []) {
    input.addEventListener("focus", () => input.select());
  }
  form?.addEventListener("input", (event) => {
    if (event.target?.name === "compartmentCount") {
      renderShelfFields(readShelfCounts(form), getCompartmentCount(form));
      for (const input of form.querySelectorAll("input[type='number']")) {
        input.addEventListener("focus", () => input.select());
      }
    }
    updateCalculatorPreview();
  });
  form?.addEventListener("submit", saveRoofPosition);
  updateCalculatorPreview();
  mhfaState.editorSnapshot = getEditorSnapshot(form);
  updateEditorDirtyState();
}

function updateCalculatorPreview() {
  const form = document.getElementById("mhfa-calculator");
  if (!form) return;

  const dimensions = readDimensions(form);
  const calculation = calculateRoofSlope(dimensions);
  const shape = document.getElementById("mhfa-shape");
  const parts = getScaledShapeParts(dimensions);
  const bom = calculateBillOfMaterials(dimensions);

  document.getElementById("mhfa-area").textContent = `${formatNumber(calculation.areaSqm)} m²`;
  document.getElementById("mhfa-buildout-price").textContent = formatMoney(calculation.buildoutPrice);
  document.getElementById("mhfa-price").textContent = formatMoney(calculation.price);
  document.getElementById("mhfa-bom").innerHTML = renderBillOfMaterials(bom);

  if (shape) {
    shape.setAttribute("points", parts.outlinePoints);
    document.getElementById("mhfa-partitions").innerHTML = parts.partitionLines.join("");
    document.getElementById("mhfa-shelves").innerHTML = parts.shelfLines.join("");
  }
  updateEditorDirtyState();
}

function getEditorSnapshot(form) {
  if (!form) return "";
  return JSON.stringify(readDimensions(form));
}

function isEditorDirty() {
  const form = document.getElementById("mhfa-calculator");
  return mhfaState.mode === "editor" && Boolean(form) && getEditorSnapshot(form) !== mhfaState.editorSnapshot;
}

function updateEditorDirtyState() {
  const saveButton = document.getElementById("mhfa-save");
  if (!saveButton) return;
  saveButton.disabled = !isEditorDirty();
}

function confirmDiscardEditorChanges() {
  if (!isEditorDirty()) {
    return true;
  }
  return window.confirm("Es gibt ungespeicherte Änderungen. Wirklich schließen?");
}

function saveRoofPosition(event) {
  event.preventDefault();

  const form = event.currentTarget;
  const dimensions = readDimensions(form);
  const calculation = calculateRoofSlope(dimensions);
  const positions = mhfaState.pageMode === "create" ? [] : getPositions(mhfaState.invoice).map(toUpdatePosition);
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
  const message = mhfaState.pageMode === "create"
    ? {
        type: "createInvoice",
        constructionId: mhfaState.constructionId,
        positions
      }
    : {
        type: "updateInvoicePositions",
        invoiceId: mhfaState.invoiceId,
        positions
      };

  chrome.runtime.sendMessage(message, (response) => {
    setSaving(false);

    if (chrome.runtime.lastError) {
      renderSaveError(chrome.runtime.lastError.message);
      return;
    }

    if (!response?.ok) {
      renderSaveError(response?.error || "Speichern fehlgeschlagen.");
      return;
    }

    if (mhfaState.pageMode === "create") {
      const invoiceId = response.data?.invoice_id;
      if (!invoiceId) {
        renderSaveError("Rechnung wurde angelegt, aber die API hat keine invoice_id zurückgegeben.");
        return;
      }
      window.location.href = `https://verwaltung.mein-handwerker-app.de/billing/edit/${invoiceId}`;
      return;
    }

    window.location.reload();
  });
}

function setSaving(isSaving) {
  const button = document.getElementById("mhfa-save");
  if (!button) return;
  button.disabled = isSaving;
  button.classList.toggle("is-saving", isSaving);
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
  const compartmentCount = getCompartmentCount(form);
  return {
    widthCm: Math.max(0, Number(data.get("widthCm")) || 0),
    outerHeightCm: Math.max(0, Number(data.get("outerHeightCm")) || 0),
    innerHeightCm: Math.max(0, Number(data.get("innerHeightCm")) || 0),
    outerSide: data.get("outerSide") === "rechts" ? "rechts" : "links",
    compartmentCount,
    shelvesPerCompartment: readShelfCounts(form).slice(0, compartmentCount)
  };
}

function getCompartmentCount(form) {
  const value = Number(new FormData(form).get("compartmentCount"));
  return Math.max(1, Math.floor(value || 1));
}

function readShelfCounts(form) {
  const fields = Array.from(form.querySelectorAll("[data-shelf-field]"));
  return fields.map((field) => {
    const selected = field.querySelector("input[type='radio']:checked");
    return Math.max(0, Math.floor(Number(selected?.value) || 0));
  });
}

function renderShelfFields(existingCounts, compartmentCount) {
  const container = document.getElementById("mhfa-shelf-fields");
  if (!container) return;

  const count = Math.max(1, Math.floor(Number(compartmentCount) || 1));
  const values = Array.from({ length: count }, (_, index) => existingCounts[index] ?? 0);
  container.innerHTML = `
    <table class="mhfa-shelf-table" aria-label="Regalböden je Fach">
      <thead>
        <tr>
          <th scope="col"></th>
          ${[0, 1, 2, 3, 4, 5].map((option) => `<th scope="col">${option}</th>`).join("")}
        </tr>
      </thead>
      <tbody>
        ${values.map((value, index) => `
          <tr data-shelf-field>
            <th scope="row">#${index + 1}</th>
            ${[0, 1, 2, 3, 4, 5].map((option) => `
              <td>
                <label class="mhfa-shelf-dot">
                  <input type="radio" name="shelfCount${index + 1}" value="${option}" ${Number(value) === option ? "checked" : ""}>
                  <span aria-label="${option} Regalböden"></span>
                </label>
              </td>
            `).join("")}
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function calculateRoofSlope(dimensions) {
  const { widthCm, outerHeightCm, innerHeightCm } = dimensions;
  const areaSqm = (widthCm / 100) * (((outerHeightCm + innerHeightCm) / 2) / 100);
  const bom = calculateBillOfMaterials(dimensions);
  const buildoutPrice = sumGroups(bom.partitions) + sumGroups(bom.shelves);
  return {
    areaSqm,
    basePrice: areaSqm * MHFA_PRICE_PER_SQM,
    buildoutPrice,
    price: areaSqm * MHFA_PRICE_PER_SQM + buildoutPrice
  };
}

function getScaledShapeParts(dimensions) {
  const { widthCm, outerHeightCm, innerHeightCm } = dimensions;
  const drawing = {
    x: 24,
    y: 12,
    width: 212,
    height: 114
  };
  const safeWidth = Math.max(widthCm, 1);
  const safeHeight = Math.max(outerHeightCm, innerHeightCm, 1);
  const scale = Math.min(drawing.width / safeWidth, drawing.height / safeHeight);
  const scaledWidth = safeWidth * scale;
  const leftX = drawing.x + (drawing.width - scaledWidth) / 2;
  const rightX = leftX + scaledWidth;
  const bottomY = drawing.y + drawing.height;
  const leftTopY = bottomY - getHeightAtX(dimensions, 0) * scale;
  const rightTopY = bottomY - getHeightAtX(dimensions, widthCm) * scale;
  const bom = calculateBillOfMaterials(dimensions);

  const outlinePoints = [
    [leftX, bottomY],
    [rightX, bottomY],
    [rightX, rightTopY],
    [leftX, leftTopY]
  ].map(([x, y]) => `${roundSvg(x)},${roundSvg(y)}`).join(" ");

  const partitionLines = bom.partitionItems.map((item) => {
    const x = leftX + item.xCm * scale;
    const topY = bottomY - item.lengthCm * scale;
    return `<line class="mhfa-partition-line" x1="${roundSvg(x)}" y1="${roundSvg(bottomY)}" x2="${roundSvg(x)}" y2="${roundSvg(topY)}"></line>`;
  });

  const shelfLines = bom.shelfItems.map((item) => {
    const x1 = leftX + item.startCm * scale;
    const x2 = leftX + item.endCm * scale;
    const y = bottomY - item.heightCm * scale;
    return `<line class="mhfa-shelf-line" x1="${roundSvg(x1)}" y1="${roundSvg(y)}" x2="${roundSvg(x2)}" y2="${roundSvg(y)}"></line>`;
  });

  return { outlinePoints, partitionLines, shelfLines };
}

function roundSvg(value) {
  return Math.round(value * 100) / 100;
}

function calculateBillOfMaterials(dimensions) {
  const partitionItems = getPartitionItems(dimensions);
  const shelfItems = getShelfItems(dimensions);
  return {
    partitionItems,
    shelfItems,
    partitions: groupLengths(partitionItems, 25),
    shelves: groupLengths(shelfItems, 20)
  };
}

function getPartitionItems(dimensions) {
  const { widthCm, compartmentCount } = dimensions;
  if (!widthCm || compartmentCount <= 1) return [];

  const compartmentWidth = widthCm / compartmentCount;
  return Array.from({ length: compartmentCount - 1 }, (_, index) => {
    const xCm = compartmentWidth * (index + 1);
    return {
      type: "partition",
      xCm,
      lengthCm: getHeightAtX(dimensions, xCm)
    };
  });
}

function getShelfItems(dimensions) {
  const { widthCm, compartmentCount, shelvesPerCompartment } = dimensions;
  if (!widthCm || compartmentCount < 1) return [];

  const compartmentWidth = widthCm / compartmentCount;
  const items = [];
  for (let index = 0; index < compartmentCount; index += 1) {
    const count = shelvesPerCompartment[index] || 0;
    const startCm = compartmentWidth * index;
    const endCm = startCm + compartmentWidth;
    const centerCm = startCm + compartmentWidth / 2;
    const compartmentHeight = getHeightAtX(dimensions, centerCm);

    for (let shelfIndex = 1; shelfIndex <= count; shelfIndex += 1) {
      const heightCm = compartmentHeight * (shelfIndex / (count + 1));
      const shelfSpan = getHorizontalSpanUnderSlope(dimensions, startCm, endCm, heightCm);
      items.push({
        type: "shelf",
        compartmentIndex: index,
        heightCm,
        startCm: shelfSpan.startCm,
        endCm: shelfSpan.endCm,
        lengthCm: Math.max(0, shelfSpan.endCm - shelfSpan.startCm)
      });
    }
  }
  return items;
}

function getHeightAtX({ widthCm, outerHeightCm, innerHeightCm, outerSide }, xCm) {
  const leftHeight = outerSide === "links" ? outerHeightCm : innerHeightCm;
  const rightHeight = outerSide === "links" ? innerHeightCm : outerHeightCm;
  if (!widthCm) return 0;
  return leftHeight + (rightHeight - leftHeight) * (xCm / widthCm);
}

function getHorizontalSpanUnderSlope(dimensions, startCm, endCm, shelfHeightCm) {
  const startHeight = getHeightAtX(dimensions, startCm);
  const endHeight = getHeightAtX(dimensions, endCm);
  if (startHeight >= shelfHeightCm && endHeight >= shelfHeightCm) {
    return { startCm, endCm };
  }

  const crossingCm = getXForHeight(dimensions, shelfHeightCm);
  if (startHeight < shelfHeightCm) {
    return { startCm: Math.min(Math.max(crossingCm, startCm), endCm), endCm };
  }
  return { startCm, endCm: Math.max(Math.min(crossingCm, endCm), startCm) };
}

function getXForHeight({ widthCm, outerHeightCm, innerHeightCm, outerSide }, heightCm) {
  const leftHeight = outerSide === "links" ? outerHeightCm : innerHeightCm;
  const rightHeight = outerSide === "links" ? innerHeightCm : outerHeightCm;
  const delta = rightHeight - leftHeight;
  if (!delta) return widthCm;
  return ((heightCm - leftHeight) / delta) * widthCm;
}

function groupLengths(items, ratePerMeter) {
  const groups = new Map();
  for (const item of items) {
    const lengthCm = Math.round(item.lengthCm);
    if (lengthCm <= 0) continue;
    const existing = groups.get(lengthCm) || { quantity: 0, lengthCm, price: 0 };
    existing.quantity += 1;
    existing.price = (existing.quantity * lengthCm / 100) * ratePerMeter;
    groups.set(lengthCm, existing);
  }
  return Array.from(groups.values()).sort((a, b) => b.lengthCm - a.lengthCm);
}

function sumGroups(groups) {
  return groups.reduce((sum, group) => sum + group.price, 0);
}

function renderBillOfMaterials(bom) {
  return `
    <section>
      <h3>Trennwände</h3>
      ${renderBomRows(bom.partitions)}
    </section>
    <section>
      <h3>Regalböden</h3>
      ${renderBomRows(bom.shelves)}
    </section>
  `;
}

function renderBomRows(groups) {
  if (!groups.length) {
    return `<p class="mhfa-muted">Keine</p>`;
  }

  return `
    <dl>
      ${groups.map((group) => `
        <div>
          <dt>${group.quantity} x ${group.lengthCm}cm</dt>
          <dd>${formatMoney(group.price)}</dd>
        </div>
      `).join("")}
    </dl>
  `;
}

function buildRoofDescription({ widthCm, outerHeightCm, innerHeightCm, outerSide, compartmentCount, shelvesPerCompartment }) {
  return [
    "Dachschrägenregal",
    `Abbmessungen: ${widthCm}cm Breite, ${outerHeightCm}cm Höhe außen, ${innerHeightCm}cm Höhe innen`,
    `Außenseite: ${outerSide}`,
    `Fächer: ${compartmentCount}`,
    `Regalböden je Fach: ${shelvesPerCompartment.join(", ")}`
  ].join("\n");
}

function parseRoofDimensions(description = "") {
  const match = description.match(/(\d+(?:[,.]\d+)?)\s*cm\s+Breite,\s*(\d+(?:[,.]\d+)?)\s*cm\s+H(?:oe|ö)he\s+außen,\s*(\d+(?:[,.]\d+)?)\s*cm\s+H(?:oe|ö)he\s+innen/i);
  if (!match) return null;

  return {
    widthCm: parseGermanNumber(match[1]),
    outerHeightCm: parseGermanNumber(match[2]),
    innerHeightCm: parseGermanNumber(match[3]),
    outerSide: parseOuterSide(description),
    compartmentCount: parseCompartmentCount(description),
    shelvesPerCompartment: parseShelvesPerCompartment(description)
  };
}

function parseOuterSide(description = "") {
  const match = description.match(/Außenseite:\s*(links|rechts)/i);
  return match?.[1]?.toLowerCase() === "rechts" ? "rechts" : "links";
}

function parseCompartmentCount(description = "") {
  const match = description.match(/Fächer:\s*(\d+)/i);
  return match ? Math.max(1, Number(match[1]) || 1) : 1;
}

function parseShelvesPerCompartment(description = "") {
  const match = description.match(/Regalböden je Fach:\s*([0-9,\s]+)/i);
  if (!match) return [];
  return match[1].split(",").map((value) => Math.max(0, Math.floor(Number(value.trim()) || 0)));
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
