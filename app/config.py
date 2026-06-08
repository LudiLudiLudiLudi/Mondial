import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"


class Config:
    # SQLite by default; switch to Postgres via env without code change.
    SQLALCHEMY_DATABASE_URI = os.environ.get(
        "DATABASE_URL", f"sqlite:///{BASE_DIR / 'mondial2026.db'}"
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SECRET_KEY = os.environ.get("SECRET_KEY", "dev-only-change-me")
    TOURNAMENT_JSON = os.environ.get("TOURNAMENT_JSON", str(DATA_DIR / "mondial2026.json"))
    SCORING_PRESETS_JSON = os.environ.get(
        "SCORING_PRESETS_JSON", str(DATA_DIR / "scoring_presets.json")
    )


class TestConfig(Config):
    SQLALCHEMY_DATABASE_URI = "sqlite:///:memory:"
    TESTING = True
    SECRET_KEY = "test"
