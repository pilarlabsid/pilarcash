# Git Workflow - Prava Cash

Panduan workflow Git untuk development fitur baru tanpa mengganggu production.

## 🌿 Branch Strategy

### Branch Utama

- **`main`**: Branch untuk production (yang sudah di-deploy ke server)
  - ✅ **JANGAN** langsung commit ke branch ini
  - ✅ Hanya merge dari `develop` setelah testing
  - ✅ Setiap commit di `main` akan otomatis ter-deploy ke server

- **`develop`**: Branch untuk development fitur baru
  - ✅ Gunakan branch ini untuk development
  - ✅ Commit semua perubahan fitur baru di sini
  - ✅ Setelah selesai dan tested, merge ke `main`

### Branch Feature (Opsional)

Untuk fitur yang lebih besar, bisa buat branch feature dari `develop`:

```bash
# Buat branch feature baru
git checkout develop
git pull origin develop
git checkout -b feature/nama-fitur

# Development...
git add .
git commit -m "Add fitur baru"

# Setelah selesai, merge ke develop
git checkout develop
git merge feature/nama-fitur
git push origin develop
```

## 📋 Workflow Development

### 1. Mulai Development Fitur Baru

```bash
# Pastikan di branch develop
git checkout develop
git pull origin develop

# Mulai development...
# Edit file, tambah fitur, dll
```

### 2. Commit Perubahan

```bash
# Lihat perubahan
git status
git diff

# Tambahkan file yang diubah
git add .

# Commit dengan pesan yang jelas
git commit -m "Add: fitur baru untuk X"

# Push ke GitHub
git push origin develop
```

### 3. Merge ke Production (main)

**⚠️ PENTING**: Hanya lakukan setelah fitur sudah di-test dan siap untuk production!

```bash
# Pastikan semua perubahan sudah di-commit dan di-push
git checkout develop
git pull origin develop

# Switch ke main
git checkout main
git pull origin main

# Merge develop ke main
git merge develop

# Push ke GitHub (ini akan trigger deploy ke server)
git push origin main
```

### 4. Update develop setelah merge

```bash
# Kembali ke develop
git checkout develop

# Update develop dengan perubahan dari main
git merge main
git push origin develop
```

## 🔄 Skenario Umum

### Skenario 1: Development Fitur Baru

```bash
# 1. Pastikan di develop dan up-to-date
git checkout develop
git pull origin develop

# 2. Development fitur
# ... edit file ...

# 3. Commit dan push
git add .
git commit -m "Add: fitur baru"
git push origin develop

# 4. Test di local/development environment

# 5. Jika sudah siap, merge ke main
git checkout main
git pull origin main
git merge develop
git push origin main  # ← Ini akan deploy ke server
```

### Skenario 2: Fix Bug di Production

```bash
# 1. Buat branch hotfix dari main
git checkout main
git pull origin main
git checkout -b hotfix/fix-bug-xyz

# 2. Fix bug
# ... edit file ...

# 3. Commit dan push
git add .
git commit -m "Fix: bug xyz"
git push origin hotfix/fix-bug-xyz

# 4. Merge ke main (urgent)
git checkout main
git merge hotfix/fix-bug-xyz
git push origin main  # ← Deploy ke server

# 5. Merge juga ke develop
git checkout develop
git merge hotfix/fix-bug-xyz
git push origin develop
```

## ⚠️ Best Practices

1. **Jangan langsung commit ke `main`**
   - Selalu gunakan `develop` untuk development
   - `main` hanya untuk production-ready code

2. **Commit message yang jelas**
   - Gunakan format: `Add:`, `Fix:`, `Update:`, `Remove:`
   - Contoh: `Add: fitur export PDF`, `Fix: bug perhitungan saldo`

3. **Pull sebelum push**
   - Selalu `git pull` sebelum `git push` untuk menghindari conflict

4. **Test sebelum merge ke main**
   - Pastikan fitur sudah di-test sebelum merge ke `main`
   - Setelah merge ke `main`, akan otomatis ter-deploy ke server

5. **Keep develop updated**
   - Setelah merge ke `main`, update juga `develop` dengan merge dari `main`

## 🔍 Command Berguna

```bash
# Lihat branch yang ada
git branch -a

# Lihat branch saat ini
git branch

# Lihat status dan perubahan
git status
git diff

# Lihat history commit
git log --oneline --graph --all

# Undo perubahan yang belum di-commit
git restore <file>
git restore .

# Undo commit terakhir (belum push)
git reset --soft HEAD~1

# Lihat perbedaan antara branch
git diff main..develop
```

## 📝 Checklist Sebelum Merge ke Main

- [ ] Semua fitur sudah di-test
- [ ] Tidak ada error di console
- [ ] Code sudah di-review (jika ada team)
- [ ] Commit message sudah jelas
- [ ] Sudah pull latest dari `main` dan `develop`
- [ ] Siap untuk deploy ke production

## 🚀 Setelah Merge ke Main

Setelah merge ke `main` dan push:
- Server akan otomatis ter-update (jika ada auto-deploy)
- Monitor deployment di server untuk memastikan tidak ada error
- Update `develop` dengan merge dari `main`

---

**Catatan**: Workflow ini memastikan bahwa kode di production (`main`) tetap stabil, sementara development fitur baru dilakukan di `develop` tanpa mengganggu production.

