"""Cloudinary Staging Service for PeakCut.
Uploads local rendered video clips and thumbnails to Cloudinary CDN so Meta's Instagram crawler
can access clean, direct, public HTTPS URLs without ngrok interstitial warnings.
"""
from pathlib import Path
import os
import re
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


def _slug(name: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9_\-]", "_", (name or "").lower().strip()).strip("_")
    return slug or "general"


def upload_clip_to_cloudinary(local_file_path: str | Path, creator_name: str = "") -> str:
    path = Path(local_file_path)
    if not path.is_file():
        raise FileNotFoundError(f"Rendered video clip not found at path: {path}")

    _ensure_configured()
    folder = f"peakcut_reels/{_slug(creator_name)}"
    try:
        res = cloudinary.uploader.upload(
            str(path),
            resource_type="video",
            folder=folder,
            format="mp4"
        )
        secure_url = res.get("secure_url")
        if not secure_url:
            raise RuntimeError(f"Cloudinary upload succeeded but no secure_url returned: {res}")
        return secure_url
    except Exception as e:
        raise RuntimeError(f"Cloudinary video upload failed: {e}") from e


def upload_image_to_cloudinary(local_image_path: str | Path, creator_name: str = "") -> str:
    path = Path(local_image_path)
    if not path.is_file():
        raise FileNotFoundError(f"Thumbnail image not found at path: {path}")

    _ensure_configured()
    folder = f"peakcut_reels/{_slug(creator_name)}/thumbnails"
    try:
        res = cloudinary.uploader.upload(
            str(path),
            resource_type="image",
            folder=folder,
            format="jpg"
        )
        secure_url = res.get("secure_url")
        if not secure_url:
            raise RuntimeError(f"Cloudinary image upload succeeded but no secure_url returned: {res}")
        return secure_url
    except Exception as e:
        raise RuntimeError(f"Cloudinary thumbnail upload failed: {e}") from e
