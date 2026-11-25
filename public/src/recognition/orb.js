// ============================================
// GeoVision - ORB Feature Extractor (با پیش‌پردازش)
// ============================================

class OrbExtractor {
  constructor(nFeatures = 1000) {
    this.nFeatures = nFeatures;
    this.orb = null;
  }

  init() {
    if (typeof cv === 'undefined' || !cv.ORB) {
      throw new Error('OpenCV (cv.ORB) is not ready yet.');
    }
    this.orb = new cv.ORB(this.nFeatures);
    console.log('[ORB] Extractor initialized with', this.nFeatures, 'features.');
  }

  extract(imageSource) {
    if (!this.orb) {
      throw new Error('OrbExtractor is not initialized. Call init() first.');
    }

    const src = cv.imread(imageSource);
    const gray = new cv.Mat();
    const blurred = new cv.Mat(); // 👈 برای بلور کردن
    const keypoints = new cv.KeyPointVector();
    const descriptors = new cv.Mat();
    const mask = new cv.Mat();

    try {
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
      
      // 👇 تار کردن تصویر برای حذف نویز و الگوهای تکراری ریز (نقطه‌ای)
      const ksize = new cv.Size(5, 5);
      cv.GaussianBlur(gray, blurred, ksize, 0, 0, cv.BORDER_DEFAULT);
      
      // استخراج ویژگی از تصویر تار شده
      this.orb.detectAndCompute(blurred, mask, keypoints, descriptors);

      // آزادسازی حافظه‌های اضافی
      blurred.delete();
      gray.delete();

      return {
        keypoints: keypoints,
        descriptors: descriptors,
        mat: src
      };
    } catch (err) {
      src.delete(); gray.delete(); blurred.delete(); keypoints.delete(); descriptors.delete(); mask.delete();
      throw err;
    }
  }
}