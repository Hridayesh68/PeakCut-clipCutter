# PeakCut Feature Extension: Instructions & Plan

This document details the architectural plan, feasibility analysis, and step-by-step changes for the following enhancements to PeakCut:
1. **Cloudinary Creator Subfolders**: Organizing staged clips into dedicated folders per creator.
2. **Crisp Reels Thumbnail Fix**: Removing the 0.0s fade-in on the hook text and sending the high-res cover image URL to Meta's Reels API.
3. **Reposting Already Posted Clips**: Allowing clips that were previously published to be queued or posted again.
4. **Bulk Multi-Select & Staggered Auto-Queue**: Allowing creators to select multiple reels and schedule them with customizable delays between posts.
5. **Background Server & ngrok Clarifications**: Explaining exactly what needs to run in the background.

---

## 1. ngrok & Local Background Server Clarifications

### Does the queue require ngrok to be constantly running?
**NO.**
- In our Cloudinary pipeline, PeakCut uploads the rendered `.mp4` and `.jpg` thumbnail directly to Cloudinary's public CDN (`res.cloudinary.com`).
- Meta's crawler fetches the media directly from Cloudinary. Meta **never makes an inbound connection to your laptop or ngrok**.
- PeakCut's publishing calls to Meta (`POST /media`, `GET /status`, `POST /media_publish`) are **outbound HTTPS calls**.
- **ngrok is only needed** during the one-time interactive OAuth login callback (`/auth/callback`). Once the account is connected and the 60-day token is saved in `accounts.json`, ngrok does not need to be active for background scheduled posting.

### What MUST be running?
- PeakCut's local Python server (`python -m studio.server` or `run.bat`) must be running while the laptop is awake so its 15-second background scheduler loop (`posting._run()`) can dispatch due posts.
- If the laptop is shut down or asleep when a post is due, PeakCut will automatically post overdue clips immediately when the server is reopened.

---

## 2. Technical Architecture & Implementation Steps

### Step 1: Cloudinary Staging with Creator Subfolders & Thumbnail Upload
- **File**: `studio/cloudinary_service.py` & `services/cloudinaryService.js`
- **Features**:
  - `upload_clip_to_cloudinary(file_path, creator_name)`: Uploads to `peakcut_reels/{creator_slug}`.
  - `upload_image_to_cloudinary(image_path, creator_name)`: Uploads high-res thumbnail to `peakcut_reels/{creator_slug}/thumbnails`.

### Step 2: Fixing Blurry Reels Thumbnails & First-Frame Hook
- **Files**: `studio/render.py` & `studio/accounts.py`
- **Root Causes**:
  - `render.py` had `\fad(160,0)` on the hook, rendering it 100% transparent at $t = 0.0\text{s}$.
  - `accounts.py` did not pass `cover_url` to Meta's `POST /{ig_user_id}/media`, forcing Instagram to auto-sample an arbitrary initial frame.
- **Fix**:
  - Remove `\fad(160,0)` so the hook is 100% opaque and sharp right from frame 0.
  - In `instagram_upload()`, upload the generated `<name>.jpg` cover to Cloudinary and pass `cover_url: <cloudinary_thumb_url>` to Meta.

### Step 3: Reposting Already Posted Clips
- **Files**: `studio/posting.py`, `studio/server.py`, `web/index.html`
- **Fix**:
  - In `posting.enqueue()`, add parameter `allow_repost=False`. When `True`, bypass the duplicate check for posts with status `posted`.
  - In `server.py`, accept `repost: bool` in `POST /api/posts`.
  - In `web/index.html`, add a **Repost** button to clips and post logs.

### Step 4: Bulk Selection & Staggered Auto-Queue
- **Files**: `studio/posting.py`, `studio/server.py`, `web/index.html`
- **Fix**:
  - In `posting.py`, implement `enqueue_bulk(items, account_ids, gap_minutes, start_now)`.
  - In `server.py`, implement `POST /api/posts/bulk`.
  - In `web/index.html`, add multi-select checkboxes to clips, a floating bulk actions bar, and a staggered queue dialog.
