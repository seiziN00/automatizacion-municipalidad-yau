"""Servicio de clasificación NLP de trámites municipales (PDF)."""

import os


def main() -> None:
    import uvicorn

    uvicorn.run(
        "ml_service.api:app",
        host=os.getenv("ML_HOST", "127.0.0.1"),
        port=int(os.getenv("ML_PORT", "8000")),
    )


def train() -> None:
    from .model import train as _train

    m = _train()
    print(f"Modelo entrenado. Accuracy categoría={m['accuracy_categoria']} prioridad={m['accuracy_prioridad']}")
