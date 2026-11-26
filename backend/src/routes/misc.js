const express = require("express");
const multer = require("multer");
const db = require("../db");
const ml = require("../services/mlClient");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// ---- Machine Learning ----
router.get("/ml/health", wrap(async (_req, res) => res.json(await ml.health())));
router.get("/ml/categorias", wrap(async (_req, res) => res.json(await ml.categories())));
router.get("/ml/metricas", wrap(async (_req, res) => res.json(await ml.metrics())));
router.post("/ml/entrenar", wrap(async (_req, res) => {
  const m = await ml.train();
  db.audit("reentrenar_modelo", { accuracy: m.accuracy_categoria });
  res.json(m);
}));
// Clasificación de prueba sin registrar trámite
router.post("/ml/clasificar", upload.single("archivo"), wrap(async (req, res) => {
  if (req.file) return res.json(await ml.classifyPdf(req.file.buffer, req.file.originalname));
  if (req.body?.texto) return res.json(await ml.classifyText(req.body.texto));
  res.status(400).json({ error: "Envíe 'archivo' (PDF) o 'texto'" });
}));

// ---- Notificaciones ----
router.get("/notificaciones", (req, res) => {
  const { codigo } = req.query;
  let list = db.load().notificaciones;
  if (codigo) list = list.filter((n) => n.codigo === codigo);
  res.json([...list].reverse().slice(0, 200));
});
router.patch("/notificaciones/:id/leida", (req, res) => {
  const n = db.load().notificaciones.find((x) => x.id === req.params.id);
  if (!n) return res.status(404).json({ error: "No encontrada" });
  n.leida = true;
  db.save();
  res.json(n);
});

// ---- Estadísticas (identificar cuellos de botella) ----
router.get("/estadisticas", (_req, res) => {
  const { tramites } = db.load();
  const ahora = Date.now();
  const count = (fn) => tramites.reduce((acc, t) => ((acc[fn(t)] = (acc[fn(t)] || 0) + 1), acc), {});
  const abiertos = tramites.filter((t) => !["finalizado", "rechazado"].includes(t.estado));
  const cerrados = tramites.filter((t) => ["finalizado", "rechazado"].includes(t.estado));
  const dias = (t) => (Date.parse(t.historial.at(-1).fecha) - Date.parse(t.fechaRegistro)) / 86400000;

  const porArea = {};
  for (const t of abiertos) {
    const a = (porArea[t.areaDestino] ||= { pendientes: 0, vencidos: 0 });
    a.pendientes++;
    if (Date.parse(t.fechaLimite) < ahora) a.vencidos++;
  }

  res.json({
    total: tramites.length,
    pendientes: abiertos.length,
    vencidos: abiertos.filter((t) => Date.parse(t.fechaLimite) < ahora).length,
    criticos: abiertos.filter((t) => t.prioridad.nivel === "alta").length,
    requierenRevision: abiertos.filter((t) => t.requiereRevisionManual).length,
    tiempoPromedioDias: cerrados.length ? +(cerrados.reduce((s, t) => s + dias(t), 0) / cerrados.length).toFixed(2) : null,
    porEstado: count((t) => t.estado),
    porCategoria: count((t) => t.categoria),
    porPrioridad: count((t) => t.prioridad.nivel),
    cuellosDeBotella: Object.entries(porArea)
      .map(([area, v]) => ({ area, ...v }))
      .sort((a, b) => b.vencidos - a.vencidos || b.pendientes - a.pendientes),
  });
});

module.exports = router;
