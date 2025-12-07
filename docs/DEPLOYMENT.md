# Panduan Deployment Pilar Cash

Panduan lengkap untuk deploy aplikasi Pilar Cash ke production.

## 📋 Overview

Aplikasi ini menggunakan arsitektur terpisah:
- **Frontend**: Deploy ke **Netlify** (static hosting)
- **Backend**: Deploy ke **Railway** (Node.js hosting)

## 🚀 Step-by-Step Deployment

### 1. Persiapan

1. Pastikan semua perubahan sudah di-commit ke Git
2. Pastikan `.gitignore` sudah mengabaikan file sensitif (`node_modules`, `.env`, dll)
3. Pastikan repository sudah di-push ke GitHub

### 2. Deploy Backend ke Railway

**Panduan lengkap**: [RAILWAY_SETUP.md](./RAILWAY_SETUP.md)

**Quick Setup:**

1. Login ke [Railway.app](https://railway.app)
2. Klik "New Project" → "Deploy from GitHub repo"
3. Pilih repository Anda
4. Konfigurasi:
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Root Directory**: *(kosongkan)*
5. **PENTING**: Tambahkan Volume untuk folder `data/`:
   - Klik tab **Volumes** → **Add Volume**
   - **Mount Path**: `/app/data`
   - **Size**: `1 GB`
6. Tunggu deploy selesai
7. **Copy URL backend** (contoh: `https://cashflow-backend.up.railway.app`)

### 3. Deploy Frontend ke Netlify

1. **Login ke Netlify** dan buat site baru:
   - Klik "Add new site" → "Import an existing project"
   - Pilih GitHub dan pilih repository Anda

2. **Konfigurasi Build Settings:**
   - **Base directory**: `client`
   - **Build command**: `npm install && npm run build`
   - **Publish directory**: `client/dist`

3. **Environment Variables** (PENTING!):
   - Buka **Site settings** → **Build & deploy** → **Environment variables**
   - Klik **Add a variable**
   - **Key**: `VITE_API_URL`
   - **Value**: URL backend Railway Anda (contoh: `https://cashflow-backend.up.railway.app`)
   - **⚠️ PENTING**: 
     - Jangan ada trailing slash (`/`) di akhir
     - Harus pakai `https://`, bukan `http://`
   - **Scope**: Pilih **All scopes**
   - Klik **Save**

4. **Deploy**: Netlify akan otomatis build dan deploy setiap kali Anda push ke GitHub

5. **Rebuild dengan Clear Cache** (setelah set environment variable):
   - Buka tab **Deploys**
   - Klik **Trigger deploy** → **Clear cache and deploy site**
   - Tunggu build selesai

### 4. Verifikasi Deployment

1. **Test Backend:**
   ```bash
   curl https://your-backend.railway.app/health
   ```
   Harus return: `{"ok":true,"timestamp":...}`

2. **Test Frontend:**
   - Buka URL Netlify Anda
   - Buka Developer Tools (F12) → Console
   - Cek apakah ada log: `🔗 Fetching from: [URL]`
   - Tidak ada error di Console

3. **Test WebSocket:**
   - Buka aplikasi di 2 tab browser berbeda
   - Di tab pertama, tambah/edit/hapus transaksi
   - Di tab kedua, data seharusnya auto-update tanpa refresh
   - Lihat panduan lengkap: [WEBSOCKET_FIX.md](./WEBSOCKET_FIX.md)

## 🔧 Konfigurasi Tambahan

### Netlify Configuration

File `netlify.toml` sudah dikonfigurasi dengan benar:

```toml
[build]
  base = "client"
  publish = "dist"
  command = "npm install && npm run build"

[build.environment]
  NODE_VERSION = "18"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

### Railway Configuration

- **Build Command**: `npm install` (hanya install dependencies backend)
- **Start Command**: `npm start` (menjalankan server.js)
- **Volume**: Mount path `/app/data` untuk persistent database

## ⚠️ Troubleshooting

### Masalah Umum

1. **Frontend tidak bisa connect ke backend:**
   - Pastikan `VITE_API_URL` sudah di-set di Netlify
   - Pastikan URL backend benar (tanpa trailing slash)
   - Rebuild dengan "Clear cache and deploy site"

2. **WebSocket tidak auto-update:**
   - Lihat panduan: [WEBSOCKET_FIX.md](./WEBSOCKET_FIX.md)
   - Pastikan `VITE_API_URL` sudah di-set dengan benar

3. **Database hilang setelah restart:**
   - Pastikan Volume sudah di-setup di Railway
   - Mount path harus: `/app/data`

4. **Build error di Netlify:**
   - Pastikan `netlify.toml` sudah benar
   - Pastikan base directory adalah `client`

### Dokumentasi Troubleshooting

- 📘 [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) - Panduan troubleshooting lengkap
- 🌐 [NETLIFY_FIX.md](./NETLIFY_FIX.md) - Fix masalah di Netlify
- 🔌 [WEBSOCKET_FIX.md](./WEBSOCKET_FIX.md) - Fix WebSocket auto-update

## 📝 Checklist Deployment

Sebelum deploy, pastikan:

- [ ] Repository sudah di-push ke GitHub
- [ ] Backend sudah di-deploy ke Railway
- [ ] Volume sudah di-setup di Railway (mount path: `/app/data`)
- [ ] Frontend sudah di-deploy ke Netlify
- [ ] Environment variable `VITE_API_URL` sudah di-set di Netlify
- [ ] Sudah rebuild dengan "Clear cache and deploy site"
- [ ] Test backend: `/health` endpoint return JSON
- [ ] Test frontend: aplikasi bisa load data
- [ ] Test WebSocket: auto-update bekerja di 2 tab berbeda

## 🔗 Link Dokumentasi Terkait

- [RAILWAY_SETUP.md](./RAILWAY_SETUP.md) - Setup backend di Railway
- [NETLIFY_FIX.md](./NETLIFY_FIX.md) - Fix masalah di Netlify
- [WEBSOCKET_FIX.md](./WEBSOCKET_FIX.md) - Fix WebSocket auto-update
- [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) - Troubleshooting guide

## 💡 Tips

1. **Environment Variables**: Selalu gunakan `https://` untuk production, jangan `http://`
2. **Trailing Slash**: Jangan ada trailing slash di akhir URL `VITE_API_URL`
3. **Clear Cache**: Setelah set environment variable, selalu rebuild dengan "Clear cache and deploy site"
4. **Monitoring**: Monitor logs di Railway dan Netlify untuk mendeteksi error lebih cepat
5. **Backup**: Lakukan backup berkala untuk database di folder `data/`
