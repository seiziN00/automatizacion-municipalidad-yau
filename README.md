# Automatización Municipalidad Yau

Sistema de gestión de trámites con clasificación automática de documentos PDF mediante NLP.

```
frontend (React :3000) ──► backend (Express :4000) ──► ml-service (FastAPI + scikit-learn :8000)
                               │  Socket.IO / SMTP (alertas)
                               └─ data/db.json, uploads/
```

## ml-service (Python, uv)

```bash
cd ml-service
uv sync
uv run ml-train      # entrena con el corpus sintético (+ data/training.csv si existe)
uv run ml-service    # API en http://127.0.0.1:8000  (docs: /docs)
```

Flujo: PDF → extracción de texto (PyMuPDF) → anonimización de DNI/RUC/correos/teléfonos →
normalización y stopwords → TF-IDF (1-2 gramas) →
- **Categoría** (LinearSVC calibrado): licencia_funcionamiento, licencia_edificacion, pago_tributos,
  registro_civil, queja_reclamo, acceso_informacion, emergencia_riesgo, programa_social.
- **Prioridad** (Regresión Logística + reglas de términos críticos y plazo legal) → puntaje 0-100.

Si la confianza es < 55 %, el trámite se marca para revisión manual. Las correcciones de los funcionarios
se guardan en `data/training.csv` y el modelo se reentrena con `POST /train`.

| Endpoint | Descripción |
|---|---|
| `POST /classify/pdf` | multipart `file` |
| `POST /classify/text` | `{ "texto": "..." }` |
| `POST /feedback` / `POST /train` | retroalimentación y reentrenamiento |
| `GET /categories`, `/metrics`, `/health` | |

## backend (Express)

```bash
cd backend
npm install
cp .env.example .env   # opcional
npm run dev
```

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/tramites` | multipart: `archivo` (PDF), `nombre`, `dni`, `correo`, `telefono`, `descripcion`, `consentimiento=true` |
| GET | `/api/tramites` | bandeja ordenada por vencidos → prioridad → antigüedad. Filtros: `estado, categoria, prioridad, area, q` |
| GET | `/api/tramites/consulta?codigo=&dni=` | consulta pública del ciudadano |
| GET | `/api/tramites/:id` · `/:id/archivo` | detalle / PDF |
| PATCH | `/api/tramites/:id/estado` | `{ estado, comentario }` (registrado → en_revision → observado/aprobado/rechazado → finalizado) |
| PATCH | `/api/tramites/:id/clasificacion` | corrección manual (retroalimenta el modelo) |
| GET | `/api/estadisticas` | KPIs y cuellos de botella por área |
| GET | `/api/notificaciones?codigo=` | historial de alertas |
| GET/POST | `/api/ml/categorias`, `/api/ml/metricas`, `/api/ml/clasificar`, `/api/ml/entrenar` | |

**Alertas en tiempo real (Socket.IO):**
- Ciudadano: `socket.emit("suscribir", { codigo, dni })` → recibe `notificacion`.
- Personal: `socket.emit("suscribir_staff")` → recibe `tramite_actualizado`, `tramite_critico`.
- Correo electrónico si se configura SMTP en `.env`.

## Protección de datos (Ley N.° 29733) y transparencia (Ley N.° 27806)
- Consentimiento explícito obligatorio al registrar.
- Los datos personales se anonimizan antes de entrar al modelo; el servicio ML no persiste los PDF.
- Los listados muestran el DNI enmascarado; la consulta pública exige código + DNI.
- Bitácora de auditoría (`auditoria` en `db.json`) para accesos y cambios de estado.
- Helmet, CORS restringido, límite de tasa y de tamaño de archivo.

## Escalabilidad
`backend/src/db.js` es un repositorio JSON fácil de reemplazar por PostgreSQL. ml-service no tiene estado
(aparte del modelo serializado), así que se pueden levantar varias réplicas detrás de un balanceador.
