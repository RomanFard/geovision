import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 1
});

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

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
    const result = await pool.query(query, [
      parseFloat(lng),
      parseFloat(lat),
      searchRadius
    ]);

    return res.status(200).json(result.rows);

  } catch (error) {
    console.error('Spatial search error:', error);

    return res.status(500).json({
      error: 'Spatial search failed.'
    });
  }
}