"""Local development server for Voice Assistant API.

Usage: python api_server.py
Runs the Flask app on http://127.0.0.1:5001 with auto-reload.

Environment: Loads .env file, uses API_PORT (default 5001).
"""

import os
import sys

# Load .env before importing app
try:
    from dotenv import load_dotenv

    env_path = os.path.join(os.path.dirname(__file__), ".env")
    if os.path.exists(env_path):
        load_dotenv(env_path)
        print(f"[API] Loaded environment from {env_path}")
except ImportError:
    # python-dotenv not installed; skip .env loading
    pass

# Add api/ to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "api"))

from api.app import app

if __name__ == "__main__":
    port = int(os.environ.get("API_PORT", "5001"))
    debug = os.environ.get("FLASK_DEBUG", "1") == "1"
    print(f"[API] Starting Flask server at http://127.0.0.1:{port}")
    app.run(host="127.0.0.1", port=port, debug=debug)
