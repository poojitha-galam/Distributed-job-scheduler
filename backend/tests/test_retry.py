from app.retry import compute_delay_seconds

def test_compute_delay_seconds():
    # fixed: always 5
    assert compute_delay_seconds("fixed", 1) == 5
    assert compute_delay_seconds("fixed", 2) == 5
    assert compute_delay_seconds("fixed", 3) == 5
    assert compute_delay_seconds("fixed", 4) == 5

    # linear: 5 * attempt (5, 10, 15, 20...)
    assert compute_delay_seconds("linear", 1) == 5
    assert compute_delay_seconds("linear", 2) == 10
    assert compute_delay_seconds("linear", 3) == 15
    assert compute_delay_seconds("linear", 4) == 20

    # exponential: 5 * (2 ** (attempt - 1)) (5, 10, 20, 40...)
    assert compute_delay_seconds("exponential", 1) == 5
    assert compute_delay_seconds("exponential", 2) == 10
    assert compute_delay_seconds("exponential", 3) == 20
    assert compute_delay_seconds("exponential", 4) == 40
