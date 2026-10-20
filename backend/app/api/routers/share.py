"""Social sharing: Open Graph HTML for chat/link previews and share images.

The frontend is a static SPA, so link scrapers never run its JavaScript.
These endpoints give every car a shareable page with proper preview metadata
and a generated preview image (1200x630, the Open Graph size).
"""

import io
import textwrap

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import HTMLResponse, Response
from PIL import Image, ImageDraw, ImageFont
from sqlmodel import Session

from app import config
from app.db.models import Listing
from app.db.session import get_session
from app.ml.predict import (
    CAR_FIELDS,
    active_artifact,
    deal_verdict,
    predict_prices,
)

router = APIRouter(tags=["share"])

FONT_REGULAR = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
FONT_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"

VERDICT_LABELS = {
    "cheap": "Good deal",
    "fair": "Fair price",
    "overpriced": "Overpriced",
    "suspicious": "Check price",
}
VERDICT_COLORS = {
    "cheap": (5, 150, 105),
    "fair": (100, 116, 139),
    "overpriced": (220, 38, 38),
    "suspicious": (217, 119, 6),
}


def _origin(request: Request) -> str:
    proto = request.headers.get("x-forwarded-proto", request.url.scheme)
    host = request.headers.get("host", request.url.netloc)
    return f"{proto}://{host}"


def _font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(FONT_BOLD if bold else FONT_REGULAR, size)


def _money(value: float | None) -> str:
    return f"{round(value or 0):,} EUR".replace(",", " ")


def _share_summary(row: Listing, prediction: dict | None) -> str:
    parts = [f"{row.title} - {_money(row.price_eur)}"]
    if prediction is not None:
        parts.append(f"fair price {_money(prediction['fair_price_eur'])}")
    parts.append("Car Market Analyzer")
    return " | ".join(parts)


@router.get("/api/listings/{listing_id}/share.png")
def share_image(listing_id: int, session: Session = Depends(get_session)) -> Response:
    """Generated preview image for social sharing."""
    row = session.get(Listing, listing_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Listing not found")

    prediction = None
    artifact = active_artifact(session)
    if artifact is not None:
        car = {k: getattr(row, k) for k in CAR_FIELDS}
        prediction = predict_prices(artifact, [car])[0]

    width, height = 1200, 630
    image = Image.new("RGB", (width, height), "white")
    draw = ImageDraw.Draw(image)

    # Header band.
    draw.rectangle([0, 0, width, 86], fill=(15, 23, 42))
    draw.text((48, 28), "CarMarketAnalyzer", font=_font(30, bold=True), fill="white")
    draw.text(
        (width - 48, 38),
        "Used car market analysis",
        font=_font(20),
        fill=(148, 163, 184),
        anchor="ra",
    )

    # Title (wrapped).
    y = 132
    for line in textwrap.wrap(row.title, width=52)[:2]:
        draw.text((48, y), line, font=_font(38, bold=True), fill=(15, 23, 42))
        y += 52

    specs = f"{row.year}   {row.mileage_km or 0:,} km   {row.power_kw or '-'} kW   {row.fuel or '-'}".replace(",", " ")
    draw.text((48, y + 8), specs, font=_font(24), fill=(100, 116, 139))

    # Prices.
    y = 360
    draw.text((48, y), _money(row.price_eur), font=_font(56, bold=True), fill=(15, 23, 42))
    draw.text((48, y + 72), "Asking price", font=_font(22), fill=(148, 163, 184))

    if prediction is not None:
        draw.text((450, y), _money(prediction["fair_price_eur"]), font=_font(44, bold=True), fill=(71, 85, 105))
        draw.text((450, y + 68), f"Fair price (range {_money(prediction['interval_low_eur'])} - {_money(prediction['interval_high_eur'])})", font=_font(20), fill=(148, 163, 184))

        verdict = "fair"
        if row.price_eur:
            verdict, _score = deal_verdict(row.price_eur, prediction)
        label = VERDICT_LABELS.get(verdict, verdict)
        color = VERDICT_COLORS.get(verdict, (100, 116, 139))
        draw.rectangle([920, y - 8, 1152, y + 64], fill=color)
        draw.text((1036, y + 12), label, font=_font(28, bold=True), fill="white", anchor="ma")

    # Footer.
    draw.line([48, height - 74, width - 48, height - 74], fill=(226, 232, 240), width=2)
    draw.text((48, height - 52), "Fair-price analysis of the used car market", font=_font(20), fill=(148, 163, 184))

    buf = io.BytesIO()
    image.save(buf, format="PNG")
    return Response(content=buf.getvalue(), media_type="image/png")


@router.get("/car/{listing_id}", response_class=HTMLResponse)
def share_page(listing_id: int, request: Request, session: Session = Depends(get_session)):
    """The SPA page with Open Graph metadata injected for link previews."""
    row = session.get(Listing, listing_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Listing not found")

    prediction = None
    artifact = active_artifact(session)
    if artifact is not None:
        car = {k: getattr(row, k) for k in CAR_FIELDS}
        prediction = predict_prices(artifact, [car])[0]

    origin = _origin(request)
    title = f"{row.title} - {_money(row.price_eur)}"
    description = _share_summary(row, prediction)
    image_url = f"{origin}/api/listings/{listing_id}/share.png"

    # Serve the real SPA shell with preview metadata injected, so chat apps
    # show a nice card while browsers still get the full application.
    meta = f"""
    <meta property="og:type" content="website" />
    <meta property="og:title" content="{title}" />
    <meta property="og:description" content="{description}" />
    <meta property="og:image" content="{image_url}" />
    <meta property="og:url" content="{origin}/car/{listing_id}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="{title}" />
    <meta name="twitter:description" content="{description}" />
    <meta name="twitter:image" content="{image_url}" />
    <title>{title}</title>
    """
    try:
        html = httpx.get(f"{config.FRONTEND_URL}/", timeout=5.0).text
        if "<head>" not in html:
            raise ValueError("unexpected shell")
        html = html.replace("<head>", "<head>\n" + meta, 1)
    except Exception:  # noqa: BLE001 - previews still work without the SPA shell
        html = f"<html><head>{meta}<meta http-equiv='refresh' content='0; url=/'></head><body></body></html>"
    return HTMLResponse(content=html)
