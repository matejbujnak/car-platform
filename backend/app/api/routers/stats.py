"""Public summary statistics (used by the web UI header)."""

from fastapi import APIRouter, Depends
from sqlmodel import Session, func, select

from app.db.models import Listing, Prediction
from app.db.session import get_session
from app.ml.predict import active_model

router = APIRouter(prefix="/api/stats", tags=["stats"])


@router.get("")
def stats(session: Session = Depends(get_session)) -> dict:
    total = session.exec(select(func.count()).select_from(Listing)).one()
    makes = [
        row
        for row in session.exec(
            select(Listing.make).distinct().order_by(Listing.make)
        ).all()
        if row
    ]

    model_name = None
    by_verdict = {"cheap": 0, "fair": 0, "overpriced": 0}
    mv = active_model(session)
    if mv is not None:
        model_name = mv.name
        rows = session.exec(
            select(Prediction.deal_verdict, func.count())
            .where(Prediction.model_version_id == mv.id)
            .group_by(Prediction.deal_verdict)
        ).all()
        for verdict, count in rows:
            if verdict in by_verdict:
                by_verdict[verdict] = count

    return {
        "listings_total": total,
        "by_verdict": by_verdict,
        "makes": makes,
        "model_name": model_name,
    }
