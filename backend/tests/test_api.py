"""API behaviour (FastAPI TestClient on a SQLite test database)."""


from app.db.models import ModelVersion
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
