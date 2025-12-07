# Fix Masalah di Netlify

## Masalah: Error "Unexpected token '<', "<!doctype "... is not valid JSON"

Ini terjadi karena frontend di Netlify tidak bisa connect ke backend Railway.

## Solusi Step-by-Step:

### 1. Set Environment Variable di Netlify

1. **Buka Netlify Dashboard:**
   - Login ke https://app.netlify.com
   - Pilih site Anda (prava-cash atau nama site Anda)

2. **Buka Environment Variables:**
   - Klik **Site settings** (di menu atas)
   - Scroll ke **Build & deploy**
   - Klik **Environment variables**
   - Klik **Add a variable**

3. **Tambahkan Variable:**
   - **Key**: `VITE_API_URL`
   - **Value**: `https://cashflow-production-c222.up.railway.app`
   - **⚠️ PENTING**: 
     - Jangan ada spasi di awal/akhir
     - Jangan ada trailing slash (`/`) di akhir
     - Harus pakai `https://`, bukan `http://`
   - **Scope**: Pilih **All scopes** (Production, Deploy previews, Branch deploys)
   - Klik **Save**

### 2. Rebuild dengan Clear Cache

Setelah set environment variable, **WAJIB rebuild**:

1. Di Netlify Dashboard, buka tab **Deploys**
2. Klik **Trigger deploy** (tombol di kanan atas)
3. Pilih **Clear cache and deploy site**
4. Tunggu build selesai (sekitar 2-5 menit)

### 3. Verifikasi Environment Variable

Setelah rebuild, cek apakah variable ter-load:

1. Buka **Deploy Logs** (bukan Build Logs)
2. Cari di log: `VITE_API_URL`
3. Atau buka browser console di aplikasi Netlify
4. Jalankan di console:
   ```javascript
   console.log('API URL:', import.meta.env.VITE_API_URL);
   ```
5. Harus menampilkan: `https://cashflow-production-c222.up.railway.app`

### 4. Test Aplikasi

1. Buka URL Netlify Anda (contoh: `https://prava-cash.netlify.app`)
2. Buka **Developer Tools** (F12)
3. Tab **Console** - seharusnya tidak ada error
4. Tab **Network** - filter `XHR` atau `Fetch`
5. Cek request ke `/api/transactions`:
   - **Request URL**: Harus `https://cashflow-production-c222.up.railway.app/api/transactions`
   - **Status**: Harus `200 OK`
   - **Response**: Harus JSON, bukan HTML

## Troubleshooting

### Masalah: Environment variable tidak ter-load

**Solusi:**
- Pastikan rebuild setelah set variable
- Pastikan scope variable adalah "All scopes"
- Cek di Deploy Logs apakah variable ter-load

### Masalah: Masih dapat HTML bukan JSON

**Solusi:**
- Pastikan URL backend benar (test di browser: https://cashflow-production-c222.up.railway.app/api/transactions)
- Pastikan tidak ada trailing slash di VITE_API_URL
- Clear cache browser dan coba lagi

### Masalah: CORS Error

**Solusi:**
- Backend sudah dikonfigurasi untuk semua origin
- Pastikan URL backend benar
- Cek Network tab untuk melihat error detail

### Masalah: 404 Not Found

**Solusi:**
- Pastikan URL backend benar
- Test backend langsung: https://cashflow-production-c222.up.railway.app/health
- Pastikan backend masih "Active" di Railway

## Checklist

Sebelum deploy, pastikan:
- [ ] Environment variable `VITE_API_URL` sudah di-set di Netlify
- [ ] Value URL benar (tanpa trailing slash)
- [ ] Sudah rebuild dengan "Clear cache and deploy site"
- [ ] Backend Railway masih "Active"
- [ ] Test backend langsung di browser (harus return JSON)

## Format URL yang Benar

✅ **Benar:**
```
https://cashflow-production-c222.up.railway.app
```

❌ **Salah:**
```
https://cashflow-production-c222.up.railway.app/  (ada trailing slash)
http://cashflow-production-c222.up.railway.app  (pakai http)
cashflow-production-c222.up.railway.app  (tanpa https://)
```

## Quick Test

Setelah fix, test dengan:
1. Buka aplikasi Netlify
2. Buka Console (F12)
3. Harus ada log: `🔗 Fetching from: https://cashflow-production-c222.up.railway.app/api/transactions`
4. Tidak ada error "Unexpected token '<'"

Jika masih error, cek Network tab untuk melihat request detail.

