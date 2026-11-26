"""Generación de un corpus sintético de documentos de trámites municipales.

Sirve como datos iniciales de entrenamiento. En producción se recomienda
reentrenar con documentos reales (ya anonimizados) mediante POST /train
o colocando un CSV en data/training.csv (columnas: texto,categoria,prioridad).
"""

import csv
import random
from pathlib import Path

CATEGORIES: dict[str, dict] = {
    "licencia_funcionamiento": {
        "area": "Gerencia de Desarrollo Económico",
        "plazo_dias": 15,
        "frases": [
            "solicito licencia de funcionamiento para mi establecimiento comercial",
            "apertura de negocio bodega restaurante tienda",
            "giro del negocio venta de abarrotes",
            "certificado de inspección técnica de seguridad en edificaciones ITSE",
            "zonificación y compatibilidad de uso del local",
            "declaración jurada de condiciones de seguridad del local comercial",
            "licencia municipal para actividad económica",
            "autorización de anuncio publicitario y licencia del local",
            "ampliación de giro comercial del establecimiento",
        ],
    },
    "licencia_edificacion": {
        "area": "Gerencia de Desarrollo Urbano",
        "plazo_dias": 20,
        "frases": [
            "solicito licencia de edificación para construcción de vivienda",
            "planos de arquitectura estructuras e instalaciones sanitarias",
            "memoria descriptiva del proyecto de construcción",
            "ampliación remodelación y demolición de inmueble",
            "conformidad de obra y declaratoria de edificación",
            "habilitación urbana del terreno y subdivisión de lote",
            "certificado de parámetros urbanísticos y edificatorios",
            "firmado por ingeniero civil colegiado responsable de obra",
            "construcción de segundo piso en lote urbano",
        ],
    },
    "pago_tributos": {
        "area": "Gerencia de Administración Tributaria",
        "plazo_dias": 7,
        "frases": [
            "pago del impuesto predial del presente año",
            "fraccionamiento de deuda tributaria arbitrios municipales",
            "declaración jurada de autovalúo del predio",
            "solicito prescripción de deuda de arbitrios",
            "devolución de pago indebido de tributos municipales",
            "constancia de no adeudo tributario",
            "beneficio tributario para pensionista descuento predial",
            "impuesto vehicular y alcabala por compra de inmueble",
            "estado de cuenta corriente del contribuyente",
        ],
    },
    "registro_civil": {
        "area": "Oficina de Registro Civil",
        "plazo_dias": 5,
        "frases": [
            "solicito copia certificada de partida de nacimiento",
            "inscripción de matrimonio civil y edictos matrimoniales",
            "partida de defunción de mi familiar fallecido",
            "rectificación administrativa de acta de nacimiento",
            "inscripción extemporánea de nacimiento del menor",
            "constancia de soltería para trámite",
            "celebración de matrimonio en la municipalidad",
            "reconocimiento de hijo en acta registral",
            "divorcio no contencioso separación convencional",
        ],
    },
    "queja_reclamo": {
        "area": "Oficina de Atención al Ciudadano",
        "plazo_dias": 10,
        "frases": [
            "presento queja por mala atención del personal municipal",
            "reclamo por cobro indebido y demora en el trámite",
            "libro de reclamaciones denuncia maltrato",
            "queja contra funcionario por negligencia",
            "reclamo por falta de recojo de basura en mi calle",
            "denuncia por ruidos molestos de local nocturno",
            "reclamo por alumbrado público malogrado",
            "queja por incumplimiento de plazos administrativos",
            "inconformidad con el servicio de limpieza pública",
        ],
    },
    "acceso_informacion": {
        "area": "Oficina de Transparencia",
        "plazo_dias": 10,
        "frases": [
            "solicitud de acceso a la información pública ley 27806",
            "requiero copia de la resolución de alcaldía",
            "transparencia y acceso a documentos de contrataciones",
            "información sobre presupuesto participativo y gastos",
            "copia de acuerdos de concejo municipal",
            "solicito información de obras públicas ejecutadas",
            "acceso a expediente administrativo",
            "relación de personal contratado y remuneraciones",
            "información del portal de transparencia estándar",
        ],
    },
    "emergencia_riesgo": {
        "area": "Oficina de Gestión del Riesgo de Desastres",
        "plazo_dias": 1,
        "frases": [
            "urgente vivienda en riesgo de colapso por lluvias",
            "emergencia deslizamiento huaico afectó viviendas",
            "inspección técnica urgente por grietas en la estructura",
            "inundación en el barrio familias damnificadas",
            "incendio afectó inmueble solicito apoyo humanitario",
            "peligro inminente muro a punto de caer",
            "declaratoria de emergencia por desastre natural",
            "apoyo urgente con techos y frazadas por heladas",
            "árbol a punto de caer sobre cables eléctricos peligro",
        ],
    },
    "programa_social": {
        "area": "Gerencia de Desarrollo Social",
        "plazo_dias": 10,
        "frases": [
            "inscripción en el programa vaso de leche",
            "solicito empadronamiento en comedor popular",
            "apoyo social para adulto mayor en abandono",
            "certificado de discapacidad registro OMAPED",
            "beca y apoyo para estudiantes de bajos recursos",
            "clasificación socioeconómica SISFOH",
            "programa de complementación alimentaria",
            "defensoría municipal del niño y adolescente DEMUNA",
            "atención a víctima de violencia familiar",
        ],
    },
}

URGENT_WORDS = [
    "urgente", "inmediato", "peligro", "riesgo", "emergencia", "plazo vencido",
    "violencia", "menor en riesgo", "salud", "adulto mayor", "discapacidad",
]

OPENINGS = [
    "Señor Alcalde de la Municipalidad Provincial de Yau.",
    "Yo, identificado con DNI 45879632, con domicilio en Jr. Lima 123,",
    "Por medio de la presente me dirijo a usted para",
    "A la Mesa de Partes de la municipalidad:",
    "",
]
CLOSINGS = [
    "Adjunto los requisitos establecidos en el TUPA. Atentamente.",
    "Por lo expuesto, pido a usted acceder a mi solicitud.",
    "Correo de contacto: vecino@correo.com teléfono 987654321.",
    "Sin otro particular, me despido.",
    "",
]


def _priority(category: str, urgent: bool) -> str:
    if category == "emergencia_riesgo" or (urgent and category in {"programa_social", "queja_reclamo"}):
        return "alta"
    if urgent:
        return "alta" if random.random() < 0.6 else "media"
    if category in {"queja_reclamo", "acceso_informacion", "programa_social"}:
        return "media"
    return "baja" if random.random() < 0.7 else "media"


def generate(n_per_class: int = 120, seed: int = 42) -> list[dict]:
    random.seed(seed)
    rows: list[dict] = []
    for cat, info in CATEGORIES.items():
        for _ in range(n_per_class):
            body = random.sample(info["frases"], k=random.randint(2, 4))
            urgent = random.random() < (0.9 if cat == "emergencia_riesgo" else 0.15)
            if urgent:
                body.insert(random.randint(0, len(body)), random.choice(URGENT_WORDS))
            text = " ".join([random.choice(OPENINGS), *body, random.choice(CLOSINGS)])
            rows.append({"texto": text, "categoria": cat, "prioridad": _priority(cat, urgent)})
    random.shuffle(rows)
    return rows


def load(csv_path: Path | None = None) -> list[dict]:
    """Carga datos reales si existen; si no, genera el corpus sintético."""
    rows = generate()
    if csv_path and csv_path.exists():
        with csv_path.open(encoding="utf-8") as f:
            rows.extend(r for r in csv.DictReader(f) if r.get("texto") and r.get("categoria"))
    return rows
