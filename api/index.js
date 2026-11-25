import express from 'express';
import cors from 'cors';
import { Pool } from 'pg';

const app = express();

app.use(cors());
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 1
});

app.get('/api/ads/nearby', async (req, res) => {
  const { lat, lng, radius } = req.query;

  if (!lat || !lng) {
    return res.status(400).json({
      error: 'Latitude and longitude are required.'
    });
  }

  const searchRadius = radius ? parseFloat(radius) : 1000;

  const query = `
    SELECT
      id,
      name,
      image_url,
      geofence_radius_meters,
      extensions.ST_Distance(
        location,
        extensions.ST_SetSRID(
          extensions.ST_MakePoint($1, $2),
          4326
        )::extensions.geography
      ) AS distance_meters
    FROM public.ads
    WHERE extensions.ST_DWithin(
      location,
      extensions.ST_SetSRID(
        extensions.ST_MakePoint($1, $2),
        4326
      )::extensions.geography,
      $3
    )
    ORDER BY distance_meters;
  `;

  try {
    const result = await pool.query(query, [lng, lat, searchRadius]);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Spatial search failed.' });
  }
});

export default app;