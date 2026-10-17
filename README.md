# Car Market Analyzer

Open-source platform for analyzing the used-car market: a scraper collects car
listings, an ML model estimates a **fair price** for each car, and the app shows
which cars are **cheap (good deals)** and which are **overpriced**.

> **Status: 🚧 work in progress** — the project is built in phases (see below).

## What it does

- **Scrape** car listings — politely, with rate limits and checkpoints
- **ML fair-price estimate** + prediction interval → a *deal score* per car
- **Public demo**: listing feed, car detail with price analysis, fair-price calculator
- **Admin**: trigger scrape jobs, retrain the model, view metrics

## Quick start (local)

_(to be filled in during development)_

```bash
docker compose -f docker-compose.dev.yml up
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
