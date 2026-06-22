const API_BASE_URL = "https://verwaltung.mein-handwerker-app.de/public/MH_Api";
const APP_HOME_URL = "https://verwaltung.mein-handwerker-app.de/";
const BILLING_EDIT_PATTERN = /^https:\/\/verwaltung\.mein-handwerker-app\.de\/billing\/edit\/\d+\/?$/;

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id || !tab.url) {
    return;
  }

  if (!BILLING_EDIT_PATTERN.test(tab.url)) {
    await offerOpenMeinHandwerker(tab.id);
    return;
  }

  try {
    await chrome.tabs.sendMessage(tab.id, { type: "openPanel" });
  } catch {
    await chrome.scripting.insertCSS({
      target: { tabId: tab.id },
      files: ["content.css"]
    });
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content.js"]
    });
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "getInvoice") {
    getInvoiceBundle(message.invoiceId)
      .then((data) => sendResponse({ ok: true, data }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "updateInvoicePositions") {
    updateInvoicePositions(message.invoiceId, message.positions)
      .then((data) => sendResponse({ ok: true, data }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "openOptions") {
    chrome.runtime.openOptionsPage();
    sendResponse({ ok: true });
    return false;
  }

  return false;
});

async function offerOpenMeinHandwerker(tabId) {
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: (url) => window.confirm(`Der Faktura Assistent funktioniert auf Rechnungsseiten.\n\nZu MeinHandwerker wechseln?\n${url}`),
    args: [APP_HOME_URL]
  });

  if (result) {
    await chrome.tabs.update(tabId, { url: APP_HOME_URL });
  }
}

async function getInvoiceBundle(invoiceId) {
  const config = await chrome.storage.local.get(["clientId", "clientPassword"]);
  if (!config.clientId || !config.clientPassword) {
    throw new Error("Bitte client_id und API-Key in den Extension-Optionen hinterlegen.");
  }

  const invoice = await postJson("/get_invoice", {
    client_id: config.clientId,
    client_password: config.clientPassword,
    invoice_id: Number(invoiceId)
  });

  let customer = null;
  if (invoice.customer_id) {
    customer = await getCustomer(config, invoice.customer_id);
  }

  return { invoice, customer };
}

async function updateInvoicePositions(invoiceId, positions) {
  const config = await chrome.storage.local.get(["clientId", "clientPassword"]);
  if (!config.clientId || !config.clientPassword) {
    throw new Error("Bitte client_id und API-Key in den Extension-Optionen hinterlegen.");
  }

  if (!Array.isArray(positions) || positions.length === 0) {
    throw new Error("Mindestens eine Rechnungsposition ist erforderlich.");
  }

  return postJson("/update_invoice", {
    client_id: config.clientId,
    client_password: config.clientPassword,
    invoice_id: Number(invoiceId),
    positions
  });
}

async function getCustomer(config, customerId) {
  const url = new URL(`${API_BASE_URL}/get_customers`);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("client_password", config.clientPassword);
  url.searchParams.set("id", customerId);

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`Kunde konnte nicht geladen werden (${response.status}).`);
  }

  const data = await response.json();
  return Array.isArray(data) ? data[0] ?? null : data;
}

async function postJson(path, body) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`Ungueltige API-Antwort (${response.status}).`);
  }

  if (!response.ok) {
    throw new Error(data?.message || `API-Fehler (${response.status}).`);
  }

  return data;
}
