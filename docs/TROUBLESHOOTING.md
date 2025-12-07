# Troubleshooting Guide

## Error: "Unexpected token '<', "<!doctype "... is not valid JSON"

### Penyebab:
Error ini terjadi ketika frontend mencoba mengakses API, tapi malah mendapat HTML (biasanya halaman error atau index.html).

### Solusi:

#### 1. Pastikan Environment Variable di Netlify sudah di-set

1. Buka Netlify Dashboard
2. Pilih site Anda
3. Buka **Site settings** → **Environment variables**
4. Pastikan ada variable:
   - **Key**: `VITE_API_URL`
   - **Value**: URL backend Railway Anda (contoh: `https://cashflow-backend-production-85bc.up.railway.app`)
   - **⚠️ PENTING**: Jangan ada trailing slash di akhir URL!

#### 2. Rebuild di Netlify

Setelah set environment variable:
1. Buka tab **Deploys**
2. Klik **Trigger deploy** → **Clear cache and deploy site**
3. Tunggu build selesai

#### 3. Cek URL Backend

Pastikan URL backend benar dan bisa diakses:
```bash
curl https://cashflow-backend-production-85bc.up.railway.app/health
```

Harus return: `{"ok":true,"timestamp":...}`

#### 4. Cek Console Browser

Buka Developer Tools (F12) → Console, cari log:
- `🔗 Fetching from: [URL]` - ini menunjukkan URL yang digunakan
- Jika URL salah, berarti environment variable tidak ter-load

### Format URL yang Benar:

✅ **Benar:**
```
https://cashflow-backend-production-85bc.up.railway.app
```

❌ **Salah:**
```
https://cashflow-backend-production-85bc.up.railway.app/  (ada trailing slash)
http://cashflow-backend-production-85bc.up.railway.app   (pakai http, bukan https)
```

## Error: "Failed to fetch" atau CORS Error

### Penyebab:
Backend tidak mengizinkan request dari domain Netlify.

### Solusi:
Backend sudah dikonfigurasi untuk menerima semua origin (`cors()`). Jika masih error:
1. Pastikan URL backend benar
2. Pastikan backend sudah running di Railway
3. Cek Network tab di browser untuk melihat request yang gagal

## Error: "API tidak merespons dengan benar"

### Penyebab:
Response dari server bukan JSON (biasanya HTML error page).

### Solusi:
1. Cek apakah backend URL benar di environment variable
2. Test backend langsung: buka `https://your-backend-url.railway.app/api/transactions`
3. Harus return JSON array, bukan HTML

## Database Hilang Setelah Restart

### Penyebab:
Volume/persistent storage belum di-setup di Railway.

### Solusi:
1. Buka Railway Dashboard → Service Anda
2. Tab **Volumes** → **Add Volume**
3. Mount Path: `/app/data`
4. Size: `1 GB`
5. Save dan redeploy

## Build Error di Netlify: "vite: not found"

### Penyebab:
Dependencies di folder `client` belum terinstall.

### Solusi:
Pastikan `netlify.toml` sudah benar:
```toml
[build]
  base = "client"
  command = "npm install && npm run build"
```

Netlify akan otomatis install dependencies di folder `client`.

## Tips Debugging

### 1. Cek Environment Variables
Di browser console, jalankan:
```javascript
console.log('API URL:', import.meta.env.VITE_API_URL);
```

### 2. Test API Langsung
Buka di browser atau curl:
```
https://your-backend-url.railway.app/api/transactions
```

Harus return JSON, bukan HTML.

### 3. Cek Network Tab
1. Buka Developer Tools (F12)
2. Tab **Network**
3. Filter: `XHR` atau `Fetch`
4. Lihat request ke `/api/transactions`
5. Cek:
   - **Request URL**: Apakah benar?
   - **Response**: Apakah JSON atau HTML?
   - **Status Code**: 200, 404, atau 500?

### 4. Cek Logs
- **Netlify**: Site settings → Build & deploy → Build logs
- **Railway**: Service → Deploy Logs

