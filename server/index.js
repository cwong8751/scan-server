const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(express.json());
app.use(cors());

// Serve uploaded images statically
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Multer setup — saves image to /uploads, only if provided
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    // Name the file after the prefix, e.g. ABC.jpg
    const prefix = (req.body.barcode || '').slice(0, 3).toUpperCase();
    const ext = path.extname(file.originalname);
    cb(null, `${prefix}${ext}`);
  }
});
const upload = multer({ storage });

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'inventory_db',
  user: 'inventory_admin',
  password: '12345',
});

pool.connect((err, client, release) => {
  if (err) {
    console.error('Error connecting to the database:', err.message);
  } else {
    console.log('Connected to PostgreSQL!');
    release();
  }
});

// ─── HELPER ───────────────────────────────────────────────────────────────────

function parseBarcode(barcode) {
  // e.g. ABCDM28 or ABCDXL05
  if (!barcode || barcode.length < 7) throw new Error('Barcode too short');
  if (barcode[3] !== 'D') throw new Error('4th character must be D');

  const prefix      = barcode.slice(0, 3).toUpperCase();
  const type_code   = barcode[0].toUpperCase();
  const style_code  = barcode[1].toUpperCase();
  const texture_code= barcode[2].toUpperCase();
  const afterMarker = barcode.slice(4);                      // e.g. 'M28' or 'XL05'
  const unit_number = parseInt(afterMarker.slice(-2), 10);   // last 2 chars
  const size        = afterMarker.slice(0, -2).toUpperCase();// everything before last 2

  if (!size) throw new Error('Could not parse size from barcode');
  if (isNaN(unit_number)) throw new Error('Could not parse unit number from barcode');

  return { prefix, type_code, style_code, texture_code, size, unit_number };
}

// ─── CHECK PREFIX ─────────────────────────────────────────────────────────────

// GET /prefix-check/:prefix
// Returns { exists: true/false } so the frontend knows whether to show image upload
app.get('/prefix-check/:prefix', async (req, res) => {
  try {
    const prefix = req.params.prefix.toUpperCase();
    const result = await pool.query(
      `SELECT prefix FROM inventory_schema.clothing_images WHERE prefix = $1`,
      [prefix]
    );
    res.json({ exists: result.rows.length > 0 });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Database error' });
  }
});

// ─── SCAN / ADD ITEM ──────────────────────────────────────────────────────────

// POST /scan
// multipart/form-data: { barcode: string, image?: file }
// - If prefix is new: image is required → inserts into clothing_images + clothing_items
// - If prefix exists: image ignored   → inserts into clothing_items only
app.post('/scan', upload.single('image'), async (req, res) => {
  const client = await pool.connect();
  try {
    const { barcode } = req.body;
    if (!barcode) return res.status(400).json({ error: 'Barcode is required' });

    const parsed = parseBarcode(barcode.toUpperCase());

    await client.query('BEGIN');

    // Check if prefix already exists
    const prefixCheck = await client.query(
      `SELECT prefix, image_url FROM inventory_schema.clothing_images WHERE prefix = $1`,
      [parsed.prefix]
    );

    let image_url;

    if (prefixCheck.rows.length === 0) {
      // First scan for this prefix — image is required
      if (!req.file) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          error: 'This is a new clothing prefix. An image is required for the first scan.'
        });
      }
      image_url = `/uploads/${req.file.filename}`;
      await client.query(
        `INSERT INTO inventory_schema.clothing_images (prefix, image_url) VALUES ($1, $2)`,
        [parsed.prefix, image_url]
      );
    } else {
      // Prefix exists — use existing image, ignore any uploaded file
      image_url = prefixCheck.rows[0].image_url;
    }

    // Check barcode isn't already registered
    const barcodeCheck = await client.query(
      `SELECT id FROM inventory_schema.clothing_items WHERE barcode = $1`,
      [barcode.toUpperCase()]
    );
    if (barcodeCheck.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'This barcode has already been scanned' });
    }

    // Insert the unit — trigger auto-fills parsed columns
    const result = await client.query(
      `INSERT INTO inventory_schema.clothing_items (barcode, image_prefix, type_code, style_code, texture_code, size, unit_number)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        barcode.toUpperCase(),
        parsed.prefix,
        parsed.type_code,
        parsed.style_code,
        parsed.texture_code,
        parsed.size,
        parsed.unit_number
      ]
    );

    await client.query('COMMIT');

    res.status(201).json({
      ...result.rows[0],
      image_url
    });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err.message);
    res.status(400).json({ error: err.message });
  } finally {
    client.release();
  }
});

// ─── GET ALL ITEMS ────────────────────────────────────────────────────────────

// GET /clothing-items
// Returns items grouped by prefix. Each group has:
//   prefix, image_url, type_code, style_code, texture_code,
//   sizes: [{ size, count, units: [{ id, barcode, unit_number }] }]
app.get('/clothing-items', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        ci.image_prefix   AS prefix,
        img.image_url,
        ci.type_code,
        ci.style_code,
        ci.texture_code,
        ci.size,
        COUNT(*)::int      AS count,
        JSON_AGG(
          JSON_BUILD_OBJECT(
            'id',          ci.id,
            'barcode',     ci.barcode,
            'unit_number', ci.unit_number,
            'created_at',  ci.created_at
          ) ORDER BY ci.unit_number
        ) AS units
      FROM inventory_schema.clothing_items ci
      JOIN inventory_schema.clothing_images img ON img.prefix = ci.image_prefix
      GROUP BY ci.image_prefix, img.image_url, ci.type_code, ci.style_code, ci.texture_code, ci.size
      ORDER BY ci.image_prefix, ci.size
    `);

    // Re-group by prefix on the JS side so the frontend gets one object per clothing
    const grouped = {};
    for (const row of result.rows) {
      if (!grouped[row.prefix]) {
        grouped[row.prefix] = {
          prefix:       row.prefix,
          image_url:    row.image_url,
          type_code:    row.type_code,
          style_code:   row.style_code,
          texture_code: row.texture_code,
          sizes: []
        };
      }
      grouped[row.prefix].sizes.push({
        size:  row.size,
        count: row.count,
        units: row.units
      });
    }

    res.json(Object.values(grouped));
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Database error' });
  }
});

// ─── DELETE A SINGLE UNIT ─────────────────────────────────────────────────────

// DELETE /clothing-items/:id
// Deletes one physical unit by its row id.
// If it was the last unit under a prefix, also deletes the clothing_images row.
app.delete('/clothing-items/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    await client.query('BEGIN');

    // Get the item first so we know its prefix
    const itemResult = await client.query(
      `DELETE FROM inventory_schema.clothing_items WHERE id = $1 RETURNING *`,
      [id]
    );
    if (itemResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Item not found' });
    }

    const deletedItem = itemResult.rows[0];

    // Check if any units remain under this prefix
    const remaining = await client.query(
      `SELECT COUNT(*) FROM inventory_schema.clothing_items WHERE image_prefix = $1`,
      [deletedItem.image_prefix]
    );

    if (parseInt(remaining.rows[0].count, 10) === 0) {
      // No units left — clean up the image row too
      await client.query(
        `DELETE FROM inventory_schema.clothing_images WHERE prefix = $1`,
        [deletedItem.image_prefix]
      );
    }

    await client.query('COMMIT');
    res.json({ message: 'Deleted successfully', item: deletedItem });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err.message);
    res.status(500).json({ error: 'Database error' });
  } finally {
    client.release();
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`App listening on port ${PORT}`));