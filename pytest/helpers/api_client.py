from __future__ import annotations

import logging
import time
from typing import Any

import requests

from .config import Config

log = logging.getLogger(__name__)


class OpenObserveClient:
    def __init__(self, config: Config) -> None:
        self._config = config
        self._session = requests.Session()
        self._session.auth = (config.username, config.password)
        self._session.headers.update({"Content-Type": "application/json"})

    def _org_url(self, path: str) -> str:
        return f"{self._config.base_url}/api/{self._config.organization}{path}"

    def ingest_json(self, stream: str, records: list[dict[str, Any]]) -> dict:
        url = self._org_url(f"/{stream}/_json")
        log.info("INGEST  stream=%s records=%d url=%s", stream, len(records), url)
        log.debug("INGEST payload: %s", records)
        started = time.monotonic()
        response = self._session.post(url, json=records, timeout=10)
        elapsed_ms = int((time.monotonic() - started) * 1000)
        log.info("INGEST  stream=%s status=%s elapsed=%dms", stream, response.status_code, elapsed_ms)
        response.raise_for_status()
        body = response.json()
        log.debug("INGEST response body: %s", body)
        return body

    def search(
        self,
        sql: str,
        *,
        start_time_us: int,
        end_time_us: int,
        size: int = 100,
        offset: int = 0,
    ) -> dict:
        log.info("SEARCH  sql=%s size=%d offset=%d", sql, size, offset)
        started = time.monotonic()
        response = self._session.post(
            self._org_url("/_search"),
            params={"type": "logs"},
            json={
                "query": {
                    "sql": sql,
                    "start_time": start_time_us,
                    "end_time": end_time_us,
                    "from": offset,
                    "size": size,
                }
            },
            timeout=15,
        )
        elapsed_ms = int((time.monotonic() - started) * 1000)
        response.raise_for_status()
        body = response.json()
        hits = body.get("hits", [])
        log.info("SEARCH  status=%s hits=%d elapsed=%dms", response.status_code, len(hits), elapsed_ms)
        log.debug("SEARCH response body: %s", body)
        return body

    def search_until(
        self,
        sql: str,
        *,
        start_time_us: int,
        end_time_us: int,
        expected_hits: int,
        timeout_s: float = 30.0,
        interval_s: float = 1.0,
    ) -> list[dict]:
        log.info("POLL    start expected=%d timeout=%ss interval=%ss sql=%s",
                 expected_hits, timeout_s, interval_s, sql)
        deadline = time.monotonic() + timeout_s
        last_hits: list[dict] = []
        attempt = 0
        while time.monotonic() < deadline:
            attempt += 1
            body = self.search(
                sql,
                start_time_us=start_time_us,
                end_time_us=end_time_us,
                size=max(expected_hits * 2, 100),
            )
            last_hits = body.get("hits", [])
            log.info("POLL    attempt=%d hits=%d/%d", attempt, len(last_hits), expected_hits)
            if len(last_hits) >= expected_hits:
                log.info("POLL    satisfied after %d attempt(s)", attempt)
                return last_hits
            time.sleep(interval_s)
        log.warning("POLL    timed out after %d attempt(s), final hits=%d", attempt, len(last_hits))
        return last_hits

    def delete_stream(self, stream: str, stream_type: str = "logs") -> None:
        url = self._org_url(f"/streams/{stream}")
        log.info("DELETE  stream=%s type=%s", stream, stream_type)
        try:
            response = self._session.delete(url, params={"type": stream_type}, timeout=10)
            log.info("DELETE  stream=%s status=%s", stream, response.status_code)
        except requests.RequestException as exc:
            log.warning("DELETE  stream=%s failed: %s", stream, exc)
