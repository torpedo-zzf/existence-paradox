#!/usr/bin/env python3
"""Official Aliyun OSS SDK (oss2) staging helper for OSS-207.
Reads credentials from environment variables only. Never prints credentials or signed URLs to stderr.
Outputs a single JSON object to stdout (consumed in-memory by Node adapter, never logged to disk).
"""
import hashlib
import json
import mimetypes
import os
import sys
import urllib.request
import oss2


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"ok": False, "error": "Usage: oss_sdk_helper.py <local_file_path>"}))
        sys.exit(2)

    local_path = sys.argv[1]
    if not os.path.isfile(local_path):
        print(json.dumps({"ok": False, "error": f"File not found: {local_path}"}))
        sys.exit(2)

    bucket_name = os.environ.get("OSS_BUCKET", "").strip()
    endpoint = os.environ.get("OSS_ENDPOINT", "").strip()
    custom_domain = os.environ.get("OSS_CUSTOM_DOMAIN", "").strip()
    ak = os.environ.get("OSS_ACCESS_KEY_ID", "").strip()
    sk = os.environ.get("OSS_ACCESS_KEY_SECRET", "").strip()
    sts = os.environ.get("OSS_SECURITY_TOKEN", "").strip()
    prefix = os.environ.get("OSS_STAGING_PREFIX", "staging/existence-paradox/").strip()
    ttl = int(os.environ.get("OSS_SIGNED_GET_TTL_SECONDS", "7200"))

    if not all([bucket_name, endpoint, ak, sk]):
        print(json.dumps({"ok": False, "error": "Missing required OSS env vars"}))
        sys.exit(2)

    if not prefix.endswith("/"):
        prefix += "/"

    ext = os.path.splitext(local_path)[1].lower()
    if ext not in {".png", ".jpg", ".jpeg", ".webp", ".wav", ".mp3"}:
        print(json.dumps({"ok": False, "error": f"Unsupported staging extension: {ext}"}))
        sys.exit(2)

    mime_type, _ = mimetypes.guess_type(local_path)
    if not mime_type:
        mime_type = "audio/wav" if ext == ".wav" else "application/octet-stream"

    with open(local_path, "rb") as f:
        raw = f.read()
    sha256 = hashlib.sha256(raw).hexdigest()
    object_key = f"{prefix}{sha256}{ext}"

    auth = oss2.StsAuth(ak, sk, sts) if sts else oss2.Auth(ak, sk)

    # Always use https endpoint for upload
    upload_ep = endpoint if endpoint.startswith("http") else f"https://{endpoint}"
    upload_bucket = oss2.Bucket(auth, upload_ep, bucket_name)

    deduplicated = False
    if upload_bucket.object_exists(object_key):
        deduplicated = True
    else:
        upload_bucket.put_object(object_key, raw, headers={"Content-Type": mime_type})

    # Sign GET URL using custom domain (CNAME) if configured, else standard endpoint
    if custom_domain:
        cname_ep = custom_domain if custom_domain.startswith("http") else f"https://{custom_domain}"
        sign_bucket = oss2.Bucket(auth, cname_ep, bucket_name, is_cname=True)
    else:
        sign_bucket = upload_bucket

    signed_url = sign_bucket.sign_url("GET", object_key, ttl, slash_safe=True)
    if signed_url.startswith("http://"):
        signed_url = "https://" + signed_url[len("http://"):]

    # Verify non-authenticated HTTPS reachability (HEAD or small Range GET)
    req = urllib.request.Request(signed_url, headers={"Range": "bytes=0-15"})
    with urllib.request.urlopen(req, timeout=15) as resp:
        http_status = resp.status
        resp_mime = resp.headers.get("Content-Type", "")

    print(json.dumps({
        "ok": True,
        "object_key": object_key,
        "sha256": sha256,
        "size_bytes": len(raw),
        "mime_type": mime_type,
        "deduplicated": deduplicated,
        "ttl_seconds": ttl,
        "reachability_http_status": http_status,
        "reachability_content_type": resp_mime,
        "signed_url": signed_url
    }))


if __name__ == "__main__":
    main()
