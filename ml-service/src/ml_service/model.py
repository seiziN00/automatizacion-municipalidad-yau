"""Modelos NLP: clasificación de tipo de trámite y predicción de prioridad.

- Clasificador de categoría: TF-IDF (unigramas+bigramas) + LinearSVC calibrado.
- Clasificador de prioridad: TF-IDF + Regresión Logística, combinado con reglas
  de negocio (palabras críticas, plazo legal) para obtener un puntaje 0-100.
"""

from __future__ import annotations

import csv
import threading
from datetime import datetime, timezone
from pathlib import Path

import joblib
from sklearn.calibration import CalibratedClassifierCV
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, classification_report
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.svm import LinearSVC

from . import dataset
from .preprocessing import clean_text, strip_accents

BASE_DIR = Path(__file__).resolve().parents[2]
MODELS_DIR = BASE_DIR / "models"
DATA_DIR = BASE_DIR / "data"
MODEL_PATH = MODELS_DIR / "classifier.joblib"
TRAINING_CSV = DATA_DIR / "training.csv"

PRIORITY_BASE = {"alta": 80, "media": 50, "baja": 20}
CRITICAL_TERMS = {
    "urgente": 10, "emergencia": 15, "peligro": 12, "riesgo": 8, "colapso": 15,
    "violencia": 15, "damnificad": 12, "incendio": 15, "inundacion": 12,
    "menor": 5, "adulto mayor": 6, "discapacidad": 6, "plazo vencido": 10, "salud": 6,
}

_lock = threading.Lock()


def _build_pipeline(estimator) -> Pipeline:
    return Pipeline([
        ("tfidf", TfidfVectorizer(ngram_range=(1, 2), min_df=1, max_features=20000, sublinear_tf=True)),
        ("clf", estimator),
    ])


def train(extra_rows: list[dict] | None = None) -> dict:
    rows = dataset.load(TRAINING_CSV)
    if extra_rows:
        rows.extend(extra_rows)

    X = [clean_text(r["texto"]) for r in rows]
    y_cat = [r["categoria"] for r in rows]
    y_pri = [r.get("prioridad") or "media" for r in rows]

    X_tr, X_te, yc_tr, yc_te, yp_tr, yp_te = train_test_split(
        X, y_cat, y_pri, test_size=0.2, random_state=42, stratify=y_cat
    )

    cat_model = _build_pipeline(CalibratedClassifierCV(LinearSVC(C=1.0), cv=3))
    pri_model = _build_pipeline(LogisticRegression(max_iter=2000, class_weight="balanced"))
    cat_model.fit(X_tr, yc_tr)
    pri_model.fit(X_tr, yp_tr)

    metrics = {
        "accuracy_categoria": round(accuracy_score(yc_te, cat_model.predict(X_te)), 4),
        "accuracy_prioridad": round(accuracy_score(yp_te, pri_model.predict(X_te)), 4),
        "reporte_categoria": classification_report(yc_te, cat_model.predict(X_te), output_dict=True, zero_division=0),
        "muestras": len(rows),
        "entrenado_en": datetime.now(timezone.utc).isoformat(),
    }

    # Reentrenar con todos los datos para el modelo final
    cat_model.fit(X, y_cat)
    pri_model.fit(X, y_pri)

    bundle = {"categoria": cat_model, "prioridad": pri_model, "metrics": metrics}
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    joblib.dump(bundle, MODEL_PATH)
    with _lock:
        global _bundle
        _bundle = bundle
    return metrics


_bundle: dict | None = None


def get_bundle() -> dict:
    global _bundle
    with _lock:
        if _bundle is None and MODEL_PATH.exists():
            _bundle = joblib.load(MODEL_PATH)
    if _bundle is None:
        train()
    return _bundle  # type: ignore[return-value]


def _priority_score(raw_text: str, pri_label: str, pri_proba: float, category: str) -> tuple[int, list[str]]:
    norm = strip_accents(raw_text.lower())
    score = PRIORITY_BASE[pri_label] * (0.6 + 0.4 * pri_proba)
    reasons = [f"Modelo NLP: prioridad '{pri_label}' ({pri_proba:.0%})"]
    for term, weight in CRITICAL_TERMS.items():
        if term in norm:
            score += weight
            reasons.append(f"Término crítico detectado: '{term}'")
    plazo = dataset.CATEGORIES.get(category, {}).get("plazo_dias", 10)
    if plazo <= 2:
        score += 15
        reasons.append(f"Plazo legal corto ({plazo} día(s))")
    return int(max(0, min(100, round(score)))), reasons


def predict(raw_text: str) -> dict:
    if not raw_text or len(raw_text.strip()) < 20:
        raise ValueError("El documento no contiene texto suficiente para clasificar (¿PDF escaneado?).")

    bundle = get_bundle()
    cleaned = clean_text(raw_text)
    cat_model, pri_model = bundle["categoria"], bundle["prioridad"]

    cat_proba = cat_model.predict_proba([cleaned])[0]
    ranking = sorted(zip(cat_model.classes_, cat_proba), key=lambda x: x[1], reverse=True)
    category, confidence = ranking[0]

    pri_proba = pri_model.predict_proba([cleaned])[0]
    pri_idx = pri_proba.argmax()
    pri_label = pri_model.classes_[pri_idx]

    score, reasons = _priority_score(raw_text, pri_label, float(pri_proba[pri_idx]), category)
    nivel = "alta" if score >= 70 else "media" if score >= 40 else "baja"
    info = dataset.CATEGORIES.get(category, {})

    return {
        "categoria": category,
        "confianza": round(float(confidence), 4),
        "alternativas": [{"categoria": c, "probabilidad": round(float(p), 4)} for c, p in ranking[1:4]],
        "area_destino": info.get("area", "Mesa de Partes"),
        "plazo_dias": info.get("plazo_dias", 10),
        "prioridad": {"nivel": nivel, "puntaje": score, "motivos": reasons},
        "requiere_revision_manual": bool(confidence < 0.55),
        "palabras_clave": _keywords(cat_model, cleaned),
    }


def _keywords(pipeline: Pipeline, cleaned: str, top: int = 8) -> list[str]:
    tfidf: TfidfVectorizer = pipeline.named_steps["tfidf"]
    vec = tfidf.transform([cleaned])
    names = tfidf.get_feature_names_out()
    idx = vec.toarray()[0].argsort()[::-1][:top]
    return [names[i] for i in idx if vec[0, i] > 0]


def save_feedback(text: str, categoria: str, prioridad: str | None) -> None:
    """Guarda correcciones de funcionarios (texto ya anonimizado) para reentrenar."""
    from .preprocessing import anonymize

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    new = not TRAINING_CSV.exists()
    with TRAINING_CSV.open("a", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["texto", "categoria", "prioridad"])
        if new:
            w.writeheader()
        w.writerow({"texto": anonymize(text)[:5000], "categoria": categoria, "prioridad": prioridad or "media"})
