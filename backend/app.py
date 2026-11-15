"""Run the Marswalk backend.

    python app.py                      # dev server on http://localhost:5000
    waitress-serve --port 5000 app:app # production (Windows/Linux)
    gunicorn -b 0.0.0.0:5000 app:app   # production (Linux)
"""

import os

from marswalk_api import create_app
from marswalk_api.env import load_dotenv

# Local dev: pick up TURSO_* / KV_* from backend/.env or the repo-root .env.
# Never overrides variables that are already set (e.g. on Vercel).
load_dotenv()

app = create_app()

if __name__ == "__main__":
    app.run(
        host=os.environ.get("MARSWALK_HOST", "127.0.0.1"),
        port=int(os.environ.get("MARSWALK_PORT", "5000")),
        debug=os.environ.get("FLASK_DEBUG") == "1",
    )
