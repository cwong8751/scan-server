const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

// Create a pool
const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'inventory_db',
  user: 'inventory_admin',
  password: '12345',
});

// Test the connection
pool.connect((err, client, release) => {
  if (err) {
    console.error('Error connecting to the database:', err.message);
  } else {
    console.log('Connected to PostgreSQL!');
    release();
  }
});

// ─── CLOTHING ITEMS ───────────────────────────────────────────────────────────

// GET all clothing items (with their variants)
app.get('/clothing-items', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        c.id, c.type, c.color, c.image_url, c.created_at,
        JSON_AGG(
          JSON_BUILD_OBJECT(
            'variant_id', v.id,
            'size', v.size,
            'barcode', v.barcode
          )
        ) FILTER (WHERE v.id IS NOT NULL) AS variants
      FROM inventory_schema.clothing_items c
      LEFT JOIN inventory_schema.clothing_variants v ON v.clothing_item_id = c.id
      GROUP BY c.id
    `);
    res.json(result.rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Database error' });
  }
});

// GET a single clothing item by ID (with its variants)
app.get('/clothing-items/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`
      SELECT 
        c.id, c.type, c.color, c.image_url, c.created_at,
        JSON_AGG(
          JSON_BUILD_OBJECT(
            'variant_id', v.id,
            'size', v.size,
            'barcode', v.barcode
          )
        ) FILTER (WHERE v.id IS NOT NULL) AS variants
      FROM inventory_schema.clothing_items c
      LEFT JOIN inventory_schema.clothing_variants v ON v.clothing_item_id = c.id
      WHERE c.id = $1
      GROUP BY c.id
    `, [id]);

    if (result.rows.length === 0) return res.status(404).json({ error: 'Item not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Database error' });
  }
});

// POST create a new clothing item
// Body: { type, color, image_url }
app.post('/clothing-items', async (req, res) => {
  try {
    const { type, color, image_url } = req.body;
    const result = await pool.query(`
      INSERT INTO inventory_schema.clothing_items (type, color, image_url)
      VALUES ($1, $2, $3)
      RETURNING *
    `, [type, color, image_url]);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Database error' });
  }
});

// PUT update a clothing item by ID
// Body: { type, color, image_url }
app.put('/clothing-items/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { type, color, image_url } = req.body;
    const result = await pool.query(`
      UPDATE inventory_schema.clothing_items
      SET type = $1, color = $2, image_url = $3
      WHERE id = $4
      RETURNING *
    `, [type, color, image_url, id]);

    if (result.rows.length === 0) return res.status(404).json({ error: 'Item not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Database error' });
  }
});

// DELETE a clothing item by ID (cascades to variants automatically)
app.delete('/clothing-items/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`
      DELETE FROM inventory_schema.clothing_items WHERE id = $1 RETURNING *
    `, [id]);

    if (result.rows.length === 0) return res.status(404).json({ error: 'Item not found' });
    res.json({ message: 'Deleted successfully', item: result.rows[0] });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Database error' });
  }
});

// ─── CLOTHING VARIANTS ────────────────────────────────────────────────────────

// GET all variants for a clothing item
app.get('/clothing-items/:id/variants', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`
      SELECT * FROM inventory_schema.clothing_variants WHERE clothing_item_id = $1
    `, [id]);
    res.json(result.rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Database error' });
  }
});

// POST add a variant to a clothing item
// Body: { size, barcode }
app.post('/clothing-items/:id/variants', async (req, res) => {
  try {
    const { id } = req.params;
    const { size, barcode } = req.body;
    const result = await pool.query(`
      INSERT INTO inventory_schema.clothing_variants (clothing_item_id, size, barcode)
      VALUES ($1, $2, $3)
      RETURNING *
    `, [id, size, barcode]);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Barcode already exists' });
    console.error(err.message);
    res.status(500).json({ error: 'Database error' });
  }
});

// PUT update a variant by variant ID
// Body: { size, barcode }
app.put('/variants/:variantId', async (req, res) => {
  try {
    const { variantId } = req.params;
    const { size, barcode } = req.body;
    const result = await pool.query(`
      UPDATE inventory_schema.clothing_variants
      SET size = $1, barcode = $2
      WHERE id = $3
      RETURNING *
    `, [size, barcode, variantId]);

    if (result.rows.length === 0) return res.status(404).json({ error: 'Variant not found' });
    res.json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Barcode already exists' });
    console.error(err.message);
    res.status(500).json({ error: 'Database error' });
  }
});

// DELETE a variant by variant ID
app.delete('/variants/:variantId', async (req, res) => {
  try {
    const { variantId } = req.params;
    const result = await pool.query(`
      DELETE FROM inventory_schema.clothing_variants WHERE id = $1 RETURNING *
    `, [variantId]);

    if (result.rows.length === 0) return res.status(404).json({ error: 'Variant not found' });
    res.json({ message: 'Deleted successfully', variant: result.rows[0] });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Database error' });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`App listening on port ${PORT}`);
});