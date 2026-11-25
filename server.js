import express from 'express';
import cors from 'cors';
import { Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// سرو کردن فایل‌های استاتیک PWA (مثل index.html, style.css, app.js)
app.use(express.static(__dirname));

// اتصال به دیتابیس از طریق Pooler
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// API: دریافت تبلیغات نزدیک
app.get('/api/ads/nearby', async (req, res) => {
  const { lat, lng, radius } = req.query;
  if (!lat || !lng) {
    return res.status(400).json({ error: 'لطفاً latitude و longitude را ارسال کنید.' });
  }
  const searchRadius = radius ? parseFloat(radius) : 1000;
  const query = `
    SELECT id, name, image_url, geofence_radius_meters,
      extensions.ST_Distance(location, extensions.ST_SetSRID(extensions.ST_MakePoint($1, $2), 4326)::extensions.geography) AS distance_meters
    FROM public.ads
    WHERE extensions.ST_DWithin(location, extensions.ST_SetSRID(extensions.ST_MakePoint($1, $2), 4326)::extensions.geography, $3)
    ORDER BY distance_meters;
  `;
  try {
    const result = await pool.query(query, [lng, lat, searchRadius]);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'خطا در جستجوی مکانی' });
  }
});

// هندل کردن مسیر ریشه (/) برای ارسال index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// در نهایت، شروع به گوش دادن به پورت
app.listen(port, () => {
  console.log(`🚀 سرور روی http://localhost:${port} اجرا شد.`);
});