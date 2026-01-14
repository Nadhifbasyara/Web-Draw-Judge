# Web-Draw-Judge
Aplikasi web menggambar: **AI memilih 1 tema**, kamu menggambar di canvas, lalu **AI menilai** hasil gambar.

## Fitur
- Generate **1 tema** dari AI (`/api/theme`)
- Canvas menggambar (brush, warna, eraser, undo/redo, clear)
- Submit gambar untuk dinilai AI (`/api/score`)
- Download hasil gambar sebagai PNG

## Struktur Project
```
E:\Web Gambar\
  server.js
  index.html
  styles.css
  app.js
  .env
  package.json
  node_modules\
```

## Prasyarat
- Node.js (disarankan versi LTS terbaru)
- API Key Gemini (Google AI Studio)

## Instalasi & Menjalankan
1) Install dependency:
```bash
npm install
```

2) Buat file `.env` di root project (jangan di-commit ke GitHub):
```env
GEMINI_API_KEY=ISI_API_KEY_KAMU
GEMINI_MODEL=gemini-2.5-flash
PORT=3000
```

3) Jalankan server:
```bash
npm start
```

4) Buka di browser:
- http://localhost:3000

Cek server:
- http://localhost:3000/api/health

## Cara Pakai
1. Klik **Generate Tema (AI)** → tema muncul di “Tema Terpilih”
2. Gambar di canvas
3. Klik **Submit untuk Dinilai** → skor & feedback muncul
4. Klik **Download PNG** untuk menyimpan gambar

## Endpoint Backend
- `GET /api/health`  
  Mengecek server & status API key (tanpa membocorkan key).

- `GET /api/theme`  
  Menghasilkan **1 tema** dari AI (jika quota habis, otomatis fallback tema lokal).

- `POST /api/score`  
  Menilai gambar berdasarkan tema.

  Body JSON:
  ```json
  {
    "theme": "Dunia bawah laut",
    "imageBase64": "<base64 image data>",
    "mimeType": "image/png"
  }
  ```

## Catatan Kuota (HTTP 429)
Jika muncul error `429 RESOURCE_EXHAUSTED`, artinya kuota/rate limit Gemini sedang habis/terbatas.

Solusi:
- tunggu beberapa saat, atau
- ganti `GEMINI_MODEL` ke model lain yang tersedia, atau
- upgrade/billing sesuai akun Gemini kamu.

## Keamanan
- **Jangan commit `.env`** ke GitHub karena berisi API key.
- Pastikan `.gitignore` berisi:
  ```
  node_modules/
  .env
  ```

## Lisensi
Bebas dipakai untuk pembelajaran / pengembangan.
