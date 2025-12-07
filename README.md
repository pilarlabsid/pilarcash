# Pilar Cash - Cashflow Management Dashboard

Dashboard arus kas modern dengan backend **Node.js + Express + SQLite** serta frontend **React (Vite) + Tailwind CSS**. Dilengkapi dengan **WebSocket (Socket.IO)** untuk real-time update otomatis di semua client yang terhubung.

## ✨ Fitur

- 📊 **Dashboard Real-time**: Auto-update otomatis menggunakan WebSocket ketika ada perubahan data
- 💰 **Manajemen Transaksi**: Input, edit, dan hapus transaksi dengan validasi lengkap
- 🔒 **Keamanan PIN**: Proteksi dengan PIN 4-digit untuk semua operasi penting
- 📱 **Responsive Design**: UI modern dan responsif dengan Tailwind CSS
- 📈 **Running Balance**: Perhitungan saldo berjalan otomatis
- 📥 **Export Excel**: Unduh data transaksi dalam format Excel
- 🎨 **Modern UI**: Kartu statistik, form modern, dan tabel responsif

## 🏗️ Struktur Proyek

```
.
├── client/              # Vite + React + Tailwind app
│   ├── src/
│   │   ├── App.jsx      # Komponen utama dengan WebSocket
│   │   └── lib/
│   └── package.json
├── data/                # SQLite database (cashflow.db)
├── docs/                # Dokumentasi
│   ├── DEPLOYMENT.md
│   ├── RAILWAY_SETUP.md
│   ├── NETLIFY_FIX.md
│   ├── WEBSOCKET_FIX.md
│   └── ...
├── src/
│   └── database.js      # Helper SQLite (create/read/update/delete)
├── server.js            # Express API + Socket.IO + static file server
├── package.json         # Backend dependencies
└── netlify.toml         # Konfigurasi Netlify
```

## 🚀 Menjalankan Secara Lokal

### Prasyarat
- Node.js ≥18

### Instalasi

1. **Install dependensi backend:**
   ```bash
   npm install
   ```

2. **Install dependensi frontend:**
   ```bash
   cd client && npm install
   ```

3. **Jalankan mode pengembangan** (dua terminal):
   ```bash
   # Terminal 1 -> Backend
   npm run dev

   # Terminal 2 -> Frontend
   npm run client
   ```
   - Backend: `http://localhost:4000`
   - Frontend: `http://localhost:6001` (proxy ke backend)

4. **Build produksi:**
   ```bash
   npm run client:build
   npm start
   ```

Database SQLite akan otomatis dibuat di `data/cashflow.db` jika belum ada.

## 📡 API Endpoints

| Method | Path                      | Deskripsi                           |
| ------ | ------------------------- | ----------------------------------- |
| GET    | `/api/transactions`       | Ambil semua transaksi               |
| POST   | `/api/transactions`       | Tambah transaksi baru               |
| PUT    | `/api/transactions/:id`   | Update transaksi                    |
| DELETE | `/api/transactions/:id`   | Hapus satu transaksi                |
| DELETE | `/api/transactions`       | Hapus semua transaksi               |
| GET    | `/health`                 | Health check endpoint               |

### Contoh Request

**POST /api/transactions:**
```json
{
  "description": "Warung Biru",
  "type": "expense",
  "amount": 233000,
  "date": "2025-01-15"
}
```

## 🔌 WebSocket / Real-time Updates

Aplikasi menggunakan **Socket.IO** untuk real-time update:

- Ketika ada perubahan data (create/update/delete), semua client yang terhubung akan otomatis menerima update
- Tidak perlu refresh halaman untuk melihat perubahan terbaru
- Support multiple clients secara bersamaan

**Event yang dikirim server:**
- `transactions:updated` - Dikirim ketika ada perubahan data

## 🌐 Deployment

### Arsitektur Deployment

- **Frontend**: Netlify (static hosting)
- **Backend**: Railway (Node.js hosting)

### Quick Start Deployment

1. **Deploy Backend ke Railway:**
   - Lihat panduan lengkap: [RAILWAY_SETUP.md](./docs/RAILWAY_SETUP.md)
   - Build Command: `npm install`
   - Start Command: `npm start`
   - **PENTING**: Tambahkan Volume untuk folder `data/` (mount path: `/app/data`)

2. **Deploy Frontend ke Netlify:**
   - Lihat panduan lengkap: [DEPLOYMENT.md](./docs/DEPLOYMENT.md)
   - Base directory: `client`
   - Build command: `npm install && npm run build`
   - Publish directory: `client/dist`
   - **PENTING**: Set environment variable `VITE_API_URL` dengan URL backend Railway

3. **Konfigurasi WebSocket:**
   - Lihat panduan: [WEBSOCKET_FIX.md](./docs/WEBSOCKET_FIX.md)
   - Pastikan `VITE_API_URL` sudah di-set dengan benar di Netlify
   - WebSocket akan otomatis menggunakan polling sebagai fallback di Netlify

### Dokumentasi Deployment

- 📘 [DEPLOYMENT.md](./docs/DEPLOYMENT.md) - Panduan deployment umum
- 🚂 [RAILWAY_SETUP.md](./docs/RAILWAY_SETUP.md) - Setup backend di Railway
- 🌐 [NETLIFY_FIX.md](./docs/NETLIFY_FIX.md) - Fix masalah di Netlify
- 🔌 [WEBSOCKET_FIX.md](./docs/WEBSOCKET_FIX.md) - Fix WebSocket auto-update
- 🔧 [TROUBLESHOOTING.md](./docs/TROUBLESHOOTING.md) - Troubleshooting guide

## ⚙️ Environment Variables

### Frontend (Netlify)

| Variable      | Deskripsi                          | Contoh                                    |
| ------------- | ---------------------------------- | ----------------------------------------- |
| `VITE_API_URL` | URL backend Railway (tanpa trailing slash) | `https://cashflow-backend.up.railway.app` |

### Backend (Railway)

| Variable  | Deskripsi              | Default |
| --------- | ---------------------- | ------- |
| `PORT`    | Port server            | 4000    |
| `NODE_ENV`| Environment mode       | -       |

## 🔐 Keamanan

- **PIN Protection**: Semua operasi penting (create, update, delete, export) memerlukan PIN 4-digit
- **Default PIN**: `6745` (dapat diubah di `client/src/App.jsx`)
- **CORS**: Backend dikonfigurasi untuk menerima request dari semua origin (untuk production, pertimbangkan membatasi ke domain Netlify)

## 📝 Catatan Penting

- **Database Persistence**: Pastikan folder `data/` menggunakan persistent storage/volume di Railway agar database tidak hilang saat restart
- **WebSocket di Netlify**: Netlify tidak support WebSocket native, jadi Socket.IO akan menggunakan polling sebagai fallback (tetap memberikan real-time update)
- **Backup**: Disarankan untuk melakukan backup berkala untuk file `data/cashflow.db`
- **Tidak ada data bawaan**: Semua transaksi berasal dari input user

## 🛠️ Teknologi yang Digunakan

- **Backend**: Node.js, Express, Socket.IO, SQLite (sql.js)
- **Frontend**: React, Vite, Tailwind CSS, Socket.IO Client
- **Deployment**: Netlify (frontend), Railway (backend)

## 📄 License

MIT

## 👥 Credits

Developed by Pilar Labs
