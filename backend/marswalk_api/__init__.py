"""Marswalk backend: Flask API for the Marswalk web GUI."""

from __future__ import annotations

import os
from pathlib import Path

from flask import Flask, jsonify, request, send_from_directory

from .config import Scenario

__version__ = "0.1.0"

DEFAULT_DIST = Path(__file__).resolve().parents[2] / "dist"


def create_app(test_config: dict | None = None) -> Flask:
    app = Flask(__name__, static_folder=None)
    app.config.update(
        MARSWALK_SCENARIO=Scenario(),
        # Comma-separated list, or "*". The Vite dev server runs on :5173.
        CORS_ORIGINS=os.environ.get("MARSWALK_CORS_ORIGINS", "*"),
        # Serve the built front-end (npm run build -> dist/) from "/" as well.
        SERVE_DIST=os.environ.get("MARSWALK_SERVE_DIST", "1") != "0",
        DIST_DIR=Path(os.environ.get("MARSWALK_DIST_DIR", DEFAULT_DIST)),
        JSON_SORT_KEYS=False,
    )
    app.json.sort_keys = False
    app.json.ensure_ascii = False
    if test_config:
        app.config.update(test_config)

    from .routes import bp

    app.register_blueprint(bp)

    @app.after_request
    def cors(response):
        allowed = [o.strip() for o in app.config["CORS_ORIGINS"].split(",") if o.strip()]
        origin = request.headers.get("Origin")
        if "*" in allowed:
            response.headers["Access-Control-Allow-Origin"] = "*"
        elif origin and origin in allowed:
            response.headers["Access-Control-Allow-Origin"] = origin
            response.headers["Vary"] = "Origin"
        response.headers.setdefault("Access-Control-Allow-Methods", "GET, OPTIONS")
        response.headers.setdefault("Access-Control-Allow-Headers", "Accept, Content-Type")
        return response

    @app.errorhandler(404)
    def not_found(_err):
        return jsonify(error="not found"), 404

    @app.errorhandler(500)
    def server_error(_err):
        return jsonify(error="internal server error"), 500

    dist: Path = app.config["DIST_DIR"]
    if app.config["SERVE_DIST"] and (dist / "index.html").is_file():

        @app.get("/")
        def index():
            return send_from_directory(dist, "index.html")

        @app.get("/<path:filename>")
        def static_files(filename: str):
            return send_from_directory(dist, filename)

    return app
