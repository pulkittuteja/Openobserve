from __future__ import annotations

import logging
import uuid

import pytest

from helpers.api_client import OpenObserveClient

log = logging.getLogger(__name__)


SAMPLE_RECORDS = [
    {"level": "info", "service": "checkout", "message": "User logged in", "user_id": "u001"},
    {"level": "error", "service": "checkout", "message": "Database connection failed", "code": 500},
    {"level": "info", "service": "search", "message": "Request completed", "took_ms": 142},
    {"level": "warn", "service": "payments", "message": "Retry attempt", "attempt": 2},
    {"level": "debug", "service": "payments", "message": "Cache miss", "key": "u001:cart"},
]


@pytest.mark.logs
def test_ingested_records_are_returned_by_search(
    client: OpenObserveClient,
    unique_stream: str,
    time_window_us: tuple[int, int],
) -> None:
    run_id = uuid.uuid4().hex
    records = [{**record, "run_id": run_id} for record in SAMPLE_RECORDS]
    log.info("TEST    run_id=%s stream=%s records=%d", run_id, unique_stream, len(records))

    ingest_response = client.ingest_json(unique_stream, records)
    assert ingest_response.get("status"), f"unexpected ingest response: {ingest_response}"

    start_us, end_us = time_window_us
    sql = f'SELECT * FROM "{unique_stream}" WHERE run_id = \'{run_id}\''
    hits = client.search_until(
        sql,
        start_time_us=start_us,
        end_time_us=end_us,
        expected_hits=len(records),
    )

    log.info("ASSERT  hit count: expected=%d actual=%d", len(records), len(hits))
    assert len(hits) == len(records), (
        f"expected {len(records)} hits, got {len(hits)}: {hits}"
    )

    hits_by_message = {hit["message"]: hit for hit in hits}
    for expected in records:
        log.debug("ASSERT  record message=%r", expected["message"])
        hit = hits_by_message.get(expected["message"])
        assert hit is not None, f"missing record with message {expected['message']!r}"
        for field, value in expected.items():
            assert hit[field] == value, (
                f"field {field!r} mismatch for message {expected['message']!r}: "
                f"expected {value!r}, got {hit.get(field)!r}"
            )
    log.info("ASSERT  all %d records matched field-by-field", len(records))


@pytest.mark.logs
def test_search_filters_apply_correctly(
    client: OpenObserveClient,
    unique_stream: str,
    time_window_us: tuple[int, int],
) -> None:
    run_id = uuid.uuid4().hex
    records = [{**record, "run_id": run_id} for record in SAMPLE_RECORDS]
    log.info("TEST    run_id=%s stream=%s records=%d", run_id, unique_stream, len(records))
    client.ingest_json(unique_stream, records)

    start_us, end_us = time_window_us
    client.search_until(
        f'SELECT * FROM "{unique_stream}" WHERE run_id = \'{run_id}\'',
        start_time_us=start_us,
        end_time_us=end_us,
        expected_hits=len(records),
    )

    log.info("ASSERT  applying narrower WHERE level='error' filter")
    error_hits = client.search(
        f'SELECT * FROM "{unique_stream}" WHERE run_id = \'{run_id}\' AND level = \'error\'',
        start_time_us=start_us,
        end_time_us=end_us,
    )["hits"]

    log.info("ASSERT  filter returned %d hit(s); expected 1", len(error_hits))
    assert len(error_hits) == 1
    assert error_hits[0]["level"] == "error"
    assert error_hits[0]["code"] == 500
