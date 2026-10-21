# Car Market Analyzer

Open-source platform for analyzing the used-car market: a scraper collects car
listings, an ML model estimates a **fair price** for each car, and the app shows
which cars are **cheap (good deals)** and which are **overpriced** — including
how much you would earn or lose on the purchase.

**Live demo:** https://car-platform.projects.matejbujnak.com

## Demo

![Demo](docs/demo.gif)

| Listings | Price analysis | Calculator |
|---|---|---|
| ![Listings](docs/01-listings.png) | ![Detail](docs/04-detail.png) | ![Calculator](docs/05-calculator.png) |

| Sorted columns | Filtered (Škoda + VW) |
|---|---|
| ![Sorted](docs/02-sorted.png) | ![Filters](docs/03-filtered.png) |

The screenshots and the GIF are captured automatically from the live demo on
every update (see `.github/workflows/demo.yml`).

## What it does

- **Scraper** collects car listings — politely (robots.txt, rate limits,
  checkpoints), on a daily schedule
- **ML fair-price estimate** with a prediction interval → a *deal verdict* per
  car (good deal / fair / overpriced) plus profit in € and %
- **Public demo**: filterable listing feed, car detail with price analysis,
  fair-price calculator, market insights, car comparison
- **Smart filter (LLM experiment)**: describe what you want in natural
  language ("*kombi do 15 000 €, od 2019, diesel*") and the filters fill in
  — powered by a small local LLM (Ollama)
- **Sold detection**: listings that disappear from the source site are marked
  as sold automatically, so the feed only shows live offers
- **Admin**: run scrape jobs, retrain the model, watch metrics and progress

## How it works

```
scraper (daily, polite)  ──►  PostgreSQL  ◄──  ML training (worker job)
                                    │
                            prediction cache
                                    │
                     web UI: fair price · interval · profit
```

- **Model** — LightGBM trained on **log prices**, so the accuracy is relative
  (the same % error on cheap and expensive cars). A Ridge regression serves as
  a sanity baseline.
- **Prediction interval** — split *conformal prediction* on a held-out
  calibration set: a guaranteed ~80% coverage that scales with the price
  (currently ±15.5% of the fair price).
- **Deal score** — `(fair_price − asking_price) / fair_price`; listings priced
  below/above the interval are flagged as *good deal* / *overpriced*, and
  placeholder prices (leasing rates) are flagged as *check price*.
- **Background jobs** — scraping, training and prediction backfill run in a
  worker container fed by a Redis queue; the API stays fast and stateless.
- **Smart filter (LLM experiment)** — natural language → structured search
  filters. A small local LLM (Ollama, e.g. `qwen2.5:1.5b`) decides alone what
  the request means and returns the filters as JSON; when the LLM is not
  available, a rule-based parser takes over so the feature never breaks.
  Treat it as an experiment: the model occasionally guesses details that were
  not asked for — the filled-in filters can always be fine-tuned by hand.

## Results

The model estimates a **fair market price** for every listing together with a
prediction interval, and flags good deals. Current numbers on the live dataset
(~79k cars, evaluated on a fixed holdout that never changes between trainings):

| Metric | Value |
|---|---|
| MAE | ~2 600 € |
| MAPE | 9.5 % |
| R² | 0.94 |
| Within ±20% | 92 % of cars |
| Prediction interval | per market tier, ±12–20 % (80% coverage) |

What makes it work:

- **Log-price target** – errors stay relative, so cheap and expensive cars are
  predicted with similar *percentage* accuracy
- **Per-tier models** – budget / mid / premium / luxury segments (grouped by
  the median price of each make in the data) each get their own LightGBM model,
  their own tuned hyperparameters (Optuna) and their own conformal interval
- **Market features** – median price of competing offers, number of competing
  offers, mileage vs. the segment; the strongest predictors in the model
- **Explainability** – exact TreeSHAP values from LightGBM; every prediction
  comes with a per-feature EUR breakdown that sums to the fair price
- **Data quality** – rental/subscription offers (monthly rates in the price
  field) are detected and excluded from training, placeholder prices get no
  deal verdict

## Using the app

- **Listings** – the main feed with a wide table: sortable columns (click a
  header: ascending → descending → off), multiselect filters (make, model,
  fuel, gearbox, body, drive), numeric ranges (price, year, mileage, power),
  deal verdicts and profit columns. Filters are persisted in the URL and in
  `localStorage`, so a view can be shared as a link and survives a reload.
- **Smart filter** – the input above the filter bar (LLM experiment, see
  below): write what you want in any language and the filters fill in.
- **Car detail** – fair price with prediction interval and deal verdict,
  a per-feature price breakdown (TreeSHAP, sums exactly to the fair price),
  price history chart, similar live offers, and a share image with social
  network preview.
- **Price calculator** – "what would be a fair price for *this* car?" with a
  full configuration form.
- **Insights** – market charts: price distribution, market by make/body/fuel,
  depreciation, days on market and more.
- **Compare** – up to three cars side by side.
- **Admin** – scrape runs and statistics, model/tier metrics, retrain.

## Smart filter (LLM experiment)

The search bar on the Listings page accepts natural language, in any language:

```
kombi do 15 000 €, od 2019, diesel
family SUV, automatic, under 25k
elektromobil s dojazdom... (napíš hocako)
```

A small local LLM (via [Ollama](https://ollama.com), default `qwen2.5:1.5b`)
converts the request to structured filters and the UI fills in the filter
controls, which can then be fine-tuned by hand. The model alone decides what
the text means — no keyword matching. This is an **experiment**: the model
sometimes guesses details that were not requested. When no LLM is reachable, a
rule-based parser provides a basic fallback so the feature keeps working.

Configuration (optional):

```bash
OLLAMA_URL=http://life_os_ollama:11434   # any Ollama server
OLLAMA_MODEL=qwen2.5:1.5b               # any chat model
```

## Tech stack

Python 3.12 · FastAPI · SQLModel + Alembic · PostgreSQL · Redis · LightGBM ·
Optuna · React 19 · Vite · Tailwind CSS · Docker · GitHub Actions · Ollama
(optional, for the smart filter)

## Quick start (local)

Requirements: Docker with Docker Compose.

```bash
docker compose -f docker-compose.dev.yml up
```

- Web UI: http://localhost:5173
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

## Configuration

Everything is configured through environment variables (`.env` in production,
sensible defaults otherwise) — see [`.env.example`](.env.example) for the full
list with comments. Highlights:

| Variable | Meaning | Default |
|---|---|---|
| `SCRAPE_SCHEDULE_HOUR` | hour of the daily full crawl | `22` |
| `SCRAPE_MAX_PER_HOUR` | hard request cap per hour (politeness) | `500` |
| `SCHEDULE_TZ` | timezone for schedules | `Europe/Bratislava` |
| `OPTUNA_TRIALS` | hyperparameter search per market tier (`0` = fast) | `10` |
| `AUTO_RETRAIN_WEEKDAY` / `AUTO_RETRAIN_HOUR` | weekly automatic retrain | Sunday 07:00 |
| `OLLAMA_URL` / `OLLAMA_MODEL` | local LLM for the smart filter (optional) | see above |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | admin account, seeded on first start | – |

## Development & testing

```bash
# backend: lint + tests (SQLite, fast, no external services needed)
cd backend && ruff check app tests && pytest

# frontend: unit tests + build
cd frontend && npm run test && npm run build
```

CI (`.github/workflows/ci.yml`) runs the same checks on every push: ruff,
pytest, vitest and a production frontend build. The demo GIF and screenshots
are captured from the live demo by `.github/workflows/demo.yml` (Playwright).

## Scraping

The scraper runs in a separate worker container and consumes jobs from a queue.
It is deliberately slow and polite (robots.txt, request limits, delays) to avoid
overloading the source site.

- **Daily crawl** – once a day (default 22:00, see `SCRAPE_SCHEDULE_HOUR`) the
  worker crawls the whole catalogue segment by segment. It runs for hours, saves
  a checkpoint after every segment, and resumes where it stopped after a crash
  or restart. Crowded segments are split by price automatically (the site caps
  results per filter), and a clean full crawl marks listings that disappeared
  from the site as sold.
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
backend/            API + background workers (same image, different command)
  app/api/          HTTP endpoints (listings, predictions, ask, admin)
  app/core/         auth, password hashing, rate limiting
  app/db/           models, migrations (Alembic), session
  app/ml/           feature engineering, training, prediction
  app/scraping/     source-site scraper + Redis job queue
  app/assistant.py  smart filter: LLM parsing + rule-based fallback
frontend/           React SPA (Vite + Tailwind CSS)
scripts/            demo capture (Playwright) and GIF maker
docs/               demo GIF + screenshots (auto-refreshed by CI)
```

## Data source

Listings are collected from [autobazar.eu](https://www.autobazar.eu). The data
belongs to the source site and its users; this project only stores factual
vehicle parameters (make, model, year, mileage, power, price) together with a
link to the original listing. Photos, listing texts and personal contact
details are **not** collected or republished.

The scraper is deliberately polite: it respects `robots.txt`, identifies
itself with a contact address, limits its request rate and crawls once a day.

If you operate the source site and want any data removed, please contact
**bujnak.matko@gmail.com** — listings will be deleted immediately and scraping
can be switched off on request.

## License

[MIT](LICENSE) © 2026 Matej Bujnak

Scraped data is **not** part of this repository and remains subject to the
terms of the source website.
