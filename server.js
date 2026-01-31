const express = require("express");
const { Pool } = require("pg");

const app = express();

// PostgreSQL connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Health check
app.get("/health", (req, res) => {
  res.send("ok");
});

// Verify endpoint
app.get("/verify", async (req, res) => {
  const code = String(req.query.code || "").trim();

  if (!code) {
    return res.send("❌ كود غير موجود");
  }

  try {
    // Try first-time use
    const update = await pool.query(
      `UPDATE product_codes
       SET used_at = NOW()
       WHERE uuid = $1 AND used_at IS NULL
       RETURNING batch_id`,
      [code]
    );

    if (update.rowCount === 1) {
      return res.send(`
        <h2 style="color:green">✅ المنتج أصلي — تم تفعيل الكود الآن</h2>
        <p>Batch: ${update.rows[0].batch_id}</p>
      `);
    }

    // Check if exists
    const check = await pool.query(
      `SELECT used_at FROM product_codes WHERE uuid = $1`,
      [code]
    );

    if (check.rowCount === 0) {
      return res.send("<h2 style='color:red'>❌ الكود غير صحيح</h2>");
    }

    return res.send("<h2 style='color:orange'>⚠️ تم استخدام هذا الكود سابقًا</h2>");

  } catch (err) {
    console.error("DB ERROR:", err);
    return res.status(500).send("Server error");
  }
});

// IMPORTANT: dynamic port
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Running on port", PORT);
});
