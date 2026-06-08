# Mondial 2026 Family Pool — MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** בריכת ניחושים משפחתית למונדיאל 2026 שעובדת מקצה-לקצה: כניסה · ניחוש · ניקוד אוטומטי · טבלת מובילים.

**Architecture:** Flask + SQLAlchemy + SQLite. מבנה הטורניר נטען מ-`data/mondial2026.json` לטבלאות. משתתפים מזינים ניחושים; מנהל מזין תוצאות; `scoring_service` מחשב ניקוד אוטומטית; `leaderboard_service` מסכם. שירותים טהורים וניתנים לבדיקה בנפרד מ-routes. אין API חיצוני — Flask routes פנימיים בלבד. אין נתיבים מוחלטים בקוד (`Path(__file__)` / env).

**Tech Stack:** Python 3.11+, Flask 3, SQLAlchemy 2, SQLite, pytest, Jinja2 (RTL Hebrew), Docker.

**Scope:** MVP בלבד. דחוי ל-Phase 2 (מתועד במסמך העיצוב §12): שיבוץ FIFA אוטומטי group→r32, קידום נוקאאוט (`next_match_id`), מסך קונפיג ניקוד / presets ב-UI, מצב ילד כ-UI נפרד, בונוסים גלובליים, `manual_override_by_admin`, `ScoringRun` UI. שדות ה-DB עבורם נוצרים כבר ב-MVP (כדי לא לשבור סכימה אחר כך), אך הלוגיקה שלהם לא ממומשת.

---

## File Structure

```
mondial2026-family-pool/
├── app/
│   ├── __init__.py                  # create_app factory + blueprint registration
│   ├── config.py                    # Config; BASE_DIR=Path(__file__); DB URI from env
│   ├── extensions.py                # db = SQLAlchemy()
│   ├── models.py                    # 8 ORM models (one file — small enough for MVP)
│   ├── services/
│   │   ├── __init__.py
│   │   ├── scoring_service.py       # score_prediction (pure) + apply_scores_for_match
│   │   ├── tournament_service.py    # load_tournament_from_json + match_lock_status
│   │   └── leaderboard_service.py   # compute_standings
│   ├── routes/
│   │   ├── __init__.py
│   │   ├── auth.py                  # /join /login + session helpers
│   │   ├── predictions.py           # /matches /predictions/me /predictions/<id>
│   │   ├── admin.py                 # /admin/results/<id>
│   │   └── leaderboard.py           # /leaderboard
│   └── web/
│       ├── templates/               # base, join, matches, leaderboard (RTL)
│       └── static/                  # style.css, app.js
├── data/
│   ├── mondial2026.json             # tournament structure (groups + matches)
│   └── scoring_presets.json         # default "family" preset
├── scripts/
│   ├── init_db.py                   # create tables + load tournament + seed config/admin
│   └── recompute.py                 # CLI recompute_all (Phase-2-light: full re-score)
├── tests/
│   ├── conftest.py                  # app/db/client fixtures
│   ├── test_scoring_service.py
│   ├── test_models.py
│   ├── test_tournament_service.py
│   ├── test_leaderboard_service.py
│   ├── test_auth.py
│   └── test_predictions.py
├── docker/
│   ├── Dockerfile
│   └── docker-compose.yml
├── requirements.txt
├── .gitignore
└── README.md
```

**Responsibilities:**
- `scoring_service.py` — pure scoring logic; no DB imports in `score_prediction`. `apply_scores_for_match` is the DB-touching wrapper.
- `tournament_service.py` — JSON→DB load; lock-status computation from `scheduled_utc`.
- `leaderboard_service.py` — sums `score_awarded` per participant.
- `routes/*` — thin; delegate to services.
- `models.py` — all tables; kept in one file because MVP is small (mirrors the design's "no premature splitting").

---

## Task 0: Project scaffolding

**Files:**
- Create: `.gitignore`, `requirements.txt`, `README.md`
- Create: `app/__init__.py`, `app/config.py`, `app/extensions.py`
- Create: `tests/conftest.py`, `tests/test_smoke.py`

- [ ] **Step 1: Create `.gitignore`**

```gitignore
.venv/
__pycache__/
*.pyc
*.db
*.sqlite3
instance/
.pytest_cache/
.env
```

- [ ] **Step 2: Create `requirements.txt`**

```
Flask==3.0.3
SQLAlchemy==2.0.36
Flask-SQLAlchemy==3.1.1
pytest==8.3.3
```

- [ ] **Step 3: Create the virtualenv and install**

Run:
```bash
cd /Users/admin/projects/mondial2026-family-pool
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```
Expected: installs without error.

- [ ] **Step 4: Create `app/extensions.py`**

```python
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()
```

- [ ] **Step 5: Create `app/config.py`**

```python
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
```

- [ ] **Step 6: Create `app/__init__.py`**

```python
from flask import Flask

from app.config import Config
from app.extensions import db


def create_app(config_object=Config):
    app = Flask(__name__, template_folder="web/templates", static_folder="web/static")
    app.config.from_object(config_object)

    db.init_app(app)

    # Models must be imported so SQLAlchemy registers tables.
    from app import models  # noqa: F401

    from app.routes.auth import bp as auth_bp
    from app.routes.predictions import bp as predictions_bp
    from app.routes.admin import bp as admin_bp
    from app.routes.leaderboard import bp as leaderboard_bp

    app.register_blueprint(auth_bp)
    app.register_blueprint(predictions_bp)
    app.register_blueprint(admin_bp)
    app.register_blueprint(leaderboard_bp)

    return app
```

> NOTE: This factory imports route blueprints that don't exist yet. Until Task 5–8 create them, comment out the four blueprint imports/registrations OR create empty placeholder blueprints. The smoke test in this task uses a minimal factory variant — see Step 7.

- [ ] **Step 7: Create `tests/conftest.py`**

```python
import pytest

from app import create_app
from app.config import TestConfig
from app.extensions import db as _db


@pytest.fixture
def app():
    app = create_app(TestConfig)
    with app.app_context():
        _db.create_all()
        yield app
        _db.session.remove()
        _db.drop_all()


@pytest.fixture
def db(app):
    return _db


@pytest.fixture
def client(app):
    return app.test_client()
```

- [ ] **Step 8: Temporarily stub blueprints so the factory imports**

Create empty placeholder files so `create_app` works before later tasks flesh them out:

`app/routes/__init__.py` (empty), and each of `app/routes/auth.py`, `predictions.py`, `admin.py`, `leaderboard.py` with:

```python
from flask import Blueprint

bp = Blueprint("auth", __name__)  # change name per file: auth/predictions/admin/leaderboard
```

Also create `app/services/__init__.py` (empty) and `app/models.py` with `from app.extensions import db` (empty otherwise) so imports resolve.

- [ ] **Step 9: Create `tests/test_smoke.py`**

```python
def test_app_boots(app):
    assert app is not None


def test_client_responds_404_on_unknown(client):
    resp = client.get("/no-such-route")
    assert resp.status_code == 404
```

- [ ] **Step 10: Run smoke tests**

Run: `.venv/bin/pytest tests/test_smoke.py -v`
Expected: 2 passed.

- [ ] **Step 11: Commit**

```bash
git add .gitignore requirements.txt README.md app tests
git commit -m "chore: project scaffolding (Flask factory, config, conftest, smoke test)"
```

---

## Task 1: Data models

**Files:**
- Modify: `app/models.py`
- Test: `tests/test_models.py`

- [ ] **Step 1: Write the failing test**

```python
from datetime import datetime, timezone

from app.extensions import db
from app.models import (
    Tournament, User, TournamentUser, Group, Match, Prediction,
    ScoringConfig, ScoringRun,
)


def test_create_full_object_graph(app):
    t = Tournament(name="מונדיאל 2026", invite_code="FAM1", admin_join_code="ADM1")
    db.session.add(t)
    db.session.flush()

    cfg = ScoringConfig(
        tournament_id=t.id, name="family",
        effective_from=datetime(2026, 6, 1, tzinfo=timezone.utc),
        params={"exact_result": 3, "correct_winner": 1, "advance_bonus": 1,
                "champion_bonus": 0, "group_ranking_bonus": 0},
    )
    db.session.add(cfg)
    db.session.flush()
    t.active_config_id = cfg.id

    g = Group(tournament_id=t.id, code="A", teams_json=["Germany", "Brazil", "Japan", "Morocco"])
    db.session.add(g)

    m = Match(
        id="M01", tournament_id=t.id, stage="group", group_code="A",
        scheduled_utc=datetime(2026, 6, 11, 19, 0, tzinfo=timezone.utc),
        home_name="Germany", away_name="Brazil", status="scheduled",
    )
    db.session.add(m)

    u = User(display_name="סבתא")
    db.session.add(u)
    db.session.flush()
    tu = TournamentUser(tournament_id=t.id, user_id=u.id, role="participant", join_code="GR4N")
    db.session.add(tu)
    db.session.flush()

    p = Prediction(tournament_user_id=tu.id, match_id="M01", pred_home=2, pred_away=1)
    db.session.add(p)

    run = ScoringRun(tournament_id=t.id, config_id=cfg.id)
    db.session.add(run)
    db.session.commit()

    assert Tournament.query.count() == 1
    assert Group.query.first().teams_json == ["Germany", "Brazil", "Japan", "Morocco"]
    assert Prediction.query.first().pred_home == 2
    assert Match.query.first().status == "scheduled"


def test_prediction_unique_per_user_match(app):
    t = Tournament(name="t", invite_code="i", admin_join_code="a")
    db.session.add(t); db.session.flush()
    u = User(display_name="x"); db.session.add(u); db.session.flush()
    tu = TournamentUser(tournament_id=t.id, user_id=u.id, role="participant", join_code="c")
    db.session.add(tu); db.session.flush()
    m = Match(id="M01", tournament_id=t.id, stage="group", status="scheduled")
    db.session.add(m); db.session.commit()

    db.session.add(Prediction(tournament_user_id=tu.id, match_id="M01", pred_home=1, pred_away=0))
    db.session.commit()
    db.session.add(Prediction(tournament_user_id=tu.id, match_id="M01", pred_home=2, pred_away=2))
    import pytest
    from sqlalchemy.exc import IntegrityError
    with pytest.raises(IntegrityError):
        db.session.commit()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/pytest tests/test_models.py -v`
Expected: FAIL (ImportError — models not defined).

- [ ] **Step 3: Implement `app/models.py`**

```python
from datetime import datetime, timezone

from sqlalchemy import UniqueConstraint
from sqlalchemy.types import JSON

from app.extensions import db


def _utcnow():
    return datetime.now(timezone.utc)


class Tournament(db.Model):
    __tablename__ = "tournament"
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    invite_code = db.Column(db.String(40), unique=True, nullable=False)
    admin_join_code = db.Column(db.String(40), unique=True, nullable=False)
    active_config_id = db.Column(db.Integer, db.ForeignKey("scoring_config.id"))
    created_at = db.Column(db.DateTime(timezone=True), default=_utcnow)


class User(db.Model):
    __tablename__ = "user"
    id = db.Column(db.Integer, primary_key=True)
    display_name = db.Column(db.String(80), nullable=False)
    created_at = db.Column(db.DateTime(timezone=True), default=_utcnow)


class TournamentUser(db.Model):
    __tablename__ = "tournament_user"
    id = db.Column(db.Integer, primary_key=True)
    tournament_id = db.Column(db.Integer, db.ForeignKey("tournament.id"), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False)
    role = db.Column(db.String(20), nullable=False, default="participant")  # admin/participant/child
    join_code = db.Column(db.String(40), unique=True, nullable=False)
    joined_at = db.Column(db.DateTime(timezone=True), default=_utcnow)


class Group(db.Model):
    __tablename__ = "group"
    id = db.Column(db.Integer, primary_key=True)
    tournament_id = db.Column(db.Integer, db.ForeignKey("tournament.id"), nullable=False)
    code = db.Column(db.String(4), nullable=False)
    teams_json = db.Column(JSON, nullable=False)  # flat array of strings


class Match(db.Model):
    __tablename__ = "match"
    id = db.Column(db.String(10), primary_key=True)  # "M01" from JSON
    tournament_id = db.Column(db.Integer, db.ForeignKey("tournament.id"), nullable=False)
    stage = db.Column(db.String(10), nullable=False)  # group/r32/r16/qf/sf/third/final
    group_code = db.Column(db.String(4))
    scheduled_utc = db.Column(db.DateTime(timezone=True))
    home_name = db.Column(db.String(80))
    away_name = db.Column(db.String(80))
    home_score = db.Column(db.Integer)
    away_score = db.Column(db.Integer)
    status = db.Column(db.String(12), nullable=False, default="scheduled")  # scheduled/locked/live/completed
    advancing_side = db.Column(db.String(4))   # home/away (knockout)
    advance_method = db.Column(db.String(12))  # normal/extra_time/penalties
    next_match_id = db.Column(db.String(10))   # Phase 2 promotion
    next_slot = db.Column(db.String(4))        # home/away


class Prediction(db.Model):
    __tablename__ = "prediction"
    __table_args__ = (UniqueConstraint("tournament_user_id", "match_id", name="uq_pred_user_match"),)
    id = db.Column(db.Integer, primary_key=True)
    tournament_user_id = db.Column(db.Integer, db.ForeignKey("tournament_user.id"), nullable=False)
    match_id = db.Column(db.String(10), db.ForeignKey("match.id"), nullable=False)
    pred_home = db.Column(db.Integer)
    pred_away = db.Column(db.Integer)
    pred_advancing_side = db.Column(db.String(4))  # home/away (knockout only)
    updated_at = db.Column(db.DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)
    locked_at = db.Column(db.DateTime(timezone=True))  # null until kickoff
    score_awarded = db.Column(db.Integer)
    scored_at = db.Column(db.DateTime(timezone=True))
    config_id_used = db.Column(db.Integer, db.ForeignKey("scoring_config.id"))


class ScoringConfig(db.Model):
    __tablename__ = "scoring_config"
    id = db.Column(db.Integer, primary_key=True)
    tournament_id = db.Column(db.Integer, db.ForeignKey("tournament.id"), nullable=False)
    name = db.Column(db.String(40), nullable=False)
    effective_from = db.Column(db.DateTime(timezone=True))
    params = db.Column(JSON, nullable=False)


class ScoringRun(db.Model):
    __tablename__ = "scoring_run"
    id = db.Column(db.Integer, primary_key=True)
    tournament_id = db.Column(db.Integer, db.ForeignKey("tournament.id"), nullable=False)
    config_id = db.Column(db.Integer, db.ForeignKey("scoring_config.id"))
    started_at = db.Column(db.DateTime(timezone=True), default=_utcnow)
    finished_at = db.Column(db.DateTime(timezone=True))
    matches_affected = db.Column(db.Integer, default=0)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv/bin/pytest tests/test_models.py -v`
Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add app/models.py tests/test_models.py
git commit -m "feat: data models (8 tables) with prediction uniqueness"
```

---

## Task 2: Scoring service (pure core)

**Files:**
- Create: `app/services/scoring_service.py`
- Test: `tests/test_scoring_service.py`

This is the heart of the system. `score_prediction` is pure — no DB. Validates against the three spec examples.

- [ ] **Step 1: Write the failing test**

```python
from types import SimpleNamespace

from app.services.scoring_service import score_prediction, Result

FAMILY = {"exact_result": 3, "correct_winner": 1, "advance_bonus": 1,
          "champion_bonus": 0, "group_ranking_bonus": 0}


def pred(h, a, adv=None):
    return SimpleNamespace(pred_home=h, pred_away=a, pred_advancing_side=adv)


def res(h, a, adv=None, method="normal", knockout=False):
    return Result(home_score=h, away_score=a, advancing_side=adv,
                  advance_method=method, is_knockout=knockout)


def test_example_1_exact_plus_advance():
    out = score_prediction(pred(1, 1, "away"), res(1, 1, "away", "penalties", True), FAMILY)
    assert out == {"result_points": 3, "advance_points": 1, "total": 4}


def test_example_2_exact_wrong_advance():
    out = score_prediction(pred(1, 1, "home"), res(1, 1, "away", "penalties", True), FAMILY)
    assert out == {"result_points": 3, "advance_points": 0, "total": 3}


def test_example_3_wrong_result_zero():
    out = score_prediction(pred(2, 1), res(1, 1, "away", "penalties", True), FAMILY)
    assert out == {"result_points": 0, "advance_points": 0, "total": 0}


def test_correct_winner_not_exact():
    out = score_prediction(pred(2, 0), res(3, 1, knockout=False), FAMILY)
    assert out == {"result_points": 1, "advance_points": 0, "total": 1}


def test_correct_draw_not_exact():
    out = score_prediction(pred(0, 0), res(2, 2), FAMILY)
    assert out["result_points"] == 1


def test_no_prediction_is_zero():
    out = score_prediction(None, res(1, 0), FAMILY)
    assert out["total"] == 0


def test_partial_prediction_is_zero():
    out = score_prediction(pred(None, None), res(1, 0), FAMILY)
    assert out["total"] == 0


def test_no_result_yet_is_zero():
    out = score_prediction(pred(1, 0), res(None, None), FAMILY)
    assert out["total"] == 0


def test_advance_bonus_only_in_knockout():
    # correct advancing guess but group match → no advance points
    out = score_prediction(pred(1, 0, "home"), res(1, 0, "home", "normal", knockout=False), FAMILY)
    assert out["advance_points"] == 0
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/pytest tests/test_scoring_service.py -v`
Expected: FAIL (ImportError).

- [ ] **Step 3: Implement `app/services/scoring_service.py`**

```python
from dataclasses import dataclass
from typing import Optional


@dataclass
class Result:
    home_score: Optional[int]
    away_score: Optional[int]
    advancing_side: Optional[str] = None   # "home" / "away"
    advance_method: str = "normal"         # normal / extra_time / penalties
    is_knockout: bool = False


def _outcome(home: int, away: int) -> str:
    if home > away:
        return "home"
    if home < away:
        return "away"
    return "draw"


def _has_prediction(prediction) -> bool:
    return (
        prediction is not None
        and prediction.pred_home is not None
        and prediction.pred_away is not None
    )


def _has_result(result: Result) -> bool:
    return result is not None and result.home_score is not None and result.away_score is not None


def _result_points(prediction, result: Result, config: dict) -> int:
    if (prediction.pred_home == result.home_score
            and prediction.pred_away == result.away_score):
        return config["exact_result"]
    if _outcome(prediction.pred_home, prediction.pred_away) == _outcome(
        result.home_score, result.away_score
    ):
        return config["correct_winner"]
    return 0


def _advance_points(prediction, result: Result, config: dict) -> int:
    if not result.is_knockout:
        return 0
    pred_side = getattr(prediction, "pred_advancing_side", None)
    if pred_side is None or result.advancing_side is None:
        return 0
    if pred_side == result.advancing_side:
        return config["advance_bonus"]
    return 0


def score_prediction(prediction, result: Result, config: dict) -> dict:
    """Pure scoring. No DB. Returns result/advance/total breakdown."""
    zero = {"result_points": 0, "advance_points": 0, "total": 0}
    if not _has_prediction(prediction) or not _has_result(result):
        return zero
    rp = _result_points(prediction, result, config)
    ap = _advance_points(prediction, result, config)
    return {"result_points": rp, "advance_points": ap, "total": rp + ap}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv/bin/pytest tests/test_scoring_service.py -v`
Expected: 9 passed.

- [ ] **Step 5: Commit**

```bash
git add app/services/scoring_service.py tests/test_scoring_service.py
git commit -m "feat: pure scoring engine (90-min result + knockout advance bonus)"
```

---

## Task 3: Tournament service (load JSON + lock status)

**Files:**
- Create: `app/services/tournament_service.py`
- Create: `data/mondial2026.json` (minimal valid fixture for tests)
- Create: `data/scoring_presets.json`
- Test: `tests/test_tournament_service.py`

- [ ] **Step 1: Create `data/scoring_presets.json`**

```json
{
  "family": {"exact_result": 3, "correct_winner": 1, "advance_bonus": 1, "champion_bonus": 0, "group_ranking_bonus": 0},
  "sportive": {"exact_result": 3, "correct_winner": 1, "advance_bonus": 2, "champion_bonus": 5, "group_ranking_bonus": 2},
  "tough": {"exact_result": 2, "correct_winner": 0, "advance_bonus": 1, "champion_bonus": 3, "group_ranking_bonus": 1}
}
```

- [ ] **Step 2: Create `data/mondial2026.json` (small but valid; full fixture filled later)**

```json
{
  "name": "מונדיאל 2026",
  "groups": [
    {"code": "A", "teams": ["Germany", "Brazil", "Japan", "Morocco"]},
    {"code": "B", "teams": ["France", "Spain", "Canada", "Ghana"]}
  ],
  "matches": [
    {"id": "M01", "stage": "group", "group": "A", "home": "Germany", "away": "Brazil",
     "scheduled_utc": "2026-06-11T19:00:00Z", "next_match_id": null, "next_slot": null},
    {"id": "M02", "stage": "group", "group": "A", "home": "Japan", "away": "Morocco",
     "scheduled_utc": "2026-06-11T22:00:00Z", "next_match_id": null, "next_slot": null},
    {"id": "M03", "stage": "group", "group": "B", "home": "France", "away": "Spain",
     "scheduled_utc": "2026-06-12T19:00:00Z", "next_match_id": null, "next_slot": null},
    {"id": "K01", "stage": "r32", "group": null, "home": "slot:1A", "away": "slot:2B",
     "scheduled_utc": "2026-06-28T19:00:00Z", "next_match_id": "K09", "next_slot": "home"}
  ]
}
```

> NOTE: The full 12-group / 104-match fixture is a separate data task (Task 10). This minimal fixture is enough for all service/route tests.

- [ ] **Step 3: Write the failing test**

```python
from datetime import datetime, timezone

from app.extensions import db
from app.models import Tournament, Group, Match
from app.services.tournament_service import load_tournament_from_json, match_lock_status


def test_load_creates_tournament_groups_matches(app):
    t = load_tournament_from_json(invite_code="FAM1", admin_join_code="ADM1")
    db.session.commit()
    assert t.name == "מונדיאל 2026"
    assert Group.query.filter_by(tournament_id=t.id).count() == 2
    assert Match.query.filter_by(tournament_id=t.id).count() == 4
    a = Group.query.filter_by(code="A").first()
    assert a.teams_json == ["Germany", "Brazil", "Japan", "Morocco"]
    k = Match.query.get("K01")
    assert k.stage == "r32"
    assert k.next_match_id == "K09"


def test_load_is_idempotent(app):
    load_tournament_from_json(invite_code="FAM1", admin_join_code="ADM1")
    db.session.commit()
    load_tournament_from_json(invite_code="FAM2", admin_join_code="ADM2")
    db.session.commit()
    assert Tournament.query.count() == 1
    assert Match.query.count() == 4


def test_lock_status_open_before_kickoff(app):
    future = datetime(2999, 1, 1, tzinfo=timezone.utc)
    assert match_lock_status(future, now=datetime(2026, 1, 1, tzinfo=timezone.utc)) == "open"


def test_lock_status_locked_at_kickoff(app):
    kickoff = datetime(2026, 6, 11, 19, 0, tzinfo=timezone.utc)
    now = datetime(2026, 6, 11, 19, 0, tzinfo=timezone.utc)
    assert match_lock_status(kickoff, now=now) == "locked"


def test_lock_status_locked_after_kickoff(app):
    kickoff = datetime(2026, 6, 11, 19, 0, tzinfo=timezone.utc)
    now = datetime(2026, 6, 11, 20, 0, tzinfo=timezone.utc)
    assert match_lock_status(kickoff, now=now) == "locked"
```

- [ ] **Step 4: Run test to verify it fails**

Run: `.venv/bin/pytest tests/test_tournament_service.py -v`
Expected: FAIL (ImportError).

- [ ] **Step 5: Implement `app/services/tournament_service.py`**

```python
import json
from datetime import datetime, timezone

from flask import current_app

from app.extensions import db
from app.models import Tournament, Group, Match


def _parse_dt(value):
    if value is None:
        return None
    # JSON uses trailing "Z"; normalise to +00:00 for fromisoformat.
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def load_tournament_from_json(*, invite_code, admin_join_code, json_path=None):
    """Idempotent: loads the single tournament + groups + matches if absent."""
    existing = Tournament.query.first()
    if existing is not None:
        return existing

    path = json_path or current_app.config["TOURNAMENT_JSON"]
    with open(path, encoding="utf-8") as fh:
        data = json.load(fh)

    t = Tournament(name=data["name"], invite_code=invite_code, admin_join_code=admin_join_code)
    db.session.add(t)
    db.session.flush()

    for g in data["groups"]:
        db.session.add(Group(tournament_id=t.id, code=g["code"], teams_json=g["teams"]))

    for m in data["matches"]:
        db.session.add(Match(
            id=m["id"], tournament_id=t.id, stage=m["stage"], group_code=m.get("group"),
            scheduled_utc=_parse_dt(m.get("scheduled_utc")),
            home_name=m.get("home"), away_name=m.get("away"),
            status="scheduled", next_match_id=m.get("next_match_id"), next_slot=m.get("next_slot"),
        ))
    return t


def match_lock_status(scheduled_utc, now=None):
    """'open' before kickoff, 'locked' at/after kickoff."""
    if scheduled_utc is None:
        return "open"
    now = now or datetime.now(timezone.utc)
    return "locked" if now >= scheduled_utc else "open"
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `.venv/bin/pytest tests/test_tournament_service.py -v`
Expected: 5 passed.

- [ ] **Step 7: Commit**

```bash
git add app/services/tournament_service.py data/mondial2026.json data/scoring_presets.json tests/test_tournament_service.py
git commit -m "feat: tournament loader (JSON->DB, idempotent) + kickoff lock status"
```

---

## Task 4: Apply scores to DB (scoring wrapper)

**Files:**
- Modify: `app/services/scoring_service.py`
- Test: `tests/test_scoring_service.py` (append)

- [ ] **Step 1: Write the failing test (append to existing file)**

```python
from datetime import datetime, timezone

from app.extensions import db
from app.models import (Tournament, User, TournamentUser, Match, Prediction, ScoringConfig)
from app.services.scoring_service import apply_scores_for_match


def _setup_tournament_with_prediction(app, pred_home, pred_away, pred_adv=None):
    t = Tournament(name="t", invite_code="i", admin_join_code="a")
    db.session.add(t); db.session.flush()
    cfg = ScoringConfig(tournament_id=t.id, name="family",
                        effective_from=datetime(2026, 1, 1, tzinfo=timezone.utc),
                        params={"exact_result": 3, "correct_winner": 1, "advance_bonus": 1,
                                "champion_bonus": 0, "group_ranking_bonus": 0})
    db.session.add(cfg); db.session.flush()
    t.active_config_id = cfg.id
    u = User(display_name="u"); db.session.add(u); db.session.flush()
    tu = TournamentUser(tournament_id=t.id, user_id=u.id, role="participant", join_code="c")
    db.session.add(tu); db.session.flush()
    m = Match(id="M01", tournament_id=t.id, stage="group", status="scheduled")
    db.session.add(m)
    db.session.add(Prediction(tournament_user_id=tu.id, match_id="M01",
                              pred_home=pred_home, pred_away=pred_away,
                              pred_advancing_side=pred_adv))
    db.session.commit()
    return t, m


def test_apply_scores_writes_score_awarded(app):
    t, m = _setup_tournament_with_prediction(app, 2, 1)
    m.home_score, m.away_score, m.status = 2, 1, "completed"
    db.session.commit()
    affected = apply_scores_for_match(m)
    db.session.commit()
    p = Prediction.query.first()
    assert affected == 1
    assert p.score_awarded == 3
    assert p.scored_at is not None
    assert p.config_id_used == t.active_config_id


def test_apply_scores_zero_for_wrong(app):
    t, m = _setup_tournament_with_prediction(app, 0, 0)
    m.home_score, m.away_score, m.status = 2, 1, "completed"
    db.session.commit()
    apply_scores_for_match(m)
    db.session.commit()
    assert Prediction.query.first().score_awarded == 0
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/pytest tests/test_scoring_service.py -k apply -v`
Expected: FAIL (ImportError: apply_scores_for_match).

- [ ] **Step 3: Add `apply_scores_for_match` to `app/services/scoring_service.py`**

```python
# --- appended imports at top of file ---
from datetime import datetime, timezone

from app.extensions import db
from app.models import Tournament, Match, Prediction, ScoringConfig


_KNOCKOUT_STAGES = {"r32", "r16", "qf", "sf", "third", "final"}


def _result_from_match(match: Match) -> Result:
    return Result(
        home_score=match.home_score,
        away_score=match.away_score,
        advancing_side=match.advancing_side,
        advance_method=match.advance_method or "normal",
        is_knockout=match.stage in _KNOCKOUT_STAGES,
    )


def apply_scores_for_match(match: Match) -> int:
    """Score every prediction for this match using the tournament's active config.
    Returns number of predictions updated. Caller commits."""
    tournament = Tournament.query.get(match.tournament_id)
    config = ScoringConfig.query.get(tournament.active_config_id)
    result = _result_from_match(match)

    predictions = Prediction.query.filter_by(match_id=match.id).all()
    now = datetime.now(timezone.utc)
    for p in predictions:
        breakdown = score_prediction(p, result, config.params)
        p.score_awarded = breakdown["total"]
        p.scored_at = now
        p.config_id_used = config.id
    return len(predictions)
```

> DRY note: `score_prediction` and `Result` already exist in this module from Task 2 — reuse them, do not duplicate.

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv/bin/pytest tests/test_scoring_service.py -v`
Expected: all passed (Task 2's 9 + these 2).

- [ ] **Step 5: Commit**

```bash
git add app/services/scoring_service.py tests/test_scoring_service.py
git commit -m "feat: apply_scores_for_match (DB wrapper over pure scorer)"
```

---

## Task 5: Leaderboard service

**Files:**
- Create: `app/services/leaderboard_service.py`
- Test: `tests/test_leaderboard_service.py`

- [ ] **Step 1: Write the failing test**

```python
from datetime import datetime, timezone

from app.extensions import db
from app.models import Tournament, User, TournamentUser, Match, Prediction
from app.services.leaderboard_service import compute_standings


def _participant(t, name, code):
    u = User(display_name=name); db.session.add(u); db.session.flush()
    tu = TournamentUser(tournament_id=t.id, user_id=u.id, role="participant", join_code=code)
    db.session.add(tu); db.session.flush()
    return tu


def test_standings_sorted_by_points_desc(app):
    t = Tournament(name="t", invite_code="i", admin_join_code="a")
    db.session.add(t); db.session.flush()
    m = Match(id="M01", tournament_id=t.id, stage="group", status="completed")
    db.session.add(m)
    alice = _participant(t, "Alice", "AAAA")
    bob = _participant(t, "Bob", "BBBB")
    db.session.add(Prediction(tournament_user_id=alice.id, match_id="M01",
                              pred_home=1, pred_away=0, score_awarded=3))
    db.session.add(Prediction(tournament_user_id=bob.id, match_id="M01",
                              pred_home=2, pred_away=2, score_awarded=0))
    db.session.commit()

    standings = compute_standings(t.id)
    assert [s["display_name"] for s in standings] == ["Alice", "Bob"]
    assert standings[0]["points"] == 3
    assert standings[1]["points"] == 0


def test_standings_counts_unscored_as_zero(app):
    t = Tournament(name="t", invite_code="i", admin_join_code="a")
    db.session.add(t); db.session.flush()
    carol = _participant(t, "Carol", "CCCC")
    db.session.commit()
    standings = compute_standings(t.id)
    assert standings[0]["display_name"] == "Carol"
    assert standings[0]["points"] == 0
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/pytest tests/test_leaderboard_service.py -v`
Expected: FAIL (ImportError).

- [ ] **Step 3: Implement `app/services/leaderboard_service.py`**

```python
from app.extensions import db
from app.models import TournamentUser, User, Prediction


def compute_standings(tournament_id: int) -> list[dict]:
    """Sum score_awarded per participant. Unscored/missing predictions count as 0.
    Sorted by points desc, then display_name asc for stable ties."""
    members = (
        db.session.query(TournamentUser, User)
        .join(User, User.id == TournamentUser.user_id)
        .filter(TournamentUser.tournament_id == tournament_id)
        .all()
    )
    standings = []
    for tu, user in members:
        total = (
            db.session.query(db.func.coalesce(db.func.sum(Prediction.score_awarded), 0))
            .filter(Prediction.tournament_user_id == tu.id)
            .scalar()
        )
        standings.append({
            "tournament_user_id": tu.id,
            "display_name": user.display_name,
            "points": int(total),
        })
    standings.sort(key=lambda s: (-s["points"], s["display_name"]))
    return standings
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv/bin/pytest tests/test_leaderboard_service.py -v`
Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add app/services/leaderboard_service.py tests/test_leaderboard_service.py
git commit -m "feat: leaderboard standings (sum points per participant)"
```

---

## Task 6: Auth routes (join / login / session)

**Files:**
- Modify: `app/routes/auth.py`
- Create: `app/services/auth_service.py`
- Test: `tests/test_auth.py`

Session model: store `tournament_user_id` in Flask session cookie. Join order is strict (validate code → create User → TournamentUser → join_code → session).

- [ ] **Step 1: Write the failing test**

```python
from app.extensions import db
from app.models import Tournament, User, TournamentUser
from app.services.tournament_service import load_tournament_from_json


def _seed_tournament(app):
    t = load_tournament_from_json(invite_code="FAM1", admin_join_code="ADM1")
    db.session.commit()
    return t


def test_join_with_valid_invite_creates_membership(client, app):
    _seed_tournament(app)
    resp = client.post("/join", data={"invite_code": "FAM1", "display_name": "סבתא"})
    assert resp.status_code in (200, 302)
    assert User.query.filter_by(display_name="סבתא").count() == 1
    tu = TournamentUser.query.first()
    assert tu.role == "participant"
    assert tu.join_code  # personal code generated


def test_join_with_bad_invite_creates_nothing(client, app):
    _seed_tournament(app)
    resp = client.post("/join", data={"invite_code": "WRONG", "display_name": "x"})
    assert resp.status_code == 403
    assert User.query.count() == 0  # no orphan users


def test_admin_code_grants_admin_role(client, app):
    _seed_tournament(app)
    client.post("/join", data={"invite_code": "ADM1", "display_name": "מנהל"})
    tu = TournamentUser.query.first()
    assert tu.role == "admin"


def test_login_with_join_code_sets_session(client, app):
    _seed_tournament(app)
    client.post("/join", data={"invite_code": "FAM1", "display_name": "סבתא"})
    code = TournamentUser.query.first().join_code
    with client.session_transaction() as sess:
        sess.clear()
    resp = client.post("/login", data={"join_code": code})
    assert resp.status_code in (200, 302)
    with client.session_transaction() as sess:
        assert sess.get("tournament_user_id") is not None


def test_login_with_bad_code_rejected(client, app):
    _seed_tournament(app)
    resp = client.post("/login", data={"join_code": "NOPE"})
    assert resp.status_code == 403
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/pytest tests/test_auth.py -v`
Expected: FAIL (routes not implemented).

- [ ] **Step 3: Implement `app/services/auth_service.py`**

```python
import secrets
import string

from app.extensions import db
from app.models import Tournament, User, TournamentUser

_ALPHABET = string.ascii_uppercase + string.digits


def _new_join_code(length=6):
    while True:
        code = "".join(secrets.choice(_ALPHABET) for _ in range(length))
        if not TournamentUser.query.filter_by(join_code=code).first():
            return code


def resolve_role(tournament: Tournament, code: str):
    """Returns 'admin' for admin_join_code, 'participant' for invite_code, else None."""
    if code == tournament.admin_join_code:
        return "admin"
    if code == tournament.invite_code:
        return "participant"
    return None


def join(*, code: str, display_name: str):
    """Strict order: validate code BEFORE creating any entity (no orphan users)."""
    tournament = Tournament.query.first()
    if tournament is None:
        return None, "no_tournament"
    role = resolve_role(tournament, code)
    if role is None:
        return None, "bad_code"

    user = User(display_name=display_name.strip() or "אורח")
    db.session.add(user)
    db.session.flush()
    tu = TournamentUser(tournament_id=tournament.id, user_id=user.id,
                        role=role, join_code=_new_join_code())
    db.session.add(tu)
    db.session.commit()
    return tu, None


def login(*, join_code: str):
    return TournamentUser.query.filter_by(join_code=join_code.strip()).first()
```

- [ ] **Step 4: Implement `app/routes/auth.py`**

```python
from flask import Blueprint, request, session, redirect, url_for, render_template, abort

from app.services.auth_service import join, login

bp = Blueprint("auth", __name__)


@bp.get("/join")
def join_form():
    return render_template("join.html")


@bp.post("/join")
def join_submit():
    code = request.form.get("invite_code", "")
    display_name = request.form.get("display_name", "")
    tu, error = join(code=code, display_name=display_name)
    if error == "bad_code":
        abort(403)
    if error:
        abort(400)
    session["tournament_user_id"] = tu.id
    session["join_code"] = tu.join_code  # shown to user for other devices
    return redirect(url_for("predictions.matches"))


@bp.post("/login")
def login_submit():
    tu = login(join_code=request.form.get("join_code", ""))
    if tu is None:
        abort(403)
    session["tournament_user_id"] = tu.id
    return redirect(url_for("predictions.matches"))


@bp.get("/logout")
def logout():
    session.clear()
    return redirect(url_for("auth.join_form"))


def current_membership():
    """Helper for other routes. Returns TournamentUser or None."""
    from app.models import TournamentUser
    tu_id = session.get("tournament_user_id")
    return TournamentUser.query.get(tu_id) if tu_id else None
```

> NOTE: `join.html` template is created in Task 9. Tests post directly and follow redirects loosely (`status_code in (200, 302)`), so the missing template only matters for GET `/join`, which the tests don't call. The redirect target `predictions.matches` is created in Task 7.

- [ ] **Step 5: Run tests to verify they pass**

Run: `.venv/bin/pytest tests/test_auth.py -v`
Expected: 5 passed.

> If redirect target errors because `predictions.matches` doesn't exist yet, implement Task 7 first or temporarily redirect to `auth.join_form`. Recommended: do Task 7 immediately after.

- [ ] **Step 6: Commit**

```bash
git add app/services/auth_service.py app/routes/auth.py tests/test_auth.py
git commit -m "feat: auth (join validates before create, login by join_code, session)"
```

---

## Task 7: Prediction routes (view matches + submit, with lock enforcement)

**Files:**
- Modify: `app/routes/predictions.py`
- Test: `tests/test_predictions.py`

- [ ] **Step 1: Write the failing test**

```python
from datetime import datetime, timezone

from app.extensions import db
from app.models import TournamentUser, Match, Prediction
from app.services.tournament_service import load_tournament_from_json


def _join(client, app, code="FAM1", name="סבתא"):
    load_tournament_from_json(invite_code="FAM1", admin_join_code="ADM1")
    db.session.commit()
    client.post("/join", data={"invite_code": code, "display_name": name})
    return TournamentUser.query.first()


def test_submit_prediction_for_future_match(client, app):
    _join(client, app)
    # M01 is far past in fixture; create an explicitly future match to allow submit.
    fm = Match(id="MX", tournament_id=1, stage="group", status="scheduled",
               scheduled_utc=datetime(2999, 1, 1, tzinfo=timezone.utc),
               home_name="A", away_name="B")
    db.session.add(fm); db.session.commit()
    resp = client.put("/predictions/MX", json={"pred_home": 2, "pred_away": 1})
    assert resp.status_code == 200
    p = Prediction.query.filter_by(match_id="MX").first()
    assert (p.pred_home, p.pred_away) == (2, 1)


def test_submit_blocked_after_kickoff(client, app):
    _join(client, app)
    pm = Match(id="MP", tournament_id=1, stage="group", status="scheduled",
               scheduled_utc=datetime(2000, 1, 1, tzinfo=timezone.utc),
               home_name="A", away_name="B")
    db.session.add(pm); db.session.commit()
    resp = client.put("/predictions/MP", json={"pred_home": 2, "pred_away": 1})
    assert resp.status_code == 423  # Locked
    assert Prediction.query.filter_by(match_id="MP").count() == 0


def test_submit_requires_login(client, app):
    load_tournament_from_json(invite_code="FAM1", admin_join_code="ADM1")
    db.session.commit()
    resp = client.put("/predictions/M01", json={"pred_home": 1, "pred_away": 0})
    assert resp.status_code == 401


def test_edit_overwrites_existing(client, app):
    _join(client, app)
    fm = Match(id="MX", tournament_id=1, stage="group", status="scheduled",
               scheduled_utc=datetime(2999, 1, 1, tzinfo=timezone.utc),
               home_name="A", away_name="B")
    db.session.add(fm); db.session.commit()
    client.put("/predictions/MX", json={"pred_home": 2, "pred_away": 1})
    client.put("/predictions/MX", json={"pred_home": 0, "pred_away": 0})
    p = Prediction.query.filter_by(match_id="MX").first()
    assert (p.pred_home, p.pred_away) == (0, 0)
    assert Prediction.query.filter_by(match_id="MX").count() == 1
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/pytest tests/test_predictions.py -v`
Expected: FAIL (route not implemented).

- [ ] **Step 3: Implement `app/routes/predictions.py`**

```python
from flask import Blueprint, request, jsonify, render_template, abort

from app.extensions import db
from app.models import Match, Prediction
from app.routes.auth import current_membership
from app.services.tournament_service import match_lock_status

bp = Blueprint("predictions", __name__)

_KNOCKOUT_STAGES = {"r32", "r16", "qf", "sf", "third", "final"}


@bp.get("/matches")
def matches():
    tu = current_membership()
    if tu is None:
        abort(401)
    all_matches = Match.query.order_by(Match.scheduled_utc).all()
    my = {p.match_id: p for p in Prediction.query.filter_by(tournament_user_id=tu.id).all()}
    rows = [{
        "match": m,
        "lock": match_lock_status(m.scheduled_utc),
        "prediction": my.get(m.id),
        "is_knockout": m.stage in _KNOCKOUT_STAGES,
    } for m in all_matches]
    return render_template("matches.html", rows=rows, membership=tu)


@bp.put("/predictions/<match_id>")
def submit(match_id):
    tu = current_membership()
    if tu is None:
        abort(401)
    match = Match.query.get(match_id)
    if match is None:
        abort(404)
    if match_lock_status(match.scheduled_utc) == "locked":
        abort(423)  # Locked

    payload = request.get_json(silent=True) or request.form
    pred_home = int(payload["pred_home"])
    pred_away = int(payload["pred_away"])
    pred_adv = payload.get("pred_advancing_side") if match.stage in _KNOCKOUT_STAGES else None

    prediction = Prediction.query.filter_by(
        tournament_user_id=tu.id, match_id=match_id
    ).first()
    if prediction is None:
        prediction = Prediction(tournament_user_id=tu.id, match_id=match_id)
        db.session.add(prediction)
    prediction.pred_home = pred_home
    prediction.pred_away = pred_away
    prediction.pred_advancing_side = pred_adv
    db.session.commit()
    return jsonify({"ok": True, "match_id": match_id,
                    "pred_home": pred_home, "pred_away": pred_away})
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv/bin/pytest tests/test_predictions.py -v`
Expected: 4 passed.

- [ ] **Step 5: Re-run auth tests (redirect target now exists)**

Run: `.venv/bin/pytest tests/test_auth.py -v`
Expected: 5 passed.

- [ ] **Step 6: Commit**

```bash
git add app/routes/predictions.py tests/test_predictions.py
git commit -m "feat: prediction routes (view matches, submit/edit, kickoff lock 423)"
```

---

## Task 8: Admin result route (triggers scoring)

**Files:**
- Modify: `app/routes/admin.py`
- Test: `tests/test_predictions.py` (append admin tests) or new `tests/test_admin.py`

- [ ] **Step 1: Write the failing test (`tests/test_admin.py`)**

```python
from datetime import datetime, timezone

from app.extensions import db
from app.models import (Tournament, User, TournamentUser, Match, Prediction,
                        ScoringConfig)
from app.services.tournament_service import load_tournament_from_json


def _seed(client):
    t = load_tournament_from_json(invite_code="FAM1", admin_join_code="ADM1")
    db.session.flush()
    cfg = ScoringConfig(tournament_id=t.id, name="family",
                        effective_from=datetime(2026, 1, 1, tzinfo=timezone.utc),
                        params={"exact_result": 3, "correct_winner": 1, "advance_bonus": 1,
                                "champion_bonus": 0, "group_ranking_bonus": 0})
    db.session.add(cfg); db.session.flush()
    t.active_config_id = cfg.id
    db.session.commit()
    return t


def _join_participant(client, name="סבתא"):
    client.post("/join", data={"invite_code": "FAM1", "display_name": name})
    return TournamentUser.query.filter_by(role="participant").order_by(TournamentUser.id.desc()).first()


def test_admin_updates_result_and_scores(client, app):
    _seed(client)
    tu = _join_participant(client)
    db.session.add(Prediction(tournament_user_id=tu.id, match_id="M01", pred_home=2, pred_away=1))
    db.session.commit()
    # log in as admin
    client.post("/join", data={"invite_code": "ADM1", "display_name": "מנהל"})
    resp = client.put("/admin/results/M01",
                      json={"home_score": 2, "away_score": 1})
    assert resp.status_code == 200
    m = Match.query.get("M01")
    assert (m.home_score, m.away_score, m.status) == (2, 1, "completed")
    assert Prediction.query.filter_by(match_id="M01").first().score_awarded == 3


def test_non_admin_cannot_update_result(client, app):
    _seed(client)
    _join_participant(client)  # current session = participant
    resp = client.put("/admin/results/M01", json={"home_score": 1, "away_score": 0})
    assert resp.status_code == 403
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/pytest tests/test_admin.py -v`
Expected: FAIL (route not implemented).

- [ ] **Step 3: Implement `app/routes/admin.py`**

```python
from flask import Blueprint, request, jsonify, abort

from app.extensions import db
from app.models import Match
from app.routes.auth import current_membership
from app.services.scoring_service import apply_scores_for_match

bp = Blueprint("admin", __name__)


def _require_admin():
    tu = current_membership()
    if tu is None:
        abort(401)
    if tu.role != "admin":
        abort(403)
    return tu


@bp.put("/admin/results/<match_id>")
def update_result(match_id):
    _require_admin()
    match = Match.query.get(match_id)
    if match is None:
        abort(404)

    payload = request.get_json(silent=True) or request.form
    match.home_score = int(payload["home_score"])
    match.away_score = int(payload["away_score"])
    # knockout-only fields; ignored for group stage
    match.advancing_side = payload.get("advancing_side")
    match.advance_method = payload.get("advance_method", "normal")
    match.status = "completed"
    db.session.flush()

    affected = apply_scores_for_match(match)
    db.session.commit()
    return jsonify({"ok": True, "match_id": match_id, "predictions_scored": affected})
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv/bin/pytest tests/test_admin.py -v`
Expected: 2 passed.

- [ ] **Step 5: Run the full suite**

Run: `.venv/bin/pytest -v`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add app/routes/admin.py tests/test_admin.py
git commit -m "feat: admin result update triggers automatic scoring (admin-only)"
```

---

## Task 9: Leaderboard route + RTL templates (the grandma flow)

**Files:**
- Modify: `app/routes/leaderboard.py`
- Create: `app/web/templates/base.html`, `join.html`, `matches.html`, `leaderboard.html`
- Create: `app/web/static/style.css`, `app/web/static/app.js`
- Test: `tests/test_leaderboard_route.py`

- [ ] **Step 1: Write the failing test (`tests/test_leaderboard_route.py`)**

```python
from app.extensions import db
from app.models import TournamentUser, Match, Prediction
from app.services.tournament_service import load_tournament_from_json


def test_leaderboard_route_renders(client, app):
    load_tournament_from_json(invite_code="FAM1", admin_join_code="ADM1")
    db.session.commit()
    client.post("/join", data={"invite_code": "FAM1", "display_name": "סבתא"})
    resp = client.get("/leaderboard")
    assert resp.status_code == 200
    assert "סבתא".encode() in resp.data
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/pytest tests/test_leaderboard_route.py -v`
Expected: FAIL.

- [ ] **Step 3: Implement `app/routes/leaderboard.py`**

```python
from flask import Blueprint, render_template, abort

from app.models import Tournament
from app.routes.auth import current_membership
from app.services.leaderboard_service import compute_standings

bp = Blueprint("leaderboard", __name__)


@bp.get("/leaderboard")
def leaderboard():
    tu = current_membership()
    if tu is None:
        abort(401)
    tournament = Tournament.query.get(tu.tournament_id)
    standings = compute_standings(tournament.id)
    return render_template("leaderboard.html", standings=standings, membership=tu)
```

- [ ] **Step 4: Create `app/web/templates/base.html`**

```html
<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{% block title %}מונדיאל 2026 — ניחושים משפחתיים{% endblock %}</title>
  <link rel="stylesheet" href="{{ url_for('static', filename='style.css') }}">
</head>
<body>
  <header class="topbar">
    <a href="{{ url_for('predictions.matches') }}">המשחקים</a>
    <a href="{{ url_for('leaderboard.leaderboard') }}">טבלת מובילים</a>
  </header>
  <main>{% block content %}{% endblock %}</main>
  <script src="{{ url_for('static', filename='app.js') }}"></script>
</body>
</html>
```

- [ ] **Step 5: Create `app/web/templates/join.html`**

```html
{% extends "base.html" %}
{% block content %}
<section class="card">
  <h1>ברוכים הבאים לניחושי המונדיאל המשפחתיים</h1>
  <form method="post" action="{{ url_for('auth.join_submit') }}">
    <label>השם שלך
      <input name="display_name" required autofocus placeholder="למשל: סבתא">
    </label>
    <label>קוד משפחתי
      <input name="invite_code" required placeholder="הקוד שקיבלתם">
    </label>
    <button type="submit">כניסה</button>
  </form>
  <p class="hint">כבר נכנסתם פעם? <a href="#" onclick="document.getElementById('login').hidden=false">כניסה עם קוד אישי</a></p>
  <form id="login" hidden method="post" action="{{ url_for('auth.login_submit') }}">
    <label>קוד אישי
      <input name="join_code" placeholder="הקוד האישי שלך">
    </label>
    <button type="submit">כניסה</button>
  </form>
</section>
{% endblock %}
```

- [ ] **Step 6: Create `app/web/templates/matches.html`**

```html
{% extends "base.html" %}
{% block content %}
<section class="card">
  <h1>המשחקים</h1>
  <p class="explainer">
    תחזית המשחק מתייחסת לתוצאה לאחר 90 דקות (כולל זמן פציעות).
    במשחקי נוקאאוט ניתן לבחור בנפרד מי תעלה שלב במקרה של הארכה או פנדלים.
  </p>
  {% if session.get('join_code') %}
    <p class="personal-code">הקוד האישי שלך: <strong>{{ session['join_code'] }}</strong> — שמרו אותו לכניסה ממכשיר אחר.</p>
  {% endif %}
  <ul class="matches">
    {% for row in rows %}
    <li class="match" data-match="{{ row.match.id }}">
      <span class="teams">{{ row.match.home_name }} – {{ row.match.away_name }}</span>
      {% if row.lock == 'locked' %}
        <span class="locked">נעול</span>
        {% if row.prediction %}<span class="my">({{ row.prediction.pred_home }}:{{ row.prediction.pred_away }})</span>{% endif %}
      {% else %}
        <input type="number" min="0" class="score" name="home" value="{{ row.prediction.pred_home if row.prediction else '' }}">
        :
        <input type="number" min="0" class="score" name="away" value="{{ row.prediction.pred_away if row.prediction else '' }}">
        {% if row.is_knockout %}
        <div class="advance">
          <span>אם המשחק מסתיים בשוויון — מי ממשיכה?</span>
          <label><input type="radio" name="adv-{{ row.match.id }}" value="home"> {{ row.match.home_name }}</label>
          <label><input type="radio" name="adv-{{ row.match.id }}" value="away"> {{ row.match.away_name }}</label>
        </div>
        {% endif %}
        <button class="save" type="button">שמור</button>
      {% endif %}
    </li>
    {% endfor %}
  </ul>
</section>
{% endblock %}
```

- [ ] **Step 7: Create `app/web/templates/leaderboard.html`**

```html
{% extends "base.html" %}
{% block content %}
<section class="card">
  <h1>טבלת מובילים</h1>
  <ol class="leaderboard">
    {% for s in standings %}
    <li><span class="name">{{ s.display_name }}</span><span class="pts">{{ s.points }} נק'</span></li>
    {% endfor %}
  </ol>
</section>
{% endblock %}
```

- [ ] **Step 8: Create `app/web/static/style.css`**

```css
:root { --bg:#0f1115; --card:#1a1d24; --accent:#16a34a; --text:#e8eaed; }
* { box-sizing: border-box; }
body { margin:0; font-family: system-ui, "Segoe UI", Arial, sans-serif; background:var(--bg); color:var(--text); }
.topbar { display:flex; gap:1rem; padding:1rem; background:var(--card); }
.topbar a { color:var(--text); text-decoration:none; font-weight:600; }
main { padding:1rem; max-width:640px; margin:0 auto; }
.card { background:var(--card); border-radius:12px; padding:1.25rem; }
h1 { font-size:1.4rem; }
label { display:block; margin:0.75rem 0; }
input, button { font-size:1rem; padding:0.6rem; border-radius:8px; border:1px solid #333; }
input.score { width:3.5rem; text-align:center; }
button { background:var(--accent); color:#fff; border:none; cursor:pointer; }
.explainer { background:#11151c; padding:0.75rem; border-radius:8px; font-size:0.9rem; }
.personal-code { color:#fbbf24; }
.matches { list-style:none; padding:0; }
.match { display:flex; flex-wrap:wrap; align-items:center; gap:0.5rem; padding:0.75rem 0; border-bottom:1px solid #2a2e36; }
.locked { color:#f87171; font-weight:600; }
.leaderboard { font-size:1.1rem; }
.leaderboard li { display:flex; justify-content:space-between; padding:0.5rem 0; border-bottom:1px solid #2a2e36; }
```

- [ ] **Step 9: Create `app/web/static/app.js`**

```javascript
// Save a prediction with one click; no page reload.
document.querySelectorAll(".match .save").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const li = btn.closest(".match");
    const matchId = li.dataset.match;
    const home = li.querySelector('input[name="home"]').value;
    const away = li.querySelector('input[name="away"]').value;
    const advEl = li.querySelector(`input[name="adv-${matchId}"]:checked`);
    const body = { pred_home: Number(home), pred_away: Number(away) };
    if (advEl) body.pred_advancing_side = advEl.value;
    const resp = await fetch(`/predictions/${matchId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    btn.textContent = resp.ok ? "נשמר ✓" : "שגיאה";
    setTimeout(() => (btn.textContent = "שמור"), 1500);
  });
});
```

- [ ] **Step 10: Run the leaderboard route test**

Run: `.venv/bin/pytest tests/test_leaderboard_route.py -v`
Expected: 1 passed.

- [ ] **Step 11: Run the full suite**

Run: `.venv/bin/pytest -v`
Expected: all green.

- [ ] **Step 12: Commit**

```bash
git add app/routes/leaderboard.py app/web tests/test_leaderboard_route.py
git commit -m "feat: leaderboard route + RTL Hebrew templates (join/matches/leaderboard)"
```

---

## Task 10: DB bootstrap script + full tournament fixture

**Files:**
- Create: `scripts/init_db.py`
- Modify: `data/mondial2026.json` (expand toward full 12-group structure)
- Test: manual run

- [ ] **Step 1: Create `scripts/init_db.py`**

```python
"""Create tables, load the tournament, seed the default scoring config + an admin code.

Run: .venv/bin/python -m scripts.init_db
Env: FAMILY_INVITE_CODE, ADMIN_JOIN_CODE override the defaults.
"""
import json
import os
from datetime import datetime, timezone

from app import create_app
from app.config import Config
from app.extensions import db
from app.models import Tournament, ScoringConfig
from app.services.tournament_service import load_tournament_from_json


def main():
    app = create_app(Config)
    with app.app_context():
        db.create_all()
        invite = os.environ.get("FAMILY_INVITE_CODE", "MISHPACHA")
        admin = os.environ.get("ADMIN_JOIN_CODE", "MENAHEL")
        t = load_tournament_from_json(invite_code=invite, admin_join_code=admin)
        db.session.flush()

        if t.active_config_id is None:
            with open(app.config["SCORING_PRESETS_JSON"], encoding="utf-8") as fh:
                presets = json.load(fh)
            cfg = ScoringConfig(
                tournament_id=t.id, name="family",
                effective_from=datetime.now(timezone.utc),
                params=presets["family"],
            )
            db.session.add(cfg)
            db.session.flush()
            t.active_config_id = cfg.id
        db.session.commit()
        print(f"Tournament '{t.name}' ready. invite={invite!r} admin={admin!r}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Run it**

Run: `.venv/bin/python -m scripts.init_db`
Expected: prints "Tournament 'מונדיאל 2026' ready. invite='MISHPACHA' admin='MENAHEL'"; creates `mondial2026.db`.

- [ ] **Step 3: Expand `data/mondial2026.json` to the full structure**

Fill all 12 groups (A–L, 4 teams each) and all 104 matches (72 group + 16 r32 + ... + final). Keep the exact same shape as the minimal fixture: each match `{id, stage, group, home, away, scheduled_utc, next_match_id, next_slot}`. Use placeholder team names where the real draw is unknown (e.g. `"slot:1A"`). `next_match_id`/`next_slot` may be filled now (used by Phase 2 promotion) but are inert in MVP.

> This is data entry, not code. Validate by re-running `init_db` against a fresh DB and confirming `Match.query.count()`.

- [ ] **Step 4: Manually verify the app boots end-to-end**

Run:
```bash
.venv/bin/flask --app app:create_app run
```
Open `http://127.0.0.1:5000/join`, join with `MISHPACHA`, submit a prediction, then as a second browser/session join with `MENAHEL`, post a result, and confirm the leaderboard updates.

- [ ] **Step 5: Commit**

```bash
git add scripts/init_db.py data/mondial2026.json
git commit -m "feat: init_db bootstrap + full tournament fixture"
```

---

## Task 11: Docker + README

**Files:**
- Create: `docker/Dockerfile`, `docker/docker-compose.yml`
- Modify: `README.md`

- [ ] **Step 1: Create `docker/Dockerfile`**

```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
ENV FLASK_APP=app:create_app
EXPOSE 5000
CMD ["sh", "-c", "python -m scripts.init_db && flask run --host=0.0.0.0"]
```

- [ ] **Step 2: Create `docker/docker-compose.yml`**

```yaml
services:
  web:
    build:
      context: ..
      dockerfile: docker/Dockerfile
    ports:
      - "5000:5000"
    environment:
      - SECRET_KEY=${SECRET_KEY:-change-me}
      - FAMILY_INVITE_CODE=${FAMILY_INVITE_CODE:-MISHPACHA}
      - ADMIN_JOIN_CODE=${ADMIN_JOIN_CODE:-MENAHEL}
    volumes:
      - ../:/app
```

- [ ] **Step 3: Write `README.md`**

````markdown
# Mondial 2026 — Family Pool

בריכת ניחושים משפחתית למונדיאל 2026. עברית מלאה, RTL. כניסה · ניחוש · ניקוד אוטומטי · טבלת מובילים.

## הרצה מקומית
```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python -m scripts.init_db
.venv/bin/flask --app app:create_app run
```
פתחו http://127.0.0.1:5000/join

## הרצה ב-Docker
```bash
docker compose -f docker/docker-compose.yml up --build
```

## בדיקות
```bash
.venv/bin/pytest
```

## קודים
- `FAMILY_INVITE_CODE` — קוד הצטרפות משפחתי (ברירת מחדל `MISHPACHA`).
- `ADMIN_JOIN_CODE` — קוד מנהל (ברירת מחדל `MENAHEL`).

## ארכיטקטורה
ראו `docs/2026-06-08-mondial2026-family-pool-design.md`.
````

- [ ] **Step 4: Verify Docker build (optional if Docker installed)**

Run: `docker compose -f docker/docker-compose.yml up --build`
Expected: container starts, `/join` reachable.

- [ ] **Step 5: Run the full suite once more**

Run: `.venv/bin/pytest -v`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add docker README.md
git commit -m "chore: Docker + README"
```

---

## Self-Review Notes

- **Spec coverage:** כניסה (Task 6) · ניחוש (Task 7) · ניקוד (Tasks 2,4,8) · טבלה (Tasks 5,9) — ארבעת רכיבי ה-MVP מכוסים. מודל הנתונים המלא (Task 1) כולל את כל 8 הטבלאות מהמסמך, כולל שדות Phase 2 (`next_match_id`, `advancing_side`, `ScoringRun`) שנוצרים אך לא מופעלים.
- **לא ב-MVP (מתועד §12):** שיבוץ FIFA אוטומטי, קידום נוקאאוט, מסך קונפיג, מצב ילד UI, בונוסים גלובליים, `manual_override_by_admin`, `recompute_all` UI. ה-`recompute` CLI נשאר כעבודת Phase-2-light אם תידרש.
- **עקביות טיפוסים:** `score_prediction(prediction, result, config)` עם `Result` dataclass עקבי בין Task 2 ל-Task 4. `current_membership()` מוגדר ב-`auth.py` ונצרך ב-predictions/admin/leaderboard. `compute_standings` מחזיר `{tournament_user_id, display_name, points}` ונצרך זהה ב-template.
- **lock semantics:** `match_lock_status` מחזיר `open`/`locked` (HTTP 423 בעת חסימה). `locked_at` נשאר `null` ב-MVP (נעילה מחושבת מ-`scheduled_utc`, לא נכתבת) — תואם להחלטת המסמך.
