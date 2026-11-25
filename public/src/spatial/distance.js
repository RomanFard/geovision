// ============================================
// GeoVision - Spatial Distance Utilities
// Phase 4.3: Haversine
// UMD-style: works in Browser (window) and Node.js (module.exports)
// ============================================

(function (root, factory) {
  const api = factory();

  // Node.js / CommonJS
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }

  // Browser
  if (typeof window !== 'undefined') {
    window.SpatialDistance = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

  const EARTH_RADIUS_M = 6371000; // شعاع زمین به متر

  /**
   * تبدیل درجه به رادیان
   */
  function toRadians(degrees) {
    return degrees * Math.PI / 180;
  }

  /**
   * محاسبه فاصله دو نقطه جغرافیایی با فرمول Haversine
   * @param {number} lat1 - عرض جغرافیایی نقطه ۱ (درجه)
   * @param {number} lon1 - طول جغرافیایی نقطه ۱ (درجه)
   * @param {number} lat2 - عرض جغرافیایی نقطه ۲ (درجه)
   * @param {number} lon2 - طول جغرافیایی نقطه ۲ (درجه)
   * @returns {number} فاصله بر حسب متر
   */
  function haversineDistance(lat1, lon1, lat2, lon2) {
    const φ1 = toRadians(lat1);
    const φ2 = toRadians(lat2);
    const Δφ = toRadians(lat2 - lat1);
    const Δλ = toRadians(lon2 - lon1);

    const a = Math.sin(Δφ / 2) ** 2 +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return EARTH_RADIUS_M * c;
  }

  /**
   * اعتبارسنجی یک آبجکت location
   * قوانین:
   *  - null / undefined / غیرآبجکت → false
   *  - latitude یا longitude غیرعدد / NaN / Infinity → false
   *  - latitude خارج از [-90, 90] → false
   *  - longitude خارج از [-180, 180] → false
   * @param {*} location
   * @returns {boolean}
   */
  function isValidLocation(location) {
    if (!location || typeof location !== 'object') return false;

    const { latitude, longitude } = location;

    if (typeof latitude !== 'number' || !Number.isFinite(latitude)) return false;
    if (typeof longitude !== 'number' || !Number.isFinite(longitude)) return false;
    if (latitude < -90 || latitude > 90) return false;
    if (longitude < -180 || longitude > 180) return false;

    return true;
  }

  /**
   * محاسبه فاصله یک نقطه مرجع تا لیستی از تبلیغات
   * - تبلیغات با location نامعتبر (null/NaN/خارج از محدوده) کاملاً حذف می‌شوند
   * - خروجی صعودی بر اساس فاصله مرتب می‌شود
   *
   * @param {number} refLat - عرض جغرافیایی مرجع (گوشی)
   * @param {number} refLon - طول جغرافیایی مرجع (گوشی)
   * @param {Array} ads - آرایه تبلیغات از reference.json
   * @returns {Array<{id, brand, name, distance}>}
   */
  function computeDistancesToAds(refLat, refLon, ads) {
    if (!Array.isArray(ads)) return [];

    return ads
      .filter(ad => ad && isValidLocation(ad.location))
      .map(ad => ({
        id: ad.id,
        brand: ad.brand,
        name: ad.name,
        distance: haversineDistance(
          refLat, refLon,
          ad.location.latitude, ad.location.longitude
        )
      }))
      .sort((a, b) => a.distance - b.distance); // صعودی
  }

  /**
   * قالب‌بندی فاصله برای نمایش در UI
   * @param {number} meters
   * @returns {string} مثلاً "32 m" یا "1.24 km"
   */
  function formatDistance(meters) {
    if (meters < 1000) {
      return `${Math.round(meters)} m`;
    }
    return `${(meters / 1000).toFixed(2)} km`;
  }

  return {
    EARTH_RADIUS_M,
    haversineDistance,
    isValidLocation,
    computeDistancesToAds,
    formatDistance
  };
});