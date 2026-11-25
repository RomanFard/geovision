// ============================================
// GeoVision - Feature Matcher (Homography + RANSAC)
// ============================================

class FeatureMatcher {
  constructor() {
    this.bf = null;
  }

  init() {
    if (typeof cv === 'undefined' || !cv.BFMatcher) {
      throw new Error('OpenCV (cv.BFMatcher) is not ready yet.');
    }
    this.bf = new cv.BFMatcher(cv.NORM_HAMMING, false);
    console.log('[Matcher] BFMatcher initialized.');
  }

  match(queryDescriptors, trainDescriptors, queryKeypoints, trainKeypoints) {
    if (!this.bf) {
      throw new Error('FeatureMatcher is not initialized. Call init() first.');
    }

    const matches = new cv.DMatchVectorVector();
    const goodMatches = [];
    const ratioThreshold = 0.75;

    try {
      this.bf.knnMatch(queryDescriptors, trainDescriptors, matches, 2);

      for (let i = 0; i < matches.size(); i++) {
        const matchPair = matches.get(i);
        if (matchPair.size() >= 2) {
          const m = matchPair.get(0);
          const n = matchPair.get(1);
          
          if (m.distance < ratioThreshold * n.distance) {
            goodMatches.push(m);
          }
        }
      }

      if (goodMatches.length < 10) {
        return { score: 0, goodMatches: [], totalMatches: 0, inliers: 0, inlierRatio: 0 };
      }

      const srcPoints = [];
      const dstPoints = [];
      
      for (const m of goodMatches) {
        const qKp = queryKeypoints.get(m.queryIdx);
        const tKp = trainKeypoints.get(m.trainIdx);
        srcPoints.push(qKp.pt.x, qKp.pt.y);
        dstPoints.push(tKp.pt.x, tKp.pt.y);
      }

      const srcMat = cv.matFromArray(goodMatches.length, 1, cv.CV_32FC2, srcPoints);
      const dstMat = cv.matFromArray(goodMatches.length, 1, cv.CV_32FC2, dstPoints);
      const mask = new cv.Mat();

      const H = cv.findHomography(srcMat, dstMat, cv.RANSAC, 5.0, mask);
      
      let inliersCount = 0;
      if (mask.data) {
        for (let i = 0; i < goodMatches.length; i++) {
          if (mask.data[i] === 1) inliersCount++;
        }
      }

      srcMat.delete();
      dstMat.delete();
      mask.delete();
      H.delete();

      const inlierRatio = goodMatches.length > 0 ? (inliersCount / goodMatches.length) : 0;
      
      if (inliersCount < 12 || inlierRatio < 0.3) {
        return { score: 0, goodMatches: [], totalMatches: goodMatches.length, inliers: inliersCount, inlierRatio: inlierRatio };
      }

      let score = 0;
      if (inliersCount >= 30) {
        score = 0.9 + Math.min((inliersCount - 30) * 0.005, 0.1);
      } else if (inliersCount >= 20) {
        score = 0.6 + (inliersCount - 20) * 0.03;
      } else if (inliersCount >= 12) {
        score = 0.3 + (inliersCount - 12) * 0.05;
      } else {
        score = 0;
      }

      return { 
        goodMatches: goodMatches, 
        score: score,
        totalMatches: goodMatches.length,
        inliers: inliersCount,
        inlierRatio: inlierRatio
      };

    } finally {
      matches.delete();
    }
  }
}