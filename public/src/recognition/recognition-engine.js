// ============================================
// GeoVision - Hybrid Recognition Engine (Canvas Color + Shape)
// ============================================

class RecognitionEngine {
  constructor() {
    this.orbExtractor = new OrbExtractor(1000);
    this.matcher = new FeatureMatcher();
    this.referenceData = [];
    this.referenceFeatures = [];
    this.isReady = false;
    this.MATCH_THRESHOLD = 0.50; // آستانه جدید // آستانه بالاتر برای جلوگیری از تشخیص‌های نویزی
  }

  async init() {
    try {
      this.orbExtractor.init();
      this.matcher.init();

      console.log('[Engine] Loading reference database...');
      const res = await fetch('data/reference.json');
      this.referenceData = await res.json();

      console.log(`[Engine] Extracting features for ${this.referenceData.length} ads...`);
      
      for (const ad of this.referenceData) {
        const img = await this.loadImage(`data/reference/${ad.file}`);
        const features = this.orbExtractor.extract(img);
        
        // استخراج هیستوگرام رنگ با Canvas (بدون OpenCV)
        const colorHist = this.extractColorHistogram(img);

        this.referenceFeatures.push({
          ad: ad,
          keypoints: features.keypoints,
          descriptors: features.descriptors,
          colorHist: colorHist
        });
      }

      this.isReady = true;
      console.log('[Engine] Initialization complete. Ready to match!');
      return true;
    } catch (err) {
      console.error('[Engine] Initialization failed:', err);
      return false;
    }
  }

  loadImage(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'Anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
      img.src = url;
    });
  }

  // --- استخراج هیستوگرام رنگ با Canvas ---
  extractColorHistogram(imageSource) {
    const canvas = document.createElement('canvas');
    canvas.width = 100;
    canvas.height = 100;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(imageSource, 0, 0, 100, 100);
    
    const imageData = ctx.getImageData(0, 0, 100, 100);
    const data = imageData.data;
    
    // 3 کانال رنگی (R, G, B) با 16 سطل (bin)
    const hist = new Array(48).fill(0); // 16*3
    
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      
      // پیدا کردن سطل مربوطه
      const binR = Math.floor(r / 16);
      const binG = Math.floor(g / 16);
      const binB = Math.floor(b / 16);
      
      hist[binR]++;
      hist[16 + binG]++;
      hist[32 + binB]++;
    }
    
    // نرمال‌سازی
    const totalPixels = data.length / 4;
    for (let i = 0; i < hist.length; i++) {
      hist[i] = hist[i] / totalPixels;
    }
    
    return hist;
  }

  // --- مقایسه هیستوگرام رنگ با فاصله اقلیدسی ---
  compareColorHistograms(hist1, hist2) {
    let sumSqDiff = 0;
    for (let i = 0; i < hist1.length; i++) {
      const diff = hist1[i] - hist2[i];
      sumSqDiff += diff * diff;
    }
    // فاصله اقلیدسی
    const distance = Math.sqrt(sumSqDiff);
    // تبدیل فاصله به امتیاز (هرچه فاصله کمتر، امتیاز بالاتر)
    // حداکثر فاصله ممکن حدود 1.7 هست، پس نرمال می‌کنیم
    const score = Math.max(0, 1 - (distance / 1.7));
    return score;
  }

  processFrame(frameCanvas) {
    if (!this.isReady) {
      return { detected: false, message: 'Engine not ready' };
    }

    const startTime = performance.now();
    let frameFeatures;

    try {
      frameFeatures = this.orbExtractor.extract(frameCanvas);
    } catch (err) {
      return { detected: false, message: 'Feature extraction failed' };
    }

    // استخراج هیستوگرام رنگ فریم
    const frameColorHist = this.extractColorHistogram(frameCanvas);
    
    if (!window._matchLogs) window._matchLogs = [];
    window._matchLogs = []; // ریست لاگ‌ها در هر فریم

    let bestMatch = null;
    let highestScore = 0;

    for (const ref of this.referenceFeatures) {
      // ۱. امتیاز شکل (ORB)
      const shapeResult = this.matcher.match(
        frameFeatures.descriptors, 
        ref.descriptors, 
        frameFeatures.keypoints, 
        ref.keypoints
      );
      
      // ۲. امتیاز رنگ (Histogram)
      const colorScore = this.compareColorHistograms(frameColorHist, ref.colorHist);

      // ۳. امتیاز ترکیبی: ۸۰٪ شکل (Homography) + ۲۰٪ رنگ
      const finalScore = (shapeResult.score * 0.8) + (colorScore * 0.2);
      
      window._matchLogs.push(`${ref.ad?.name || 'Unknown'}: ${finalScore.toFixed(3)} (شکل: ${shapeResult.score.toFixed(2)} | رنگ: ${colorScore.toFixed(2)})`);
      
      if (finalScore > highestScore) {
        highestScore = finalScore;
        bestMatch = {
          ad: ref.ad,
          score: finalScore,
          goodMatchesCount: shapeResult.goodMatches.length,
          totalMatches: shapeResult.totalMatches || 0,
          inliers: shapeResult.inliers || 0,
          inlierRatio: shapeResult.inlierRatio || 0
        };
      }
    }

    frameFeatures.mat.delete();
    frameFeatures.keypoints.delete();
    frameFeatures.descriptors.delete();

    const processingMs = Math.round(performance.now() - startTime);
    const detected = highestScore >= this.MATCH_THRESHOLD && highestScore > 0;

    return {
      detected: detected,
      ad: detected ? bestMatch.ad : null,
      matchScore: highestScore.toFixed(3),
      processingMs: processingMs,
      // --- معیارهای ارزیابی ---
      adId: bestMatch ? bestMatch.ad.id : null,
      totalGoodMatches: bestMatch ? bestMatch.totalMatches : 0,
      ransacInliers: bestMatch ? bestMatch.inliers : 0,
      inlierRatio: bestMatch ? bestMatch.inlierRatio.toFixed(2) : 0
    };
  }
}

// ساخت نمونه سراسری
window.recognitionEngine = new RecognitionEngine();