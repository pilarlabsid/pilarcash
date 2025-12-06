# Cashflow Dashboard (Node + React + Tailwind)

Dashboard arus kas dengan backend **Node.js + Express + SQLite** serta frontend **React (Vite) + Tailwind CSS**. Data disimpan di file `data/cashflow.db`, sedangkan UI menampilkan kartu ringkasan, form modern, dan tabel responsif gaya Tailwind template.

## Fitur

- Input transaksi lengkap dengan validasi sisi server & client.
- Node API menyimpan ke SQLite (`sql.js`) dan menyediakan endpoint JSON.
- Vite React UI dengan Tailwind: summary cards, running balance table, kartu mobile view, toast feedback, dan tombol bersihkan data.
- Dev server terpisah (Vite) dengan proxy ke backend, build hasilnya otomatis disajikan oleh Express.

## Struktur Proyek

```
.
├── client/              # Vite + React + Tailwind app
│   ├── src/
│   └── package.json
├── data/                # file SQLite (cashflow.db)
├── src/database.js      # helper SQLite (create/read/write using sql.js)
├── server.js            # Express API + static file server
└── package.json         # backend scripts & deps
```

## Menjalankan Secara Lokal

1. Pastikan Node.js ≥18 terpasang.
2. Instal dependensi backend:
   ```bash
   npm install
   ```
3. Instal dependensi frontend:
   ```bash
   cd client && npm install
   ```
4. Jalankan mode pengembangan (dua terminal):
   ```bash
   # terminal 1 -> backend
   npm run dev

   # terminal 2 -> frontend
   npm run client
   ```
   - Backend otomatis berjalan di `http://localhost:4000`.
   - Frontend (Vite) berjalan di `http://localhost:6001` dan mem-proxy request `/api` ke backend.
5. Build produksi:
   ```bash
   npm run client:build
   npm start        # menjalankan Express + hasil build React
   ```

Semua data tersimpan di `data/cashflow.db`. File ini otomatis dibuat jika belum ada.

## Endpoint API

| Method | Path                  | Deskripsi                         |
| ------ | --------------------- | --------------------------------- |
| GET    | `/api/transactions`   | Ambil semua transaksi (urut tanggal) |
| POST   | `/api/transactions`   | Tambah transaksi baru             |
| DELETE | `/api/transactions/:id` | Hapus satu transaksi             |
| DELETE | `/api/transactions`   | Hapus semua transaksi             |

Payload `POST /api/transactions`:

```json
{
  "description": "Warung Biru",
  "type": "expense",
  "amount": 233000,
  "date": "2025-12-04"
}
```

## Deploy

### Deploy ke GitHub

1. **Inisialisasi Git repository** (jika belum):
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   ```

2. **Buat repository baru di GitHub** dan push:
   ```bash
   git remote add origin https://github.com/pilarlabsid/cashflow.git
   git branch -M main
   git push -u origin main
   ```

### Deploy Frontend ke Netlify

1. **Login ke Netlify** dan buat site baru dari GitHub repository Anda.

2. **Konfigurasi Build Settings**:
   - **Base directory**: `client`
   - **Build command**: `npm install && npm run build`
   - **Publish directory**: `client/dist`

3. **Environment Variables** (di Netlify Dashboard → Site settings → Environment variables):
   - Tambahkan `VITE_API_URL` dengan nilai URL backend Anda (contoh: `https://your-backend.herokuapp.com`)

4. **Deploy**: Netlify akan otomatis build dan deploy setiap kali Anda push ke GitHub.

### Deploy Backend

Backend perlu di-deploy ke layanan yang mendukung Node.js. Pilihan populer:

#### Option 1: Render.com (Recommended)

**Langkah-langkah:**

1. **Buat akun di [Render.com](https://render.com)**
   - Login dengan GitHub account Anda

2. **Buat Web Service baru:**
   - Klik "New +" → "Web Service"
   - Pilih repository: `pilarlabsid/cashflow`
   - Klik "Connect"

3. **Isi Settingan berikut:**

   **Basic Settings:**
   - **Name**: `cashflow-backend` (atau nama lain yang Anda inginkan)
   - **Region**: Pilih region terdekat (misal: Singapore)
   - **Branch**: `main`
   - **Root Directory**: (kosongkan, biarkan default)
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`

   **Advanced Settings:**
   - **Auto-Deploy**: `Yes` (otomatis deploy saat push ke GitHub)

   **Environment Variables:**
   - Klik "Add Environment Variable"
   - Tambahkan:
     - **Key**: `NODE_ENV`
     - **Value**: `production`
   - **Key**: `PORT`
   - **Value**: (biarkan kosong, Render akan set otomatis)

4. **Setup Persistent Disk untuk Database:**
   - Scroll ke bagian "Disk"
   - Klik "Add Disk"
   - **Name**: `cashflow-data`
   - **Mount Path**: `/opt/render/project/data`
   - **Size**: `1 GB` (cukup untuk database kecil)
   - **Note**: Ini penting agar database tidak hilang saat restart!

5. **Pilih Plan:**
   - **Free**: Gratis (dengan beberapa limitasi)
   - **Starter**: $7/bulan (lebih stabil)

6. **Klik "Create Web Service"**
   - Render akan mulai build dan deploy
   - Tunggu hingga selesai (sekitar 2-5 menit)

7. **Dapatkan URL Backend:**
   - Setelah deploy selesai, Anda akan mendapat URL seperti: `https://cashflow-backend.onrender.com`
   - **Copy URL ini** untuk digunakan di Netlify environment variable

**Catatan Penting:**
- Free tier di Render akan "sleep" setelah 15 menit tidak aktif (wake up butuh ~30 detik)
- Untuk production, pertimbangkan upgrade ke Starter plan ($7/bulan)
- Database akan tersimpan di persistent disk dan tidak akan hilang

#### Option 2: Railway.app
1. Buat akun di [Railway.app](https://railway.app)
2. Deploy dari GitHub repository
3. Railway otomatis mendeteksi Node.js dan menjalankan `npm start`
4. Tambahkan **Volume** untuk folder `data/` agar database persisten

#### Option 3: Fly.io
1. Install Fly CLI: `curl -L https://fly.io/install.sh | sh`
2. Login: `fly auth login`
3. Deploy: `fly launch`
4. Tambahkan volume untuk database: `fly volumes create data`

### Catatan Penting

- **Database Persistence**: Pastikan folder `data/` menggunakan persistent storage/volume agar `cashflow.db` tidak hilang saat restart.
- **Environment Variables**: Set `VITE_API_URL` di Netlify dengan URL backend yang sudah di-deploy.
- **CORS**: Backend sudah dikonfigurasi untuk menerima request dari semua origin. Untuk production, pertimbangkan membatasi CORS ke domain Netlify Anda.
- **Backup**: Jadwalkan backup berkala untuk file `data/cashflow.db`.

## Catatan

- Tidak ada data bawaan; semua transaksi berasal dari input user.
- Jika ingin mengganti database (MySQL, Postgres, dsb), cukup implementasikan ulang helper pada `src/database.js`.
- UI dibangun dengan Tailwind; warna dan layout dapat disesuaikan melalui `client/src/index.css`, `tailwind.config.js`, dan komponen React di `client/src/App.jsx`.

