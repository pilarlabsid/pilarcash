# Panduan Setup Admin

Panduan untuk membuat akun admin pertama di Prava Cash.

## 📋 Cara Membuat Admin

Ada 3 cara untuk membuat admin:

### 1. Menggunakan Script CLI (Paling Mudah) ⭐

Jalankan script berikut di terminal:

```bash
node create-admin.js
```

Script akan meminta input:
- Email
- Password (minimal 6 karakter)
- Nama

**Atau langsung dengan parameter:**

```bash
node create-admin.js admin@example.com password123 "Admin User"
```

**Contoh:**
```bash
node create-admin.js admin@pravacash.com admin123 "Administrator"
```

### 2. Menggunakan API Endpoint

Jika belum ada admin, Anda bisa membuat admin pertama melalui API:

```bash
curl -X POST http://localhost:4000/api/admin/create-first \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com",
    "password": "password123",
    "name": "Admin User"
  }'
```

**Catatan:** Endpoint ini hanya bisa digunakan jika **belum ada admin** di sistem.

### 3. Manual via Database (Advanced)

Jika Anda ingin mengubah user yang sudah ada menjadi admin:

```sql
-- Cek user yang ada
SELECT id, email, name, role FROM users;

-- Update role menjadi admin
UPDATE users SET role = 'admin' WHERE email = 'user@example.com';
```

Atau menggunakan psql:

```bash
psql -U postgres -d pravacash -c "UPDATE users SET role = 'admin' WHERE email = 'user@example.com';"
```

## 🔐 Cara Login sebagai Admin

1. **Buka aplikasi** di browser
2. **Login** dengan email dan password admin yang sudah dibuat
3. **Tombol "Admin"** akan muncul di header (desktop dan mobile)
4. **Klik tombol "Admin"** untuk membuka halaman admin

## ✅ Verifikasi Admin

Setelah login, Anda bisa verifikasi bahwa Anda adalah admin dengan:

1. **Cek tombol Admin** - Harus muncul di header
2. **Buka halaman Admin** - Harus bisa akses semua tab (Dashboard, Users, Transactions)
3. **Cek role di database:**
   ```sql
   SELECT email, name, role FROM users WHERE role = 'admin';
   ```

## 🛠️ Fitur Admin

Setelah login sebagai admin, Anda bisa:

1. **Dashboard Admin:**
   - Lihat statistik keseluruhan (total users, transactions, income, expense, balance)

2. **Manage Users:**
   - Lihat semua users
   - Edit user (nama, email, role)
   - Hapus user (kecuali diri sendiri)

3. **Lihat Semua Transaksi:**
   - Lihat transaksi dari semua users
   - Filter dan analisis data

## ⚠️ Catatan Penting

- **Hanya admin yang bisa akses halaman admin**
- **Admin tidak bisa menghapus dirinya sendiri**
- **Setidaknya harus ada 1 admin di sistem**
- **Password admin harus minimal 6 karakter**

## 🔄 Membuat Admin Tambahan

Setelah ada admin pertama, admin lain bisa membuat admin baru melalui:

1. **Halaman Admin → Tab Users**
2. **Klik "Edit" pada user yang ingin dijadikan admin**
3. **Ubah Role menjadi "Admin"**
4. **Klik "Simpan"**

Atau menggunakan API (dengan token admin):

```bash
curl -X PUT http://localhost:4000/api/admin/users/{user_id} \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "role": "admin"
  }'
```

## 🆘 Troubleshooting

### Admin tidak muncul setelah login

1. **Cek role di database:**
   ```sql
   SELECT email, role FROM users WHERE email = 'your-email@example.com';
   ```
   Pastikan `role = 'admin'`

2. **Logout dan login kembali** untuk refresh token

3. **Clear browser cache** dan coba lagi

### Script create-admin.js error

1. **Pastikan database sudah running:**
   ```bash
   psql -U postgres -d pravacash -c "SELECT NOW();"
   ```

2. **Pastikan .env sudah dikonfigurasi dengan benar**

3. **Cek koneksi database di src/db.config.js**

### Endpoint /api/admin/create-first tidak bisa digunakan

- Endpoint ini **hanya bisa digunakan jika belum ada admin**
- Jika sudah ada admin, gunakan halaman admin atau API dengan token admin
