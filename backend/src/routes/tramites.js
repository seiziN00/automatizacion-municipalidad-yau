const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const express = require("express");
const multer = require("multer");
const db = require("../db");
const ml = require("../services/mlClient");
const notifier = require("../services/notifier");
const { maxPdfMb } = require("../config");

const router = express.Router();
const UPLOAD_DIR = path.join(__dirname, "..", "..", "uploads");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: maxPdfMb * 1024 * 1024 },
  fileFilter: (_req, file, cb) =>
    file.mimetype === "application/pdf" ? cb(null, true) : cb(Object.assign(new Error("Solo se aceptan PDF"), { status: 400 })),
});

const ESTADOS = ["registrado", "en_revision", "observado", "aprobado", "rechazado", "finalizado"];
const TRANSICIONES = {
  registrado: ["en_revision", "observado", "rechazado"],
  en_revision: ["observado", "aprobado", "rechazado"],
  observado: ["en_revision", "rechazado"],
  aprobado: ["finalizado"],
  rechazado: [],
  finalizado: [],
};

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function generarCodigo(state) {
  const year = new Date().getFullYear();
  const n = state.tramites.filter((t) => t.codigo.includes(`-${year}-`)).length + 1;
  return `EXP-${year}-${String(n).padStart(6, "0")}`;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

// Datos personales mínimos en vistas de listado (minimización - Ley 29733)
function vistaListado(t) {
  return {
    ...t,
    ciudadano: { nombre: t.ciudadano.nombre, dni: `****${t.ciudadano.dni.slice(-4)}` },
    archivo: t.archivo ? { nombre: t.archivo.nombre, paginas: t.archivo.paginas } : null,
  };
}

function validarCiudadano(body) {
  const { nombre, dni, correo, telefono } = body;
  if (!nombre || !/^\d{8}$/.test(dni || "")) {
    throw Object.assign(new Error("Nombre y DNI (8 dígitos) son obligatorios"), { status: 400 });
  }
  if (correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
    throw Object.assign(new Error("Correo inválido"), { status: 400 });
  }
  if (body.consentimiento !== "true" && body.consentimiento !== true) {
    throw Object.assign(new Error("Se requiere el consentimiento para el tratamiento de datos personales"), { status: 400 });
  }
  return { nombre: String(nombre).trim(), dni, correo: correo || null, telefono: telefono || null };
}

/** POST /api/tramites  (multipart: archivo PDF + datos del ciudadano) */
router.post(
  "/",
  upload.single("archivo"),
  wrap(async (req, res) => {
    const ciudadano = validarCiudadano(req.body);
    if (!req.file && !req.body.descripcion) {
      return res.status(400).json({ error: "Adjunte un PDF o ingrese una descripción" });
    }

    const clasificacion = req.file
      ? await ml.classifyPdf(req.file.buffer, req.file.originalname)
      : await ml.classifyText(req.body.descripcion);

    const state = db.load();
    const id = crypto.randomUUID();
    const ahora = new Date().toISOString();
    let archivo = null;

    if (req.file) {
      fs.mkdirSync(UPLOAD_DIR, { recursive: true });
      const fileName = `${id}.pdf`;
      fs.writeFileSync(path.join(UPLOAD_DIR, fileName), req.file.buffer);
      archivo = { nombre: req.file.originalname, ruta: fileName, paginas: clasificacion.paginas, bytes: req.file.size };
    }

    const tramite = {
      id,
      codigo: generarCodigo(state),
      ciudadano,
      descripcion: req.body.descripcion || clasificacion.extracto || "",
      archivo,
      categoria: clasificacion.categoria,
      confianza: clasificacion.confianza,
      alternativas: clasificacion.alternativas,
      areaDestino: clasificacion.area_destino,
      prioridad: clasificacion.prioridad,
      requiereRevisionManual: clasificacion.requiere_revision_manual,
      palabrasClave: clasificacion.palabras_clave,
      estado: "registrado",
      fechaRegistro: ahora,
      fechaLimite: addDays(ahora, clasificacion.plazo_dias),
      historial: [{ estado: "registrado", fecha: ahora, comentario: "Registro y clasificación automática" }],
    };

    state.tramites.push(tramite);
    db.save();
    db.audit("crear_tramite", { tramiteId: id, categoria: tramite.categoria });

    await notifier.notify(tramite);
    if (tramite.prioridad.nivel === "alta") {
      notifier.alertStaff("tramite_critico", { id, codigo: tramite.codigo, area: tramite.areaDestino, puntaje: tramite.prioridad.puntaje });
    }

    res.status(201).json(tramite);
  })
);

/** GET /api/tramites?estado=&categoria=&prioridad=&q=  — ordenados por prioridad */
router.get("/", (req, res) => {
  const { estado, categoria, prioridad, area, q } = req.query;
  let list = db.load().tramites;
  if (estado) list = list.filter((t) => t.estado === estado);
  if (categoria) list = list.filter((t) => t.categoria === categoria);
  if (prioridad) list = list.filter((t) => t.prioridad.nivel === prioridad);
  if (area) list = list.filter((t) => t.areaDestino === area);
  if (q) {
    const s = String(q).toLowerCase();
    list = list.filter((t) => t.codigo.toLowerCase().includes(s) || t.ciudadano.nombre.toLowerCase().includes(s));
  }
  const ahora = Date.now();
  const sorted = [...list]
    .map((t) => ({ ...t, vencido: !["finalizado", "rechazado"].includes(t.estado) && Date.parse(t.fechaLimite) < ahora }))
    .sort((a, b) => b.vencido - a.vencido || b.prioridad.puntaje - a.prioridad.puntaje || a.fechaRegistro.localeCompare(b.fechaRegistro));
  res.json(sorted.map(vistaListado));
});

/** GET /api/tramites/consulta?codigo=&dni=  — consulta pública del ciudadano */
router.get("/consulta", (req, res) => {
  const { codigo, dni } = req.query;
  const t = db.load().tramites.find((x) => x.codigo === codigo && x.ciudadano.dni === dni);
  if (!t) return res.status(404).json({ error: "Trámite no encontrado" });
  const notificaciones = db.load().notificaciones.filter((n) => n.tramiteId === t.id);
  res.json({
    codigo: t.codigo, estado: t.estado, categoria: t.categoria, areaDestino: t.areaDestino,
    fechaRegistro: t.fechaRegistro, fechaLimite: t.fechaLimite, historial: t.historial, notificaciones,
  });
});

router.get("/:id", (req, res) => {
  const t = db.load().tramites.find((x) => x.id === req.params.id);
  if (!t) return res.status(404).json({ error: "Trámite no encontrado" });
  res.json(t);
});

router.get("/:id/archivo", (req, res) => {
  const t = db.load().tramites.find((x) => x.id === req.params.id);
  if (!t?.archivo) return res.status(404).json({ error: "Archivo no encontrado" });
  db.audit("ver_archivo", { tramiteId: t.id });
  res.sendFile(path.join(UPLOAD_DIR, t.archivo.ruta));
});

/** PATCH /api/tramites/:id/estado  { estado, comentario } */
router.patch(
  "/:id/estado",
  wrap(async (req, res) => {
    const { estado, comentario = "" } = req.body;
    const state = db.load();
    const t = state.tramites.find((x) => x.id === req.params.id);
    if (!t) return res.status(404).json({ error: "Trámite no encontrado" });
    if (!ESTADOS.includes(estado)) return res.status(400).json({ error: `Estado inválido. Use: ${ESTADOS.join(", ")}` });
    if (!TRANSICIONES[t.estado].includes(estado)) {
      return res.status(409).json({ error: `No se puede pasar de '${t.estado}' a '${estado}'` });
    }
    t.estado = estado;
    t.historial.push({ estado, fecha: new Date().toISOString(), comentario });
    db.save();
    db.audit("cambiar_estado", { tramiteId: t.id, estado });
    const notificacion = await notifier.notify(t, comentario);
    res.json({ tramite: t, notificacion });
  })
);

/** PATCH /api/tramites/:id/clasificacion  — corrección manual (retroalimenta el modelo) */
router.patch(
  "/:id/clasificacion",
  wrap(async (req, res) => {
    const { categoria, prioridad } = req.body;
    const state = db.load();
    const t = state.tramites.find((x) => x.id === req.params.id);
    if (!t) return res.status(404).json({ error: "Trámite no encontrado" });
    const cats = await ml.categories();
    const cat = cats.find((c) => c.id === categoria);
    if (!cat) return res.status(400).json({ error: "Categoría inválida" });

    await ml.feedback({ texto: t.descripcion, categoria, prioridad: prioridad || t.prioridad.nivel });
    t.categoria = categoria;
    t.areaDestino = cat.area;
    if (prioridad) t.prioridad = { ...t.prioridad, nivel: prioridad, motivos: [...t.prioridad.motivos, "Ajuste manual"] };
    t.requiereRevisionManual = false;
    db.save();
    db.audit("corregir_clasificacion", { tramiteId: t.id, categoria, prioridad });
    res.json(t);
  })
);

module.exports = router;
