from __future__ import annotations

import logging
import pathlib
import time
import uuid

import pytest

from helpers.api_client import OpenObserveClient
from helpers.config import Config

log = logging.getLogger(__name__)

(pathlib.Path(__file__).parent / "logs").mkdir(exist_ok=True)


@pytest.fixture(scope="session")
def config() -> Config:
    cfg = Config.from_env()
    log.info("CONFIG  base_url=%s org=%s user=%s", cfg.base_url, cfg.organization, cfg.username)
    return cfg


@pytest.fixture(scope="session")
def client(config: Config) -> OpenObserveClient:
    return OpenObserveClient(config)


@pytest.fixture
def unique_stream(client: OpenObserveClient, request: pytest.FixtureRequest) -> str:
    name = f"qa_logs_{uuid.uuid4().hex[:10]}"
    log.info("FIXTURE unique_stream=%s test=%s", name, request.node.nodeid)
    yield name
    log.info("FIXTURE teardown stream=%s", name)
    client.delete_stream(name)


@pytest.fixture
def time_window_us() -> tuple[int, int]:
    now_us = int(time.time() * 1_000_000)
    fifteen_min_us = 15 * 60 * 1_000_000
    window = (now_us - fifteen_min_us, now_us + fifteen_min_us)
    log.debug("FIXTURE time_window_us=%s", window)
    return window
