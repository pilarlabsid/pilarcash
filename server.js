// Load environment variables from .env file
require("dotenv").config();

const fs = require("fs");
const path = require("path");
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const database = require("./src/database");
const auth = require("./src/auth");
const os = require("os");
const http = require("http");
const { Server } = require("socket.io");

const PORT = process.env.PORT || 4000;

// Fungsi untuk mendapatkan IP address lokal
const getLocalIPAddress = () => {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // Skip internal (i.e. 127.0.0.1) dan non-IPv4 addresses
      if (iface.family === "IPv4" && !iface.internal) {
        return iface.address;
      }
    }
  }
  return "localhost";
};

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

// Store authenticated socket connections by userId
const userSockets = new Map();

// Fungsi helper untuk broadcast perubahan data ke user-specific clients
const broadcastTransactionUpdate = async (userId) => {
  const transactions = await database.listTransactions(userId);
  // Broadcast hanya ke user yang bersangkutan
  const sockets = userSockets.get(userId) || [];
  sockets.forEach((socket) => {
    socket.emit("transactions:updated", transactions);
  });
};

// Fungsi helper untuk broadcast update ke semua admin yang sedang online
const broadcastAdminUpdate = async () => {
  try {
    // Get all admin users
    const allUsers = await database.getAllUsers();
    const adminUsers = allUsers.filter(u => u.role === 'admin');
    
    if (adminUsers.length === 0) {
      return; // No admin online, skip broadcast
    }
    
    // Get all admin stats
    const stats = await database.getAdminStats();
    const allTransactions = await database.getAllTransactions();
    
    // Broadcast ke semua admin yang sedang online
    adminUsers.forEach(admin => {
      const sockets = userSockets.get(admin.id) || [];
      sockets.forEach((socket) => {
        socket.emit("admin:stats:updated", stats);
        socket.emit("admin:users:updated", allUsers);
        socket.emit("admin:transactions:updated", allTransactions);
      });
    });
  } catch (error) {
    console.error("Error broadcasting admin update:", error);
    // Don't throw, just log error
  }
};

app.use(cors());
app.use(express.json());
app.use(morgan("dev"));

const asyncHandler = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next);

// Health check
app.get("/health", (_req, res) => {
  res.json({ ok: true, timestamp: Date.now() });
});

// Create first admin endpoint (only if no admin exists)
app.post(
  "/api/admin/create-first",
  asyncHandler(async (req, res) => {
    // Check if admin already exists
    const allUsers = await database.getAllUsers();
    const existingAdmin = allUsers.find((u) => u.role === "admin");

    if (existingAdmin) {
      return res.status(400).json({
        message: "Admin sudah ada. Gunakan endpoint lain untuk membuat admin baru.",
      });
    }

    const { email, password, name } = req.body ?? {};

    if (!email || !password || !name) {
      return res.status(400).json({ message: "Email, password, dan nama wajib diisi." });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: "Password minimal 6 karakter." });
    }

    try {
      // Check if email already exists
      const existingUser = await database.getUserByEmail(email);
      if (existingUser) {
        // Update existing user to admin
        await database.updateUserRole(existingUser.id, "admin");
        const result = {
          message: "User berhasil dijadikan admin.",
          user: {
            id: existingUser.id,
            email: existingUser.email,
            name: existingUser.name,
            role: "admin",
          },
        };
        
        // Broadcast update ke semua admin
        await broadcastAdminUpdate();
        
        return res.json(result);
      }

      // Create new admin user
      const passwordHash = await auth.hashPassword(password);
      const user = await database.createUser({
        email,
        passwordHash,
        name,
      });

      // Set role to admin
      await database.updateUserRole(user.id, "admin");

      const result = {
        message: "Admin berhasil dibuat.",
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: "admin",
        },
      };
      
      // Broadcast update ke semua admin
      await broadcastAdminUpdate();
      
      return res.json(result);
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  })
);

// Authentication routes
app.post(
  "/api/auth/register",
  asyncHandler(async (req, res) => {
    const { email, password, name } = req.body ?? {};

    if (!email || !password || !name) {
      return res.status(400).json({
        message: "Email, password, dan nama wajib diisi.",
      });
    }

    try {
      const result = await auth.register({ email, password, name });
      // Broadcast update ke semua admin (untuk new user)
      await broadcastAdminUpdate();
      
      return res.status(201).json(result);
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  })
);

app.post(
  "/api/auth/login",
  asyncHandler(async (req, res) => {
    const { email, password } = req.body ?? {};

    if (!email || !password) {
      return res.status(400).json({
        message: "Email dan password wajib diisi.",
      });
    }

    try {
      const result = await auth.login({ email, password });
      // Update last login after successful login
      if (result.user && result.user.id) {
        await database.updateLastLogin(result.user.id);
      }
      return res.json(result);
    } catch (error) {
      return res.status(401).json({ message: error.message });
    }
  })
);

// Verify token endpoint
app.get(
  "/api/auth/verify",
  auth.authenticateToken,
  asyncHandler(async (req, res) => {
    const user = await database.getUserById(req.user.userId);
    if (!user) {
      return res.status(404).json({ message: "User tidak ditemukan." });
    }
    return res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role || 'user',
        pinEnabled: user.pin_enabled || false,
        timezone: user.timezone || 'Asia/Jakarta',
      },
    });
  })
);

// Get user settings
app.get(
  "/api/user/settings",
  auth.authenticateToken,
  asyncHandler(async (req, res) => {
    const settings = await database.getUserSettings(req.user.userId);
    if (!settings) {
      return res.status(404).json({ message: "User tidak ditemukan." });
    }
    return res.json({
      id: settings.id,
      email: settings.email,
      name: settings.name,
      pinEnabled: settings.pin_enabled || false,
      timezone: settings.timezone || 'Asia/Jakarta',
      createdAt: settings.created_at,
    });
  })
);

// Update user profile
app.put(
  "/api/user/profile",
  auth.authenticateToken,
  asyncHandler(async (req, res) => {
    const { name, email, timezone, password } = req.body ?? {};
    const userId = req.user.userId;

    if (name !== undefined && (!name || !name.trim())) {
      return res.status(400).json({ message: "Nama tidak boleh kosong." });
    }

    if (email !== undefined && (!email || !email.trim())) {
      return res.status(400).json({ message: "Email tidak boleh kosong." });
    }

    if (email !== undefined && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ message: "Format email tidak valid." });
    }

    // Validate password if provided
    if (password !== undefined && password !== null && password !== "") {
      if (password.length < 6) {
        return res.status(400).json({ message: "Password minimal 6 karakter." });
      }
    }

    // Validate timezone if provided
    if (timezone !== undefined) {
      // Basic validation - check if it's a valid timezone string
      try {
        Intl.DateTimeFormat(undefined, { timeZone: timezone });
      } catch (e) {
        return res.status(400).json({ message: "Timezone tidak valid." });
      }
    }

    try {
      // Update profile if name, email, or timezone provided
      if (name !== undefined || email !== undefined || timezone !== undefined) {
        await database.updateUserProfile({
          id: userId,
          name,
          email,
          timezone,
        });
      }

      // Update password if provided
      if (password !== undefined && password !== null && password !== "") {
        const hashedPassword = await auth.hashPassword(password);
        await database.updateUserPassword({ id: userId, passwordHash: hashedPassword });
      }

      // Get updated user
      const updated = await database.getUserById(userId);

      if (!updated) {
        return res.status(404).json({ message: "User tidak ditemukan." });
      }

      const result = {
        id: updated.id,
        email: updated.email,
        name: updated.name,
        pinEnabled: updated.pin_enabled || false,
        timezone: updated.timezone || 'Asia/Jakarta',
      };
      
      // Broadcast update ke semua admin
      await broadcastAdminUpdate();
      
      return res.json(result);
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  })
);

// Update user PIN settings
app.put(
  "/api/user/pin",
  auth.authenticateToken,
  asyncHandler(async (req, res) => {
    const { pin, pinEnabled } = req.body ?? {};
    const userId = req.user.userId;

    // Validate pin if provided
    if (pin !== undefined && pin !== null && pin !== "") {
      if (typeof pin !== "string" || pin.length !== 4 || !/^\d{4}$/.test(pin)) {
        return res.status(400).json({ message: "PIN harus berupa 4 digit angka." });
      }
    }

    try {
      const updated = await database.updateUserPin({
        id: userId,
        pin: pin || null,
        pinEnabled: pinEnabled !== undefined ? pinEnabled : undefined,
      });

      if (!updated) {
        return res.status(404).json({ message: "User tidak ditemukan." });
      }

      const result = {
        id: updated.id,
        email: updated.email,
        name: updated.name,
        pinEnabled: updated.pin_enabled || false,
        message: pin ? "PIN berhasil diatur." : "PIN berhasil dihapus.",
      };
      
      // Broadcast update ke semua admin
      await broadcastAdminUpdate();
      
      return res.json(result);
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  })
);

// Verify user PIN
app.post(
  "/api/user/verify-pin",
  auth.authenticateToken,
  asyncHandler(async (req, res) => {
    const { pin } = req.body ?? {};
    const userId = req.user.userId;

    if (!pin || typeof pin !== "string") {
      return res.status(400).json({ message: "PIN wajib diisi." });
    }

    const isValid = await database.verifyUserPin(userId, pin);
    
    if (!isValid) {
      return res.status(401).json({ message: "PIN salah. Coba lagi." });
    }

    return res.json({ valid: true });
  })
);

// ==================== ADMIN ROUTES ====================
// Semua route admin memerlukan authentication + admin role

// Get admin statistics
app.get(
  "/api/admin/stats",
  auth.authenticateToken,
  auth.requireAdmin,
  asyncHandler(async (req, res) => {
    const stats = await database.getAdminStats();
    res.json(stats);
  })
);

// Get all users
app.get(
  "/api/admin/users",
  auth.authenticateToken,
  auth.requireAdmin,
  asyncHandler(async (req, res) => {
    const users = await database.getAllUsers();
    res.json(users);
  })
);

// Create new user/admin
app.post(
  "/api/admin/users",
  auth.authenticateToken,
  auth.requireAdmin,
  asyncHandler(async (req, res) => {
    const { name, email, password, role } = req.body ?? {};
    
    // Validate input
    if (!name || !email || !password) {
      return res.status(400).json({ message: "Nama, email, dan password wajib diisi." });
    }
    
    if (password.length < 6) {
      return res.status(400).json({ message: "Password minimal 6 karakter." });
    }
    
    // Validate role if provided
    const userRole = role && ['user', 'admin'].includes(role) ? role : 'user';
    
    try {
      // Check if email already exists
      const existingUser = await database.getUserByEmail(email);
      if (existingUser) {
        return res.status(400).json({ message: "Email sudah digunakan." });
      }
      
      // Create user using auth.register but with role
      const hashedPassword = await auth.hashPassword(password);
      const newUser = await database.createUser({
        email: email.toLowerCase().trim(),
        passwordHash: hashedPassword,
        name: name.trim(),
        role: userRole,
      });
      
      // Broadcast update ke semua admin
      await broadcastAdminUpdate();
      
      res.status(201).json({
        id: newUser.id,
        email: newUser.email,
        name: newUser.name,
        role: newUser.role || 'user',
        createdAt: newUser.created_at,
      });
    } catch (error) {
      return res.status(400).json({ message: error.message || "Gagal membuat user." });
    }
  })
);

// Get user detail by ID
app.get(
  "/api/admin/users/:id",
  auth.authenticateToken,
  auth.requireAdmin,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const user = await database.getUserById(id);
    
    if (!user) {
      return res.status(404).json({ message: "User tidak ditemukan." });
    }
    
    // Get user transactions
    const transactions = await database.listTransactions(id);
    
    res.json({
      ...user,
      transactions,
    });
  })
);

// Update user (admin can update name, email, password, role)
app.put(
  "/api/admin/users/:id",
  auth.authenticateToken,
  auth.requireAdmin,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { name, email, password, role } = req.body ?? {};
    
    // Validate role if provided
    if (role && !['user', 'admin'].includes(role)) {
      return res.status(400).json({ message: "Role harus 'user' atau 'admin'." });
    }
    
    // Validate password if provided
    if (password !== undefined && password !== null && password !== "") {
      if (password.length < 6) {
        return res.status(400).json({ message: "Password minimal 6 karakter." });
      }
    }
    
    try {
      // Update profile if name or email provided
      if (name || email) {
        await database.updateUserProfile({ id, name, email });
      }
      
      // Update password if provided
      if (password !== undefined && password !== null && password !== "") {
        const hashedPassword = await auth.hashPassword(password);
        await database.updateUserPassword({ id, passwordHash: hashedPassword });
      }
      
      // Update role if provided
      if (role) {
        await database.updateUserRole(id, role);
      }
      
      // Get updated user
      const updatedUser = await database.getUserById(id);
      
      if (!updatedUser) {
        return res.status(404).json({ message: "User tidak ditemukan." });
      }
      
      const result = {
        id: updatedUser.id,
        email: updatedUser.email,
        name: updatedUser.name,
        role: updatedUser.role || 'user',
        pinEnabled: updatedUser.pin_enabled || false,
        createdAt: updatedUser.created_at,
      };
      
      // Broadcast update ke semua admin
      await broadcastAdminUpdate();
      
      res.json(result);
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  })
);

// Delete user
app.delete(
  "/api/admin/users/:id",
  auth.authenticateToken,
  auth.requireAdmin,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    // Prevent admin from deleting themselves
    if (id === req.user.userId) {
      return res.status(400).json({ message: "Tidak bisa menghapus akun sendiri." });
    }
    
    const deletedUser = await database.deleteUser(id);
    
    if (!deletedUser) {
      return res.status(404).json({ message: "User tidak ditemukan." });
    }
    
    const result = {
      message: "User berhasil dihapus.",
      user: deletedUser,
    };
    
    // Broadcast update ke semua admin
    await broadcastAdminUpdate();
    
    res.json(result);
  })
);

// Get all transactions (from all users)
app.get(
  "/api/admin/transactions",
  auth.authenticateToken,
  auth.requireAdmin,
  asyncHandler(async (req, res) => {
    const transactions = await database.getAllTransactions();
    res.json(transactions);
  })
);

// Protected routes - require authentication
app.get(
  "/api/transactions",
  auth.authenticateToken,
  asyncHandler(async (req, res) => {
    const transactions = await database.listTransactions(req.user.userId);
    res.json(transactions);
  })
);

app.post(
  "/api/transactions",
  auth.authenticateToken,
  asyncHandler(async (req, res) => {
    const { description, type, amount, date } = req.body ?? {};

    if (
      typeof description !== "string" ||
      !description.trim() ||
      !["income", "expense"].includes(type)
    ) {
      return res
        .status(400)
        .json({ message: "Deskripsi dan jenis transaksi wajib diisi." });
    }

    const numericAmount = Number(amount);
    if (Number.isNaN(numericAmount) || numericAmount <= 0) {
      return res
        .status(400)
        .json({ message: "Nominal harus berupa angka lebih dari nol." });
    }

    if (!date || Number.isNaN(new Date(date).getTime())) {
      return res.status(400).json({ message: "Tanggal tidak valid." });
    }

    const id = await database.createTransaction({
      userId: req.user.userId,
      description: description.trim(),
      type,
      amount: Math.round(numericAmount),
      date,
    });

    // Broadcast update ke user-specific clients
    await broadcastTransactionUpdate(req.user.userId);
    
    // Broadcast update ke semua admin
    await broadcastAdminUpdate();

    return res.status(201).json({ id });
  })
);

app.delete(
  "/api/transactions/:id",
  auth.authenticateToken,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const userId = req.user.userId;

    // Verifikasi bahwa transaksi benar-benar milik user ini
    const transaction = await database.getTransactionById(id, userId);
    if (!transaction) {
      return res.status(404).json({ message: "Transaksi tidak ditemukan atau tidak memiliki akses." });
    }

    const success = await database.deleteTransaction(id, userId);
    if (!success) {
      return res.status(404).json({ message: "Gagal menghapus transaksi." });
    }

    // Broadcast update ke user-specific clients
    await broadcastTransactionUpdate(userId);
    
    // Broadcast update ke semua admin
    await broadcastAdminUpdate();

    return res.status(204).send();
  })
);

app.delete(
  "/api/transactions",
  auth.authenticateToken,
  asyncHandler(async (req, res) => {
    await database.deleteAllTransactions(req.user.userId);

    // Broadcast update ke user-specific clients
    await broadcastTransactionUpdate(req.user.userId);
    
    // Broadcast update ke semua admin
    await broadcastAdminUpdate();

    res.status(204).send();
  })
);

app.put(
  "/api/transactions/:id",
  auth.authenticateToken,
  asyncHandler(async (req, res) => {
    const { description, type, amount, date } = req.body ?? {};
    const { id } = req.params;
    const userId = req.user.userId;

    if (
      typeof description !== "string" ||
      !description.trim() ||
      !["income", "expense"].includes(type)
    ) {
      return res
        .status(400)
        .json({ message: "Deskripsi dan jenis transaksi wajib diisi." });
    }

    const numericAmount = Number(amount);
    if (Number.isNaN(numericAmount) || numericAmount <= 0) {
      return res
        .status(400)
        .json({ message: "Nominal harus berupa angka lebih dari nol." });
    }

    if (!date || Number.isNaN(new Date(date).getTime())) {
      return res.status(400).json({ message: "Tanggal tidak valid." });
    }

    // Verifikasi bahwa transaksi benar-benar milik user ini sebelum update
    const transaction = await database.getTransactionById(id, userId);
    if (!transaction) {
      return res.status(404).json({ message: "Transaksi tidak ditemukan atau tidak memiliki akses." });
    }

    const updated = await database.updateTransaction({
      id,
      userId,
      description: description.trim(),
      type,
      amount: Math.round(numericAmount),
      date,
    });

    if (!updated) {
      return res.status(404).json({ message: "Gagal memperbarui transaksi." });
    }

    // Broadcast update ke user-specific clients
    await broadcastTransactionUpdate(userId);

    return res.status(204).send();
  })
);

// Serve static files
const clientDir = path.join(__dirname, "client", "dist");
const clientBuildExists = fs.existsSync(clientDir);

if (clientBuildExists) {
  app.use(express.static(clientDir));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api")) {
      return next();
    }
    res.sendFile(path.join(clientDir, "index.html"));
  });
} else {
  app.get("/", (_req, res) => {
    res.send(
      "Frontend build belum tersedia. Jalankan `npm run client` untuk mode dev atau `npm run client:build` untuk produksi."
    );
  });
}

// Error handler
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ message: "Terjadi kesalahan pada server." });
});

// Initialize database and start server
database
  .initDb()
  .then(() => {
    const HOST = "0.0.0.0";
    const localIP = getLocalIPAddress();

    // Setup WebSocket connection with authentication
    io.use((socket, next) => {
      const token = socket.handshake.auth.token;
      if (!token) {
        return next(new Error("Authentication error: Token required"));
      }

      const decoded = auth.verifyToken(token);
      if (!decoded) {
        return next(new Error("Authentication error: Invalid token"));
      }

      socket.userId = decoded.userId;
      socket.userRole = decoded.role || 'user';
      next();
    });

    io.on("connection", (socket) => {
      const userId = socket.userId;
      console.log(`Client connected: ${socket.id} (User: ${userId})`);

      // Add socket to user's socket list
      if (!userSockets.has(userId)) {
        userSockets.set(userId, []);
      }
      userSockets.get(userId).push(socket);

      socket.on("disconnect", () => {
        console.log(`Client disconnected: ${socket.id}`);
        // Remove socket from user's socket list
        const sockets = userSockets.get(userId);
        if (sockets) {
          const index = sockets.indexOf(socket);
          if (index > -1) {
            sockets.splice(index, 1);
          }
          if (sockets.length === 0) {
            userSockets.delete(userId);
          }
        }
      });
    });

    server.listen(PORT, HOST, () => {
      console.log("\n" + "=".repeat(60));
      console.log("Prava Cash - Multi-User Ready!");
      console.log("=".repeat(60));
      console.log(`Local:    http://localhost:${PORT}`);
      console.log(`Network:  http://${localIP}:${PORT}`);
      console.log("=".repeat(60));
      console.log("WebSocket enabled for realtime updates");
      console.log("Authentication enabled");
      console.log("=".repeat(60));
      console.log("\nAkses dari perangkat lain di jaringan yang sama:");
      console.log(`   Gunakan: http://${localIP}:${PORT}`);
      console.log("\n");
    });
  })
  .catch((error) => {
    console.error("Gagal menginisialisasi database:", error);
    process.exit(1);
  });
