require("dotenv").config();

module.exports = {
  port: Number(process.env.PORT || 4000),
  mlServiceUrl: process.env.ML_SERVICE_URL || "http://127.0.0.1:8000",
  corsOrigin: process.env.CORS_ORIGIN || "http://localhost:3000",
  dataFile: process.env.DATA_FILE || require("path").join(__dirname, "..", "data", "db.json"),
  maxPdfMb: Number(process.env.MAX_PDF_MB || 10),
  smtp: {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.SMTP_FROM || "Municipalidad Provincial de Yau <no-reply@muniyau.gob.pe>",
  },
};
