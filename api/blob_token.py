"""Vercel Serverless Function: Generate Blob upload token."""
import json
import os


def handler(request):
    """Handle GET /api/blob-token requests (used by api/app.py Flask wrapper)."""
    if request.method != "GET":
        return {"statusCode": 405, "body": json.dumps({"error": "Method not allowed"})}

    try:
        blob_token = os.environ.get("BLOB_READ_WRITE_TOKEN", "")
        if not blob_token:
            return {"statusCode": 500, "body": json.dumps({"error": "BLOB_READ_WRITE_TOKEN not configured"})}

        return {
            "statusCode": 200,
            "body": json.dumps({"token": blob_token, "ok": True}),
        }
    except Exception as e:
        return {"statusCode": 500, "body": json.dumps({"error": str(e)})}
