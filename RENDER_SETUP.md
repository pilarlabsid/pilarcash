# Panduan Setup Render.com untuk Backend

## Settingan Lengkap yang Perlu Diisi

### 1. Basic Settings

| Field | Value | Keterangan |
|-------|-------|------------|
| **Name** | `cashflow-backend` | Nama service Anda |
| **Region** | Singapore / Frankfurt / dll | Pilih yang terdekat |
| **Branch** | `main` | Branch yang akan di-deploy |
| **Root Directory** | *(kosongkan)* | Biarkan default |
| **Runtime** | `Node` | Environment runtime |
| **Build Command** | `npm install` | Command untuk build |
| **Start Command** | `npm start` | Command untuk start server |

### 2. Environment Variables

Tambahkan environment variables berikut:

| Key | Value | Keterangan |
|-----|-------|------------|
| `NODE_ENV` | `production` | Environment mode |
| `PORT` | *(kosongkan)* | Render akan set otomatis |

**Cara menambah:**
1. Scroll ke bagian "Environment"
2. Klik "Add Environment Variable"
3. Isi Key dan Value
4. Klik "Save Changes"

### 3. Persistent Disk (PENTING!)

Database perlu disimpan di persistent disk agar tidak hilang:

1. Scroll ke bagian "Disk"
2. Klik "Add Disk"
3. Isi:
   - **Name**: `cashflow-data`
   - **Mount Path**: `/opt/render/project/data`
   - **Size**: `1 GB` (cukup untuk database kecil)
4. Klik "Save"

**Catatan:** 
- Mount path harus sesuai dengan lokasi folder `data/` di project
- Tanpa persistent disk, database akan hilang setiap restart!

### 4. Auto-Deploy

- **Auto-Deploy**: `Yes` (aktifkan)
- Setiap push ke branch `main` akan otomatis trigger deployment

### 5. Plan Selection

- **Free**: Gratis, tapi service akan sleep setelah 15 menit tidak aktif
  - ⚠️ **PENTING**: Request pertama setelah sleep akan butuh ~30-50 detik untuk wake up
  - Cocok untuk development/testing
  - Untuk production yang butuh response cepat, pertimbangkan upgrade ke Starter ($7/bulan)

## Setelah Deploy

1. **Tunggu build selesai** (sekitar 2-5 menit)
2. **Copy URL backend** yang diberikan (contoh: `https://cashflow-backend.onrender.com`)
3. **Update Netlify Environment Variable:**
   - Buka Netlify dashboard
   - Site settings → Environment variables
   - Update `VITE_API_URL` dengan URL Render Anda

## Troubleshooting

### Service tidak bisa start
- Cek logs di Render dashboard
- Pastikan `startCommand` adalah `npm start`
- Pastikan PORT menggunakan `process.env.PORT` (sudah ada di server.js)

### Database hilang
- Pastikan persistent disk sudah di-setup
- Pastikan mount path benar: `/opt/render/project/data`

### CORS Error
- Backend sudah dikonfigurasi untuk menerima semua origin
- Jika masih error, cek apakah URL di Netlify sudah benar

### Service sleep (Free tier)
- Free tier akan sleep setelah 15 menit tidak aktif
- Request pertama setelah sleep akan butuh ~30-50 detik untuk wake up
- **Solusi sementara**: 
  - Gunakan service monitoring seperti UptimeRobot (gratis) untuk ping setiap 10 menit
  - Atau buat cron job yang hit health endpoint secara berkala
  - Untuk production yang butuh response cepat, upgrade ke Starter plan ($7/bulan)

