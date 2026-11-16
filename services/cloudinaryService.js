const fs = require('fs');
const path = require('path');
const cloudinary = require('cloudinary').v2;
require('dotenv').config();

// Configure Cloudinary using environment variables
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'dbdvnfxat',
  api_key: process.env.CLOUDINARY_API_KEY || '427729858613736',
  api_secret: (process.env.CLOUDINARY_API_SECRET || 'Nq5jrBLeaE8hYFORwvuDp16zoUI').trim(),
  secure: true
});

/**
 * Uploads a local rendered video clip to Cloudinary CDN.
 * Generates a clean, crawler-friendly HTTPS .mp4 URL for Meta's Instagram crawler.
 * 
 * @param {string} localFilePath - Path to local .mp4 video file
 * @returns {Promise<string>} Direct secure .mp4 URL on Cloudinary CDN
 */
async function uploadClipToCloudinary(localFilePath) {
  // Validate file existence
  if (!fs.existsSync(localFilePath)) {
    throw new Error(`Rendered video clip not found at path: ${localFilePath}`);
  }

  try {
    // Explicitly set resource_type: 'video' and format: 'mp4' so Cloudinary returns a direct .mp4 URL
    const result = await cloudinary.uploader.upload(localFilePath, {
      resource_type: 'video',
      folder: 'peakcut_reels',
      format: 'mp4'
    });

    if (!result || !result.secure_url) {
      throw new Error(`Cloudinary upload returned no secure_url: ${JSON.stringify(result)}`);
    }

    return result.secure_url;
  } catch (error) {
    console.error('Cloudinary API upload error:', error);
    throw new Error(`Cloudinary upload failed: ${error.message || error}`);
  }
}

module.exports = {
  uploadClipToCloudinary
};
