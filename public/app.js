// ============================================
// GeoVision - Stage 2: Frame Capture
// ============================================

// --- ارجاعات DOM ---
const video          = document.getElementById('video');
const startBtn       = document.getElementById('start-btn');
const stopBtn        = document.getElementById('stop-btn');
const startCaptureBtn = document.getElementById('start-capture-btn');
const stopCaptureBtn  = document.getElementById('stop-capture-btn');

const cameraStatusEl  = document.getElementById('camera-status');
const captureStatusEl = document.getElementById('capture-status');
const framesEl        = document.getElementById('frames-captured');
const lastCaptureEl   = document.getElementById('last-capture');
const intervalEl      = document.getElementById('capture-interval');

const previewCanvas = document.getElementById('preview-canvas');
const previewEmpty  = document.getElementById('preview-empty');
const previewCtx    = previewCanvas.getContext('2d');

// Canvas مخفی برای capture با کیفیت کامل
const captureCanvas = document.getElementById('capture-canvas');
const captureCtx    = captureCanvas.getContext('2d');

// --- تنظیمات ---
const CAPTURE_INTERVAL_MS = 1000; // هر ۱ ثانیه
intervalEl.textContent = `${CAPTURE_INTERVAL_MS} ms`;

// --- وضعیت داخلی ---
let mediaStream    = null;
let captureTimerId = null;
let framesCaptured = 0;
let lastFrameBlob  = null;
let lastGpsPosition = null; // 🟢 اضافه شد (Phase 4.4)

// ============================================
// بخش ۱: مدیریت دوربین
// ============================================

async function startCamera() {
  try {
    cameraStatusEl.textContent = 'Requesting...';

    const tempStream = await navigator.mediaDevices.getUserMedia({ video: true });
    tempStream.getTracks().forEach(t => t.stop());

    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices.filter(d => d.kind === 'videoinput');

    const backCamera = videoDevices.find(d => {
      const l = d.label.toLowerCase();
      return l.includes('back') || l.includes('rear') || l.includes('environment');
    });

    const constraints = {
      video: backCamera
        ? { deviceId: { ideal: backCamera.deviceId } }
        : { facingMode: { ideal: 'environment' } }
    };

    mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = mediaStream;

    await new Promise(resolve => {
      video.onloadedmetadata = resolve;
    });
    await video.play();

    cameraStatusEl.textContent = 'Active';
    startBtn.disabled = true;
    stopBtn.disabled = false;
    startCaptureBtn.disabled = false;

  } catch (err) {
    console.error('[Camera]', err);
    cameraStatusEl.textContent = 'Permission Denied';
    alert('دسترسی به دوربین ممکن نشد: ' + err.message);
  }
}

function stopCamera() {
  stopCapture();
  if (mediaStream) {
    mediaStream.getTracks().forEach(t => t.stop());
    mediaStream = null;
  }
  video.srcObject = null;

  cameraStatusEl.textContent = 'Inactive';
  startBtn.disabled = false;
  stopBtn.disabled = true;
  startCaptureBtn.disabled = true;
  stopCaptureBtn.disabled = true;
}

// ============================================
// بخش ۲: Capture Engine
// ============================================

function startCapture() {
  if (!mediaStream || video.videoWidth === 0) {
    alert('ابتدا دوربین را روشن کنید.');
    return;
  }
  if (captureTimerId) return;

  captureStatusEl.textContent = 'Running';
  startCaptureBtn.disabled = true;
  stopCaptureBtn.disabled = false;

  captureFrame();
  captureTimerId = setInterval(captureFrame, CAPTURE_INTERVAL_MS);
}

function stopCapture() {
  if (captureTimerId) {
    clearInterval(captureTimerId);
    captureTimerId = null;
  }
  captureStatusEl.textContent = 'Stopped';
  startCaptureBtn.disabled = !mediaStream;
  stopCaptureBtn.disabled = true;
}

function captureFrame() {
  if (!video.videoWidth) return;

  const w = video.videoWidth;
  const h = video.videoHeight;

  captureCanvas.width  = w;
  captureCanvas.height = h;
  captureCtx.drawImage(video, 0, 0, w, h);

  captureCanvas.toBlob(blob => {
    if (lastFrameBlob) URL.revokeObjectURL(lastFrameBlob.url);
    lastFrameBlob = {
      blob,
      url: URL.createObjectURL(blob),
      timestamp: Date.now()
    };
  }, 'image/jpeg', 0.9);

  renderPreview();

  framesCaptured++;
  framesEl.textContent = framesCaptured;
  lastCaptureEl.textContent = new Date().toLocaleTimeString('en-GB');

  if (window.recognitionEngine && window.recognitionEngine.isReady) {
    const result = window.recognitionEngine.processFrame(captureCanvas);

    const resultPanel = document.getElementById('recognition-result');
    const resStatus = document.getElementById('res-status');
    const resAd = document.getElementById('res-ad');
    const resScore = document.getElementById('res-score');
    const resTime = document.getElementById('res-time');

    if (resultPanel) {
      resultPanel.style.display = 'block';

      document.getElementById('res-id').textContent = result.adId || '—';
      document.getElementById('res-total').textContent = result.totalGoodMatches || 0;
      document.getElementById('res-inliers').textContent = result.ransacInliers || 0;
      document.getElementById('res-ratio').textContent = result.inlierRatio || 0;

      if (result.detected) {
        resultPanel.classList.add('detected');
        resStatus.textContent = '✅ Ad Detected';
        resAd.textContent = result.ad.name;
        resScore.textContent = result.matchScore;

        // 🟢 محاسبه فاصله تا تبلیغ (Phase 4.4)
        const resDistanceEl = document.getElementById('res-distance');
        if (resDistanceEl) {
          if (lastGpsPosition && result.ad.location && window.SpatialDistance) {
            const dist = SpatialDistance.haversineDistance(
              lastGpsPosition.latitude, lastGpsPosition.longitude,
              result.ad.location.latitude, result.ad.location.longitude
            );
            resDistanceEl.textContent = SpatialDistance.formatDistance(dist);
          } else {
            resDistanceEl.textContent = '—'; // GPS خاموش یا مختصات تبلیغ نامعتبر
          }
        }
      } else {
        resultPanel.classList.remove('detected');
        resStatus.textContent = `❌ Not Found (Best Score: ${result.matchScore})`;
        resAd.textContent = '—';
        resScore.textContent = result.matchScore || '0.000';
        
        // 🟢 در حالت عدم تشخیص، فاصله هم پاک شود
        const resDistanceEl = document.getElementById('res-distance');
        if (resDistanceEl) resDistanceEl.textContent = '—';
      }
      
      resTime.textContent = result.processingMs;
    }
  }
}

function renderPreview() {
  const maxW = 300;
  const ratio = video.videoHeight / video.videoWidth;
  previewCanvas.width  = maxW;
  previewCanvas.height = Math.round(maxW * ratio);

  previewCtx.drawImage(video, 0, 0, previewCanvas.width, previewCanvas.height);

  previewCanvas.style.display = 'block';
  previewEmpty.style.display = 'none';
}

// ============================================
// بخش ۳: اتصال رویدادها
// ============================================

startBtn.addEventListener('click', startCamera);
stopBtn.addEventListener('click', stopCamera);
startCaptureBtn.addEventListener('click', startCapture);
stopCaptureBtn.addEventListener('click', stopCapture);

window.addEventListener('beforeunload', () => {
  stopCapture();
  if (mediaStream) mediaStream.getTracks().forEach(t => t.stop());
});

// ============================================
// بخش ۳.۵: GPS / Location Module (Phase 4.2 + 4.3)
// مستقل از دوربین و Capture
// ============================================

// --- ارجاعات DOM ---
const startGpsBtn    = document.getElementById('start-gps-btn');
const stopGpsBtn     = document.getElementById('stop-gps-btn');
const gpsStatusEl    = document.getElementById('gps-status');
const gpsLatitudeEl  = document.getElementById('gps-latitude');
const gpsLongitudeEl = document.getElementById('gps-longitude');
const gpsAccuracyEl  = document.getElementById('gps-accuracy');
const gpsLastUpdateEl = document.getElementById('gps-last-update');

// --- ارجاعات DOM برای جدول Nearby Ads (Phase 4.3) ---
const nearbyAdsPanel = document.getElementById('nearby-ads-panel');
const nearbyAdsBody  = document.getElementById('nearby-ads-body');

// --- وضعیت داخلی ---
let gpsWatchId = null;
let referenceAds = []; // دیتابیس تبلیغات برای محاسبه فاصله

// --- متغیرهای نقشه (Phase 6) ---
let map = null;
let userMarker = null;
let adMarkersLayer = null;

// --- شروع دریافت موقعیت ---
function startGps() {
  if (!navigator.geolocation) {
    gpsStatusEl.textContent = 'Not Supported';
    console.error('[GPS] navigator.geolocation is not available in this browser.');
    alert('مرورگر شما از GPS پشتیبانی نمی‌کند.');
    return;
  }

  if (gpsWatchId !== null) return; // قبلاً روشن شده

  gpsStatusEl.textContent = 'Requesting...';
  startGpsBtn.disabled = true;
  stopGpsBtn.disabled = false;

  gpsWatchId = navigator.geolocation.watchPosition(
    onGpsSuccess,
    onGpsError,
    {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0
    }
  );

  console.log('[GPS] watchPosition started. watchId =', gpsWatchId);
}

// --- توقف دریافت موقعیت ---
function stopGps() {
  if (gpsWatchId !== null) {
    navigator.geolocation.clearWatch(gpsWatchId);
    gpsWatchId = null;
    console.log('[GPS] watchPosition stopped.');
  }

  // 🟢 پاک کردن موقعیت ذخیره‌شده (Phase 4.4)
  lastGpsPosition = null;

  // 🟢 پاک کردن مارکرها (Phase 6)
  if (adMarkersLayer) adMarkersLayer.clearLayers();

  gpsStatusEl.textContent = 'Inactive';
  startGpsBtn.disabled = false;
  stopGpsBtn.disabled = true;
  
  // پنهان کردن جدول Nearby Ads هنگام قطع GPS
  if (nearbyAdsPanel) {
    nearbyAdsPanel.style.display = 'none';
  }
}

// --- راه‌اندازی نقشه (Phase 6) ---
function initMap() {
  if (map) return; // اگر قبلاً ساخته شده، کاری نکن

  // مختصات پیش‌فرض (تهران) تا وقتی GPS بیاد
  const defaultLat = 35.70000;
  const defaultLng = 51.40000;

  map = L.map('map').setView([defaultLat, defaultLng], 14);

  // لایه کاشی‌های OpenStreetMap
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);

  // لایه برای مارکرهای تبلیغات
  adMarkersLayer = L.layerGroup().addTo(map);

  // مارکر اولیه برای کاربر
  userMarker = L.marker([defaultLat, defaultLng], {
    icon: L.divIcon({
      className: 'user-location-marker',
      html: '<div style="background-color: #38bdf8; width: 16px; height: 16px; border-radius: 50%; border: 3px solid white; box-shadow: 0 0 10px rgba(56, 189, 248, 0.8);"></div>',
      iconSize: [16, 16],
      iconAnchor: [8, 8]
    })
  }).addTo(map);
  userMarker.bindPopup('موقعیت شما').openPopup();
}

// --- به‌روزرسانی مارکر کاربر ---
function updateUserMarker(lat, lng) {
  if (!map || !userMarker) return;
  userMarker.setLatLng([lat, lng]);
  map.setView([lat, lng], map.getZoom()); // مرکز نقشه رو روی کاربر نگه دار
}

// --- به‌روزرسانی مارکرهای تبلیغات ---
function updateAdMarkers(ads) {

    if (!map || !adMarkersLayer) return;

    adMarkersLayer.clearLayers();

    ads.forEach(ad => {

        // بررسی معتبر بودن مختصات
        if (
            ad.latitude == null ||
            ad.longitude == null ||
            !Number.isFinite(Number(ad.latitude)) ||
            !Number.isFinite(Number(ad.longitude))
        ) {
            return;
        }

        const lat = Number(ad.latitude);
        const lng = Number(ad.longitude);

        const marker = L.marker([lat, lng])
            .addTo(adMarkersLayer);

        // ساخت Popup امن
        const popup = document.createElement('div');

        popup.style.direction = 'ltr';
        popup.style.textAlign = 'left';

        const name = document.createElement('b');
        name.textContent = ad.name || 'Unknown Ad';

        const id = document.createElement('div');
        id.textContent = `ID: ${ad.id}`;

        const distance = document.createElement('div');
        distance.textContent =
            `Distance: ${window.SpatialDistance.formatDistance(ad.distance_meters)}`;

        popup.appendChild(name);
        popup.appendChild(id);
        popup.appendChild(distance);

        marker.bindPopup(popup);
    });
}
// ============================================
// GPS Success Handler
// ============================================

async function onGpsSuccess(position) {

    const { latitude, longitude, accuracy } = position.coords;

    // ذخیره آخرین موقعیت برای Recognition
    lastGpsPosition = { latitude, longitude };

    // به‌روزرسانی اطلاعات GPS
    gpsStatusEl.textContent = 'Active';
    gpsLatitudeEl.textContent = latitude.toFixed(6);
    gpsLongitudeEl.textContent = longitude.toFixed(6);
    gpsAccuracyEl.textContent = accuracy.toFixed(0) + ' m';
    gpsLastUpdateEl.textContent =
        new Date().toLocaleTimeString('en-GB');

    console.log('[GPS] Update:', {
        latitude,
        longitude,
        accuracy
    });

    // دریافت تبلیغات نزدیک از API
    try {

        const response = await fetch(
          /api/ads/nearby
        );

        if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
        }

        const apiAds = await response.json();

        // تبدیل داده‌ها برای جدول Nearby Ads
        const nearby = apiAds.map(ad => ({
            id: ad.id,
            brand: ad.name,
            distance: ad.distance_meters
        }));

        renderNearbyAds(nearby);

        // به‌روزرسانی موقعیت کاربر روی نقشه
        updateUserMarker(latitude, longitude);

        // به‌روزرسانی مارکرهای تبلیغات
        updateAdMarkers(apiAds);

    } catch (err) {

        console.warn(
            '[API] Failed to fetch nearby ads:',
            err.message
        );

        if (nearbyAdsPanel) {
            nearbyAdsPanel.style.display = 'none';
        }
    }
}


// ============================================
// Nearby Ads Renderer
// ============================================

function renderNearbyAds(nearbyAds) {

    if (!nearbyAdsPanel || !nearbyAdsBody) return;

    if (!nearbyAds || nearbyAds.length === 0) {
        nearbyAdsPanel.style.display = 'none';
        nearbyAdsBody.innerHTML = '';
        return;
    }

    nearbyAdsBody.innerHTML = '';

    nearbyAds.forEach(ad => {

        const tr = document.createElement('tr');

        const idCell = document.createElement('td');
        idCell.textContent = ad.id;

        const brandCell = document.createElement('td');
        brandCell.textContent = ad.brand;

        const distanceCell = document.createElement('td');
        distanceCell.textContent =
            window.SpatialDistance.formatDistance(ad.distance);

        tr.appendChild(idCell);
        tr.appendChild(brandCell);
        tr.appendChild(distanceCell);

        nearbyAdsBody.appendChild(tr);
    });

    nearbyAdsPanel.style.display = 'block';
}


// --- هندلر خطا ---
function onGpsError(error) {
  let statusText = 'Error';
  let message = '';

  switch (error.code) {
    case error.PERMISSION_DENIED:
      statusText = 'Denied';
      message = 'دسترسی به GPS رد شد. لطفاً مجوز مکان را در مرورگر فعال کنید.';
      break;
    case error.POSITION_UNAVAILABLE:
      statusText = 'Unavailable';
      message = 'موقعیت مکانی در دسترس نیست.';
      break;
    case error.TIMEOUT:
      statusText = 'Timeout';
      message = 'دریافت موقعیت مکانی زمان‌بر شد (timeout).';
      break;
    default:
      statusText = 'Error';
      message = 'خطای ناشناخته در دریافت GPS: ' + error.message;
  }

  gpsStatusEl.textContent = statusText;
  gpsAccuracyEl.textContent = '—';
  console.error('[GPS] Error:', error.code, error.message);

  // پنهان کردن جدول Nearby Ads در صورت خطا
  if (nearbyAdsPanel) {
    nearbyAdsPanel.style.display = 'none';
  }

  if (gpsWatchId !== null) {
    navigator.geolocation.clearWatch(gpsWatchId);
    gpsWatchId = null;
  }
  startGpsBtn.disabled = false;
  stopGpsBtn.disabled = true;

  alert(message);
}

// --- اتصال رویدادها ---
startGpsBtn.addEventListener('click', startGps);
stopGpsBtn.addEventListener('click', stopGps);

// --- پاک‌سازی هنگام خروج ---
window.addEventListener('beforeunload', () => {
  if (gpsWatchId !== null) {
    navigator.geolocation.clearWatch(gpsWatchId);
  }
});

// ============================================
// بخش ۴: راه‌اندازی OpenCV و موتور تشخیص
// ============================================

const engineStatusEl = document.getElementById('engine-status');

window.Module = {
  onRuntimeInitialized: async function() {
    try {
      if (cv instanceof Promise) {
        window.cv = await cv;
      }

      if (cv && cv.Mat) {
        console.log('[OpenCV] Engine ready. Loading recognition database...');
        engineStatusEl.textContent = 'Loading DB...';
        
        const success = await recognitionEngine.init();
        
        if (success) {


          engineStatusEl.textContent = 'Ready';
          engineStatusEl.classList.remove('loading');
          engineStatusEl.classList.add('ready');
          console.log('[GeoVision] All systems ready.');
        } else {
          throw new Error('Recognition engine initialization failed');
        }
      } else {
        throw new Error('cv object not fully initialized after runtime init');
      }
    } catch (err) {
      console.error('[Init] Failed:', err);
      engineStatusEl.textContent = 'Error';
      engineStatusEl.classList.remove('loading');
      engineStatusEl.classList.add('error');
    }
  }
};

// ============================================
// بخش ۵: ابزار ارزیابی خودکار (Auto-Evaluation Tool)
// ============================================
// --- راه‌اندازی اولیه نقشه ---
initMap();
window.runAutoEvaluation = async function() {
  if (!window.recognitionEngine || !window.recognitionEngine.isReady) {
    alert('Recognition Engine is not ready yet. Please wait.');
    return;
  }

  console.log('🚀 Starting Auto-Evaluation...');
  
  // 🔴 لیست تست‌ها را بر اساس فایل‌های خودت تنظیم کن
  const testCases = [
    // --- تست‌های مثبت (تصاویر از خود دیتابیس) ---
    { file: 'data/reference/ad_001.jpg', expectedId: 'ad_001', shouldDetect: true, name: 'Fizzora' },
    { file: 'data/reference/ad_002.jpg', expectedId: 'ad_002', shouldDetect: true, name: 'Sonova' },
    { file: 'data/reference/ad_003.jpg', expectedId: 'ad_003', shouldDetect: true, name: 'Veloria' },
    { file: 'data/reference/ad_004.jpg', expectedId: 'ad_004', shouldDetect: true, name: 'Burger & Co' },
    { file: 'data/reference/ad_005.jpg', expectedId: 'ad_005', shouldDetect: true, name: 'Urban Thread' },
    { file: 'data/reference/ad_006.jpg', expectedId: 'ad_006', shouldDetect: true, name: 'Skywander' },

    // --- تست‌های منفی (تصاویر نویز) ---
    { file: 'data/test_negatives/wall.jpg', expectedId: null, shouldDetect: false, name: 'Wall' },
    { file: 'data/test_negatives/nature.jpg', expectedId: null, shouldDetect: false, name: 'Nature' },
    { file: 'data/test_negatives/food.jpg', expectedId: null, shouldDetect: false, name: 'Food' },
    { file: 'data/test_negatives/keyboard.jpg', expectedId: null, shouldDetect: false, name: 'Keyboard' }
  ];

  const results = [];
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  for (const test of testCases) {
    console.log(`Testing: ${test.name}...`);
    
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.crossOrigin = 'Anonymous';
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error(`Failed to load ${test.file}`));
      i.src = test.file;
    });

    canvas.width = img.width;
    canvas.height = img.height;
    ctx.drawImage(img, 0, 0);

    const result = window.recognitionEngine.processFrame(canvas);

    results.push({
      name: test.name,
      expectedId: test.expectedId,
      shouldDetect: test.shouldDetect,
      actualDetected: result.detected,
      actualId: result.adId,
      matchScore: parseFloat(result.matchScore),
      totalMatches: result.totalGoodMatches,
      inliers: result.ransacInliers,
      inlierRatio: parseFloat(result.inlierRatio),
      processingMs: result.processingMs,
      isCorrect: (test.shouldDetect === result.detected) && 
                 (!test.shouldDetect || test.expectedId === result.adId)
    });
  }

  // --- محاسبه معیارهای نهایی ---
  const totalTests = results.length;
  const correctDetections = results.filter(r => r.isCorrect).length;
  const truePositives = results.filter(r => r.shouldDetect && r.actualDetected).length;
  const falsePositives = results.filter(r => !r.shouldDetect && r.actualDetected).length;
  const falseNegatives = results.filter(r => r.shouldDetect && !r.actualDetected).length;
  const trueNegatives = results.filter(r => !r.shouldDetect && !r.actualDetected).length;

  const correctDetectionRate = (correctDetections / totalTests * 100).toFixed(1);
  const falsePositiveRate = (falsePositives + trueNegatives) > 0 
    ? (falsePositives / (falsePositives + trueNegatives) * 100).toFixed(1) 
    : 'N/A';
  
  const avgProcessingTime = (results.reduce((s, r) => s + r.processingMs, 0) / totalTests).toFixed(0);
  const avgMatchScore = (results.reduce((s, r) => s + r.matchScore, 0) / totalTests).toFixed(3);
  const avgInlierRatio = (results.reduce((s, r) => s + r.inlierRatio, 0) / totalTests).toFixed(2);

  // --- چاپ جدول در کنسول ---
  console.log('%c📊 GeoVision Evaluation Report', 'font-size: 16px; font-weight: bold; color: #00ff00;');
  console.table(results.map(r => ({
    'Name': r.name,
    'Expected?': r.shouldDetect,
    'Detected?': r.actualDetected,
    'Expected ID': r.expectedId || '—',
    'Actual ID': r.actualId || '—',
    'Match Score': r.matchScore,
    'Total Matches': r.totalMatches,
    'Inliers': r.inliers,
    'Inlier Ratio': r.inlierRatio,
    'Proc. Time (ms)': r.processingMs,
    'Correct?': r.isCorrect ? '✅' : '❌'
  })));

  console.log('%c📈 Summary Metrics:', 'font-size: 14px; font-weight: bold; color: #00ffff;');
  console.log(`Total Tests: ${totalTests}`);
  console.log(`True Positives: ${truePositives} | True Negatives: ${trueNegatives}`);
  console.log(`False Positives: ${falsePositives} | False Negatives: ${falseNegatives}`);
  console.log(`%cCorrect Detection Rate: ${correctDetectionRate}%`, 'color: #00ff00; font-weight: bold;');
  console.log(`%cFalse Positive Rate: ${falsePositiveRate}%`, 'color: #ff0000; font-weight: bold;');
  console.log(`Average Processing Time: ${avgProcessingTime} ms`);
  console.log(`Average Match Score: ${avgMatchScore}`);
  console.log(`Average Inlier Ratio: ${avgInlierRatio}`);

  // --- نمایش خلاصه در UI ---
  const resPanel = document.getElementById('recognition-result');
  if (resPanel) {
    resPanel.style.display = 'block';
    resPanel.classList.add('detected');
    document.getElementById('res-status').textContent = `📊 Evaluation Done: ${correctDetectionRate}% Correct`;
    document.getElementById('res-ad').textContent = `TP: ${truePositives}, TN: ${trueNegatives}, FP: ${falsePositives}, FN: ${falseNegatives}`;
    document.getElementById('res-score').textContent = `Avg Score: ${avgMatchScore}`;
    document.getElementById('res-time').textContent = `Avg Time: ${avgProcessingTime}ms`;
    document.getElementById('res-id').textContent = `FPR: ${falsePositiveRate}%`;
    document.getElementById('res-total').textContent = `Avg Inlier Ratio: ${avgInlierRatio}`;
    document.getElementById('res-inliers').textContent = '—';
    document.getElementById('res-ratio').textContent = '—';
  }

  console.log('📊 Evaluation complete. Report printed above.');
};