# Fix WebSocket Auto-Update di Netlify + Railway

## Masalah: Frontend di Netlify tidak auto-update ketika ada perubahan data

Ini terjadi karena WebSocket tidak terhubung dengan benar antara frontend (Netlify) dan backend (Railway).

**Catatan Penting:** Aplikasi sudah dikonfigurasi untuk menggunakan **polling** di production (bukan WebSocket) karena Netlify dan Railway tidak support WebSocket dengan baik. Error WebSocket di console adalah normal dan tidak perlu dikhawatirkan - aplikasi akan otomatis menggunakan polling yang tetap memberikan real-time update.

## Solusi Step-by-Step:

### 1. Pastikan Environment Variable di Netlify Sudah Di-Set

1. **Buka Netlify Dashboard:**
   - Login ke https://app.netlify.com
   - Pilih site Anda

2. **Buka Environment Variables:**
   - Klik **Site settings** → **Build & deploy** → **Environment variables**
   - Pastikan ada variable:
     - **Key**: `VITE_API_URL`
     - **Value**: URL backend Railway Anda (contoh: `https://cashflow-production-c222.up.railway.app`)
     - **⚠️ PENTING**: 
       - Jangan ada trailing slash (`/`) di akhir
       - Harus pakai `https://`, bukan `http://`
     - **Scope**: Pilih **All scopes**

3. **Rebuild dengan Clear Cache:**
   - Buka tab **Deploys**
   - Klik **Trigger deploy** → **Clear cache and deploy site**
   - Tunggu build selesai

### 2. Verifikasi WebSocket Connection

Setelah rebuild, cek apakah WebSocket terhubung:

1. **Buka aplikasi di Netlify** (contoh: `https://pilar-cash.netlify.app`)

2. **Buka Developer Tools** (F12)

3. **Tab Console** - Cari log berikut:
   - `✅ Socket connected: [socket-id]` - Berarti Socket.IO berhasil connect
   - `📡 Transport: polling` - Di production, akan selalu menggunakan polling (ini normal!)
   - **Error WebSocket di console adalah normal** - Aplikasi sudah dikonfigurasi untuk force polling di production, jadi error WebSocket bisa diabaikan

4. **Tab Network** - Filter `WS` (WebSocket) atau `Fetch`:
   - Harus ada request ke `/socket.io/` dengan status `101 Switching Protocols` (untuk WebSocket)
   - Atau request polling ke `/socket.io/?EIO=...` dengan status `200 OK`

### 3. Test Auto-Update

1. **Buka aplikasi di 2 tab browser berbeda** (atau 2 device berbeda)

2. **Di tab pertama**, tambah/edit/hapus transaksi

3. **Di tab kedua**, seharusnya data **otomatis update** tanpa perlu refresh

4. **Jika tidak auto-update**, cek Console di tab kedua:
   - Harus ada log: `📨 Received transactions update via WebSocket`
   - Jika tidak ada, berarti WebSocket tidak menerima broadcast dari server

### 4. Troubleshooting

#### Masalah: WebSocket tidak connect

**Gejala:**
- Console menunjukkan `❌ WebSocket connection error`
- Tidak ada log `✅ WebSocket connected`

**Solusi:**
1. Pastikan `VITE_API_URL` sudah di-set dengan benar di Netlify
2. Pastikan URL backend benar (test: `https://your-backend.railway.app/health`)
3. Pastikan backend Railway masih "Active"
4. Cek Network tab untuk melihat error detail
5. Clear cache browser dan coba lagi

#### Masalah: WebSocket connect tapi tidak auto-update

**Gejala:**
- Console menunjukkan `✅ WebSocket connected`
- Tapi data tidak auto-update ketika ada perubahan

**Solusi:**
1. Cek apakah backend mengirim broadcast:
   - Buka Railway logs
   - Ketika ada perubahan data, harus ada log: `✅ Client connected: [socket-id]`
2. Cek apakah frontend menerima event:
   - Di Console, harus ada log: `📨 Received transactions update via WebSocket`
3. Pastikan tidak ada error di Console

#### Masalah: Error WebSocket di Console

**Gejala:**
- Console menunjukkan error: `WebSocket connection to 'wss://...' failed`
- Error ini muncul berulang kali

**Ini NORMAL dan TIDAK MASALAH!**
- Aplikasi sudah dikonfigurasi untuk **force polling** di production
- Error WebSocket muncul karena Socket.IO mencoba upgrade ke WebSocket, tapi gagal (normal untuk Netlify/Railway)
- Aplikasi akan tetap menggunakan polling yang memberikan real-time update
- Error ini bisa diabaikan - tidak mempengaruhi fungsi aplikasi
- Untuk menghilangkan error, aplikasi sudah dikonfigurasi untuk tidak mencoba WebSocket di production

**Verifikasi:**
- Cek log: `✅ Socket connected: [socket-id]` - Berarti koneksi berhasil
- Cek log: `📡 Transport: polling` - Berarti menggunakan polling (benar untuk production)
- Test auto-update: Buka 2 tab, ubah data di tab 1, tab 2 harus auto-update

### 5. Format URL yang Benar

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

### 6. Quick Test Checklist

Setelah fix, test dengan:

- [ ] Environment variable `VITE_API_URL` sudah di-set di Netlify
- [ ] Sudah rebuild dengan "Clear cache and deploy site"
- [ ] Console menunjukkan `✅ WebSocket connected`
- [ ] Network tab menunjukkan koneksi ke `/socket.io/`
- [ ] Test auto-update: buka 2 tab, ubah data di tab 1, tab 2 auto-update
- [ ] Tidak ada error di Console

### 7. Catatan Penting

1. **Netlify tidak support WebSocket native**, jadi Socket.IO akan menggunakan polling sebagai fallback. Ini normal dan tidak masalah.

2. **Polling juga memberikan real-time update**, hanya sedikit lebih lambat dari WebSocket.

3. **Auto-update tetap bekerja dengan polling**, jadi aplikasi Anda akan tetap auto-update meskipun menggunakan polling.

4. **Jika ingin WebSocket murni**, pertimbangkan untuk:
   - Deploy frontend ke platform yang support WebSocket (seperti Vercel, atau self-hosted)
   - Atau gunakan service seperti Pusher, Ably, atau Firebase Realtime Database

### 8. Debug Commands

Di browser console, jalankan untuk debug:

```javascript
// Cek environment variable
console.log('API URL:', import.meta.env.VITE_API_URL);

// Cek Socket.IO connection status
// (jika socket tersedia di window)
if (window.socket) {
  console.log('Socket connected:', window.socket.connected);
  console.log('Socket ID:', window.socket.id);
}
```

## Jika Masih Bermasalah

1. **Cek Railway Logs:**
   - Buka Railway dashboard
   - Cek logs untuk melihat apakah ada error
   - Pastikan server berjalan dengan baik

2. **Cek Netlify Logs:**
   - Buka Netlify dashboard
   - Cek Deploy Logs untuk melihat apakah build berhasil
   - Pastikan environment variable ter-load

3. **Test Backend Langsung:**
   ```bash
   curl https://your-backend.railway.app/health
   ```
   Harus return: `{"ok":true,"timestamp":...}`

4. **Test WebSocket Connection:**
   - Buka browser console
   - Cek Network tab untuk melihat request ke `/socket.io/`
   - Pastikan tidak ada CORS error atau 404 error

