# Car Market Analyzer

Open-source platforma na analýzu trhu ojazdených áut: scraper sťahuje inzeráty,
ML model odhadne **férovú cenu** auta a aplikácia ukáže, ktoré autá sú **lacné
(dobrý deal)** a ktoré **predražené**.

> **Status: 🚧 rozpracované** – projekt sa stavia po fázach (viď nižšie).

## Čo to robí

- **Scrape** inzerátov (autobazar.eu) – slušne, s limitmi a checkpointmi
- **ML odhad férovej ceny** + predikčný interval → *deal skóre* pre každé auto
- **Verejné demo**: prehľad inzerátov, detail auta s analýzou, kalkulátor férovej ceny
- **Admin**: spustenie scrape jobov, retraining modelu, metriky

## Rýchly štart (lokálne)

_(doplníme v ďalších fázach)_

```bash
docker compose -f docker-compose.dev.yml up
```

## Fázy vývoja

1. ✅ Základ repozitára (git, licencia, env template)
2. ⬜ Backend core (DB + migrácie + auth)
3. ⬜ Scraper worker
4. ⬜ ML pipeline + deal skóre
5. ⬜ Frontend (demo + admin)
6. ⬜ Deploy (NPM + doména + bezpečnostný audit)
7. ⬜ Testy, dokumentácia, screenshoty

## Licencia

[MIT](LICENSE) © 2026 Matej Bujnak

Dáta scrapované z autobazar.eu nie sú súčasťou repozitára a podliehajú
podmienkam zdrojového webu.
