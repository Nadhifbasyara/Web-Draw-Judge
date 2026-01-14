import "dotenv/config";
import express from "express";

const app = express();
app.use(express.json({ limit: "60mb" }));
app.use(express.static(".")); // serve index.html, css, js

const PORT = Number(process.env.PORT || 3000);
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

function normalizeModelId(nameOrId) {
  return String(nameOrId || "").replace(/^models\//, "");
}

function extractText(resp) {
  const parts = resp?.candidates?.[0]?.content?.parts || [];
  return parts.map(p => p.text || "").join("\n").trim();
}

async function geminiFetch(path, bodyObj, attempt = 1) {
  if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY belum diset (cek .env).");

  const url = `https://generativelanguage.googleapis.com/v1beta/${path}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": GEMINI_API_KEY,
    },
    body: JSON.stringify(bodyObj),
  });

  const text = await res.text();
  if (res.ok) return JSON.parse(text);

  // retry 429 once (rate limit)
  if (res.status === 429 && attempt < 2) {
    let waitMs = 30_000;
    try {
      const err = JSON.parse(text);
      const retryInfo = (err?.error?.details || []).find(d =>
        String(d?.["@type"] || "").includes("RetryInfo")
      );
      const retryDelay = retryInfo?.retryDelay; // "59s"
      if (retryDelay) {
        const seconds = parseInt(String(retryDelay).replace("s",""), 10);
        if (!Number.isNaN(seconds)) waitMs = (seconds + 1) * 1000;
      }
    } catch {}

    console.warn(`⚠️ Gemini 429, retry in ${Math.round(waitMs/1000)}s...`);
    await new Promise(r => setTimeout(r, waitMs));
    return geminiFetch(path, bodyObj, attempt + 1);
  }

  throw new Error(`Gemini HTTP ${res.status}: ${text}`);
}

const FALLBACK_THEMES = [
  "Dunia bawah laut", "Kucing lucu", "Rumah kecil", "Gunung dan matahari",
  "Balon udara", "Robot sederhana", "Bunga matahari", "Kapal layar"
];

function parseJsonLoose(text) {
  if (!text) return null;

  // buang code fence ```json ... ```
  const cleaned = String(text)
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();

  // 1) coba parse langsung
  try { return JSON.parse(cleaned); } catch {}

  // 2) ambil objek JSON pertama yang terlihat { ... }
  const m1 = cleaned.match(/\{[\s\S]*\}/);
  if (m1) {
    try { return JSON.parse(m1[0]); } catch {}
  }

  return null;
}


// ---- ROUTES ----

// Generate ONE theme (AI)
app.get("/api/theme", async (req, res) => {
  try {
    const modelId = normalizeModelId(GEMINI_MODEL);

    const prompt =
`Buat 1 tema gambar singkat dalam Bahasa Indonesia.
Syarat:
- Maksimal 4 kata
- Aman untuk semua umur
- Tidak menyebut karakter berhak cipta
Balas HANYA teks tema saja, tanpa nomor, tanpa bullet, tanpa tanda kutip, tanpa penjelasan.`;

    const resp = await geminiFetch(`models/${modelId}:generateContent`, {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.9, maxOutputTokens: 40 }
    });

    let theme = extractText(resp)
      .replace(/\*\*/g, "")
      .replace(/^"+|"+$/g, "")
      .split("\n")[0]
      .trim();

    if (!theme) theme = FALLBACK_THEMES[Math.floor(Math.random() * FALLBACK_THEMES.length)];

    res.json({ theme, model: modelId });
  } catch (e) {
    const msg = String(e?.message || e);
    console.error("❌ /api/theme", msg);

    // jika quota/rate limit, tetap balikin fallback biar app tetap jalan
    if (msg.includes("Gemini HTTP 429")) {
      const theme = FALLBACK_THEMES[Math.floor(Math.random() * FALLBACK_THEMES.length)];
      return res.json({ theme, model: normalizeModelId(GEMINI_MODEL), fallback: true });
    }

    res.status(500).send(msg);
  }
});

// Score drawing (AI vision)
app.post("/api/score", async (req, res) => {
  try {
    const modelId = normalizeModelId(GEMINI_MODEL);

    let { theme, imageBase64, mimeType } = req.body || {};
    if (!theme || !imageBase64) return res.status(400).send("theme & imageBase64 wajib.");

    // dataURL -> base64 only
    if (typeof imageBase64 === "string" && imageBase64.includes(",")) {
      imageBase64 = imageBase64.split(",")[1];
    }

    const judgePrompt =
`Kamu juri gambar sketsa sederhana.
Tema: "${theme}"

Aturan output:
- Balas HANYA JSON valid (tanpa markdown, tanpa \`\`\`, tanpa penjelasan)
- Lengkapi semua field

Format wajib:
{"score":0,"breakdown":{"relevance":0,"composition":0,"clarity":0,"creativity":0},"feedback":"","tip":""}

Kriteria:
- relevance (0-40)
- composition (0-20)
- clarity (0-20)
- creativity (0-20)`;

    const resp = await geminiFetch(`models/${modelId}:generateContent`, {
      contents: [{
        role: "user",
        parts: [
          { inline_data: { mime_type: mimeType || "image/png", data: imageBase64 } },
          { text: judgePrompt }
        ]
      }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 1024 }
    });

    const raw = extractText(resp);
let json = parseJsonLoose(raw);

if (!json || typeof json.score !== "number") {
  console.log("RAW /api/score (try1):", raw);

  // retry sekali dengan prompt super ketat
  const retryPrompt =
`Balas HANYA JSON valid tanpa markdown:
{"score":0,"breakdown":{"relevance":0,"composition":0,"clarity":0,"creativity":0},"feedback":"","tip":""}
Isi sesuai gambar dan tema "${theme}".`;

  const resp2 = await geminiFetch(`models/${modelId}:generateContent`, {
    contents: [{
      role: "user",
      parts: [
        { inline_data: { mime_type: mimeType || "image/png", data: imageBase64 } },
        { text: retryPrompt }
      ]
    }],
    generationConfig: { temperature: 0.1, maxOutputTokens: 1024 }
  });

  const raw2 = extractText(resp2);
  console.log("RAW /api/score (try2):", raw2);

  json = parseJsonLoose(raw2);
}

if (!json || typeof json.score !== "number") {
  throw new Error("AI masih tidak mengembalikan JSON skor yang valid.");
}


    res.json(json);
  } catch (e) {
    console.error("❌ /api/score", e);
    res.status(500).send(String(e?.message || e));
  }
});

// Health check
app.get("/api/health", (req, res) => {
  res.json({ ok: true, hasKey: Boolean(GEMINI_API_KEY), model: normalizeModelId(GEMINI_MODEL) });
});

app.listen(PORT, () => console.log(`✅ http://localhost:${PORT}`));
