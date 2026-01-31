const express = require("express");
const { Pool } = require("pg");

const app = express();

// PostgreSQL connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// Health check
app.get("/health", (req, res) => {
  res.send("ok");
});

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderResultPage({ title, message, type, batchId, usedAt, lastCheckedAt }) {
  // Theme (light / clean)
  const accent =
    type === "good" ? "#16a34a" : type === "warn" ? "#ca8a04" : "#dc2626";

  const bgTint =
    type === "good"
      ? "rgba(22,163,74,.08)"
      : type === "warn"
      ? "rgba(202,138,4,.10)"
      : "rgba(220,38,38,.08)";

  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>تحقق من المنتج</title>
  <style>
    body{margin:0;background:#fff;color:#0f172a;font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial}
    .topbar{padding:14px 18px;border-bottom:1px solid #e5e7eb;text-align:center;font-weight:800}
    .wrap{max-width:560px;margin:0 auto;padding:18px}
    .card{border:1px solid #e5e7eb;border-radius:16px;padding:18px;background:#fff;box-shadow:0 10px 30px rgba(0,0,0,.06)}
    .badge{display:inline-block;padding:6px 10px;border-radius:999px;font-weight:800;font-size:13px;color:${accent};background:${bgTint};border:1px solid rgba(15,23,42,.08)}
    h1{margin:12px 0 8px;font-size:22px}
    p{margin:0 0 10px;line-height:1.7;font-size:16px}
    .meta{margin-top:12px;padding-top:12px;border-top:1px dashed #e5e7eb;font-size:14px;color:#334155;line-height:1.8}
    .btn{margin-top:14px;display:block;text-align:center;text-decoration:none;padding:12px 14px;border-radius:12px;border:1px solid #e5e7eb;background:#0f172a;color:#fff;font-weight:800}
    .small{margin-top:10px;font-size:12px;color:#64748b;text-align:center}
  </style>
</head>
<body>
  <div class="topbar">Afghani Oil</div>

  <div class="wrap">
    <div class="card">
      <span class="badge">${escapeHtml(title)}</span>
      <h1>${escapeHtml(message)}</h1>

      ${
        batchId
          ? `<p>Batch: <b>${escapeHtml(batchId)}</b></p>`
          : ``
      }

      <div class="meta">
        ${
          usedAt
            ? `وقت أول استخدام: <b>${escapeHtml(usedAt)}</b><br/>`
            : ``
        }
        آخر قراءة للكود: <b>${escapeHtml(lastCheckedAt || "—")}</b>
      </div>

      <a class="btn" href="/scan">إعادة فحص منتج</a>
      <div class="small">إذا واجهت مشكلة، تواصل مع خدمة العملاء.</div>
    </div>
  </div>
</body>
</html>`;
}

// صفحة scan بسيطة (اختيارية) — لو ما تبيها قلّي أشيلها
app.get("/scan", (req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(`<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>مسح الكود</title>
  <style>
    body{margin:0;background:#fff;color:#0f172a;font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial}
    .topbar{padding:14px 18px;border-bottom:1px solid #e5e7eb;text-align:center;font-weight:800}
    .wrap{max-width:560px;margin:0 auto;padding:18px}
    .card{border:1px solid #e5e7eb;border-radius:16px;padding:18px;background:#fff;box-shadow:0 10px 30px rgba(0,0,0,.06)}
    h1{margin:0 0 8px;font-size:20px}
    p{margin:0 0 12px;line-height:1.7;color:#334155}
    .btn{width:100%;border:0;padding:12px 14px;border-radius:12px;background:#0f172a;color:#fff;font-weight:800;font-size:16px}
    #reader{margin-top:12px;border-radius:14px;overflow:hidden;border:1px solid #e5e7eb}
    .msg{margin-top:10px;font-size:14px;color:#16a34a}
    .hint{margin-top:10px;font-size:12px;color:#64748b}
  </style>
  <script src="https://unpkg.com/html5-qrcode"></script>
</head>
<body>
  <div class="topbar">Afghani Oil</div>
  <div class="wrap">
    <div class="card">
      <h1>تحقق من المنتج</h1>
      <p>اضغط بدء المسح ثم وجّه الكاميرا نحو QR الموجود على العبوة.</p>
      <button id="startBtn" class="btn">بدء المسح بالكاميرا</button>
      <div id="reader"></div>
      <div id="msg" class="msg"></div>
      <div class="hint">ملاحظة: لازم HTTPS عشان الكاميرا تشتغل.</div>
    </div>
  </div>

<script>
  const startBtn = document.getElementById("startBtn");
  const msg = document.getElementById("msg");
  let qr;

  startBtn.addEventListener("click", async () => {
    msg.textContent = "";
    startBtn.disabled = true;

    try {
      if(!qr) qr = new Html5Qrcode("reader");
      const cams = await Html5Qrcode.getCameras();
      if(!cams || cams.length === 0) throw new Error("لا توجد كاميرا");

      const camId = cams[cams.length - 1].id; // الخلفية غالبًا
      await qr.start(
        { deviceId: { exact: camId } },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        async (decodedText) => {
          msg.textContent = "✅ تم قراءة الكود بنجاح… جاري التحقق";
          try { await qr.stop(); } catch(e){}
          const url = new URL("/verify", window.location.origin);
          url.searchParams.set("code", decodedText.trim());
          window.location.href = url.toString();
        }
      );
    } catch (e) {
      startBtn.disabled = false;
      msg.style.color = "#dc2626";
      msg.textContent = "تعذر تشغيل الكاميرا. تأكد من السماح بإذن الكاميرا وفتح الصفحة عبر HTTPS.";
    }
  });
</script>
</body>
</html>`);
});

// Verify endpoint
app.get("/verify", async (req, res) => {
  const code = String(req.query.code || "").trim();

  if (!code) {
    return res.status(400).send(
      renderResultPage({
        title: "❌ كود غير موجود",
        message: "الرجاء مسح QR أو إدخال كود صحيح.",
        type: "bad",
        lastCheckedAt: "—",
      })
    );
  }

  try {
    // 1) هل الكود موجود؟ (نجيب used_at و batch_id)
    const exists = await pool.query(
      `SELECT batch_id, used_at FROM product_codes WHERE uuid = $1 LIMIT 1`,
      [code]
    );

    if (exists.rowCount === 0) {
      return res.status(404).send(
        renderResultPage({
          title: "❌ الكود غير صحيح",
          message: "هذا الكود غير موجود في النظام.",
          type: "bad",
          lastCheckedAt: "—",
        })
      );
    }

    // 2) تحديث last_checked_at دائمًا (كل قراءة)
    await pool.query(
      `UPDATE product_codes SET last_checked_at = NOW() WHERE uuid = $1`,
      [code]
    );

    // 3) نحاول أول استخدام (نفس منطقك)
    const update = await pool.query(
      `UPDATE product_codes
       SET used_at = NOW()
       WHERE uuid = $1 AND used_at IS NULL
       RETURNING batch_id, used_at`,
      [code]
    );

    // 4) نجيب آخر قراءة (بعد التحديث)
    const last = await pool.query(
      `SELECT last_checked_at, used_at FROM product_codes WHERE uuid = $1 LIMIT 1`,
      [code]
    );

    const lastCheckedAt = last.rows[0]?.last_checked_at
      ? new Date(last.rows[0].last_checked_at).toLocaleString("ar-SA")
      : "—";

    const usedAt = last.rows[0]?.used_at
      ? new Date(last.rows[0].used_at).toLocaleString("ar-SA")
      : null;

    // أول مرة
    if (update.rowCount === 1) {
      return res.send(
        renderResultPage({
          title: "✅ المنتج أصلي",
          message: "تم تفعيل الكود الآن بنجاح.",
          type: "good",
          batchId: update.rows[0].batch_id || exists.rows[0].batch_id,
          usedAt, // وقت أول استخدام (الآن)
          lastCheckedAt,
        })
      );
    }

    // مستخدم سابقًا
    return res.send(
      renderResultPage({
        title: "⚠️ مستخدم سابقًا",
        message: "تم استخدام هذا الكود سابقًا.",
        type: "warn",
        batchId: exists.rows[0].batch_id,
        usedAt, // وقت أول استخدام
        lastCheckedAt, // آخر قراءة
      })
    );
  } catch (err) {
    console.error("DB ERROR:", err);
    return res.status(500).send(
      renderResultPage({
        title: "⚠️ خطأ بالخادم",
        message: "حدث خطأ، حاول مرة أخرى لاحقًا.",
        type: "warn",
        lastCheckedAt: "—",
      })
    );
  }
});

// IMPORTANT: dynamic port
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Running on port", PORT);
});
