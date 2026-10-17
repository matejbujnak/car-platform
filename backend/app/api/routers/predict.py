"""Public fair-price calculator."""

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlmodel import Session

from app.db.session import get_session
from app.ml.predict import active_artifact, deal_verdict, predict_prices
from app.core.rate_limit import limiter

router = APIRouter(prefix="/api/predict", tags=["predict"])


class CarInput(BaseModel):
    """Car parameters, as in a listing."""

    make: str = Field(min_length=1, max_length=60)
    model: str = Field(min_length=1, max_length=60)
    year: int = Field(ge=1950, le=2100)
    mileage_km: int = Field(default=0, ge=0, le=2_000_000)
    power_kw: int = Field(default=0, ge=0, le=2_000)
    engine_cc: int = Field(default=0, ge=0, le=10_000)
    fuel: str | None = None
    gearbox: str | None = None
    body: str | None = None
    drive: str | None = None
    seller_type: str | None = None
    # Optional asking price - when given, the response includes a deal verdict.
    price_eur: float | None = Field(default=None, gt=0, le=1_000_000)


@router.post("")
@limiter.limit("30/minute")
def predict(
    request: Request,
    car: CarInput,
    session: Session = Depends(get_session),
) -> dict:
    """Estimate the fair price (and its 80% interval) for one car."""
    artifact = active_artifact(session)
    if artifact is None:
        raise HTTPException(status_code=503, detail="No trained model available")

    prediction = predict_prices(artifact, [car.model_dump()])[0]
    result = {**prediction, "model_name": artifact["model_name"]}
    if car.price_eur is not None:
        verdict, score = deal_verdict(car.price_eur, prediction)
        result["deal_verdict"] = verdict
        result["deal_score"] = score
    return result
