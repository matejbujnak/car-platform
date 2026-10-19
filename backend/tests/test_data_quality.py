"""Rental/subscription offers must be recognized (they poison the model)."""

from app.data_quality import OFFER_RENT, OFFER_SALE, classify_offer


def test_rental_titles_are_detected():
    for title in [
        "Porsche 911 Targa 4 GTS na prenájom 5,890 €",
        "DS 4 - operatívny leasing DS 1.5 BlueHDi",
        "Toyota Proace 80eur/Deň",
        "Ford Ranger Wildtrak - FORD PAUŠÁL",
        "Mercedes Benz A 180d na prenajom",
        "Byt na podnájom",  # any rental marker wins
    ]:
        assert classify_offer(title) == OFFER_RENT, title


def test_regular_sale_titles_pass():
    for title in [
        "Skoda Octavia Combi 2.0 TDi 110kW",
        "BMW X5 xDrive30d Automat",
        "Audi A4 Avant 40 TDI, servisná kniha",
        "Peugeot 2008 1.2 PureTech, možný leasing",
        None,
        "",
    ]:
        assert classify_offer(title) == OFFER_SALE, title
