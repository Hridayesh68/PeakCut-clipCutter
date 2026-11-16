"""Cloudinary Staging Service for PeakCut.
Uploads local rendered video clips to Cloudinary CDN so Meta's Instagram crawler
can access a clean, direct, public HTTPS .mp4 URL without ngrok interstitial warnings.
"""
from pathlib import Path
import os
import cloudinary
import cloudinary.uploader
from . import config


def _ensure_configured():
    cloud_name = config.env("CLOUDINARY_CLOUD_NAME", "").strip()
    api_key = config.env("CLOUDINARY_API_KEY", "").strip()
    api_secret = config.env("CLOUDINARY_API_SECRET", "").strip()
    if not (cloud_name and api_key and api_secret):
        raise ValueError("Missing Cloudinary configuration (CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET).")
    cloudinary.config(
        cloud_name=cloud_name,
        api_key=api_key,
        api_secret=api_secret,
        secure=True
    )


def upload_clip_to_cloudinary(local_file_path: str | Path) -> str:
    path = Path(local_file_path)
    if not path.is_file():
        raise FileNotFoundError(f"Rendered video clip not found at path: {path}")

    _ensure_configured()
    try:
        res = cloudinary.uploader.upload(
            str(path),
            resource_type="video",
            folder="peakcut_reels",
            format="mp4"
        )
        secure_url = res.get("secure_url")
        if not secure_url:
            raise RuntimeError(f"Cloudinary upload succeeded but no secure_url returned: {res}")
        return secure_url
    except Exception as e:
        raise RuntimeError(f"Cloudinary video upload failed: {e}") from e
