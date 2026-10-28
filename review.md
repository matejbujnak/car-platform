# Car Market Analyzer — príručka na pohovor

Tento dokument je sprievodca projektom podľa aktuálneho zdrojového kódu. Jeho cieľom je pomôcť vysvetliť, čo aplikácia rieši, ako tečú dáta systémom a prečo sú hlavné časti navrhnuté tak, ako sú.

## 1. Projekt v jednej minúte

**Car Market Analyzer** je webová aplikácia na analýzu trhu s jazdenými autami. Pravidelne zbiera ponuky z autobazar.eu, ukladá ich do PostgreSQL a nad parametrami áut trénuje model, ktorý odhaduje ich férovú trhovú cenu. Aplikácia porovnáva odhad s inzerovanou cenou, zobrazuje cenové rozpätie a označí ponuku ako výhodnú, férovú alebo predraženú. Používateľ môže ponuky filtrovať, porovnávať, sledovať históriu ceny a vypočítať cenu vlastného auta.

Backend tvorí FastAPI a Python, frontend React s TypeScriptom a Vite. PostgreSQL uchováva inzeráty, predikcie a prevádzkové údaje; Redis slúži na frontu úloh a počítanie limitov scrapera. Dlhšie úlohy spracúva samostatný worker. Aplikácia aj jej služby sa spúšťajú cez Docker Compose.

## 2. Čo používateľ v aplikácii robí

- **Listings (`/`)**: prehliada stránkovaný zoznam aktívnych ponúk, filtruje značku, model, palivo, prevodovku, karosériu, pohon, cenu, rok, výkon a nájazd. Vie triediť podľa ceny aj modelového odhadu a deal skóre. Filtre sa ukladajú do URL a `localStorage`.
- **Detail auta (`/car/:id`)**: zobrazuje parametre, inzerovanú a odhadovanú férovú cenu, interval, vysvetlenie vplyvu parametrov, históriu ceny, podobné aktívne ponuky a možnosti zdieľania.
- **Price calculator (`/calculator`)**: odošle zadané parametre na API a zobrazí odhad aj vysvetlenie. Voliteľne možno zadať ponukovú cenu a získať verdikt.
- **Insights (`/charts`, `/insights`)**: grafy cien, ponúk, nájazdu, predajcov, deal skóre a približného času na trhu.
- **Compare (`/compare`)**: porovná najviac tri vybrané autá. Výber je uložený na klientovi.
- **Admin (`/admin`)**: po prihlásení umožní spustiť scraping, retraining alebo prepočet predikcií a prezerať stav behov a metrík modelov.
- **Smart filter**: prirodzený text sa zmení na filtre. Voliteľne sa použije lokálny LLM cez Ollama; pri jeho nedostupnosti endpoint na parsovanie použije pravidlový fallback.

## 3. Architektúra a tok dát

```text
autobazar.eu
    │ HTML s vloženým __NEXT_DATA__ JSON
    ▼
scraper v worker kontajneri ── upsert ──► PostgreSQL: Listing + PriceHistory
    │                                           │
    └─ Redis queue ◄── admin / plánovač         ├── API FastAPI ──► React SPA
                                                │
trénovanie ──► joblib model artifact             ├── ModelVersion
                                                └── Prediction cache
```

Typický beh:

1. Worker stiahne stránku s ponukami, vyparsuje dáta a po dávkach ich uloží cez `upsert_listings`.
2. Pri opätovnom nájdení ponuky aktualizuje jej parametre, dátum posledného výskytu a stav. Zmenenú cenu uloží aj do `PriceHistory`.
3. Po scrape jobe worker zaradí dopočítanie chýbajúcich predikcií. Predikcie pre aktívnu verziu modelu uloží do `Prediction`.
4. API vracia dáta a cache predikcií. Ak je ponuka nová a cache ešte neexistuje, zoznamový endpoint ju vie odhadnúť priamo pri požiadavke.
5. Frontend vykreslí tabuľky, grafy a detailné vysvetlenia. V produkcii Nginx servuje SPA a proxyuje API požiadavky na backend.

## 4. Tech stack a priečinky

| Časť | Technológie | Kde hľadať |
|---|---|---|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS | `frontend/src/` |
| HTTP API | Python 3.12, FastAPI, Pydantic | `backend/app/api/routers/` |
| DB a migrácie | SQLModel, SQLAlchemy, PostgreSQL, Alembic | `backend/app/db/`, `backend/alembic/` |
| Scraper a úlohy | Requests, Redis, samostatný worker | `backend/app/scraping/`, `backend/app/worker.py` |
| Model | pandas, scikit-learn, LightGBM, Optuna, joblib | `backend/app/ml/` |
| Nasadenie | Docker, Docker Compose, Nginx | `docker-compose*.yml`, Dockerfile, `frontend/nginx.conf` |

Kľúčové súbory: `backend/app/main.py` skladá FastAPI aplikáciu a startup, `backend/app/db/models.py` definuje tabuľky, `backend/app/assistant.py` obsahuje smart filter/market assistant, `frontend/src/App.tsx` definuje klientské routy a `frontend/src/api.ts` je spoločný klient pre API.

## 5. Backend a API

FastAPI routery sú rozdelené podľa funkcie. Session do DB sa poskytuje cez FastAPI dependency (`get_session`). Pri štarte aplikácia overí produkčné tajomstvá, vytvorí admin účet, ak je nakonfigurovaný a ešte neexistuje, načíta aktívny model a spustí best-effort warm-up Ollama na pozadí. Migrácie sa v Compose spustia pred Uvicornom príkazom `alembic upgrade head`.

| Prefix alebo cesta | Úloha |
|---|---|
| `GET /api/health` | Jednoduchý health check |
| `GET /api/stats`, `GET /api/stats/models` | Počty ponúk, značky, model aktívneho modelu, modely áut |
| `GET /api/charts` | Agregované dáta grafov |
| `GET /api/listings` | Filtrovaný a stránkovaný feed; query parametre určujú sort a filtre |
| `GET /api/listings/{id}` | Detail obohatený o predikciu a vysvetlenie |
| `GET /api/listings/{id}/similar` | Podobné autá rovnakej značky a modelu |
| `GET /api/listings/{id}/history` | Časový rad zaznamenaných cien |
| `POST /api/predict` | Predikcia pre zadané parametre auta |
| `POST /api/ask/parse`, `/search`, `/answer` | Parsovanie filtrov, SQL vyhľadanie, prípadne textová odpoveď LLM |
| `POST /api/auth/login`, `GET /api/auth/me` | Prihlásenie a identita používateľa |
| `/api/admin/*` | Scrape, monitoring, retraining a predikčný backfill; vyžaduje admin rolu |
| `/car/{id}`, `/api/listings/{id}/share.png` | HTML Open Graph náhľad a generovaný obrázok na zdieľanie |

Pri výpise sa predikcie pripájajú podľa ID aktívneho `ModelVersion`. Verdiktové filtre potrebujú záznam v cache; triedenie bez verdiktového filtra používa outer join, takže ponuky bez predikcie zostanú vo výsledkoch, len sa zoradia na koniec. Nadpisy a kategórie prevodovky/pohonu sú miestami voľný text, preto backend používa čiastočné zhody a normalizáciu.

## 6. Databázový model

- **`Listing`**: jedna ponuka identifikovaná unikátnym `source_id`; obsahuje základné parametre auta, URL, cenu, `offer_type` (`sale`/`rent`), `status` (`active`/`sold`), `first_seen` a `last_seen`.
- **`PriceHistory`**: pozorovanie ceny v čase. Cena v `Listing` sa pri scrape prepíše, história uchová predchádzajúce pozorovania.
- **`Prediction`**: výstup pre dvojicu inzerát + verzia modelu; unikátny constraint bráni duplicitnému záznamu pre túto dvojicu. Obsahuje férovú cenu, interval, verdikt a deal score.
- **`ModelVersion`**: cesta k modelovému artifactu, metriky, veľkosť datasetu, dátum tréningu a príznak aktívnej verzie.
- **`ScrapeRun`**: priebeh scrape úlohy, segmenty, checkpoint/cursor, výsledky a chyby.
- **`User`**: username, bcrypt hash hesla, rola, aktivita.

Časové hodnoty sa ukladajú ako UTC bez timezone informácie. Modely `SQLModel` používajú Alembic migrácie; databázová schéma sa teda spravuje verzovane a nenasadzuje sa automaticky cez `create_all`.

## 7. Scraper a kvalita dát

Scraper (`backend/app/scraping/autobazar.py`) sťahuje výsledkové stránky autobazar.eu a extrahuje JSON z HTML elementu `__NEXT_DATA__`. Tento prístup je ľahší než spúšťať plnohodnotný prehliadač, ale závisí od štruktúry webu. Ak JSON chýba alebo sa zmení, scraper vyhodí `ScrapeError`, nie falošný úspešný prázdny výsledok.

Zdrojový web obmedzuje výsledky jedného filtra na 50 strán × 20 ponúk. Kompletný crawl preto tvorí segmenty podľa značky a roku; preplnený segment sa rekurzívne delí podľa cenových intervalov. Prekrývajúce sa hranice sa deduplikujú podľa `source_id`. Crawl ukladá cursor a postup po segmentoch, takže ho worker vie po reštarte obnoviť. Po kompletnom crawl-e ponuky, ktoré sa nenašli, označí ako predané; ponuky patriace do neúspešných segmentov ponechá aktívne. Čiastočný crawl predaj neoznačuje.

Ohľaduplnosť a limity:

- načíta a rešpektuje `robots.txt` (ak jeho stiahnutie zlyhá, kód aktuálne použije permissive fallback — dobrá téma na diskusiu pri pohovore);
- identifikuje sa vlastným User-Agentom a kontaktnou adresou;
- používa náhodné pauzy, dlhšiu pauzu každých 25 požiadaviek a Redis hodinový strop;
- Requests retry-uje vybrané HTTP chyby s backoffom a rešpektovaním `Retry-After`;
- plánovač spúšťa denný crawl a crawl sa môže obmedziť časovým oknom.

`store.upsert_listings` vyhľadá existujúci záznam podľa `source_id`, vloží nový alebo aktualizuje existujúci. Opätovne nájdený inzerát sa nastaví späť na `active`. Pri importe aj scrapingu sa ponuky klasifikujú ako predaj alebo prenájom/subscription. Prenájmy a nevierohodné ceny (mimo 500–200 000 €) sa nezapočítajú do tréningu; pri takýchto ponukách sa nevytvorí bežný deal verdikt.

## 8. Background worker a Redis

API nedrží otvorenú HTTP požiadavku počas dlhého scrape alebo tréningu. Admin router vloží JSON job do Redis listu cez `RPUSH`; worker ho vezme cez blokujúce `BLPOP` a podľa `type` zavolá scrape, training alebo backfill. Worker tiež kontroluje denný crawl, týždenný retraining a periodický sweep predikcií.

Redis tak plní dve roly: jednoduchú frontu a uloženie hodinových počítadiel. Je to zámerne jednoduché riešenie, ale job po `BLPOP` už nie je vo fronte. Ak proces spadne uprostred jeho spracovania, systém nemá všeobecnú ack/retry frontu ani dead-letter queue; full crawl má vlastný checkpoint v PostgreSQL. Toto je užitočné pomenovať ako trade-off/ďalší krok, nie predstierať, že ide o plnohodnotný task broker.

## 9. Cenový model: od dát po predikciu

### Vstupné čistenie a featury

Tréning číta dáta z tabuľky `listing` alebo z CSV. Deduplikuje kombinácie parametrov a ceny, vylúči prenájmy, ceny mimo hraníc, roky mimo 1990–aktuálny rok a nájazd nad 500 000 km. Potrebuje aspoň 200 vyčistených riadkov a každý samostatný tier model aspoň 500.

Zo vstupných polí sa vyrátajú príznaky:

- vek auta a jeho druhá mocnina;
- logaritmus nájazdu, priemerný nájazd za rok;
- výkon, logaritmus výkonu, objem motora a pomer výkon/objem;
- medián ceny a počet porovnateľných ponúk pre model (pri malých kohortách fallback na značku, potom globálny trh);
- nájazd voči mediánu danej trhovej kohorty.

Kategórie značky, modelu, paliva, prevodovky, karosérie, pohonu a typu predajcu sa kódujú cez `OneHotEncoder(handle_unknown="ignore")`. Prevodovka sa zjednoduší na `manual`, `automatic` alebo `unknown`. Číselné featury idú cez `StandardScaler`; LightGBM si poradí s niektorými chýbajúcimi hodnotami, Ridge baseline môže byť na chýbajúce číselné hodnoty citlivejší.

Trhové štatistiky sa vypočítajú iba z tréningovej časti a uložia sa do artifactu, aby scoring používal rovnaký snapshot. Rozdelenie train/calibration/test je deterministické podľa CRC32 `source_id`: buckety 4–9 sú train (60 %), 2–3 calibration (20 %), 0–1 test (20 %). Rovnaké záznamy tak pri retrainingu zostávajú v rovnakom splite.

### Tiers, modely a metriky

Tréning rozdelí značky do budget/mid/premium/luxury tierov podľa mediánu cien a približne vyrovná počty riadkov. Pre každý dostatočne veľký tier trénuje:

1. **Ridge regresiu** ako lineárnu sanity baseline.
2. **LightGBM regressor** ako hlavný nelineárny model.

Cieľovou veličinou je `log(price_eur)`, takže model lepšie pracuje s relatívnou chybou. Pri predikcii sa výsledok prevedie späť exponenciálou. Optuna (TPE sampler) môže ladiť počet stromov, learning rate, počet listov, regularizáciu a ďalšie parametre. Ladenie používa validačnú časť tréningových dát; kalibračná a testovacia množina sú ponechané na interval a vyhodnotenie.

Metriky uložené pre model zahŕňajú MAE, RMSE, R², MAPE a podiel predikcií v tolerancii ±20 %. V README sú uvedené približné výsledky na aktuálnom live datasete, napr. MAPE ~9,5 % a R² ~0,94. Sú to výsledky konkrétneho datasetu/verzie, nie garantovaná vlastnosť každého natrénovaného modelu; pri pohovore ich označ ako reportované hodnoty a uveď dataset a holdout.

### Interval neistoty a deal verdict

Na samostatnej calibration množine sa spočíta absolútna chyba v log priestore. 80. percentil sa uloží ako `conformal_q_log`. Pri inference je interval relatívny:

```text
férová cena = exp(predikcia v log priestore)
dolná hranica = férová cena × exp(−q)
horná hranica = férová cena × exp(q)
```

Tým interval rastie s cenou auta. Implementácia cieli na približne 80 % coverage podľa kalibračných rezíduí; pri interpretácii treba myslieť na reprezentatívnosť a stabilitu dát aj na to, že príslušná coverage nie je garanciou pre ľubovoľný budúci trh.

Deal score je `(férová cena − ponuková cena) / férová cena`. Ak je ponuková cena pod dolnou hranicou, verdikt je `cheap`; nad hornou hranicou `overpriced`; vo vnútri `fair`. Cena pod 40 % odhadu dostane `suspicious` bez score, pretože môže ísť o mesačnú splátku alebo placeholder, nie skutočnú predajnú cenu.

### Artifact, cache a vysvetlenie

Pipeline a kalibrácia sa serializujú cez joblib do zdieľaného `/models` volume. DB tabuľka `ModelVersion` drží registráciu a aktívnu verziu. Po registrácii novej verzie sa stará deaktivuje a zaradí sa backfill predikcií. Predikcia sa routuje do modelu podľa značky; neznáma značka použije default tier.

LightGBM `pred_contrib=True` počíta TreeSHAP príspevky. Keďže model pracuje v log priestore, vysvetlenie skupinuje featury do čitateľných faktorov (vek, nájazd, výkon, značka/model, trhový medián…). Základná cena sa postupne upravuje týmito multiplikatívnymi vplyvmi; zobrazené EUR zmeny sa zaokrúhľujú a podľa implementačného zámeru sa sčítajú na férovú cenu.

## 10. Smart filter a LLM

Sú tu dve podobne pomenované, ale odlišné použitia:

- `POST /api/ask/parse` volá Ollama, žiada JSON filtrov a filtruje odpoveď cez allowlist kľúčov, enumov a čísel. Ak LLM nie je dostupný alebo výstup nie je validný, používa regex/keyword parser. Frontend Listings používa práve tento endpoint na naplnenie filtrov.
- `POST /api/ask/search` a `/answer` v aktuálnom kóde volajú `parse_question` (pravidlový parser) priamo. Search spraví presný SQL dopyt. Answer po SQL retrieval odošle nájdené ponuky a kontext LLM, ktorý napíše stručnú odpoveď. Pri výpadku vráti jednoduché faktické zhrnutie.

Retrieval je SQL, nie embeddings/RAG nad dokumentmi. To je vhodné pre číselné filtre ako cena, rok či nájazd. LLM nemá byť zdrojom cien; SQL výsledky sú zdroj pravdy. Odpoveď je obmedzená promptom a kontextom, ale generovaný text stále treba chápať ako komentár nad dátami. Parser môže zle interpretovať jazyk a UI umožňuje filtre následne ručne opraviť.

## 11. Frontend

`App.tsx` definuje client-side routy cez React Router. `api.ts` centralizuje fetch volania, typy odpovedí a bearer token. V dev režime `VITE_API_URL` smeruje na backend; v produkcii sa používa rovnaký origin a Nginx proxy.

`CarsPage` drží rozpracované (`draft`) a aplikované (`applied`) filtre oddelene. Pri Apply ich uloží do URL aj `localStorage`, následne zavolá stránkovaný listing endpoint. Detail získa listing, históriu a podobné ponuky. Kalkulačka posiela JSON predikcie. Grafy sa kreslia frontendovými SVG komponentmi. Admin stránka najprv kontroluje token v `localStorage`, potom volá chránené admin API; token sa pri 401 odstráni.

Pri pohovore je vhodné spomenúť, že token v `localStorage` je jednoduché riešenie pre demo; pri aplikácii s vyššími bezpečnostnými nárokmi by sa posudzovalo riziko XSS a možnosť httpOnly Secure cookie. URL filtre zlepšujú zdieľateľnosť a obnoviteľnosť stavu.

## 12. Prihlásenie a ochrana endpointov

Heslá sa ukladajú ako bcrypt hash. Login vydáva podpísaný JWT s ID, username, rolou a expiráciou. FastAPI dependency dekóduje bearer token, načíta používateľa z DB a `require_roles` kontroluje rolu. Admin router má požiadavku na admin rolu na úrovni celého routera. SlowAPI limity chránia login, LLM/predict a niektoré admin operácie pred nadmerným používaním.

V produkcii aplikácia odmietne štart bez `SECRET_KEY` alebo `ADMIN_PASSWORD`. Admin sa seeduje iba vtedy, keď nakonfigurovaný účet ešte neexistuje; zmena env hesla sama osebe nemení existujúci hash v DB.

## 13. Nasadenie a lokálny beh

Lokálny vývoj:

```bash
docker compose -f docker-compose.dev.yml up
```

Frontend beží na `localhost:5173`, API na `localhost:8000`, Postgres na `localhost:5432` a Redis na `localhost:6379`. Dev Compose bind-mountuje kód a frontend používa Vite hot reload.

Produkčný Compose rozdeľuje aplikáciu na frontend Nginx, backend API, worker, PostgreSQL a Redis. Modelové súbory sú na zdieľanom Docker volume, aby ich videl API aj worker. DB a Redis nie sú publikované na host port; reverse proxy potrebuje dosiahnuť frontend na zdieľanej Docker sieti. Nginx proxyuje `/api/` na backend a `/car/` na backend pre social preview; iné cesty vracia do SPA.

Konfigurácia je v `.env.example`: DB a JWT tajomstvá, admin, scrapovanie, plánovač, retraining a Ollama. Hodnoty v dev Compose sú iba lokálne vývojové predvolené hodnoty.

## 14. Rozhodnutia a kompromisy, ktoré sa oplatí vysvetliť

- **Oddelenie web požiadaviek od dlhých jobov**: scrape/tréning neblokujú API; cenou je ďalšia služba a potreba monitorovať frontu.
- **Prediction cache**: rýchle filtre a triedenie cez SQL; nové ponuky však môžu mať krátko chýbajúcu cache a fallback ich odhadne pri požiadavke.
- **Log cieľ + tier modely**: lepšie zohľadňuje relatívnu chybu a rozdielne cenové segmenty; nevýhodou je väčšia zložitosť a menej dát na tier.
- **Validácia tierov**: rozdelenie riadkov na train/calibration/test je stabilné podľa ID a trhové štatistiky sa rátajú z train časti, ale mapovanie značiek do tierov sa v aktuálnom kóde počíta z celého vyčisteného datasetu. Pri prísnejšom vyhodnotení by sa tier mapovanie odvodilo iba z train dát a potom sa zmrazené použilo pre calibration/test.
- **Conformal interval**: používateľ vidí neistotu, nielen jedno číslo; kvalita závisí od kalibračných dát a trhu.
- **Jednoduchý scraper HTML JSON parser**: lacný a rýchly, ale zraniteľný zmenami HTML/schema zdroja.
- **Postupné označenie predaných áut**: vyžaduje kompletný crawl, aby sa výpadok segmentu nepovažoval za predaj.
- **Joblib artifact + DB registry**: jednoduchá verzionácia modelov; infraštruktúra musí zachovať súlad cesty k artifactu a záznamu v DB.
- **LLM iba ako parser/komentátor**: SQL drží presné filtre a ponuky, model zlepšuje prirodzené rozhranie; môže mať latenciu a nesprávne pochopiť text.

## 15. Otázky na pohovor a stručné odpovede

### „Ako by ste vysvetlili celý systém?“

„Scraper zbiera štruktúrované ponuky a cez upsert ich ukladá do Postgresu. Redis fronta oddeľuje pomalé scrape, tréning a backfill joby od HTTP API. Tréning vytvorí tierované LightGBM modely na log-cene, kalibruje interval a uloží artifact aj jeho verziu. Worker predpočíta ceny do cache. FastAPI poskytuje filtre a predikcie, React z nich skladá používateľské obrazovky.“

### „Prečo LightGBM a logaritmus ceny?“

„Ceny závisia od nelineárnych kombinácií vlastností a kategórií; gradient-boostované stromy ich vedia modelovať bez ručného navrhovania interakcií. Log-cieľ znižuje dominanciu drahých áut a zodpovedá relatívnej chybe. Ridge slúži ako jednoduchá sanity baseline.“

### „Ako určíte, či je auto dobrá ponuka?“

„Model odhadne férovú cenu a calibration rezíduá definujú interval. Ponuka pod spodnou hranicou je cheap, nad hornou overpriced a vnútri fair. Deal score vyjadruje relatívny rozdiel od odhadu. Extrémne nízke a nevierohodné ceny označujeme suspicious.“

### „Ako sa staráte o zmeny inzertnej ceny?“

„Aktuálna cena sa drží v Listing kvôli rýchlym filtrom. Pri zmene sa pridá pozorovanie do PriceHistory, čo umožňuje graf histórie.“

### „Ako viete, že ponuka zmizla?“

„Len po kompletnom prechode katalógu porovnám aktívne ponuky, ktoré crawl nezaevidoval. Chybné segmenty vynechám, aby sa ich autá omylom neoznačili ako predané.“

### „Ako predchádzate úniku testovacích dát?“

„Rozdelenie podľa stabilného hash ID ponecháva rovnaké záznamy v rovnakých splitoch. Segmentové trhové štatistiky sa počítajú z train riadkov; Optuna validačný split je vnútri tréningu a kalibrácia/test sa používajú na oddelené účely.“

### „Čo by ste zlepšili ďalej?“

Vyber konkrétne zlepšenie podľa otázky: robustnejšia ack/retry fronta; monitoring driftu a coverage; testovanie scrape parsera voči fixture HTML; lepšia imputácia a analýza chýb; presnejšie meranie času predaja; bezpečnejšia správa tokenov. Zdôrazni, že ide o ďalšie kroky, nie už hotové vlastnosti.

## 16. Dôležité limity a presnosť tvrdení

- Model odhaduje cenu z pozorovaných ponúk, nie konečnú realizovanú predajnú cenu. „Fair price“ je modelový odhad.
- Tiers sa vytvárajú podľa mediánovej ceny značky ešte pred train/calibration/test maskami. Je to malý informačný presah do rozdelenia segmentov, ktorý by sa dal odstrániť tak, že sa hranice tierov naučia len na tréningových dátach.
- Dataset môže obsahovať chyby, selekčné skreslenie, opakované či propagované inzeráty a meniace sa textové kategórie.
- Scraper je viazaný na jeden zdroj a jeho HTML/JSON vnútornú štruktúru.
- Predikčný interval vyjadruje kalibrovanú neistotu na dátach, nie prísľub ceny ani garanciu pre každý segment a budúce obdobie.
- README uvádza live dataset a metriky; čísla sa môžu meniť po novom scrape alebo retrainingu.
- Market assistant má kusovú implementáciu: UI smart filter používa LLM parser s fallbackom, no `/search` a `/answer` používajú pravidlové parsovanie. Oplatí sa poznať tento rozdiel.
- Jednoduchá Redis fronta nemá všeobecné potvrdenie spracovania jobu. Po páde workeru môže byť práve odobratá úloha stratená; full crawl má samostatné pokračovanie cez checkpoint.
- Pri dostupnosti menšieho počtu riadkov sa niektoré tier modely preskočia a mapovanie neznámych značiek padá na default tier.

## 17. Súvisiace súbory na rýchle opakovanie

- `README.md` — používateľské funkcie, lokálny beh, deployment a reportované výsledky.
- `backend/app/ml/train.py` — čistenie, splity, tiering, tréning a metriky.
- `backend/app/ml/features.py`, `predict.py`, `explain.py` — featury, scoring a TreeSHAP vysvetlenia.
- `backend/app/worker.py` — joby, plánovanie, pokračovanie crawl-u a backfill.
- `backend/app/scraping/autobazar.py`, `store.py` — zber, parsovanie a upsert.
- `backend/app/db/models.py` a `backend/alembic/versions/` — databázový model a jeho história.
- `backend/app/api/routers/` — HTTP rozhranie.
- `frontend/src/App.tsx`, `api.ts`, `pages/` — obrazovky a komunikácia s API.
- `docker-compose.yml`, `docker-compose.dev.yml`, `frontend/nginx.conf` — runtime služby, lokálny vývoj a proxy.

