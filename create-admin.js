#!/usr/bin/env node

/**
 * Script untuk membuat admin pertama
 * 
 * Usage:
 *   node create-admin.js <email> <password> <name>
 * 
 * Contoh:
 *   node create-admin.js admin@example.com password123 "Admin User"
 */

require("dotenv").config();
const database = require("./src/database");
const auth = require("./src/auth");
const readline = require("readline");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(query) {
  return new Promise((resolve) => rl.question(query, resolve));
}

async function createAdmin() {
  try {
    // Initialize database
    await database.initDb();
    console.log("✅ Database connected\n");

    // Check if admin already exists
    const allUsers = await database.getAllUsers();
    const existingAdmin = allUsers.find((u) => u.role === "admin");

    if (existingAdmin) {
      console.log("⚠️  Admin sudah ada:");
      console.log(`   Email: ${existingAdmin.email}`);
      console.log(`   Name: ${existingAdmin.name}\n`);
      
      const answer = await question("Apakah Anda ingin membuat admin baru? (y/n): ");
      if (answer.toLowerCase() !== "y") {
        console.log("❌ Dibatalkan.");
        rl.close();
        process.exit(0);
      }
    }

    // Get input from command line or prompt
    let email, password, name;

    if (process.argv.length >= 5) {
      // From command line arguments
      email = process.argv[2];
      password = process.argv[3];
      name = process.argv[4];
    } else {
      // Interactive prompt
      console.log("Masukkan data admin:\n");
      email = await question("Email: ");
      password = await question("Password (minimal 6 karakter): ");
      name = await question("Nama: ");
    }

    // Validate input
    if (!email || !password || !name) {
      throw new Error("Email, password, dan nama wajib diisi.");
    }

    if (password.length < 6) {
      throw new Error("Password minimal 6 karakter.");
    }

    // Check if email already exists
    const existingUser = await database.getUserByEmail(email);
    if (existingUser) {
      // Update existing user to admin
      await database.updateUserRole(existingUser.id, "admin");
      console.log(`\n✅ User dengan email ${email} berhasil dijadikan admin!`);
      console.log(`   Name: ${existingUser.name}`);
      console.log(`   Email: ${existingUser.email}`);
      console.log(`   Role: admin\n`);
    } else {
      // Create new admin user
      const passwordHash = await auth.hashPassword(password);
      const user = await database.createUser({
        email,
        passwordHash,
        name,
      });

      // Set role to admin
      await database.updateUserRole(user.id, "admin");

      console.log(`\n✅ Admin berhasil dibuat!`);
      console.log(`   Name: ${user.name}`);
      console.log(`   Email: ${user.email}`);
      console.log(`   Role: admin\n`);
    }

    console.log("💡 Cara login:");
    console.log("   1. Buka aplikasi");
    console.log("   2. Login dengan email dan password yang baru dibuat");
    console.log("   3. Tombol 'Admin' akan muncul di header\n");
  } catch (error) {
    console.error("\n❌ Error:", error.message);
    process.exit(1);
  } finally {
    rl.close();
    process.exit(0);
  }
}

createAdmin();

