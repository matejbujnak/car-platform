"""API behaviour (FastAPI TestClient on a SQLite test database)."""


from app.db.models import ModelVersion, Prediction
from app.core.security import hash_password, verify_password


def _login(client, username="admin", password="test-password"):
    return client.post(
        "/api/auth/login", data={"username": username, "password": password}
    )


def test_health(client):
    resp = client.get("/api/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


def test_login_and_me(client):
    resp = _login(client)
    assert resp.status_code == 200
    token = resp.json()["access_token"]

    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    assert me.json()["username"] == "admin"

    assert client.get("/api/auth/me").status_code == 401
    assert _login(client, password="wrong").status_code == 401


def test_password_hashing_roundtrip():
    hashed = hash_password("secret")
    assert hashed != "secret"
    assert verify_password("secret", hashed)
    assert not verify_password("other", hashed)


def test_listings_and_filters(client, session, sample_listing):
    resp = client.get("/api/listings")
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 1
    assert body["items"][0]["make"] == "Skoda"

    assert client.get("/api/listings?make=BMW").json()["total"] == 0
    assert client.get("/api/listings?make=Skoda").json()["total"] == 1
    assert client.get("/api/listings?search=octavia").json()["total"] == 1
    assert client.get("/api/listings?offer=rent").json()["total"] == 0
    assert client.get("/api/listings?gearbox=manual").json()["total"] == 1


def test_prediction_sort_keeps_rows_without_cache(client, session, sample_listing):
    """Regression: sorting by profit used to empty the list when the prediction
    cache was not filled yet (e.g. right after a retrain)."""
    session.add(
        ModelVersion(name="test-model", artifact_path="/nonexistent.joblib", dataset_rows=1)
    )
    session.commit()

    for sort in ("profit_best", "profit_worst", "deal_best", "fair_low"):
        resp = client.get(f"/api/listings?sort={sort}")
        assert resp.status_code == 200, sort
        assert resp.json()["total"] == 1, sort


def test_cached_deal_verdict_follows_current_price(client, session, sample_listing):
    """Regression: a price change after the prediction was cached left a stale
    verdict/score behind; the API must derive them from the current price."""
    mv = ModelVersion(
        name="test-model",
        artifact_path="/nonexistent.joblib",
        dataset_rows=1,
        is_active=True,
    )
    session.add(mv)
    session.commit()
    session.refresh(mv)
    session.add(
        Prediction(
            listing_id=sample_listing.id,
            model_version_id=mv.id,
            fair_price_eur=10_000,
            interval_low_eur=9_000,
            interval_high_eur=11_000,
            deal_verdict="cheap",  # cached when the car was offered for 5 000
            deal_score=0.5,
        )
    )
    sample_listing.price_eur = 15_000  # the seller raised the price since
    session.add(sample_listing)
    session.commit()

    item = client.get("/api/listings").json()["items"][0]
    assert item["fair_price_eur"] == 10_000
    assert item["deal_verdict"] == "overpriced"
    assert item["deal_score"] == round((10_000 - 15_000) / 10_000, 4)


def test_listing_detail_and_similar(client, session, sample_listing):
    resp = client.get(f"/api/listings/{sample_listing.id}")
    assert resp.status_code == 200
    assert resp.json()["title"].startswith("Skoda")

    similar = client.get(f"/api/listings/{sample_listing.id}/similar")
    assert similar.status_code == 200

    assert client.get("/api/listings/999999").status_code == 404


def test_admin_requires_auth(client):
    assert client.get("/api/admin/models").status_code == 401
    assert client.post("/api/admin/scrape").status_code == 401

    token = _login(client).json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    assert client.get("/api/admin/models", headers=headers).status_code == 200
    assert client.get("/api/admin/scrape/runs", headers=headers).status_code == 200


def test_stats_and_models(client, session, sample_listing):
    stats = client.get("/api/stats").json()
    assert stats["listings_total"] == 1
    assert "Skoda" in stats["makes"]
    assert client.get("/api/stats/models?make=Skoda").json() == ["Octavia"]


def test_charts(client, session, sample_listing):
    body = client.get("/api/charts").json()
    assert body["price_histogram"]
    assert body["top_makes"][0]["label"] == "Skoda"
    assert body["price_by_year"][0]["label"] == "2020"
    # Placeholder prices are excluded from the charts.
    assert sum(point["value"] for point in body["price_histogram"]) == 1


def test_listing_ids_filter(client, session, sample_listing):
    resp = client.get(f"/api/listings?ids={sample_listing.id}&status=all")
    assert resp.status_code == 200
    assert resp.json()["total"] == 1
    assert client.get("/api/listings?ids=999999&status=all").json()["total"] == 0


def test_power_and_fuel_filters_and_sorts(client, session, sample_listing):
    # Power filter (sample has 110 kW).
    assert client.get("/api/listings?power_min=100&power_max=150").json()["total"] == 1
    assert client.get("/api/listings?power_min=200").json()["total"] == 0

    # Clickable column sorts must keep rows and respond.
    for sort in ("power_high", "power_low", "fuel_az", "fuel_za"):
        resp = client.get(f"/api/listings?sort={sort}")
        assert resp.status_code == 200, sort
        assert resp.json()["total"] == 1, sort


def test_drive_filter_matches_by_meaning(client, session, sample_listing):
    # The sample lists its drive as "Predny"; the filter canonicalizes
    # Slovak/English labels ("Predný", "Front drive", "front" ...).
    assert client.get("/api/listings?drive=front").json()["total"] == 1
    assert client.get("/api/listings?drive=rear").json()["total"] == 0


def test_share_image_and_share_page(client, session, sample_listing):
    png = client.get(f"/api/listings/{sample_listing.id}/share.png")
    assert png.status_code == 200
    assert png.headers["content-type"] == "image/png"
    assert png.content[:8] == b"\x89PNG\r\n\x1a\n"

    page = client.get(f"/car/{sample_listing.id}")
    assert page.status_code == 200
    assert "og:title" in page.text
    assert "share.png" in page.text


def test_ask_search_and_fallback_answer(client, session, sample_listing):
    body = {"question": "skoda octavia do 20000 eur"}
    search = client.post("/api/ask/search", json=body).json()
    assert search["summary"]["matches_total"] == 1
    assert search["matches"][0]["title"].startswith("Skoda")
    assert search["filters"]["price_max"] == 20_000

    # Without an LLM the endpoint must still answer with real data.
    answer = client.post("/api/ask/answer", json=body).json()
    assert answer["used_llm"] is False
    assert "Skoda" in answer["answer"]


def test_ask_parse_falls_back_to_rules(client):
    # No LLM in tests -> the rule-based parser answers with the same keys.
    resp = client.post("/api/ask/parse", json={"question": "kombi do 15 000 eur od 2019"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["source"] == "rules"
    assert body["filters"]["price_max"] == 15_000
    assert body["filters"]["year_min"] == 2019
    assert "Combi" in body["filters"]["body"]


def test_price_history_is_recorded(client, session, sample_listing):
    """A new listing gets one price point; price changes add more."""
    from app.scraping.store import upsert_listings

    upsert_listings(
        session,
        [
            {
                "source_id": "test-1",
                "url": sample_listing.url,
                "title": sample_listing.title,
                "make": "Skoda",
                "model": "Octavia",
                "year": 2020,
                "price_eur": 15_000,  # changed price -> new history point
            }
        ],
    )

    body = client.get(f"/api/listings/{sample_listing.id}/history").json()
    assert [p["price_eur"] for p in body["points"]] == [16_000, 15_000]
