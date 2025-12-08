const { Pool } = require("pg");
const crypto = require("crypto");
const dbConfig = require("./db.config");

// Get current environment
const env = process.env.NODE_ENV || "development";
const config = dbConfig[env];

// Build connection string from config
const getConnectionString = () => {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }
  // Build connection string from config object
  const password = config.password ? `:${config.password}` : "";
  return `postgresql://${config.user}${password}@${config.host}:${config.port}/${config.database}`;
};

// Create PostgreSQL connection pool
const pool = new Pool({
  host: config.host,
  user: config.user,
  password: config.password,
  database: config.database,
  port: config.port,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
});

// Test connection
pool.on("error", (err) => {
  console.error("Unexpected error on idle client", err);
  process.exit(-1);
});

async function initDb() {
  try {
    // Test connection
    await pool.query("SELECT NOW()");
    console.log("Connected to PostgreSQL database");

    // Create tables if not exist
    await createSchema();
    console.log("Database schema initialized");
  } catch (error) {
    if (error.code === "3D000") {
      // Database does not exist
      console.error("\nDatabase tidak ditemukan!");
      console.error(`   Buat database dengan perintah berikut:`);
      console.error(`   createdb -U ${config.user} ${config.database}\n`);
      console.error(`   Atau jika menggunakan password:`);
      console.error(`   PGPASSWORD=${config.password} createdb -U ${config.user} ${config.database}\n`);
    } else if (error.code === "28P01") {
      // Authentication failed
      console.error("\n Gagal autentikasi ke PostgreSQL!");
      console.error(" Pastikan username dan password di DATABASE_URL benar.\n");
    } else if (error.code === "ECONNREFUSED") {
      // Connection refused
      console.error("\n Tidak bisa connect ke PostgreSQL!");
      console.error(" Pastikan PostgreSQL service berjalan:");
      console.error("   macOS: brew services start postgresql");
      console.error("   Linux: sudo systemctl start postgresql\n");
    } else {
      console.error(" Database initialization error:", error.message);
    }
    throw error;
  }
}

async function createSchema() {
  // Create users table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      name VARCHAR(255) NOT NULL,
      pin VARCHAR(4) DEFAULT NULL,
      pin_enabled BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Add pin, pin_enabled, and role columns if they don't exist (for existing databases)
  await pool.query(`
    DO $$ 
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                     WHERE table_name='users' AND column_name='pin') THEN
        ALTER TABLE users ADD COLUMN pin VARCHAR(4) DEFAULT NULL;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                     WHERE table_name='users' AND column_name='pin_enabled') THEN
        ALTER TABLE users ADD COLUMN pin_enabled BOOLEAN DEFAULT false;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                     WHERE table_name='users' AND column_name='role') THEN
        ALTER TABLE users ADD COLUMN role VARCHAR(20) DEFAULT 'user' CHECK (role IN ('user', 'admin'));
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                     WHERE table_name='users' AND column_name='last_login_at') THEN
        ALTER TABLE users ADD COLUMN last_login_at TIMESTAMP DEFAULT NULL;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                     WHERE table_name='users' AND column_name='is_active') THEN
        ALTER TABLE users ADD COLUMN is_active BOOLEAN DEFAULT true;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                     WHERE table_name='users' AND column_name='login_count') THEN
        ALTER TABLE users ADD COLUMN login_count INTEGER DEFAULT 0;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                     WHERE table_name='users' AND column_name='timezone') THEN
        ALTER TABLE users ADD COLUMN timezone VARCHAR(50) DEFAULT 'Asia/Jakarta';
      END IF;
    END $$;
  `);

  // Create transactions table with user_id foreign key
  await pool.query(`
    CREATE TABLE IF NOT EXISTS transactions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      description TEXT NOT NULL,
      type VARCHAR(10) NOT NULL CHECK (type IN ('income','expense')),
      amount INTEGER NOT NULL CHECK (amount >= 0),
      date DATE NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create indexes for better performance
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
    CREATE INDEX IF NOT EXISTS idx_transactions_user_date ON transactions(user_id, date);
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
  `);
  
  // Add comment untuk dokumentasi
  await pool.query(`
    COMMENT ON TABLE transactions IS 'Setiap transaksi terikat ke user_id. User hanya bisa akses transaksi miliknya sendiri.';
    COMMENT ON COLUMN transactions.user_id IS 'Foreign key ke users.id. Wajib diisi dan tidak bisa diubah oleh user lain.';
  `);
}

// User management functions
async function createUser({ email, passwordHash, name }) {
  const result = await pool.query(
    `INSERT INTO users (email, password_hash, name) 
     VALUES ($1, $2, $3) 
     RETURNING id, email, name, created_at`,
    [email.toLowerCase().trim(), passwordHash, name.trim()]
  );
  return result.rows[0];
}

async function getUserByEmail(email) {
  const result = await pool.query(
    `SELECT id, email, password_hash, name, role, last_login_at, is_active, login_count, timezone, created_at 
     FROM users 
     WHERE email = $1`,
    [email.toLowerCase().trim()]
  );
  return result.rows[0] || null;
}

async function getUserById(id) {
  const result = await pool.query(
    `SELECT id, email, name, pin, pin_enabled, role, last_login_at, is_active, login_count, timezone, created_at 
     FROM users 
     WHERE id = $1`,
    [id]
  );
  return result.rows[0] || null;
}

// Update last login timestamp
async function updateLastLogin(userId) {
  await pool.query(
    `UPDATE users 
     SET last_login_at = CURRENT_TIMESTAMP, 
         login_count = COALESCE(login_count, 0) + 1,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [userId]
  );
}

// Get user settings (without sensitive data)
async function getUserSettings(id) {
  const result = await pool.query(
    `SELECT id, email, name, pin_enabled, timezone, created_at 
     FROM users 
     WHERE id = $1`,
    [id]
  );
  return result.rows[0] || null;
}

// Update user profile
async function updateUserProfile({ id, name, email, timezone }) {
  const updates = [];
  const values = [];
  let paramCount = 1;

  if (name !== undefined) {
    updates.push(`name = $${paramCount++}`);
    values.push(name.trim());
  }

  if (email !== undefined) {
    // Check if email already exists for another user
    const existingUser = await getUserByEmail(email);
    if (existingUser && existingUser.id !== id) {
      throw new Error("Email sudah digunakan oleh user lain.");
    }
    updates.push(`email = $${paramCount++}`);
    values.push(email.toLowerCase().trim());
  }

  if (timezone !== undefined) {
    updates.push(`timezone = $${paramCount++}`);
    values.push(timezone);
  }

  if (updates.length === 0) {
    return null;
  }

  updates.push(`updated_at = CURRENT_TIMESTAMP`);
  values.push(id);

  const result = await pool.query(
    `UPDATE users 
     SET ${updates.join(", ")}
     WHERE id = $${paramCount}
     RETURNING id, email, name, pin_enabled, timezone, created_at`,
    values
  );

  return result.rows[0] || null;
}

// Update user PIN
async function updateUserPin({ id, pin, pinEnabled }) {
  const updates = [];
  const values = [];
  let paramCount = 1;

  if (pin !== undefined) {
    if (pin && (pin.length !== 4 || !/^\d{4}$/.test(pin))) {
      throw new Error("PIN harus berupa 4 digit angka.");
    }
    updates.push(`pin = $${paramCount++}`);
    values.push(pin || null);
  }

  if (pinEnabled !== undefined) {
    updates.push(`pin_enabled = $${paramCount++}`);
    values.push(pinEnabled);
  }

  if (updates.length === 0) {
    return null;
  }

  updates.push(`updated_at = CURRENT_TIMESTAMP`);
  values.push(id);

  const result = await pool.query(
    `UPDATE users 
     SET ${updates.join(", ")}
     WHERE id = $${paramCount}
     RETURNING id, email, name, pin, pin_enabled, created_at`,
    values
  );

  return result.rows[0] || null;
}

// Verify user PIN
async function verifyUserPin(userId, pin) {
  const user = await getUserById(userId);
  if (!user || !user.pin_enabled || !user.pin) {
    return false;
  }
  return user.pin === pin;
}

// Transaction functions (user-specific)
async function listTransactions(userId) {
  const result = await pool.query(
    `SELECT id, description, type, amount, date, created_at as "createdAt"
     FROM transactions
     WHERE user_id = $1
     ORDER BY date ASC, created_at ASC`,
    [userId]
  );
  return result.rows.map((row) => ({
    ...row,
    amount: Number(row.amount),
  }));
}

async function createTransaction({ userId, description, type, amount, date }) {
  const result = await pool.query(
    `INSERT INTO transactions (user_id, description, type, amount, date)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [userId, description.trim(), type, Math.round(amount), date]
  );
  return result.rows[0].id;
}

async function updateTransaction({ id, userId, description, type, amount, date }) {
  const result = await pool.query(
    `UPDATE transactions
     SET description = $1, type = $2, amount = $3, date = $4, updated_at = CURRENT_TIMESTAMP
     WHERE id = $5 AND user_id = $6
     RETURNING id`,
    [description.trim(), type, Math.round(amount), date, id, userId]
  );
  return result.rows.length > 0;
}

async function deleteTransaction(id, userId) {
  const result = await pool.query(
    `DELETE FROM transactions 
     WHERE id = $1 AND user_id = $2
     RETURNING id`,
    [id, userId]
  );
  return result.rows.length > 0;
}

async function deleteAllTransactions(userId) {
  await pool.query(
    `DELETE FROM transactions WHERE user_id = $1`,
    [userId]
  );
}

// Get transaction by ID (for ownership verification)
async function getTransactionById(id, userId) {
  const result = await pool.query(
    `SELECT id, user_id, description, type, amount, date
     FROM transactions
     WHERE id = $1 AND user_id = $2`,
    [id, userId]
  );
  return result.rows[0] || null;
}

// Admin functions
async function getAllUsers() {
  const result = await pool.query(
    `SELECT id, email, name, role, pin_enabled, last_login_at, is_active, login_count, created_at,
     (SELECT COUNT(*) FROM transactions WHERE user_id = users.id) as transaction_count,
     (SELECT COALESCE(SUM(amount), 0) FROM transactions WHERE user_id = users.id AND type = 'income') as total_income,
     (SELECT COALESCE(SUM(amount), 0) FROM transactions WHERE user_id = users.id AND type = 'expense') as total_expense
     FROM users 
     ORDER BY created_at DESC`
  );
  return result.rows;
}

async function getAllTransactions() {
  const result = await pool.query(
    `SELECT t.id, t.user_id, t.description, t.type, t.amount, t.date, t.created_at,
     u.name as user_name, u.email as user_email
     FROM transactions t
     JOIN users u ON t.user_id = u.id
     ORDER BY t.created_at DESC`
  );
  return result.rows;
}

async function getAdminStats() {
  // Total users
  const usersResult = await pool.query(`SELECT COUNT(*) as count FROM users`);
  const totalUsers = parseInt(usersResult.rows[0].count);

  // Active users (login dalam 7 hari terakhir)
  const activeUsersResult = await pool.query(
    `SELECT COUNT(*) as count FROM users 
     WHERE last_login_at >= CURRENT_DATE - INTERVAL '7 days' OR last_login_at IS NULL`
  );
  const activeUsers = parseInt(activeUsersResult.rows[0].count);

  // New users (hari ini, minggu ini, bulan ini)
  const newUsersToday = await pool.query(
    `SELECT COUNT(*) as count FROM users 
     WHERE created_at::date = CURRENT_DATE`
  );
  const newUsersThisWeek = await pool.query(
    `SELECT COUNT(*) as count FROM users 
     WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'`
  );
  const newUsersThisMonth = await pool.query(
    `SELECT COUNT(*) as count FROM users 
     WHERE created_at >= DATE_TRUNC('month', CURRENT_DATE)`
  );

  // Total transactions
  const transResult = await pool.query(`SELECT COUNT(*) as count FROM transactions`);
  const totalTransactions = parseInt(transResult.rows[0].count);

  // New transactions (hari ini, minggu ini, bulan ini)
  const newTransToday = await pool.query(
    `SELECT COUNT(*) as count FROM transactions 
     WHERE created_at::date = CURRENT_DATE`
  );
  const newTransThisWeek = await pool.query(
    `SELECT COUNT(*) as count FROM transactions 
     WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'`
  );
  const newTransThisMonth = await pool.query(
    `SELECT COUNT(*) as count FROM transactions 
     WHERE created_at >= DATE_TRUNC('month', CURRENT_DATE)`
  );

  // Transactions by type (count only, not amount - untuk monitoring volume)
  const typeResult = await pool.query(
    `SELECT type, COUNT(*) as count
     FROM transactions
     GROUP BY type`
  );

  // Average transaction value (untuk monitoring, bukan financial)
  const avgTransResult = await pool.query(
    `SELECT COALESCE(AVG(amount), 0) as avg FROM transactions`
  );
  const avgTransactionValue = parseFloat(avgTransResult.rows[0].avg) || 0;

  // Inactive users (tidak login dalam 30 hari)
  const inactiveUsersResult = await pool.query(
    `SELECT COUNT(*) as count FROM users 
     WHERE (last_login_at < CURRENT_DATE - INTERVAL '30 days' OR last_login_at IS NULL)
     AND created_at < CURRENT_DATE - INTERVAL '30 days'`
  );
  const inactiveUsers = parseInt(inactiveUsersResult.rows[0].count);

  // Total income and expense (untuk overview, bukan financial detail)
  const incomeResult = await pool.query(
    `SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE type = 'income'`
  );
  const totalIncome = parseInt(incomeResult.rows[0].total);

  const expenseResult = await pool.query(
    `SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE type = 'expense'`
  );
  const totalExpense = parseInt(expenseResult.rows[0].total);

  // Min/Max per user untuk income, expense, dan balance
  const userStatsResult = await pool.query(
    `SELECT 
      u.id,
      u.name,
      u.email,
      COALESCE(SUM(CASE WHEN t.type = 'income' THEN t.amount ELSE 0 END), 0) as total_income,
      COALESCE(SUM(CASE WHEN t.type = 'expense' THEN t.amount ELSE 0 END), 0) as total_expense,
      COALESCE(SUM(CASE WHEN t.type = 'income' THEN t.amount ELSE -t.amount END), 0) as balance
    FROM users u
    LEFT JOIN transactions t ON u.id = t.user_id
    GROUP BY u.id, u.name, u.email
    HAVING COUNT(t.id) > 0`
  );

  const userStats = userStatsResult.rows;
  
  // Find min/max - handle multiple users with same value
  const findMaxUsers = (stats, field) => {
    if (stats.length === 0) return [];
    const maxValue = Math.max(...stats.map(u => parseInt(u[field])));
    return stats.filter(u => parseInt(u[field]) === maxValue);
  };

  const findMinUsers = (stats, field) => {
    if (stats.length === 0) return [];
    const minValue = Math.min(...stats.map(u => parseInt(u[field])));
    return stats.filter(u => parseInt(u[field]) === minValue);
  };

  const maxIncomeUsers = findMaxUsers(userStats, 'total_income');
  const minIncomeUsers = findMinUsers(userStats, 'total_income');
  const maxExpenseUsers = findMaxUsers(userStats, 'total_expense');
  const minExpenseUsers = findMinUsers(userStats, 'total_expense');
  const maxBalanceUsers = findMaxUsers(userStats, 'balance');
  const minBalanceUsers = findMinUsers(userStats, 'balance');

  // Format untuk response (ambil pertama jika ada, atau null)
  const formatUserList = (users, field) => {
    if (users.length === 0) return null;
    const amount = parseInt(users[0][field]);
    return {
      amount,
      users: users.map(u => ({
        name: u.name,
        email: u.email
      })),
      count: users.length
    };
  };

  return {
    totalUsers,
    activeUsers,
    inactiveUsers,
    newUsers: {
      today: parseInt(newUsersToday.rows[0].count),
      thisWeek: parseInt(newUsersThisWeek.rows[0].count),
      thisMonth: parseInt(newUsersThisMonth.rows[0].count),
    },
    totalTransactions,
    newTransactions: {
      today: parseInt(newTransToday.rows[0].count),
      thisWeek: parseInt(newTransThisWeek.rows[0].count),
      thisMonth: parseInt(newTransThisMonth.rows[0].count),
    },
    avgTransactionValue,
    transactionsByType: typeResult.rows,
    // Financial overview (untuk monitoring, bukan detail)
    totalIncome,
    totalExpense,
    totalBalance: totalIncome - totalExpense,
    // Min/Max per user (bisa multiple users dengan nilai sama)
    maxIncome: formatUserList(maxIncomeUsers, 'total_income'),
    minIncome: formatUserList(minIncomeUsers, 'total_income'),
    maxExpense: formatUserList(maxExpenseUsers, 'total_expense'),
    minExpense: formatUserList(minExpenseUsers, 'total_expense'),
    maxBalance: formatUserList(maxBalanceUsers, 'balance'),
    minBalance: formatUserList(minBalanceUsers, 'balance'),
  };
}

async function updateUserRole(userId, role) {
  if (!['user', 'admin'].includes(role)) {
    throw new Error("Role harus 'user' atau 'admin'");
  }
  
  const result = await pool.query(
    `UPDATE users 
     SET role = $1, updated_at = CURRENT_TIMESTAMP
     WHERE id = $2
     RETURNING id, email, name, role, created_at`,
    [role, userId]
  );
  
  return result.rows[0] || null;
}

async function deleteUser(userId) {
  // Delete user (transactions will be deleted via CASCADE)
  const result = await pool.query(
    `DELETE FROM users WHERE id = $1 RETURNING id, email, name`,
    [userId]
  );
  return result.rows[0] || null;
}

module.exports = {
  pool,
  initDb,
  createUser,
  getUserByEmail,
  getUserById,
  getUserSettings,
  updateUserProfile,
  updateUserPin,
  verifyUserPin,
  listTransactions,
  createTransaction,
  updateTransaction,
  deleteTransaction,
  deleteAllTransactions,
  getTransactionById,
  getAllUsers,
  getAllTransactions,
  getAdminStats,
  updateUserRole,
  deleteUser,
  updateLastLogin,
};
