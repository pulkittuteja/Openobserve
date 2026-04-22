from __future__ import annotations

import os
import pathlib
from dataclasses import dataclass

from dotenv import load_dotenv

_ENV_FILE = pathlib.Path(__file__).resolve().parent.parent / ".env"
load_dotenv(dotenv_path=_ENV_FILE, override=False)


@dataclass(frozen=True)
class Config:
    base_url: str
    organization: str
    username: str
    password: str

    @classmethod
    def from_env(cls) -> "Config":
        return cls(
            base_url=os.getenv("OO_BASE_URL", "http://localhost:5080").rstrip("/"),
            organization=os.getenv("OO_ORG", "default"),
            username=os.getenv("OO_USER", "root@example.com"),
            password=os.getenv("OO_PASSWORD", "Complexpass#123"),
        )
