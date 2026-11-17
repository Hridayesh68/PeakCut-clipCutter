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

function slugify(name) {
  return String(name || '').toLowerCase().replace(/[^a-z0-9_-]/g, '_').replace(/^_+|_+$/g, '') || 'general';
}

/**
 * Uploads a local rendered video clip to Cloudinary CDN inside the creator's subfolder.
 * 
 * @param {string} localFilePath - Path to local .mp4 video file
 * @param {string} creatorName - Name or slug of the creator
 * @returns {Promise<string>} Direct secure .mp4 URL on Cloudinary CDN
 */
async function uploadClipToCloudinary(localFilePath, creatorName = '') {
  if (!fs.existsSync(localFilePath)) {
    throw new Error(`Rendered video clip not found at path: ${localFilePath}`);
  }

  const folder = `peakcut_reels/${slugify(creatorName)}`;
  try {
    const result = await cloudinary.uploader.upload(localFilePath, {
      resource_type: 'video',
      folder: folder,
      format: 'mp4'
    });

    if (!result || !result.secure_url) {
      throw new Error(`Cloudinary upload returned no secure_url: ${JSON.stringify(result)}`);
    }

    return result.secure_url;
  } catch (error) {
    console.error('Cloudinary API video upload error:', error);
    throw new Error(`Cloudinary video upload failed: ${error.message || error}`);
  }
}

/**
 * Uploads a local thumbnail image to Cloudinary CDN inside the creator's thumbnails subfolder.
 * 
 * @param {string} localImagePath - Path to local .jpg image file
 * @param {string} creatorName - Name or slug of the creator
 * @returns {Promise<string>} Direct secure .jpg URL on Cloudinary CDN
 */
async function uploadImageToCloudinary(localImagePath, creatorName = '') {
  if (!fs.existsSync(localImagePath)) {
    throw new Error(`Thumbnail image not found at path: ${localImagePath}`);
  }

  const folder = `peakcut_reels/${slugify(creatorName)}/thumbnails`;
  try {
    const result = await cloudinary.uploader.upload(localImagePath, {
      resource_type: 'image',
      folder: folder,
      format: 'jpg'
    });

    if (!result || !result.secure_url) {
      throw new Error(`Cloudinary upload returned no secure_url: ${JSON.stringify(result)}`);
    }

    return result.secure_url;
  } catch (error) {
    console.error('Cloudinary API image upload error:', error);
    throw new Error(`Cloudinary image upload failed: ${error.message || error}`);
  }
}

module.exports = {
  uploadClipToCloudinary,
  uploadImageToCloudinary
};
