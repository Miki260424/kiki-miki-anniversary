// Cloudinary Configuration for Image Uploads
// Your personalized settings - High Quality, No Cropping!

const CLOUDINARY_CONFIG = {
  cloudName: "dc59eomk8", // Your cloud name
  uploadPreset: "anniversary_uploads", // Your upload preset
};

// ===== HIGH QUALITY IMAGE COMPRESSION SETTINGS =====
// These settings compress images while maintaining excellent quality
const IMAGE_SETTINGS = {
  maxWidth: 2560, // Higher resolution (2K) for better quality
  maxHeight: 2560, // Maintains aspect ratio, no cropping
  quality: 0.92, // 92% quality = excellent quality, smaller size
  format: "image/jpeg", // JPEG works best for photos
};

// ===== COMPRESS IMAGE WHILE MAINTAINING QUALITY =====
// This resizes images proportionally - NO CROPPING!
async function compressImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      const img = new Image();

      img.onload = () => {
        const canvas = document.createElement("canvas");
        let width = img.width;
        let height = img.height;

        // Only resize if image is larger than max dimensions
        // This maintains the aspect ratio - NO CROPPING!
        if (
          width > IMAGE_SETTINGS.maxWidth ||
          height > IMAGE_SETTINGS.maxHeight
        ) {
          const aspectRatio = width / height;

          if (width > height) {
            // Landscape or square
            if (width > IMAGE_SETTINGS.maxWidth) {
              width = IMAGE_SETTINGS.maxWidth;
              height = width / aspectRatio;
            }
          } else {
            // Portrait
            if (height > IMAGE_SETTINGS.maxHeight) {
              height = IMAGE_SETTINGS.maxHeight;
              width = height * aspectRatio;
            }
          }
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");

        // Enable image smoothing for better quality
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";

        // Draw image with high quality
        ctx.drawImage(img, 0, 0, width, height);

        // Convert to blob with high quality
        canvas.toBlob(
          (blob) => {
            if (blob) {
              const compressedFile = new File(
                [blob],
                file.name.replace(/\.[^/.]+$/, ".jpg"),
                { type: IMAGE_SETTINGS.format },
              );

              const originalSize = (file.size / 1024 / 1024).toFixed(2);
              const compressedSize = (blob.size / 1024 / 1024).toFixed(2);
              const savings = ((1 - blob.size / file.size) * 100).toFixed(0);

              console.log(
                `📦 Image optimized: ${originalSize}MB → ${compressedSize}MB (${savings}% smaller)`,
              );
              console.log(
                `   Dimensions: ${Math.round(width)}x${Math.round(height)}px`,
              );
              console.log(
                `   Quality: ${IMAGE_SETTINGS.quality * 100}% (High Quality)`,
              );

              resolve(compressedFile);
            } else {
              reject(new Error("Compression failed"));
            }
          },
          IMAGE_SETTINGS.format,
          IMAGE_SETTINGS.quality, // 92% quality for excellent results
        );
      };

      img.onerror = () => reject(new Error("Failed to load image"));
      img.src = e.target.result;
    };

    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

// ===== UPLOAD IMAGE TO CLOUDINARY =====
async function uploadImageToCloudinary(file, folder = "memories") {
  try {
    console.log(`📤 Uploading to Cloudinary...`);
    console.log(`   Original file: ${file.name}`);
    console.log(`   Original size: ${(file.size / 1024 / 1024).toFixed(2)}MB`);

    // Compress image first (maintains quality, no cropping!)
    const compressedFile = await compressImage(file);

    // Create form data
    const formData = new FormData();
    formData.append("file", compressedFile);
    formData.append("upload_preset", CLOUDINARY_CONFIG.uploadPreset);
    formData.append("folder", folder);

    // Upload to Cloudinary
    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${CLOUDINARY_CONFIG.cloudName}/image/upload`,
      {
        method: "POST",
        body: formData,
      },
    );

    if (!response.ok) {
      const errorData = await response.json();
      console.error("❌ Upload error:", errorData);
      throw new Error(
        "Upload failed: " + (errorData.error?.message || response.statusText),
      );
    }

    const data = await response.json();

    console.log(`✅ Uploaded successfully!`);
    console.log(`   URL: ${data.secure_url}`);
    console.log(`   Final size: ${(data.bytes / 1024 / 1024).toFixed(2)}MB`);
    console.log(`   Stored dimensions: ${data.width}x${data.height}px`);

    return data.secure_url;
  } catch (error) {
    console.error("❌ Cloudinary upload error:", error);
    throw error;
  }
}

console.log("✅ Cloudinary configured with HIGH QUALITY settings!");
console.log(`   Cloud Name: ${CLOUDINARY_CONFIG.cloudName}`);
console.log(`   Upload Preset: ${CLOUDINARY_CONFIG.uploadPreset}`);
console.log(
  `   Max Resolution: ${IMAGE_SETTINGS.maxWidth}x${IMAGE_SETTINGS.maxHeight}px (2K quality)`,
);
console.log(
  `   Quality: ${IMAGE_SETTINGS.quality * 100}% (No visible quality loss)`,
);
console.log(`   Cropping: DISABLED (maintains aspect ratio)`);
