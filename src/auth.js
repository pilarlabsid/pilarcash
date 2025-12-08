const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const database = require("./database");

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-in-production";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";

// Hash password
async function hashPassword(password) {
  const saltRounds = 10;
  return await bcrypt.hash(password, saltRounds);
}

// Verify password
async function verifyPassword(password, hash) {
  return await bcrypt.compare(password, hash);
}

// Generate JWT token
function generateToken(user) {
  return jwt.sign(
    { userId: user.id, email: user.email, role: user.role || 'user' },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

// Verify JWT token
function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
}

// Register new user
async function register({ email, password, name }) {
  // Validate input
  if (!email || !password || !name) {
    throw new Error("Email, password, dan nama wajib diisi.");
  }

  if (password.length < 6) {
    throw new Error("Password minimal 6 karakter.");
  }

  // Check if user already exists
  const existingUser = await database.getUserByEmail(email);
  if (existingUser) {
    throw new Error("Email sudah terdaftar.");
  }

  // Hash password
  const passwordHash = await hashPassword(password);

  // Create user
  const user = await database.createUser({
    email,
    passwordHash,
    name,
  });

  // Get full user data including role
  const fullUser = await database.getUserById(user.id);

  // Generate token
  const token = generateToken(fullUser);

  return {
    user: {
      id: fullUser.id,
      email: fullUser.email,
      name: fullUser.name,
      role: fullUser.role || 'user',
    },
    token,
  };
}

// Login user
async function login({ email, password }) {
  // Validate input
  if (!email || !password) {
    throw new Error("Email dan password wajib diisi.");
  }

  // Get user by email
  const user = await database.getUserByEmail(email);
  if (!user) {
    throw new Error("Email atau password salah.");
  }

  // Verify password
  const isValid = await verifyPassword(password, user.password_hash);
  if (!isValid) {
    throw new Error("Email atau password salah.");
  }

  // Generate token
  const token = generateToken(user);

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role || 'user',
    },
    token,
  };
}

// Admin middleware - check if user is admin
function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ message: "Tidak terautentikasi." });
  }
  
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: "Akses ditolak. Hanya admin yang bisa mengakses." });
  }
  
  next();
}

// Authentication middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ message: "Token tidak ditemukan. Silakan login." });
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(401).json({ message: "Token tidak valid. Silakan login kembali." });
  }

  req.user = decoded;
  next();
}

module.exports = {
  register,
  login,
  authenticateToken,
  requireAdmin,
  verifyToken,
  hashPassword,
  verifyPassword,
};

