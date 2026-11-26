"""Extracción de texto desde archivos PDF usando PyMuPDF."""

import pymupdf as fitz

MAX_PAGES = 30


def extract_text(pdf_bytes: bytes) -> dict:
    try:
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    except Exception as exc:  # noqa: BLE001
        raise ValueError(f"PDF inválido o dañado: {exc}") from exc

    with doc:
        pages = doc.page_count
        text = "\n".join(doc[i].get_text("text") for i in range(min(pages, MAX_PAGES)))

    return {"text": text.strip(), "pages": pages}
