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
