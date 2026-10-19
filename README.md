# Car Market Analyzer

Open-source platform for analyzing the used-car market: a scraper collects car
listings, an ML model estimates a **fair price** for each car, and the app shows
which cars are **cheap (good deals)** and which are **overpriced**.

> **Status: 🚧 work in progress** — the project is built in phases (see below).

## Demo

![Demo](docs/demo.gif)

| Listings | Price analysis | Calculator |
|---|---|---|
| ![Listings](docs/01-listings.png) | ![Detail](docs/04-detail.png) | ![Calculator](docs/05-calculator.png) |

The screenshots and the GIF are captured automatically from the live demo on
every update (see `.github/workflows/demo.yml`).

## What it does

- **Scrape** car listings — politely, with rate limits and checkpoints
- **ML fair-price estimate** + prediction interval → a *deal score* per car
- **Public demo**: listing feed, car detail with price analysis, fair-price calculator
- **Admin**: trigger scrape jobs, retrain the model, view metrics

## Quick start (local)

Requirements: Docker with Docker Compose.

```bash
docker compose -f docker-compose.dev.yml up
```

- API: http://localhost:8000 (interactive docs at `/docs`)
- Postgres: `127.0.0.1:5432` (user/pass/db: `car_platform` / `car_platform` / `car_platform_dev`)
- Redis: `127.0.0.1:6379`

If the default host ports clash with other local services, override them:

```bash
BACKEND_PORT=8001 POSTGRES_PORT=5433 REDIS_PORT=6380 \
  docker compose -f docker-compose.dev.yml up
```

## Deployment

The production stack runs behind a reverse proxy (this project is deployed
with Nginx Proxy Manager) on a shared Docker network.

1. Create the network once: `docker network create home_network`
2. Configure secrets: `cp .env.example .env` and fill in real values
   (`openssl rand -hex 32` for `SECRET_KEY`).
3. Start: `docker compose up -d --build`
   Migrations run automatically on startup and the admin account is seeded
   from `.env`.
4. Point the reverse proxy at the `car-platform-frontend` container (port 80).
   It serves the app and proxies `/api` to the backend, so no CORS setup is
   needed for the browser.

Notes:

- The database and Redis are not published to the host - only the frontend is
  reachable through the reverse proxy.
- Background scraping runs in the `car-platform-worker` container (daily
  schedule, see `SCRAPE_SCHEDULE_HOUR`). Check progress in the admin UI.

## Scraping

The scraper runs in a separate worker container and consumes jobs from a queue.
It is deliberately slow and polite (robots.txt, request limits, delays) to avoid
overloading the source site.

- **Daily crawl** – once a day (default 22:00, see `SCRAPE_SCHEDULE_HOUR`) the
  worker crawls the whole catalogue segment by segment. It runs for hours, saves
  a checkpoint after every segment, and resumes where it stopped after a crash
  or restart.
- **Manual runs** – as admin, queue a run via the API:

```bash
# small run: first N listing pages
curl -X POST "http://localhost:8000/api/admin/scrape?pages=2" \
  -H "Authorization: Bearer $TOKEN"

# full crawl (optionally limited to a few segments for testing)
curl -X POST "http://localhost:8000/api/admin/scrape/full?max_segments=3" \
  -H "Authorization: Bearer $TOKEN"
```

## Project structure

```
backend/    FastAPI app + background workers (same image, different command)
frontend/   React SPA (Vite)
ml/         model training + evaluation
deploy/     deployment configs and scripts
```

## Development phases

1. ✅ Repository setup (git, license, env template)
2. ⬜ Backend core (database + migrations + auth)
3. ⬜ Scraper worker
4. ⬜ ML pipeline + deal score
5. ⬜ Frontend (demo + admin)
6. ⬜ Deployment (reverse proxy + domain + security hardening)
7. ⬜ Tests, documentation, screenshots

## License

[MIT](LICENSE) © 2026 Matej Bujnak

Scraped data is **not** part of this repository and remains subject to the
terms of the source website.
