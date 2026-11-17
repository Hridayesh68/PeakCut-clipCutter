const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { uploadClipToCloudinary, uploadImageToCloudinary } = require('./cloudinaryService');

const GRAPH_API_BASE = 'https://graph.facebook.com/v27.0';

/**
 * Extracts structured error information from Meta / Graph API responses.
 */
function extractMetaError(error, defaultAction = 'Operation') {
  if (error.response?.data?.error) {
    const metaErr = error.response.data.error;
    const msg = metaErr.message || 'Unknown Meta API error';
    const trace = metaErr.fbtrace_id ? ` (fbtrace_id: ${metaErr.fbtrace_id})` : '';
    const code = metaErr.code ? ` [Code: ${metaErr.code}]` : '';
    return new Error(`${defaultAction} failed: ${msg}${code}${trace}`);
  }
  return error;
}

/**
 * Helper to pause execution for a given number of milliseconds.
 */
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * End-to-end Instagram Reel Publishing Pipeline
 * 
 * @param {string} localVideoPath - Absolute or relative path to rendered .mp4 clip
 * @param {string} caption - Caption text for the Reel
 * @param {string} accessToken - 60-day long-lived User / Page access token
 * @param {string} igUserId - Instagram Business / Creator User ID (e.g. 17841462625637581)
 * @param {function} onProgress - Optional callback for real-time stage progress updates
 * @returns {Promise<{ publishedMediaId: string, publicVideoUrl: string }>}
 */
async function publishReel({
  localVideoPath,
  localCoverPath = null,
  caption = '',
  creatorName = '',
  accessToken,
  igUserId = process.env.IG_USER_ID || '17841462625637581',
  onProgress = () => {}
}) {
  if (!accessToken) {
    throw new Error('Missing Meta/Instagram access token.');
  }
  if (!igUserId) {
    throw new Error('Missing Instagram User ID (igUserId).');
  }

  // Stage 1: Upload to Cloudinary for crawler-friendly CDN delivery inside creator's subfolder
  onProgress({ stage: 'uploading_cloudinary', message: 'Uploading clip to Cloudinary CDN...' });
  const publicVideoUrl = await uploadClipToCloudinary(localVideoPath, creatorName);

  // Upload high-res thumbnail if available so Meta displays a crisp cover
  let coverUrl = null;
  const potentialCoverPath = localCoverPath || localVideoPath.replace(/\.[^/.]+$/, '.jpg');
  if (fs.existsSync(potentialCoverPath)) {
    try {
      coverUrl = await uploadImageToCloudinary(potentialCoverPath, creatorName);
    } catch (e) {
      console.warn('Optional thumbnail upload failed:', e.message);
    }
  }

  // Stage 2: Create Media Container on Meta Graph API
  onProgress({ stage: 'creating_container', message: 'Creating Instagram Reel container on Meta...', videoUrl: publicVideoUrl });
  let creationId;
  const containerPayload = {
    media_type: 'REELS',
    video_url: publicVideoUrl,
    caption: caption
  };
  if (coverUrl) {
    containerPayload.cover_url = coverUrl;
  }
  try {
    const containerRes = await axios.post(
      `${GRAPH_API_BASE}/${igUserId}/media`,
      containerPayload,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );
    creationId = containerRes.data?.id;
    if (!creationId) {
      throw new Error(`Meta container creation succeeded but returned no container ID: ${JSON.stringify(containerRes.data)}`);
    }
  } catch (error) {
    throw extractMetaError(error, 'Instagram container creation');
  }

  // Stage 3: Poll Container Status until FINISHED
  onProgress({ stage: 'processing_video', message: 'Meta is downloading and transcoding the Reel...', creationId });
  const maxAttempts = 24; // 24 attempts * 5 seconds = 2 minutes max
  let isFinished = false;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await delay(5000);
    try {
      const statusRes = await axios.get(
        `${GRAPH_API_BASE}/${creationId}?fields=status_code,status`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        }
      );

      const statusCode = statusRes.data?.status_code;
      if (statusCode === 'FINISHED' || statusCode === 'PUBLISHED') {
        isFinished = true;
        break;
      }

      if (statusCode === 'ERROR' || statusCode === 'EXPIRED') {
        const details = statusRes.data?.status || statusCode;
        throw new Error(`Meta video processing failed with status '${statusCode}': ${details}`);
      }

      onProgress({
        stage: 'processing_video',
        attempt,
        maxAttempts,
        message: `Transcoding in progress (${attempt}/${maxAttempts})...`
      });
    } catch (error) {
      if (error.response?.data?.error) {
        throw extractMetaError(error, 'Polling Reel status');
      }
      throw error;
    }
  }

  if (!isFinished) {
    throw new Error('Meta transcoding timed out after 2 minutes. The video may be too large or Meta is experiencing delays.');
  }

  // Stage 4: Publish Reel Live
  onProgress({ stage: 'publishing', message: 'Publishing Reel live to Instagram...' });
  let publishedMediaId;
  try {
    const publishRes = await axios.post(
      `${GRAPH_API_BASE}/${igUserId}/media_publish`,
      {
        creation_id: creationId
      },
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );
    publishedMediaId = publishRes.data?.id;
  } catch (error) {
    throw extractMetaError(error, 'Publishing live Reel');
  }

  onProgress({ stage: 'published', message: 'Reel published successfully!', publishedMediaId });
  return {
    publishedMediaId,
    publicVideoUrl
  };
}

module.exports = {
  publishReel
};
