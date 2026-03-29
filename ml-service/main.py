"""
inDala AI — ML Inference Microservice
Mock XGBoost model serving Mobility Vulnerability Scores with SHAP explanations.
"""

import hashlib
import math
import random
from datetime import datetime

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(
    title="inDala ML Service",
    description="Mobility Vulnerability Score prediction with SHAP explanations",
    version="0.2.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ───────────── Schemas ─────────────

class PredictRequest(BaseModel):
    start_lat: float
    start_lng: float
    end_lat: float
    end_lng: float
    distance_km: float = 0.0
    duration_mins: float = 0.0


class SHAPFactor(BaseModel):
    factor: str
    contribution: float


class PredictResponse(BaseModel):
    mobility_score: float
    risk_level: str
    subsidy_kzt: int
    shap_breakdown: list[SHAPFactor]
    model_version: str


# ───────────── Mock Model Logic ─────────────

FACTOR_POOL = [
    ("Отсутствие больниц в радиусе 50 км", 8, 35),
    ("Суровые зимние условия", 5, 25),
    ("Отсутствие асфальтированных дорог", 10, 30),
    ("Низкая плотность населения", 3, 15),
    ("Удалённость от райцентра", 5, 20),
    ("Нет общественного транспорта", 10, 30),
    ("Сезонное бездорожье (весна/осень)", 5, 20),
    ("Отсутствие школ поблизости", 3, 15),
    ("Нет доступа к интернету / связи", 2, 10),
    ("Высокий уровень безработицы", 2, 12),
    ("Зависимость от единственной дороги", 5, 18),
    ("Паводкоопасная зона", 3, 15),
]


def _deterministic_seed(lat1: float, lng1: float, lat2: float, lng2: float) -> int:
    h = hashlib.md5(f"{lat1:.4f}|{lng1:.4f}|{lat2:.4f}|{lng2:.4f}".encode()).hexdigest()
    return int(h[:8], 16)


def _calculate_subsidy(score: float, distance_km: float) -> int:
    """Calculate recommended driver subsidy in KZT based on score and distance."""
    base_rate = 45  # KZT per km
    vulnerability_multiplier = 1.0 + (score / 100.0) * 1.5  # up to 2.5x for score=100
    subsidy = base_rate * max(distance_km, 10) * vulnerability_multiplier
    return int(math.ceil(subsidy / 100) * 100)  # round up to nearest 100


def mock_predict(req: PredictRequest) -> PredictResponse:
    seed = _deterministic_seed(req.start_lat, req.start_lng, req.end_lat, req.end_lng)
    rng = random.Random(seed)

    k = rng.randint(4, 6)
    chosen = rng.sample(FACTOR_POOL, k)

    shap_factors: list[SHAPFactor] = []
    total = 0.0
    for name, lo, hi in chosen:
        contribution = round(rng.uniform(lo, hi), 1)
        total += contribution
        shap_factors.append(SHAPFactor(factor=name, contribution=contribution))

    score = round(min(max(total, 0), 100), 1)

    if score >= 70:
        risk = "critical"
    elif score >= 45:
        risk = "high"
    elif score >= 25:
        risk = "medium"
    else:
        risk = "low"

    shap_factors.sort(key=lambda f: f.contribution, reverse=True)

    subsidy = _calculate_subsidy(score, req.distance_km)

    return PredictResponse(
        mobility_score=score,
        risk_level=risk,
        subsidy_kzt=subsidy,
        shap_breakdown=shap_factors,
        model_version="mock-xgboost-v0.2.0",
    )


# ───────────── Routes ─────────────

@app.get("/health")
def health():
    return {
        "status": "healthy",
        "service": "indala-ml",
        "time": datetime.utcnow().isoformat() + "Z",
    }


@app.post("/predict", response_model=PredictResponse)
def predict(req: PredictRequest):
    return mock_predict(req)
