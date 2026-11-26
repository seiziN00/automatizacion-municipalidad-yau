// Sistema de alertas: notifica en tiempo real (Socket.IO) y por correo (SMTP opcional).
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const { smtp } = require("../config");
const db = require("../db");

let io = null;
const transporter = smtp.host
  ? nodemailer.createTransport({ host: smtp.host, port: smtp.port, auth: { user: smtp.user, pass: smtp.pass } })
  : null;

const MENSAJES = {
  registrado: (t) => `Su trámite ${t.codigo} fue registrado y derivado a ${t.areaDestino}.`,
  en_revision: (t) => `Su trámite ${t.codigo} se encuentra en revisión.`,
  observado: (t) => `Su trámite ${t.codigo} tiene observaciones. Revise los detalles.`,
  aprobado: (t) => `Su trámite ${t.codigo} fue aprobado.`,
  rechazado: (t) => `Su trámite ${t.codigo} fue rechazado.`,
  finalizado: (t) => `Su trámite ${t.codigo} ha finalizado. Puede recoger su documento.`,
};

function init(socketServer) {
  io = socketServer;
  io.on("connection", (socket) => {
    // Ciudadano se suscribe a su trámite con código y DNI (no se expone a otros).
    socket.on("suscribir", ({ codigo, dni } = {}) => {
      const t = db.load().tramites.find((x) => x.codigo === codigo && x.ciudadano.dni === dni);
      if (t) socket.join(`tramite:${t.codigo}`);
      socket.emit("suscripcion", { ok: Boolean(t), codigo });
    });
    socket.on("suscribir_staff", () => socket.join("staff"));
  });
}

async function notify(tramite, detalle = "") {
  const mensaje = (MENSAJES[tramite.estado] || ((t) => `Su trámite ${t.codigo} cambió a ${t.estado}.`))(tramite);
  const n = {
    id: crypto.randomUUID(),
    tramiteId: tramite.id,
    codigo: tramite.codigo,
    estado: tramite.estado,
    mensaje: detalle ? `${mensaje} ${detalle}` : mensaje,
    fecha: new Date().toISOString(),
    canales: ["web"],
    leida: false,
  };

  if (io) {
    io.to(`tramite:${tramite.codigo}`).emit("notificacion", n);
    io.to("staff").emit("tramite_actualizado", { id: tramite.id, codigo: tramite.codigo, estado: tramite.estado });
  }

  if (transporter && tramite.ciudadano.correo) {
    try {
      await transporter.sendMail({
        from: smtp.from,
        to: tramite.ciudadano.correo,
        subject: `Trámite ${tramite.codigo}: ${tramite.estado}`,
        text: n.mensaje,
      });
      n.canales.push("email");
    } catch (err) {
      console.error("Error enviando correo:", err.message);
    }
  }

  const state = db.load();
  state.notificaciones.push(n);
  db.save();
  return n;
}

function alertStaff(evento, data) {
  if (io) io.to("staff").emit(evento, data);
}

module.exports = { init, notify, alertStaff };
