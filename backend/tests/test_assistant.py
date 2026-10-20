"""Natural-language intent parsing for the market assistant."""

from app.assistant import parse_question


def test_price_and_type_intents():
    f = parse_question("najlepšie dealy do 50k eur")
    assert f["price_max"] == 50_000
    assert f["sort"] == "deal_best"

    f = parse_question("kombi do 20 000 €, diesel, manual")
    assert f["price_max"] == 20_000
    assert "Combi" in f["bodies"]
    assert "Diesel" in f["fuels"]
    assert f["gearbox"] == "manual"


def test_year_mileage_power_intents():
    f = parse_question("SUV od 2020 do 100 000 km aspoň 150 kW")
    assert f["year_min"] == 2020
    assert f["mileage_max"] == 100_000
    assert f["power_min"] == 150
    assert "SUV" in f["bodies"]

    f = parse_question("electric cars under 30k")
    assert f["price_max"] == 30_000
    assert "Elektromotor" in f["fuels"]

    # "not older than X" means "from X" - the negation must not flip it.
    f = parse_question("kombiky co nie su starsie ako 2020")
    assert f.get("year_min") == 2020
    assert "year_max" not in f


def test_english_and_misc_intents():
    f = parse_question("cheapest 4x4 from 2018")
    assert "price_min" not in f
    assert f["year_min"] == 2018
    assert f["drive"] == "4x4"
    assert f["sort"] == "price_low"

    f = parse_question("najdrahšie autá")
    assert f["sort"] == "price_high"
