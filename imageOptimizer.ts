export interface OptimizationResult {
  url: string; // Original URL or Blob URL
  dataUrl: string; // Optimized Base64 or Blob URL
  originalSize: number;
  optimizedSize: number;
  originalWidth: number;
  originalHeight: number;
  optimizedWidth: number;
  optimizedHeight: number;
  format: string;
}

export const optimizeImage = async (
  url: string, 
  targetWidth = 1600, 
  quality = 0.82
): Promise<OptimizationResult> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const originalWidth = img.width;
      const originalHeight = img.height;

      // STRICT SIZE VALIDATION
      if (originalWidth < 600) {
        reject(new Error(`Image too small (${originalWidth}x${originalHeight}). Minimum width is 600px.`));
        return;
      }

      const targetHeight = Math.round((targetWidth * 9) / 16); // Perfect 16:9

      // --- CROP LOGIC (Center Crop to 16:9) ---
      let srcX = 0;
      let srcY = 0;
      let srcWidth = originalWidth;
      let srcHeight = originalHeight;

      const sourceRatio = originalWidth / originalHeight;
      const targetRatio = 16 / 9;

      if (sourceRatio > targetRatio) {
        // Source is wider than 16:9
        srcWidth = originalHeight * targetRatio;
        srcX = (originalWidth - srcWidth) / 2;
      } else {
        // Source is taller than 16:9
        srcHeight = originalWidth / targetRatio;
        srcY = (originalHeight - srcHeight) / 2;
      }

      const canvas = document.createElement("canvas");
      canvas.width = targetWidth;
      canvas.height = targetHeight;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Could not get canvas context"));
        return;
      }

      // Metadata stripping happens here because we draw only what we need
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      
      // If original is massive (> 4x target), use a middle step for quality and stability
      if (originalWidth > targetWidth * 4) {
        const midCanvas = document.createElement("canvas");
        midCanvas.width = targetWidth * 2;
        midCanvas.height = targetHeight * 2;
        const midCtx = midCanvas.getContext("2d");
        if (midCtx) {
           midCtx.drawImage(img, srcX, srcY, srcWidth, srcHeight, 0, 0, midCanvas.width, midCanvas.height);
           ctx.drawImage(midCanvas, 0, 0, midCanvas.width, midCanvas.height, 0, 0, targetWidth, targetHeight);
        } else {
           ctx.drawImage(img, srcX, srcY, srcWidth, srcHeight, 0, 0, targetWidth, targetHeight);
        }
      } else {
        ctx.drawImage(img, srcX, srcY, srcWidth, srcHeight, 0, 0, targetWidth, targetHeight);
      }

      // Export as JPEG
      const dataUrl = canvas.toDataURL("image/jpeg", quality);
      
      // Calculate sizes
      const optimizedSize = Math.round((dataUrl.length * 3) / 4); 

      resolve({
        url,
        dataUrl,
        originalSize: 0, // Will be filled by fetchAndOptimizeImage
        optimizedSize,
        originalWidth,
        originalHeight,
        optimizedWidth: targetWidth,
        optimizedHeight: targetHeight,
        format: "image/jpeg"
      });
    };

    img.onerror = (e) => reject(new Error(`Failed to load image: ${url}`));
    img.src = url;
  });
};

/**
 * Fetches image blob to get accurate original size before optimization
 */
export const fetchAndOptimizeImage = async (
  url: string,
  maxWidth = 1200,
  quality = 0.82
): Promise<OptimizationResult> => {
  if (!url || !url.startsWith("https://") || url.includes("blob:") || url.includes("data:image") || url.includes("picsum")) {
    throw new Error(`Invalid image URL pattern: ${url}`);
  }

  try {
    const response = await fetch(url, { method: 'GET' });
    if (!response.ok) throw new Error(`HTTP Error ${response.status} for ${url}`);
    
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.startsWith("image/")) {
      throw new Error(`URL is not a valid image (Content-Type: ${contentType})`);
    }

    const blob = await response.blob();
    const originalSize = blob.size;
    
    // Create a local URL for the loaded blob
    const localUrl = URL.createObjectURL(blob);
    const result = await optimizeImage(localUrl, maxWidth, quality);
    
    // Clean up
    URL.revokeObjectURL(localUrl);
    
    return {
      ...result,
      url, // restore original url for reference
      originalSize
    };
  } catch (e) {
    console.error("[Image Optimizer] Fetch failure:", e);
    throw e; // Do NOT fall back to direct optimization which bypasses validation
  }
};
