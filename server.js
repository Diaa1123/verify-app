const express = require("express");
const { Pool } = require("pg");

const app = express();

const cors = require("cors");

const allowedOrigins = new Set([
  "https://afghanioil.com",
  "https://www.afghanioil.com",
]);

app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true); // يسمح لـ Postman / curl
    if (origin.endsWith(".myshopify.com")) return cb(null, true); // اختبارات Shopify
    if (allowedOrigins.has(origin)) return cb(null, true); // موقعك الرئيسي
    return cb(new Error("Not allowed by CORS: " + origin));
  },
  methods: ["GET", "OPTIONS"],
}));

app.options("*", cors());


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

/* ✅ استخراج UUID سواء كان:
   - UUID مباشر
   - رابط فيه ?code=
*/
function extractUuid(input) {
  const raw = String(input || "").trim();
  const uuidRegex =
    /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;

  // UUID مباشر
  const direct = raw.match(uuidRegex);
  if (direct) return direct[0];

  // رابط وفيه code
  try {
    const u = new URL(raw);
    const code = u.searchParams.get("code");
    if (code) {
      const m = String(code).match(uuidRegex);
      if (m) return m[0];
    }
  } catch (_) {}

  // نص عام فيه code=
  const match = raw.match(/[?&]code=([^&#]+)/i);
  if (match) {
    const decoded = decodeURIComponent(match[1]);
    const m = decoded.match(uuidRegex);
    if (m) return m[0];
  }

  return "";
}

function renderResultPage({ title, message, type, batchId, usedAt, lastCheckedAt }) {
  const accent =
    type === "good" ? "#16a34a" : type === "warn" ? "#ca8a04" : "#dc2626";

  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>تحقق من المنتج</title>
<style>
:root{
  --brown:#F5DEB3;
  --green:#63aa98;
  --gold:#b48a2f;
  --white:#ffffff;
}
body{
  margin:0;
  font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial;
  background:var(--brown);
}
.topbar{
  background:var(--white);
  padding:18px;
  text-align:center;
  font-weight:800;
  font-size:34px;
  color:var(--gold);
}
.wrap{max-width:560px;margin:0 auto;padding:18px}
.card{
  border-radius:18px;
  padding:18px;
  background:rgba(255,255,255,.5);
  border:1px solid rgba(0,0,0,.1);
  box-shadow:0 10px 30px rgba(0,0,0,.08);
  color:#000;
}
.badge{
  display:inline-block;
  padding:8px 12px;
  border-radius:999px;
  font-weight:900;
  font-size:14px;
  color:#fff;
  background:${accent};
}
.card h1{color:#000;font-size:22px;margin:12px 0 8px}
.card p{color:#000;font-size:16px;line-height:1.8}
.card .meta{
  margin-top:12px;
  padding-top:12px;
  border-top:1px dashed rgba(0,0,0,.3);
  font-size:14px;
  color:#000;
}
.card b{color:#000}
.btn{
  margin-top:14px;
  display:block;
  text-align:center;
  padding:14px;
  border-radius:14px;
  background:var(--green);
  color:#fff;
  font-weight:900;
  text-decoration:none;
}
</style>
</head>
<body>
<div class="topbar">الزيت الأفغاني</div>
<div class="wrap">
  <div class="card">
    <span class="badge">${escapeHtml(title)}</span>
    <h1>${escapeHtml(message)}</h1>
    ${batchId ? `<p>Batch: <b>${escapeHtml(batchId)}</b></p>` : ``}
    <div class="meta">
      ${usedAt ? `وقت أول استخدام: <b>${escapeHtml(usedAt)}</b><br>` : ``}
      آخر قراءة للكود: <b>${escapeHtml(lastCheckedAt || "—")}</b>
    </div>
    <a class="btn" href="/scan">إعادة فحص منتج</a>
  </div>
</div>
</body>
</html>`;
}

// صفحة المسح (تبقى HTML عشان الكاميرا)
app.get("/scan", (req, res) => {
  res.send(`<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>تحقق من المنتج</title>
<style>
:root{
  --brown:#F5DEB3;
  --green:#63aa98;
  --gold:#b48a2f;
  --white:#ffffff;
  --red:#dc2626;
}
body{margin:0;font-family:system-ui;background:var(--brown)}
.topbar{background:#fff;padding:18px;text-align:center;font-weight:800;font-size:34px;color:var(--gold)}
.wrap{max-width:560px;margin:0 auto;padding:18px}
h1,p{color:#000}
.btn{width:100%;padding:16px;border-radius:14px;background:var(--green);color:#fff;font-size:18px;font-weight:900;border:0}
#reader{margin-top:14px}
.msg{margin-top:10px;color:#000;font-weight:800}
.err{margin-top:10px;color:var(--red);font-weight:900}
</style>
<script src="https://unpkg.com/html5-qrcode"></script>
</head>
<body>
<div class="topbar">الزيت الأفغاني</div>
<div class="wrap">
<h1>تحقق من المنتج</h1>
<p>امسح رمز QR الموجود على العبوة</p>
<button id="startBtn" class="btn">بدء المسح بالكاميرا</button>
<div id="reader"></div>
<div id="msg" class="msg"></div>
<div id="err" class="err"></div>
</div>

<script>
const startBtn = document.getElementById("startBtn");
const msg = document.getElementById("msg");
const err = document.getElementById("err");
let qr;
let handled = false;

startBtn.onclick = async () => {
  msg.textContent = "";
  err.textContent = "";
  startBtn.disabled = true;
  handled = false;

  try {
    if (!qr) qr = new Html5Qrcode("reader");
    const cams = await Html5Qrcode.getCameras();
    if (!cams || !cams.length) throw new Error("no_camera");

    await qr.start(
      { deviceId: { exact: cams[cams.length - 1].id } },
      { fps: 10, qrbox: 250 },
      async (text) => {
        if (handled) return;
        handled = true;

        msg.textContent = "تم قراءة الكود... جاري التحقق";

        const m = String(text).match(
          /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
        );

        if (!m) {
          err.textContent = "تعذر قراءة الكود";
          startBtn.disabled = false;
          handled = false;
          try { await qr.stop(); } catch(e){}
          return;
        }

        try { await qr.stop(); } catch(e){}

        // ✅ توجيه مباشر للـ API بدل HTML
        window.location.href = "/api/verify?code=" + encodeURIComponent(m[0]);
      }
    );
  } catch (e) {
    err.textContent = "تعذر تشغيل الكاميرا";
    startBtn.disabled = false;
  }
};
</script>
</body>
</html>`);
});

/* ✅ API Verify (JSON فقط) */
app.get("/api/verify", async (req, res) => {
  const code = extractUuid(req.query.code);

  if (!code) {
    return res.status(400).json({
      status: "bad",
      message: "Invalid code",
    });
  }

  try {
    const exists = await pool.query(
      "SELECT batch_id, used_at FROM product_codes WHERE uuid=$1",
      [code]
    );

    if (!exists.rowCount) {
      return res.status(404).json({
        status: "invalid",
        message: "Code not found",
      });
    }

    // تحديث آخر قراءة دائمًا
    await pool.query(
      "UPDATE product_codes SET last_checked_at=NOW() WHERE uuid=$1",
      [code]
    );

    // محاولة تفعيل أول مرة فقط
    const first = await pool.query(
      "UPDATE product_codes SET used_at=NOW() WHERE uuid=$1 AND used_at IS NULL RETURNING used_at",
      [code]
    );

    // جلب الأوقات بعد التحديث
    const last = await pool.query(
      "SELECT used_at,last_checked_at FROM product_codes WHERE uuid=$1",
      [code]
    );

    const formatOptions = {
      timeZone: "Asia/Riyadh",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    };

    const usedAt = last.rows[0].used_at
      ? new Date(last.rows[0].used_at).toLocaleString("en-US", formatOptions)
      : null;

    const lastCheckedAt = last.rows[0].last_checked_at
      ? new Date(last.rows[0].last_checked_at).toLocaleString("en-US", formatOptions)
      : "—";

    return res.json({
      status: first.rowCount ? "valid" : "used",
      message: first.rowCount ? "Code verified successfully" : "Code already used",
      batch_id: exists.rows[0].batch_id,
      used_at: usedAt,
      last_checked_at: lastCheckedAt,
    });
  } catch (e) {
    return res.status(500).json({
      status: "error",
      message: "Server error",
    });
  }
});

/* ✅ /verify الآن مجرد توجيه للـ API */
app.get("/verify", (req, res) => {
  const code = req.query.code || "";
  return res.redirect(302, "/api/verify?code=" + encodeURIComponent(code));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Running on port", PORT));
