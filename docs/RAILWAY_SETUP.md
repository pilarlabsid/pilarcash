# Panduan Setup Railway untuk Backend

## ⚠️ PENTING: Hanya Deploy Backend di Railway

**Frontend akan di-deploy ke Netlify**, jadi di Railway kita **TIDAK perlu build client**.

## Settingan Railway untuk Backend

### Build Command:
```
npm install
```

**JANGAN gunakan:**
- ❌ `npm run build` (akan build client yang tidak diperlukan)
- ❌ `cd client && npm install && npm run build` (tidak diperlukan)

### Start Command:
```
npm start
```

### Root Directory:
*(kosongkan - biarkan default)*

## Konfigurasi Lengkap

| Field | Value | Keterangan |
|-------|-------|------------|
| **Service Type** | `Web Service` | Untuk backend API |
| **Build Command** | `npm install` | Hanya install dependencies backend |
| **Start Command** | `npm start` | Menjalankan server.js |
| **Root Directory** | *(kosongkan)* | Default root project |
| **Healthcheck Path** | `/health` | Optional, untuk monitoring |

## Environment Variables (Opsional)

| Key | Value | Keterangan |
|-----|-------|------------|
| `NODE_ENV` | `production` | Environment mode |
| `PORT` | *(kosongkan)* | Railway akan set otomatis |

## Volume/Persistent Storage

⚠️ **PENTING**: Tambahkan volume untuk folder `data/` agar database tidak hilang:

1. Di Railway dashboard, buka service Anda
2. Klik tab **"Volumes"**
3. Klik **"Add Volume"**
4. Isi:
   - **Mount Path**: `/app/data`
   - **Size**: `1 GB` (cukup untuk database kecil)
5. Save

## Catatan

- ✅ Backend di Railway: https://cashflow-backend-production-85bc.up.railway.app
- ✅ Frontend di Netlify: Deploy terpisah dengan build command `npm install && npm run build` di folder `client`
- ✅ Server.js sudah handle jika `client/dist` tidak ada (akan tampilkan pesan, tapi API tetap berfungsi)
- ✅ API endpoints tetap berfungsi meski frontend tidak di-build di Railway

## Troubleshooting

### Error "vite: not found"
- Pastikan Build Command adalah `npm install` saja, BUKAN `npm run build`
- Railway hanya perlu install dependencies backend, tidak perlu build frontend

### Database hilang setelah restart
- Pastikan volume sudah di-setup dengan mount path `/app/data`
- Cek di Railway dashboard → Volumes

