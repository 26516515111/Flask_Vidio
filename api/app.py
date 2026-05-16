"""Vercel Flask App: Voice Assistant API.

Single Flask app handling all /api/* routes.
Local dev: `flask --app api.app run --port 5001 --debug`
Vercel: auto-detected via `flask` in requirements.txt.
"""
import json
import os
import sys

from flask import Flask, request, jsonify
from flask_cors import CORS

# Add api/ to path so we can import sibling modules
sys.path.insert(0, os.path.dirname(__file__))

from tts import handler as tts_handler
from llm import handler as llm_handler
from ocr import handler as ocr_handler
from blob_token import handler as blob_token_handler
from blob_upload import handler as blob_upload_handler
from video import handler as video_handler
from audio import handler as audio_handler

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})


class RequestWrapper:
    """Adapts Vercel/WSGI request to handler format (method, headers, body)."""

    def __init__(self, method: str, headers: dict, body: bytes):
        self.method = method
        self.headers = headers
        self.body = body


def _call_handler(handler_fn, req_wrapper: RequestWrapper):
    """Invoke existing handler and convert dict response to Flask response."""
    result = handler_fn(req_wrapper)
    status = result.get("statusCode", 200)
    try:
        body = json.loads(result.get("body", "{}"))
    except (json.JSONDecodeError, TypeError):
        body = {"raw": result.get("body", "")}
    return jsonify(body), status


@app.route("/api/tts", methods=["POST", "OPTIONS"])
def tts_route():
    if request.method == "OPTIONS":
        return "", 204
    wrapper = RequestWrapper(
        method=request.method,
        headers=dict(request.headers),
        body=request.get_data(),
    )
    return _call_handler(tts_handler, wrapper)


@app.route("/api/llm", methods=["POST", "OPTIONS"])
def llm_route():
    if request.method == "OPTIONS":
        return "", 204
    wrapper = RequestWrapper(
        method=request.method,
        headers=dict(request.headers),
        body=request.get_data(),
    )
    return _call_handler(llm_handler, wrapper)


@app.route("/api/ocr", methods=["POST", "OPTIONS"])
def ocr_route():
    if request.method == "OPTIONS":
        return "", 204
    wrapper = RequestWrapper(
        method=request.method,
        headers=dict(request.headers),
        body=request.get_data(),
    )
    return _call_handler(ocr_handler, wrapper)


@app.route("/api/blob-token", methods=["GET"])
def blob_token_route():
    wrapper = RequestWrapper(
        method=request.method,
        headers=dict(request.headers),
        body=request.get_data(),
    )
    return _call_handler(blob_token_handler, wrapper)


@app.route("/api/blob-upload", methods=["POST", "OPTIONS"])
def blob_upload_route():
    if request.method == "OPTIONS":
        return "", 204
    wrapper = RequestWrapper(
        method=request.method,
        headers=dict(request.headers),
        body=request.get_data(),
    )
    return _call_handler(blob_upload_handler, wrapper)


@app.route("/api/video", methods=["POST", "OPTIONS"])
def video_route():
    if request.method == "OPTIONS":
        return "", 204
    wrapper = RequestWrapper(
        method=request.method,
        headers=dict(request.headers),
        body=request.get_data(),
    )
    return _call_handler(video_handler, wrapper)


@app.route("/api/audio", methods=["POST", "OPTIONS"])
def audio_route():
    if request.method == "OPTIONS":
        return "", 204
    wrapper = RequestWrapper(
        method=request.method,
        headers=dict(request.headers),
        body=request.get_data(),
    )
    return _call_handler(audio_handler, wrapper)


@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "version": "1.0.0"})


if __name__ == "__main__":
    port = int(os.environ.get("API_PORT", "5001"))
    app.run(host="127.0.0.1", port=port, debug=True)
