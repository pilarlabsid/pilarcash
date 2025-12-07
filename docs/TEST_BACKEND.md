# Cara Test Backend yang Sudah Deploy

## ✅ Backend Sudah Berjalan!

URL Backend: `https://cashflow-production-c222.up.railway.app`

### 1. Test Backend Langsung

#### Test Health Endpoint:
```bash
curl https://cashflow-production-c222.up.railway.app/health
```

**Expected Response:**
```json
{"ok":true,"timestamp":1765043792039}
```

#### Test API Endpoint:
```bash
curl https://cashflow-production-c222.up.railway.app/api/transactions
```

**Expected Response:**
```json
[]
```

#### Test di Browser:
Buka langsung di browser:
- Health: https://cashflow-production-c222.up.railway.app/health
- API: https://cashflow-production-c222.up.railway.app/api/transactions

### 2. Jalankan Frontend Lokal dengan Backend Railway

#### Opsi 1: Menggunakan Environment Variable (Recommended)

1. **Buat file `.env.local` di folder `client/`:**
   ```bash
   cd client
   echo "VITE_API_URL=https://cashflow-production-c222.up.railway.app" > .env.local
   ```

2. **Jalankan frontend:**
   ```bash
   npm run dev
   ```

3. **Buka browser:** http://localhost:6001

Frontend akan otomatis connect ke backend Railway!

#### Opsi 2: Set Environment Variable Saat Run

```bash
cd client
VITE_API_URL=https://cashflow-production-c222.up.railway.app npm run dev
```

### 3. Test API dengan Postman/Insomnia

#### GET All Transactions:
```
GET https://cashflow-production-c222.up.railway.app/api/transactions
```

#### POST New Transaction:
```
POST https://cashflow-production-c222.up.railway.app/api/transactions
Content-Type: application/json

{
  "description": "Test Transaction",
  "type": "income",
  "amount": 100000,
  "date": "2025-12-07"
}
```

#### DELETE Transaction:
```
DELETE https://cashflow-production-c222.up.railway.app/api/transactions/:id
```

### 4. Cek Logs di Railway

1. Buka Railway Dashboard
2. Pilih service `cashflow`
3. Tab **Deploy Logs** untuk melihat real-time logs
4. Tab **Metrics** untuk melihat usage

### 5. Troubleshooting

#### Backend tidak merespons:
- Cek status di Railway dashboard (harus "Active")
- Free tier akan sleep setelah 15 menit tidak aktif
- Request pertama setelah sleep butuh ~30-50 detik

#### CORS Error:
- Backend sudah dikonfigurasi untuk menerima semua origin
- Pastikan URL backend benar

#### Connection Timeout:
- Pastikan backend sudah "Active" di Railway
- Cek apakah URL benar (https, bukan http)

## Status Backend Saat Ini

✅ **Health Endpoint**: OK  
✅ **API Endpoint**: OK  
✅ **WebSocket**: Enabled  
✅ **Database**: SQLite (persistent dengan volume)

Backend siap digunakan! 🚀

