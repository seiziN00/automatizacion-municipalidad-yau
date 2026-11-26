// Almacenamiento simple en archivo JSON con escritura atómica.
// Para escalar, reemplazar este módulo por un repositorio PostgreSQL/MySQL
// manteniendo la misma interfaz.
const fs = require("fs");
const path = require("path");
const { dataFile } = require("./config");

const empty = { tramites: [], notificaciones: [], auditoria: [] };
let state;

function load() {
  if (state) return state;
  try {
    state = { ...empty, ...JSON.parse(fs.readFileSync(dataFile, "utf8")) };
  } catch {
    state = structuredClone(empty);
  }
  return state;
}

function save() {
  fs.mkdirSync(path.dirname(dataFile), { recursive: true });
  const tmp = `${dataFile}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, dataFile);
}

function audit(accion, detalle) {
  load().auditoria.push({ fecha: new Date().toISOString(), accion, ...detalle });
  save();
}

module.exports = { load, save, audit };
