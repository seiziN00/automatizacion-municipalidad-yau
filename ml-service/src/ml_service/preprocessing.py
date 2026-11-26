"""Preprocesamiento NLP de texto en español y anonimización de datos personales.

La anonimización se aplica ANTES de vectorizar para que el modelo nunca
aprenda ni almacene datos personales (Ley N.° 29733 - Protección de Datos Personales).
"""

import re
import unicodedata

SPANISH_STOPWORDS = {
    "a", "al", "algo", "ante", "antes", "como", "con", "contra", "cual", "cuando", "de", "del",
    "desde", "donde", "durante", "e", "el", "ella", "ellas", "ellos", "en", "entre", "era", "es",
    "esa", "ese", "eso", "esta", "este", "esto", "estos", "estas", "fue", "ha", "hace", "hacia",
    "han", "hasta", "hay", "la", "las", "le", "les", "lo", "los", "mas", "me", "mi", "mis", "muy",
    "ni", "no", "nos", "nuestra", "nuestro", "o", "otra", "otro", "para", "pero", "por", "porque",
    "que", "quien", "se", "sea", "ser", "si", "sin", "sobre", "su", "sus", "tambien", "te", "tiene",
    "todo", "todos", "tu", "un", "una", "uno", "unos", "unas", "y", "ya", "yo", "senor", "senora",
    "sr", "sra", "atentamente", "presente", "mediante", "presento", "solicito", "usted", "dicho",
}

_PII_PATTERNS = [
    (re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+"), " correo_anon "),
    (re.compile(r"\b(?:dni|d\.n\.i\.?)\s*(?:n[°ºo.]*)?\s*:?\s*\d{8}\b", re.I), " dni_anon "),
    (re.compile(r"\b\d{11}\b"), " ruc_anon "),
    (re.compile(r"\b9\d{8}\b"), " telefono_anon "),
    (re.compile(r"\b\d{8}\b"), " dni_anon "),
]


def anonymize(text: str) -> str:
    """Reemplaza correos, DNI, RUC y teléfonos por marcadores."""
    for pattern, repl in _PII_PATTERNS:
        text = pattern.sub(repl, text)
    return text


def strip_accents(text: str) -> str:
    return "".join(
        c for c in unicodedata.normalize("NFD", text) if unicodedata.category(c) != "Mn"
    )


def clean_text(text: str) -> str:
    """Anonimiza, normaliza, tokeniza y elimina stopwords."""
    text = anonymize(text or "")
    text = strip_accents(text.lower())
    text = re.sub(r"[^a-z_ ]+", " ", text)
    tokens = [t for t in text.split() if len(t) > 2 and t not in SPANISH_STOPWORDS]
    return " ".join(tokens)
