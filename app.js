const themeText = document.getElementById("themeText");
const statusEl = document.getElementById("status");

const btnGenerateTheme = document.getElementById("btnGenerateTheme");
const btnClearTheme = document.getElementById("btnClearTheme");
const themeManual = document.getElementById("themeManual");
const btnSetTheme = document.getElementById("btnSetTheme");

const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

const brushSize = document.getElementById("brushSize");
const color = document.getElementById("color");

const btnEraser = document.getElementById("btnEraser");
const btnUndo = document.getElementById("btnUndo");
const btnRedo = document.getElementById("btnRedo");
const btnClear = document.getElementById("btnClear");

const btnSubmit = document.getElementById("btnSubmit");
const btnDownload = document.getElementById("btnDownload");

const resultEl = document.getElementById("result");
const scoreValue = document.getElementById("scoreValue");
const scoreBreakdown = document.getElementById("scoreBreakdown");
const feedbackEl = document.getElementById("feedback");
const tipEl = document.getElementById("tip");

let currentTheme = "";
let drawing = false;
let isEraser = false;

let undoStack = [];
let redoStack = [];

function setStatus(t) { statusEl.textContent = t; }

function setTheme(t) {
  currentTheme = (t || "").trim();
  themeText.textContent = currentTheme || "—";
}

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.floor(rect.width * dpr);
  canvas.height = Math.floor(rect.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, rect.width, rect.height);
  pushUndo();
}

window.addEventListener("resize", resizeCanvas);

function pushUndo() {
  try {
    undoStack.push(canvas.toDataURL("image/png"));
    if (undoStack.length > 40) undoStack.shift();
    redoStack = [];
  } catch {}
}

function restoreFromDataUrl(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const rect = canvas.getBoundingClientRect();
      ctx.clearRect(0, 0, rect.width, rect.height);
      ctx.drawImage(img, 0, 0, rect.width, rect.height);
      resolve();
    };
    img.src = dataUrl;
  });
}

function getPos(e) {
  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX ?? e.touches?.[0]?.clientX) - rect.left;
  const y = (e.clientY ?? e.touches?.[0]?.clientY) - rect.top;
  return { x, y };
}

function beginStroke(e) {
  drawing = true;
  const { x, y } = getPos(e);
  ctx.beginPath();
  ctx.moveTo(x, y);
}

function moveStroke(e) {
  if (!drawing) return;
  e.preventDefault();
  const { x, y } = getPos(e);

  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = Number(brushSize.value);

  if (isEraser) {
    ctx.globalCompositeOperation = "destination-out";
    ctx.strokeStyle = "rgba(0,0,0,1)";
  } else {
    ctx.globalCompositeOperation = "source-over";
    ctx.strokeStyle = color.value;
  }

  ctx.lineTo(x, y);
  ctx.stroke();
}

function endStroke() {
  if (!drawing) return;
  drawing = false;
  ctx.closePath();
  pushUndo();
}

canvas.addEventListener("mousedown", beginStroke);
canvas.addEventListener("mousemove", moveStroke);
window.addEventListener("mouseup", endStroke);

canvas.addEventListener("touchstart", (e) => beginStroke(e), { passive: false });
canvas.addEventListener("touchmove", (e) => moveStroke(e), { passive: false });
canvas.addEventListener("touchend", endStroke);

btnEraser.addEventListener("click", () => {
  isEraser = !isEraser;
  btnEraser.textContent = isEraser ? "Eraser: ON" : "Eraser";
});

btnClear.addEventListener("click", () => {
  const rect = canvas.getBoundingClientRect();
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, rect.width, rect.height);
  pushUndo();
});

btnUndo.addEventListener("click", async () => {
  if (undoStack.length <= 1) return;
  const last = undoStack.pop();
  redoStack.push(last);
  const prev = undoStack[undoStack.length - 1];
  await restoreFromDataUrl(prev);
});

btnRedo.addEventListener("click", async () => {
  if (!redoStack.length) return;
  const next = redoStack.pop();
  undoStack.push(next);
  await restoreFromDataUrl(next);
});

// Theme buttons
btnSetTheme.addEventListener("click", () => {
  setTheme(themeManual.value);
  setStatus(currentTheme ? "Tema diset manual" : "Tema kosong");
});

btnClearTheme.addEventListener("click", () => {
  themeManual.value = "";
  setTheme("");
  setStatus("Tema di-reset");
});

btnGenerateTheme.addEventListener("click", async () => {
  btnGenerateTheme.disabled = true;
  setStatus("Mengambil tema dari AI...");
  try {
    const r = await fetch("/api/theme");
    if (!r.ok) {
     const errText = await r.text();
     console.error("Server /api/score error:", errText);
     setStatus("Gagal menilai AI: " + errText.slice(0, 120));
     return;
    }
    const data = await r.json();
    setTheme(data.theme);
    setStatus(data.fallback ? "Tema fallback (quota)" : "Tema dari AI siap!");
  } catch (e) {
    console.error(e);
    setStatus("Gagal ambil tema AI");
  } finally {
    btnGenerateTheme.disabled = false;
  }
});

// Submit score
btnSubmit.addEventListener("click", async () => {
  if (!currentTheme) return setStatus("Isi/generate tema dulu");

  btnSubmit.disabled = true;
  setStatus("Menilai dengan AI...");

  try {
    const dataUrl = canvas.toDataURL("image/png");
    const base64 = dataUrl.split(",")[1];

    const r = await fetch("/api/score", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        theme: currentTheme,
        imageBase64: base64,
        mimeType: "image/png"
      })
    });

    if (!r.ok) throw new Error(await r.text());
    const data = await r.json();

    resultEl.classList.remove("hidden");
    scoreValue.textContent = data.score;

    const b = data.breakdown || {};
    scoreBreakdown.textContent =
      `relevance: ${b.relevance ?? "-"}\ncomposition: ${b.composition ?? "-"}\nclarity: ${b.clarity ?? "-"}\ncreativity: ${b.creativity ?? "-"}`;

    feedbackEl.textContent = data.feedback || "";
    tipEl.textContent = data.tip || "";

    setStatus("Selesai dinilai");
  } catch (e) {
    console.error(e);
    setStatus("Gagal menilai AI (cek quota / model)");
  } finally {
    btnSubmit.disabled = false;
  }
});

btnDownload.addEventListener("click", () => {
  const a = document.createElement("a");
  a.href = canvas.toDataURL("image/png");
  a.download = "gambar.png";
  a.click();
});

// init
setStatus("Siap");
setTheme("");
resizeCanvas();
