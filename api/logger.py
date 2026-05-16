"""Application logger - writes to stderr and log file."""
import os
import sys
import json
import logging
from datetime import datetime

LOG_DIR = os.environ.get("LOG_DIR", os.path.join(os.path.dirname(__file__), "..", "logs"))

# Ensure log directory exists
os.makedirs(LOG_DIR, exist_ok=True)

# Configure root logger
logger = logging.getLogger("api")
logger.setLevel(logging.DEBUG)

# Console handler (stderr for Vercel logs)
console = logging.StreamHandler(sys.stderr)
console.setLevel(logging.INFO)
console.setFormatter(logging.Formatter(
    "[%(levelname)s] %(asctime)s - %(message)s",
    datefmt="%H:%M:%S",
))
logger.addHandler(console)

# File handler
log_file = os.path.join(LOG_DIR, f"api_{datetime.now().strftime('%Y-%m-%d')}.log")
file_handler = logging.FileHandler(log_file, encoding="utf-8")
file_handler.setLevel(logging.DEBUG)
file_handler.setFormatter(logging.Formatter(
    "[%(levelname)s] %(asctime)s - %(module)s:%(lineno)d - %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
))
logger.addHandler(file_handler)


def log_api_call(endpoint: str, request_data: dict, response_data=None, error=None, duration_ms=None):
    """Log an API call with request/response details."""
    info = {
        "endpoint": endpoint,
        "timestamp": datetime.now().isoformat(),
        "request": _mask_sensitive(request_data),
    }
    if response_data is not None:
        info["response"] = str(response_data)[:500]  # Truncate long responses
    if error is not None:
        info["error"] = str(error)
    if duration_ms is not None:
        info["duration_ms"] = duration_ms

    logger.info(f"API Call: {json.dumps(info, ensure_ascii=False, default=str)}")


def _mask_sensitive(data: dict) -> dict:
    """Mask sensitive fields in log output."""
    if not isinstance(data, dict):
        return data
    masked = dict(data)
    for key in ("api_key", "token", "Authorization", "api-key"):
        if key in masked:
            masked[key] = "***MASKED***"
    return masked


def get_header(headers: dict, name: str, default: str = "") -> str:
    """Case-insensitive header lookup from dict(headers)."""
    name_lower = name.lower()
    for key, value in headers.items():
        if key.lower() == name_lower:
            return value
    return default
