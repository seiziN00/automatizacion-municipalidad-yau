const { mlServiceUrl } = require("../config");

async function request(path, options = {}) {
  let res;
  try {
    res = await fetch(`${mlServiceUrl}${path}`, { ...options, signal: AbortSignal.timeout(60000) });
  } catch (err) {
    const e = new Error(`Servicio ML no disponible: ${err.message}`);
    e.status = 503;
    throw e;
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = new Error(body.detail || `Error del servicio ML (${res.status})`);
    e.status = res.status;
    throw e;
  }
  return body;
}

module.exports = {
  classifyPdf(buffer, filename) {
    const form = new FormData();
    form.append("file", new Blob([buffer], { type: "application/pdf" }), filename);
    return request("/classify/pdf", { method: "POST", body: form });
  },
  classifyText(texto) {
    return request("/classify/text", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texto }),
    });
  },
  feedback(payload) {
    return request("/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  },
  train: () => request("/train", { method: "POST" }),
  metrics: () => request("/metrics"),
  categories: () => request("/categories"),
  health: () => request("/health"),
};
