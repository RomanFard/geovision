import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function seedAds() {
  try {
    const filePath = path.resolve('data/reference.json');
    const rawData = fs.readFileSync(filePath, 'utf-8');
    const ads = JSON.parse(rawData);

    console.log(`📦 تعداد ${ads.length} تبلیغ پیدا شد. شروع انتقال...`);

    for (const ad of ads) {
      const { id, name, file, location, geofence } = ad;

      const imageUrl = `data/reference/${file || id + '.jpg'}`;
      const radius = geofence?.radius_meters || 50;

      let wktLocation = null;
      if (location && location.latitude && location.longitude) {
        wktLocation = `POINT(${location.longitude} ${location.latitude})`;
      }

      const query = `
        INSERT INTO public.ads (id, name, image_url, location, geofence_radius_meters)
        VALUES ($1, $2, $3, $4::extensions.geography, $5)
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          image_url = EXCLUDED.image_url,
          location = EXCLUDED.location,
          geofence_radius_meters = EXCLUDED.geofence_radius_meters;
      `;

      try {
        await pool.query(query, [id, name || id, imageUrl, wktLocation, radius]);
        console.log(`✅ ${id} با موفقیت منتقل شد.`);
      } catch (err) {
        console.error(`❌ خطا در درج ${id}:`, err.message);
      }
    }

    console.log('🎉 انتقال تمام شد.');
  } catch (err) {
    console.error('❌ خطای کلی:', err.message);
  } finally {
    await pool.end();
  }
}

seedAds();