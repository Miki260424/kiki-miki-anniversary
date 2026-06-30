// ─── cloudinary-config.js ────────────────────────────────────────────────────

const CLOUDINARY_CONFIG = {
  cloudName: "dc59eomk8",
  uploadPreset: "anniversary_uploads",
};

const IMAGE_SETTINGS = {
  maxWidth: 1920,
  maxHeight: 1920,
  webpQuality: 0.82,
  jpegQuality: 0.85,
};

// ===== WEBP SUPPORT =====
function supportsWebP() {
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  return canvas.toDataURL("image/webp").startsWith("data:image/webp");
}

// ===== RESIZE — NO CROPPING, NO UPSCALING =====
function getResizedDimensions(width, height) {
  const max = IMAGE_SETTINGS.maxWidth;
  if (width <= max && height <= max) {
    return { width: Math.round(width), height: Math.round(height) };
  }
  const ratio = Math.min(max / width, max / height);
  return {
    width: Math.round(width * ratio),
    height: Math.round(height * ratio),
  };
}

// ===== COMPRESS + CONVERT =====
// Accepts ANY format the browser can decode (JPEG, PNG, GIF, HEIC*, AVIF, BMP, TIFF, WebP)
// Always outputs WebP (or JPEG fallback) — smallest file, no visible quality loss
// * HEIC requires iOS Safari 17+ to decode natively; other browsers may not support it
async function compressImage(file) {
  // KIKIMIKI OBJECT-URL COMPRESSION:
  // Avoid reading the whole image into an unused base64 string first.
  if (
    !file ||
    typeof file.type !== "string" ||
    !file.type.startsWith("image/")
  ) {
    throw new Error(`Not an image file: ${file?.type || "unknown type"}`);
  }

  const useWebP = supportsWebP();
  const format = useWebP ? "image/webp" : "image/jpeg";
  const quality = useWebP
    ? IMAGE_SETTINGS.webpQuality
    : IMAGE_SETTINGS.jpegQuality;
  const extension = useWebP ? ".webp" : ".jpg";
  const objectUrl = URL.createObjectURL(file);

  try {
    const img = await new Promise((resolve, reject) => {
      const image = new Image();

      image.onload = () => resolve(image);
      image.onerror = () =>
        reject(
          new Error(
            `Browser cannot decode this image format (${file.type}). ` +
              "Try converting it to JPEG or PNG first.",
          ),
        );

      image.src = objectUrl;
    });

    const { width, height } = getResizedDimensions(
      img.naturalWidth || img.width,
      img.naturalHeight || img.height,
    );

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Image canvas is unavailable");

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    if (!useWebP) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
    }

    ctx.drawImage(img, 0, 0, width, height);

    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (result) => {
          if (result) resolve(result);
          else reject(new Error("Compression failed (toBlob returned null)"));
        },
        format,
        quality,
      );
    });

    const originalName =
      typeof file.name === "string" && file.name
        ? file.name
        : `image_${Date.now()}`;
    const name = originalName.replace(/\.[^/.]+$/, "") + extension;

    console.log(
      `Compressed ${originalName}: ` +
        `${(file.size / 1024 / 1024).toFixed(2)}MB -> ` +
        `${(blob.size / 1024 / 1024).toFixed(2)}MB`,
    );

    return new File([blob], name, {
      type: format,
      lastModified: Date.now(),
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

// ===== UPLOAD TO CLOUDINARY =====
async function uploadImageToCloudinary(file, folder = "memories") {
  try {
    console.log(
      `📤 Uploading: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)}MB)`,
    );

    const compressedFile = await compressImage(file);

    const formData = new FormData();
    formData.append("file", compressedFile);
    formData.append("upload_preset", CLOUDINARY_CONFIG.uploadPreset);
    formData.append("folder", folder);

    // ── Upload with timeout — avoids hanging forever on bad connections ──
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000); // 60s max

    let response;
    try {
      response = await fetch(
        `https://api.cloudinary.com/v1_1/${CLOUDINARY_CONFIG.cloudName}/image/upload`,
        { method: "POST", body: formData, signal: controller.signal },
      );
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(
        "Upload failed: " + (err.error?.message || response.statusText),
      );
    }

    const data = await response.json();

    console.log(`✅ Uploaded successfully`);
    console.log(`   Stored format: ${data.format}`);
    console.log(`   Stored size:   ${(data.bytes / 1024 / 1024).toFixed(2)}MB`);
    console.log(`   Dimensions:    ${data.width}×${data.height}px`);
    console.log(`   URL:           ${data.secure_url}`);

    return data.secure_url;
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error(
        "Upload timed out after 60 seconds. Check your connection and try again.",
      );
    }
    console.error("❌ Upload error:", error);
    throw error;
  }
}

console.log("✅ Cloudinary ready");
console.log(
  `   Max resolution: ${IMAGE_SETTINGS.maxWidth}×${IMAGE_SETTINGS.maxHeight}px`,
);
console.log(`   WebP quality:   ${IMAGE_SETTINGS.webpQuality * 100}%`);
console.log(`   JPEG fallback:  ${IMAGE_SETTINGS.jpegQuality * 100}%`);
console.log(
  `   Accepts:        JPEG, PNG, GIF, BMP, TIFF, AVIF, WebP, HEIC (Safari only)`,
);
console.log(`   Cropping:       disabled`);
