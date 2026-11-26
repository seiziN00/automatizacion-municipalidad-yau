"""API REST (FastAPI) del servicio de Machine Learning."""

from contextlib import asynccontextmanager

from fastapi import FastAPI, File, HTTPException, UploadFile
from pydantic import BaseModel, Field

from . import dataset, model
from .pdf_extractor import extract_text

MAX_PDF_BYTES = 10 * 1024 * 1024

@asynccontextmanager
async def lifespan(_app: FastAPI):
    model.get_bundle()  # carga (o entrena) el modelo al iniciar
    yield


app = FastAPI(title="ML Service - Municipalidad Provincial de Yau", version="0.1.0", lifespan=lifespan)


class TextIn(BaseModel):
    texto: str = Field(min_length=1)


class FeedbackIn(BaseModel):
    texto: str
    categoria: str
    prioridad: str | None = None


@app.get("/health")
def health():
    return {"status": "ok", "modelo_cargado": model._bundle is not None}


@app.get("/categories")
def categories():
    return [{"id": k, "area": v["area"], "plazo_dias": v["plazo_dias"]} for k, v in dataset.CATEGORIES.items()]


@app.get("/metrics")
def metrics():
    m = model.get_bundle()["metrics"]
    return {k: v for k, v in m.items() if k != "reporte_categoria"} | {"reporte_categoria": m["reporte_categoria"]}


@app.post("/classify/pdf")
async def classify_pdf(file: UploadFile = File(...)):
    data = await file.read()
    if len(data) > MAX_PDF_BYTES:
        raise HTTPException(413, "El PDF excede 10 MB")
    if not data.startswith(b"%PDF"):
        raise HTTPException(400, "El archivo no es un PDF válido")
    try:
        extracted = extract_text(data)
        result = model.predict(extracted["text"])
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    # Solo se devuelve un extracto: el texto completo no se persiste en el servicio ML.
    return result | {"paginas": extracted["pages"], "extracto": extracted["text"][:500]}


@app.post("/classify/text")
def classify_text(body: TextIn):
    try:
        return model.predict(body.texto)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc


@app.post("/feedback")
def feedback(body: FeedbackIn):
    if body.categoria not in dataset.CATEGORIES:
        raise HTTPException(400, "Categoría desconocida")
    model.save_feedback(body.texto, body.categoria, body.prioridad)
    return {"ok": True}


@app.post("/train")
def train():
    m = model.train()
    return {k: v for k, v in m.items() if k != "reporte_categoria"}
