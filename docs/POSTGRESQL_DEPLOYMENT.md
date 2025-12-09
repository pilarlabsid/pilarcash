# Panduan Deploy PostgreSQL untuk Prava Cash

Aplikasi Prava Cash menggunakan **PostgreSQL** sebagai database. Dokumen ini menjelaskan berbagai opsi untuk deploy PostgreSQL di production.

## 🎯 Opsi Deploy PostgreSQL

### 1. Railway PostgreSQL (Recommended) ⭐

**Railway** menyediakan managed PostgreSQL database yang mudah di-setup dan terintegrasi dengan Railway backend.

#### Keuntungan:
- ✅ Terintegrasi langsung dengan Railway backend
- ✅ Auto-backup dan monitoring
- ✅ Free tier tersedia (dengan limit)
- ✅ Mudah di-setup (1 klik)
- ✅ SSL connection otomatis

#### Setup:

1. **Buat PostgreSQL Database di Railway:**
   - Login ke [Railway.app](https://railway.app)
   - Di project Anda, klik **"New"** → **"Database"** → **"Add PostgreSQL"**
   - Railway akan otomatis membuat database PostgreSQL

2. **Copy Connection String:**
   - Klik database yang baru dibuat
   - Di tab **"Variables"**, copy value dari `DATABASE_URL`
   - Format: `postgresql://postgres:password@host:port/railway`

3. **Set Environment Variable di Backend Service:**
   - Buka backend service di Railway
   - Klik tab **"Variables"**
   - Tambahkan variable:
     - **Key**: `DATABASE_URL`
     - **Value**: (paste connection string dari step 2)
   - Atau gunakan format terpisah:
     - `DB_HOST`: host dari connection string
     - `DB_USER`: user (biasanya `postgres`)
     - `DB_PASSWORD`: password dari connection string
     - `DB_NAME`: nama database (biasanya `railway`)
     - `DB_PORT`: port (biasanya `5432`)

4. **Redeploy Backend:**
   - Railway akan otomatis redeploy setelah set environment variable
   - Atau klik **"Redeploy"** manual

#### Pricing:
- **Free Tier**: $5 credit/bulan (cukup untuk development)
- **Pro**: Mulai dari $20/bulan

---

### 2. Supabase (Recommended untuk Free Tier) ⭐

**Supabase** menyediakan managed PostgreSQL dengan free tier yang generous.

#### Keuntungan:
- ✅ Free tier: 500MB database, unlimited API requests
- ✅ Auto-backup harian
- ✅ Dashboard admin yang bagus
- ✅ Built-in authentication (optional)
- ✅ Real-time subscriptions (optional)

#### Setup:

1. **Buat Project di Supabase:**
   - Login ke [Supabase](https://supabase.com)
   - Klik **"New Project"**
   - Isi:
     - **Name**: `pravacash` (atau nama lain)
     - **Database Password**: (buat password kuat)
     - **Region**: Pilih yang terdekat (Singapore untuk Indonesia)
   - Klik **"Create new project"**
   - Tunggu setup selesai (~2 menit)

2. **Copy Connection String:**
   - Di project dashboard, klik **"Settings"** → **"Database"**
   - Scroll ke bagian **"Connection string"**
   - Pilih tab **"URI"**
   - Copy connection string
   - Format: `postgresql://postgres:[YOUR-PASSWORD]@db.xxx.supabase.co:5432/postgres`

3. **Set Environment Variable di Railway:**
   - Buka backend service di Railway
   - Tambahkan variable:
     - **Key**: `DATABASE_URL`
     - **Value**: (paste connection string dari Supabase, ganti `[YOUR-PASSWORD]` dengan password yang Anda buat)

4. **Redeploy Backend**

#### Pricing:
- **Free Tier**: 500MB database, 2GB bandwidth/bulan
- **Pro**: Mulai dari $25/bulan

---

### 3. Neon (Serverless PostgreSQL)

**Neon** adalah serverless PostgreSQL yang modern dengan auto-scaling.

#### Keuntungan:
- ✅ Serverless (auto-scale)
- ✅ Free tier: 0.5GB storage
- ✅ Branching database (seperti Git)
- ✅ Auto-suspend saat tidak digunakan (hemat resource)

#### Setup:

1. **Buat Project di Neon:**
   - Login ke [Neon](https://neon.tech)
   - Klik **"Create Project"**
   - Isi:
     - **Name**: `pravacash`
     - **Region**: Pilih yang terdekat
   - Klik **"Create Project"**

2. **Copy Connection String:**
   - Di dashboard, copy **"Connection string"**
   - Format: `postgresql://user:password@ep-xxx.region.aws.neon.tech/neondb?sslmode=require`

3. **Set Environment Variable di Railway:**
   - Tambahkan `DATABASE_URL` dengan connection string dari Neon

4. **Redeploy Backend**

#### Pricing:
- **Free Tier**: 0.5GB storage, 1 branch
- **Launch**: Mulai dari $19/bulan

---

### 4. Self-Hosted PostgreSQL

Jika Anda memiliki VPS atau server sendiri, bisa install PostgreSQL manual.

#### Setup:

1. **Install PostgreSQL di Server:**
   ```bash
   # Ubuntu/Debian
   sudo apt-get update
   sudo apt-get install postgresql postgresql-contrib
   
   # macOS
   brew install postgresql
   ```

2. **Buat Database:**
   ```bash
   sudo -u postgres psql
   CREATE DATABASE pravacash;
   CREATE USER pravauser WITH PASSWORD 'your-strong-password';
   GRANT ALL PRIVILEGES ON DATABASE pravacash TO pravauser;
   \q
   ```

3. **Set Environment Variable:**
   - Di Railway backend service, set:
     - `DB_HOST`: IP atau domain server Anda
     - `DB_USER`: `pravauser`
     - `DB_PASSWORD`: `your-strong-password`
     - `DB_NAME`: `pravacash`
     - `DB_PORT`: `5432`
   - Atau gunakan `DATABASE_URL`: `postgresql://pravauser:password@your-server-ip:5432/pravacash`

4. **Buka Firewall:**
   - Pastikan port 5432 terbuka di firewall server
   - Untuk keamanan, batasi akses hanya dari Railway IP

---

## 🔧 Konfigurasi Environment Variables

### Format DATABASE_URL (Recommended)

```bash
DATABASE_URL=postgresql://user:password@host:port/database
```

Contoh:
```bash
# Railway PostgreSQL
DATABASE_URL=postgresql://postgres:abc123@containers-us-west-123.railway.app:5432/railway

# Supabase
DATABASE_URL=postgresql://postgres:password@db.xxx.supabase.co:5432/postgres

# Neon
DATABASE_URL=postgresql://user:password@ep-xxx.region.aws.neon.tech/neondb?sslmode=require
```

### Format Terpisah (Alternative)

Jika tidak menggunakan `DATABASE_URL`, bisa gunakan format terpisah:

```bash
DB_HOST=hostname
DB_USER=postgres
DB_PASSWORD=password
DB_NAME=database_name
DB_PORT=5432
```

Aplikasi akan otomatis menggunakan `DATABASE_URL` jika tersedia, atau fallback ke format terpisah.

---

## ✅ Verifikasi Koneksi

Setelah set environment variable, verifikasi koneksi:

1. **Cek Logs di Railway:**
   - Buka backend service → **"Deploy Logs"**
   - Harus ada log: `Connected to PostgreSQL database`
   - Harus ada log: `Database schema initialized`

2. **Test Health Endpoint:**
   ```bash
   curl https://your-backend.railway.app/health
   ```
   Harus return: `{"ok":true,"timestamp":...}`

3. **Test API:**
   - Coba register user baru
   - Coba login
   - Jika berhasil, database sudah terhubung dengan benar

---

## 🔒 Keamanan

### Best Practices:

1. **Gunakan SSL Connection:**
   - Semua managed database (Railway, Supabase, Neon) sudah menggunakan SSL
   - Untuk self-hosted, pastikan SSL enabled

2. **Jangan Commit Connection String:**
   - Jangan commit `.env` ke Git
   - Gunakan environment variables di Railway

3. **Gunakan Password Kuat:**
   - Minimal 16 karakter
   - Kombinasi huruf, angka, simbol

4. **Limit Database Access:**
   - Untuk self-hosted, batasi akses hanya dari Railway IP
   - Gunakan firewall rules

---

## 📊 Perbandingan Opsi

| Opsi | Free Tier | Setup | Best For |
|------|-----------|-------|----------|
| **Railway PostgreSQL** | $5 credit/bulan | ⭐⭐⭐⭐⭐ Sangat mudah | Railway users |
| **Supabase** | 500MB, unlimited API | ⭐⭐⭐⭐ Mudah | Free tier, dashboard bagus |
| **Neon** | 0.5GB, serverless | ⭐⭐⭐⭐ Mudah | Auto-scaling, modern |
| **Self-Hosted** | Unlimited | ⭐⭐ Manual | Full control, VPS owners |

---

## 🚨 Troubleshooting

### Error: "Database tidak ditemukan"

**Penyebab:** Database belum dibuat atau connection string salah.

**Solusi:**
1. Pastikan database sudah dibuat di provider
2. Pastikan `DATABASE_URL` atau `DB_*` variables sudah di-set di Railway
3. Cek connection string format (harus valid PostgreSQL URI)

### Error: "Gagal autentikasi ke PostgreSQL"

**Penyebab:** Username atau password salah.

**Solusi:**
1. Pastikan password di connection string benar
2. Untuk Supabase/Neon, pastikan password yang digunakan adalah yang Anda buat saat setup
3. Cek apakah user memiliki permission untuk database

### Error: "Tidak bisa connect ke PostgreSQL"

**Penyebab:** Host tidak bisa diakses atau firewall block.

**Solusi:**
1. Pastikan host/domain benar
2. Untuk self-hosted, pastikan port 5432 terbuka di firewall
3. Cek apakah database provider masih aktif (untuk managed services)

### Database Schema Tidak Terbuat

**Penyebab:** Aplikasi belum dijalankan atau ada error saat init.

**Solusi:**
1. Cek logs di Railway untuk error saat init
2. Pastikan aplikasi sudah di-deploy dan running
3. Schema akan otomatis dibuat saat pertama kali aplikasi connect ke database

---

## 📝 Checklist Deployment PostgreSQL

Sebelum deploy, pastikan:

- [ ] PostgreSQL database sudah dibuat (Railway/Supabase/Neon/self-hosted)
- [ ] Connection string sudah di-copy
- [ ] Environment variable `DATABASE_URL` sudah di-set di Railway backend service
- [ ] Backend sudah di-redeploy setelah set environment variable
- [ ] Logs menunjukkan "Connected to PostgreSQL database"
- [ ] Health endpoint return `{"ok":true}`
- [ ] Bisa register dan login user baru (test database connection)

---

## 🔗 Link Dokumentasi Terkait

- [DEPLOYMENT.md](./DEPLOYMENT.md) - Panduan deployment umum
- [RAILWAY_SETUP.md](./RAILWAY_SETUP.md) - Setup backend di Railway
- [README.md](../README.md) - Dokumentasi utama

---

## 💡 Tips

1. **Untuk Development:** Gunakan Railway PostgreSQL atau Supabase (free tier cukup)
2. **Untuk Production:** Pertimbangkan upgrade ke paid plan untuk backup dan monitoring yang lebih baik
3. **Backup:** Semua managed services (Railway, Supabase, Neon) sudah include auto-backup
4. **Monitoring:** Gunakan dashboard provider untuk monitor database usage dan performance

