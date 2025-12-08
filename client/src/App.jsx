import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { formatCurrency, formatDate, getToday } from "./lib/format";
import { utils as XLSXUtils, writeFile as writeXLSXFile, read as readXLSX } from "xlsx";
import { io } from "socket.io-client";

// PIN Code default (akan di-override oleh user settings)
const DEFAULT_PIN_CODE = import.meta.env.VITE_PIN_CODE || "6745";

const createInitialForm = (overrides = {}, timezone = "Asia/Jakarta") => ({
  description: "",
  amount: "",
  type: "expense",
  date: getToday(timezone),
  ...overrides,
});

const STAT_STYLES = {
  income: "from-emerald-500 via-emerald-400 to-emerald-500 text-white",
  expense: "from-rose-500 via-rose-400 to-rose-500 text-white",
  balance: "from-indigo-500 via-blue-500 to-sky-500 text-white",
};

const inputClasses =
  "w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-900 outline-none transition focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-100";

function App() {
  // Authentication state
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem("token"));
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);
  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  const [registerForm, setRegisterForm] = useState({ email: "", password: "", name: "" });
  const [authError, setAuthError] = useState("");
  
  // Settings state
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settings, setSettings] = useState({ name: "", email: "", pinEnabled: false, timezone: "Asia/Jakarta" });
  const [settingsForm, setSettingsForm] = useState({ name: "", email: "", pin: "", pinEnabled: false, timezone: "Asia/Jakarta" });
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsError, setSettingsError] = useState("");

  // Existing state
  const [entries, setEntries] = useState([]);
  const [form, setForm] = useState(() => createInitialForm({}, settings.timezone || "Asia/Jakarta"));
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [pinMode, setPinMode] = useState(null); // "create" | "delete" | "reset"
  const [deleting, setDeleting] = useState(false);
  const [editingTarget, setEditingTarget] = useState(null);
  const [isPinStep, setIsPinStep] = useState(false);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState("");
  const modalRef = useRef(null);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isExportPinOpen, setIsExportPinOpen] = useState(false);
  const [isImportPinOpen, setIsImportPinOpen] = useState(false);
  const [isImportFileOpen, setIsImportFileOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importPreview, setImportPreview] = useState([]);
  const [pendingPayload, setPendingPayload] = useState(null);
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false);
  const [isDeleteUserConfirmOpen, setIsDeleteUserConfirmOpen] = useState(false);
  const [deleteUserTarget, setDeleteUserTarget] = useState(null);
  
  // Admin state - auto set to true if user is admin
  const [isAdminPage, setIsAdminPage] = useState(false);
  const [adminStats, setAdminStats] = useState(null);
  const [adminUsers, setAdminUsers] = useState([]);
  const [adminTransactions, setAdminTransactions] = useState([]);
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminTab, setAdminTab] = useState("dashboard"); // "dashboard" | "users" | "transactions"
  const [selectedUser, setSelectedUser] = useState(null);
  const [isEditUserModalOpen, setIsEditUserModalOpen] = useState(false);
  const [editUserForm, setEditUserForm] = useState({ name: "", email: "", role: "user" });
  const [expandedUsers, setExpandedUsers] = useState(new Set());

  const resetPinFlow = () => {
    setPin("");
    setPinError("");
    setPinMode(null);
    setIsPinStep(false);
    setIsModalOpen(false);
    setDeleteTarget(null);
    setIsDeleteConfirmOpen(false);
    setEditingTarget(null);
    setForm(createInitialForm({}, settings.timezone || "Asia/Jakarta"));
    setPendingPayload(null);
    setTimeout(() => {
      modalRef.current
        ?.querySelector("input[name='description']")
        ?.focus();
    }, 0);
  };

  const pinDescriptions = {
    create: "Masukkan PIN 4-digit untuk menyimpan transaksi ini.",
    edit: "Masukkan PIN 4-digit untuk memperbarui transaksi ini.",
    delete: "Masukkan PIN 4-digit untuk menghapus transaksi ini.",
    reset: "Masukkan PIN 4-digit untuk menghapus semua transaksi.",
    export: "Masukkan PIN 4-digit untuk mengunduh transaksi.",
    import: "Masukkan PIN 4-digit untuk mengimpor transaksi dari Excel.",
  };

  // Helper untuk mendapatkan base API URL
  const getApiUrl = () => {
    // Gunakan environment variable jika tersedia
    const apiUrl = import.meta.env.VITE_API_URL;
    if (apiUrl) {
      // Pastikan tidak ada trailing slash
      return apiUrl.replace(/\/$/, '');
    }
    // Fallback: di development gunakan proxy, di production gunakan relative path
    return import.meta.env.DEV ? "" : window.location.origin;
  };

  // Helper untuk membuat fetch dengan authentication
  // Menggunakan useCallback dengan dependency token
  const authenticatedFetch = useCallback(async (url, options = {}) => {
    const headers = {
      "Content-Type": "application/json",
      ...options.headers,
    };

    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (response.status === 401) {
      // Token expired or invalid - logout
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      setToken(null);
      setUser(null);
      setIsAuthenticated(false);
      setEntries([]);
      throw new Error("Session expired. Silakan login kembali.");
    }

    return response;
  }, [token]);

  // Fetch user settings
  const fetchSettings = useCallback(async () => {
    if (!token || !isAuthenticated) return;

    try {
      const apiBase = getApiUrl();
      // Use authenticatedFetch from closure
      const headers = {
        "Content-Type": "application/json",
      };
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }
      const response = await fetch(`${apiBase}/api/user/settings`, {
        headers,
      });
      
      if (response.status === 401) {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        setToken(null);
        setUser(null);
        setIsAuthenticated(false);
        setEntries([]);
        return;
      }
      
      if (response.ok) {
        const data = await response.json();
        setSettings({
          name: data.name,
          email: data.email,
          pinEnabled: data.pinEnabled || false,
          timezone: data.timezone || "Asia/Jakarta",
        });
        setSettingsForm(prev => ({
          ...prev,
          name: data.name,
          email: data.email,
          pinEnabled: data.pinEnabled || false,
          timezone: data.timezone || "Asia/Jakarta",
        }));
      }
    } catch (error) {
      console.error("Failed to fetch settings:", error);
    }
  }, [token, isAuthenticated]);

  // Verify PIN dengan user's PIN
  const validatePin = useCallback(async () => {
    if (!settings.pinEnabled) {
      // Jika PIN tidak enabled, skip validation
      setPinError("");
      return true;
    }

    if (!pin || pin.length !== 4) {
      setPinError("PIN harus 4 digit.");
      return false;
    }

    // Verify PIN dengan backend
    try {
      const apiBase = getApiUrl();
      const headers = {
        "Content-Type": "application/json",
      };
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }
      const response = await fetch(`${apiBase}/api/user/verify-pin`, {
        method: "POST",
        headers,
        body: JSON.stringify({ pin }),
      });

      if (response.status === 401) {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        setToken(null);
        setUser(null);
        setIsAuthenticated(false);
        setEntries([]);
        setPinError("Session expired. Silakan login kembali.");
        return false;
      }

      if (response.ok) {
        setPinError("");
        return true;
      } else {
        const data = await response.json();
        setPinError(data.message || "PIN salah. Coba lagi.");
        return false;
      }
    } catch (error) {
      setPinError("Gagal memverifikasi PIN.");
      return false;
    }
  }, [settings.pinEnabled, pin, token]);

  // Admin functions
  const fetchAdminStats = useCallback(async () => {
    if (!token || !user || user.role !== 'admin') return;
    
    try {
      const apiBase = getApiUrl();
      const headers = {
        "Content-Type": "application/json",
      };
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }
      const response = await fetch(`${apiBase}/api/admin/stats`, { headers });
      
      if (response.ok) {
        const data = await response.json();
        setAdminStats(data);
      }
    } catch (error) {
      console.error("Failed to fetch admin stats:", error);
    }
  }, [token, user]);

  const fetchAdminUsers = useCallback(async () => {
    if (!token || !user || user.role !== 'admin') return;
    
    try {
      const apiBase = getApiUrl();
      const headers = {
        "Content-Type": "application/json",
      };
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }
      const response = await fetch(`${apiBase}/api/admin/users`, { headers });
      
      if (response.ok) {
        const data = await response.json();
        setAdminUsers(data);
      }
    } catch (error) {
      console.error("Failed to fetch admin users:", error);
    }
  }, [token, user]);

  const fetchAdminTransactions = useCallback(async () => {
    if (!token || !user || user.role !== 'admin') return;
    
    try {
      const apiBase = getApiUrl();
      const headers = {
        "Content-Type": "application/json",
      };
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }
      const response = await fetch(`${apiBase}/api/admin/transactions`, { headers });
      
      if (response.ok) {
        const data = await response.json();
        setAdminTransactions(data);
      }
    } catch (error) {
      console.error("Failed to fetch admin transactions:", error);
    }
  }, [token, user]);

  const handleEditUser = (userData) => {
    setSelectedUser(userData);
    setEditUserForm({
      name: userData.name,
      email: userData.email,
      role: userData.role || 'user',
    });
    setIsEditUserModalOpen(true);
  };

  const handleUpdateUser = async (e) => {
    e.preventDefault();
    if (!token || !selectedUser) return;
    
    setAdminLoading(true);
    try {
      const apiBase = getApiUrl();
      const headers = {
        "Content-Type": "application/json",
      };
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }
      const response = await fetch(`${apiBase}/api/admin/users/${selectedUser.id}`, {
        method: "PUT",
        headers,
        body: JSON.stringify(editUserForm),
      });
      
      if (response.ok) {
        setToast({ type: "success", message: "User berhasil diperbarui." });
        setIsEditUserModalOpen(false);
        fetchAdminUsers();
      } else {
        const data = await response.json();
        setToast({ type: "error", message: data.message || "Gagal memperbarui user." });
      }
    } catch (error) {
      setToast({ type: "error", message: "Gagal memperbarui user." });
    } finally {
      setAdminLoading(false);
    }
  };

  const handleDeleteUser = (userId) => {
    // Tampilkan modal konfirmasi
    setDeleteUserTarget(userId);
    setIsDeleteUserConfirmOpen(true);
  };

  const confirmDeleteUser = async () => {
    if (!token || !deleteUserTarget) return;
    
    setAdminLoading(true);
    setIsDeleteUserConfirmOpen(false);
    
    try {
      const apiBase = getApiUrl();
      const headers = {
        "Content-Type": "application/json",
      };
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }
      const response = await fetch(`${apiBase}/api/admin/users/${deleteUserTarget}`, {
        method: "DELETE",
        headers,
      });
      
      if (response.ok) {
        setToast({ type: "success", message: "User berhasil dihapus." });
        fetchAdminUsers();
      } else {
        const data = await response.json();
        setToast({ type: "error", message: data.message || "Gagal menghapus user." });
      }
    } catch (error) {
      setToast({ type: "error", message: "Gagal menghapus user." });
    } finally {
      setAdminLoading(false);
      setDeleteUserTarget(null);
    }
  };

  // Load admin data when admin page is opened
  useEffect(() => {
    if (isAdminPage && user?.role === 'admin') {
      fetchAdminStats();
      fetchAdminUsers();
      fetchAdminTransactions();
    }
  }, [isAdminPage, user, fetchAdminStats, fetchAdminUsers, fetchAdminTransactions]);


  // Authentication functions
  const handleLogin = async (e) => {
    e.preventDefault();
    setAuthError("");
    
    try {
      const apiBase = getApiUrl();
      const response = await fetch(`${apiBase}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(loginForm),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Login gagal.");
      }

      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));
      setToken(data.token);
      setUser(data.user);
      setIsAuthenticated(true);
      setIsLoginModalOpen(false);
      setLoginForm({ email: "", password: "" });
      setToast({ type: "success", message: `Selamat datang, ${data.user.name}!` });
      fetchEntries();
      // Fetch settings setelah login
      setTimeout(() => {
        fetchSettings();
      }, 100);
    } catch (error) {
      console.error(error);
      setAuthError(error.message);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setAuthError("");

    if (registerForm.password.length < 6) {
      setAuthError("Password minimal 6 karakter.");
      return;
    }

    try {
      const apiBase = getApiUrl();
      const response = await fetch(`${apiBase}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(registerForm),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Registrasi gagal.");
      }

      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));
      setToken(data.token);
      setUser(data.user);
      setIsAuthenticated(true);
      // Jika admin, langsung set ke admin page
      if (data.user.role === 'admin') {
        setIsAdminPage(true);
      }
      setIsRegisterModalOpen(false);
      setRegisterForm({ email: "", password: "", name: "" });
      setToast({ type: "success", message: `Akun berhasil dibuat, ${data.user.name}!` });
      fetchEntries();
      // Fetch settings setelah register
      setTimeout(() => {
        fetchSettings();
      }, 100);
    } catch (error) {
      console.error(error);
      setAuthError(error.message);
    }
  };

  const handleLogout = () => {
    // Tampilkan modal konfirmasi
    setIsLogoutConfirmOpen(true);
  };

  const confirmLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setToken(null);
    setUser(null);
    setIsAuthenticated(false);
    setEntries([]);
    setIsAdminPage(false);
    setIsLogoutConfirmOpen(false);
    setToast({ type: "success", message: "Anda telah logout." });
  };

  // Verify token on mount
  useEffect(() => {
    const verifyToken = async () => {
      if (!token) {
        setAuthLoading(false);
        return;
      }

      try {
        const apiBase = getApiUrl();
        const headers = {
          "Content-Type": "application/json",
        };
        if (token) {
          headers["Authorization"] = `Bearer ${token}`;
        }
        const response = await fetch(`${apiBase}/api/auth/verify`, {
          headers,
        });
        
        if (response.status === 401) {
          handleLogout();
          setAuthLoading(false);
          return;
        }
        
        if (response.ok) {
          const data = await response.json();
          setUser(data.user);
          setIsAuthenticated(true);
          // Jika admin, langsung set ke admin page
          if (data.user.role === 'admin') {
            setIsAdminPage(true);
          }
          // Fetch settings setelah login
          setTimeout(() => {
            fetchSettings();
          }, 100);
        } else {
          handleLogout();
        }
      } catch (error) {
        console.error("Token verification failed:", error);
        handleLogout();
      } finally {
        setAuthLoading(false);
      }
    };

    verifyToken();
  }, [token, fetchSettings]);

  const fetchEntries = useCallback(async (silent = false) => {
    if (!token || !isAuthenticated) return;
    
    if (!silent) {
      setLoading(true);
    }
    try {
      const apiBase = getApiUrl();
      const apiUrl = `${apiBase}/api/transactions`;
      
      // Debug: log API URL di development
      if (import.meta.env.DEV) {
        console.log('🔗 Fetching from:', apiUrl);
      }
      
      const response = await authenticatedFetch(apiUrl);
      
      // Check if response is HTML (error case)
      const contentType = response.headers.get('content-type');
      if (contentType && !contentType.includes('application/json')) {
        const text = await response.text();
        console.error('❌ Received non-JSON response:', text.substring(0, 200));
        throw new Error(`API tidak merespons dengan benar. Pastikan VITE_API_URL sudah di-set di Netlify.`);
      }
      
      if (!response.ok) {
        const body = await safeJson(response);
        throw new Error(body.message || "Gagal memuat data.");
      }
      const data = await response.json();
      setEntries(
        (data ?? []).map((entry) => ({
          ...entry,
          amount: Number(entry.amount) || 0,
        }))
      );
    } catch (error) {
      console.error(error);
      if (!silent) {
        setToast({ type: "error", message: error.message });
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [token, isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated) {
      fetchEntries();
    }
  }, [fetchEntries, isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated && token) {
      fetchSettings();
    }
  }, [isAuthenticated, token, fetchSettings]);

  // WebSocket untuk realtime update (menggantikan polling)
  useEffect(() => {
    if (!isAuthenticated || !token) {
      return;
    }

    // Tentukan URL WebSocket server
    const getSocketUrl = () => {
      // Gunakan environment variable jika tersedia
      const apiUrl = import.meta.env.VITE_API_URL;
      if (apiUrl) {
        // Pastikan tidak ada trailing slash
        return apiUrl.replace(/\/$/, '');
      }
      // Fallback: di development connect ke localhost, di production gunakan origin
      if (import.meta.env.DEV) {
        return "http://localhost:4000";
      }
      return window.location.origin;
    };

    const socketUrl = getSocketUrl();
    
    // Debug logging (hanya di development)
    if (import.meta.env.DEV) {
      console.log('🔌 Connecting to WebSocket:', socketUrl);
    }

    // Connect ke WebSocket server dengan authentication
    // Di production, force polling saja karena Netlify/Railway tidak support WebSocket dengan baik
    // Di development, biarkan Socket.IO coba WebSocket dulu
    const isProduction = !import.meta.env.DEV;
    const socket = io(socketUrl, {
      // Di production, hanya gunakan polling untuk menghindari error WebSocket
      // Di development, coba WebSocket dulu, fallback ke polling
      transports: isProduction ? ["polling"] : ["polling", "websocket"],
      upgrade: !isProduction, // Di production, jangan upgrade ke WebSocket
      autoConnect: true,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: Infinity, // Retry terus menerus
      timeout: 20000,
      forceNew: false,
      auth: {
        token: token,
      },
    });

    // Event listeners untuk debugging dan monitoring
    socket.on("connect", () => {
      // Log hanya di development
      if (import.meta.env.DEV) {
        console.log('Socket connected:', socket.id);
        console.log('Transport:', socket.io.engine.transport.name);
      }
    });

    socket.on("disconnect", (reason) => {
      // Log hanya di development
      if (import.meta.env.DEV) {
        console.log('Socket disconnected:', reason);
      }
    });

    socket.on("connect_error", (error) => {
      // Suppress error WebSocket di production karena kita sudah force polling
      // Error ini normal terjadi ketika WebSocket tidak tersedia
      if (import.meta.env.DEV) {
        console.error('Socket connection error:', error.message);
      }
      // Jika koneksi gagal, tetap gunakan polling untuk fetch data
      // fetchEntries akan tetap berjalan untuk fallback
    });

    socket.on("reconnect", (attemptNumber) => {
      if (import.meta.env.DEV) {
        console.log('WebSocket reconnected after', attemptNumber, 'attempts');
      }
    });

    socket.on("reconnect_attempt", () => {
      if (import.meta.env.DEV) {
        console.log('Attempting to reconnect WebSocket...');
      }
    });

    socket.on("reconnect_error", (error) => {
      // Suppress error di production karena kita sudah force polling
      if (import.meta.env.DEV) {
        console.error('Socket reconnection error:', error.message);
      }
    });

    socket.on("reconnect_failed", () => {
      // Log hanya di development
      if (import.meta.env.DEV) {
        console.error('Socket reconnection failed. Using polling fallback.');
      }
    });

    // Listen untuk update transaksi dari server
    socket.on("transactions:updated", (transactions) => {
      // Log di production juga untuk debugging
      if (import.meta.env.DEV) {
        console.log('Received transactions update via Socket');
      }
      // Update data tanpa loading indicator
      setEntries(
        (transactions ?? []).map((entry) => ({
          ...entry,
          amount: Number(entry.amount) || 0,
        }))
      );
    });

    // Listen untuk admin updates (hanya jika user adalah admin)
    if (user?.role === 'admin') {
      // Listen untuk admin stats update
      socket.on("admin:stats:updated", (stats) => {
        if (import.meta.env.DEV) {
          console.log('Admin stats updated via WebSocket');
        }
        setAdminStats(stats);
      });

      // Listen untuk admin users update
      socket.on("admin:users:updated", (users) => {
        if (import.meta.env.DEV) {
          console.log('Admin users updated via WebSocket');
        }
        setAdminUsers(users);
      });

      // Listen untuk admin transactions update
      socket.on("admin:transactions:updated", (transactions) => {
        if (import.meta.env.DEV) {
          console.log('Admin transactions updated via WebSocket');
        }
        setAdminTransactions(transactions);
      });
    }

    // Cleanup saat component unmount
    return () => {
      socket.disconnect();
    };
  }, [isAuthenticated, token, user]);

  useEffect(() => {
    if (!toast) return undefined;
    const timeout = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(timeout);
  }, [toast]);

  // Update waktu setiap detik
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const sortedEntries = useMemo(() => {
    return [...entries].sort((a, b) => {
      const dateDiff = new Date(b.date) - new Date(a.date);
      if (dateDiff !== 0) return dateDiff;
      return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    });
  }, [entries]);

const runningEntries = useMemo(() => {
  const reversed = [...sortedEntries].reverse();
  let balance = 0;
  const withBalance = reversed.map((entry) => {
    balance += entry.type === "income" ? entry.amount : -entry.amount;
    return { ...entry, runningBalance: balance };
  });
  return withBalance.reverse();
}, [sortedEntries]);

  const totals = useMemo(() => {
    return runningEntries.reduce(
      (acc, entry) => {
        if (entry.type === "income") {
          acc.income += entry.amount;
        } else {
          acc.expense += entry.amount;
        }
        acc.balance = acc.income - acc.expense;
        return acc;
      },
      { income: 0, expense: 0, balance: 0 }
    );
  }, [runningEntries]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    if (name === "amount") {
      const numeric = value.replace(/[^\d]/g, "");
      setForm((prev) => ({ ...prev, amount: numeric }));
      return;
    }
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (
      isPinStep &&
      ["delete", "reset", "export"].includes(pinMode ?? "")
    ) {
      return;
    }

    // Normalisasi form data - pastikan semua nilai ter-set dengan benar
    // JANGAN ubah type jika sudah valid, hanya set default jika undefined/null
    const normalizedForm = {
      description: (form.description || "").trim(),
      amount: form.amount ? form.amount.toString().replace(/[^\d]/g, "") : "",
      // Hanya set default jika type tidak ada atau tidak valid, jangan ubah jika sudah "income"
      type: form.type === "income" || form.type === "expense" ? form.type : "expense",
      date: form.date || getToday(settings.timezone || "Asia/Jakarta"),
    };

    const payload = {
      description: normalizedForm.description,
      amount: normalizedForm.amount ? Number(normalizedForm.amount) : 0,
      type: normalizedForm.type,
      date: normalizedForm.date,
    };

    const isEditing = Boolean(editingTarget);

    if (!isPinStep) {
      // Validasi dengan pesan yang lebih spesifik
      if (!payload.description || payload.description === "") {
        setToast({
          type: "error",
          message: "Uraian wajib diisi.",
        });
        return;
      }
      // Validasi type (seharusnya selalu valid karena sudah di-normalisasi)
      // Tapi tetap validasi untuk memastikan
      if (payload.type !== "income" && payload.type !== "expense") {
        setToast({
          type: "error",
          message: "Jenis transaksi wajib dipilih.",
        });
        return;
      }
      if (Number.isNaN(payload.amount) || payload.amount <= 0) {
        setToast({
          type: "error",
          message: "Nominal harus lebih dari 0.",
        });
        return;
      }
      if (!payload.date) {
        setToast({ type: "error", message: "Tanggal wajib diisi." });
        return;
      }
      setPendingPayload(payload);
      
      // Check if PIN is enabled
      if (settings.pinEnabled) {
        setIsPinStep(true);
        setPin("");
        setPinError("");
        setPinMode(isEditing ? "edit" : "create");
        setTimeout(() => {
          modalRef.current
            ?.querySelector("input[name='pin']")
            ?.focus();
        }, 0);
        return;
      } else {
        // PIN not enabled, proceed directly
        setPinMode(isEditing ? "edit" : "create");
        // Continue to submit without PIN
      }
    }

    const finalPayload = pendingPayload ?? payload;

    // Normalisasi finalPayload - pastikan type tidak diubah jika sudah valid
    const normalizedPayload = {
      description: (finalPayload.description || "").trim(),
      amount: finalPayload.amount 
        ? Number(finalPayload.amount.toString().replace(/[^\d]/g, "")) 
        : 0,
      // Hanya set default jika type tidak ada atau tidak valid, jangan ubah jika sudah "income"
      type: finalPayload.type === "income" || finalPayload.type === "expense" 
        ? finalPayload.type 
        : "expense",
      date: finalPayload.date || getToday(settings.timezone || "Asia/Jakarta"),
    };

    // Validasi ulang finalPayload sebelum submit
    if (
      !normalizedPayload.description ||
      !normalizedPayload.type ||
      !["income", "expense"].includes(normalizedPayload.type) ||
      Number.isNaN(normalizedPayload.amount) ||
      normalizedPayload.amount <= 0 ||
      !normalizedPayload.date
    ) {
      setToast({
        type: "error",
        message: "Deskripsi dan jenis transaksi wajib diisi.",
      });
      return;
    }

    setSubmitting(true);
    try {
      // Check if PIN is required
      if (settings.pinEnabled) {
        const isValid = await validatePin();
        if (!isValid) {
          setSubmitting(false);
          return;
        }
      }

      if (pinMode === "edit" && editingTarget) {
      const apiBase = getApiUrl();
      const response = await authenticatedFetch(
        `${apiBase}/api/transactions/${editingTarget}`,
          {
            method: "PUT",
            body: JSON.stringify(normalizedPayload),
          }
        );
        if (!response.ok) {
          const body = await safeJson(response);
          throw new Error(body.message || "Gagal memperbarui transaksi.");
        }
        setForm(createInitialForm({}, settings.timezone || "Asia/Jakarta"));
        setToast({ type: "success", message: "Transaksi diperbarui." });
        fetchEntries();
        resetPinFlow();
        return;
      }

      const apiBase = getApiUrl();
      const response = await authenticatedFetch(`${apiBase}/api/transactions`, {
        method: "POST",
        body: JSON.stringify(normalizedPayload),
      });
      if (!response.ok) {
        const body = await safeJson(response);
        throw new Error(body.message || "Gagal menyimpan transaksi.");
      }
      setForm(createInitialForm({}, settings.timezone || "Asia/Jakarta"));
      setToast({ type: "success", message: "Transaksi tersimpan!" });
      fetchEntries();
      resetPinFlow();
      return;
    } catch (error) {
      console.error(error);
      setToast({ type: "error", message: error.message });
    } finally {
      setSubmitting(false);
    }
  };

  const requestDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const apiBase = getApiUrl();
      const response = await authenticatedFetch(`${apiBase}/api/transactions/${deleteTarget}`, {
        method: "DELETE",
      });
      if (!response.ok && response.status !== 204) {
        const body = await safeJson(response);
        throw new Error(body.message || "Gagal menghapus transaksi.");
      }
      setToast({ type: "success", message: "Transaksi dihapus." });
      fetchEntries();
    } catch (error) {
      console.error(error);
      setToast({ type: "error", message: error.message });
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  const handleReset = async () => {
    setResetting(true);
    try {
      const apiBase = getApiUrl();
      const response = await authenticatedFetch(`${apiBase}/api/transactions`, { method: "DELETE" });
      if (!response.ok && response.status !== 204) {
        const body = await safeJson(response);
        throw new Error(body.message || "Gagal menghapus data.");
      }
      setToast({ type: "success", message: "Database dikosongkan." });
      fetchEntries();
    } catch (error) {
      console.error(error);
      setToast({ type: "error", message: error.message });
    } finally {
      setResetting(false);
      setIsConfirmOpen(false);
    }
  };

  const confirmDeleteWithPin = async () => {
    if (settings.pinEnabled) {
      const isValid = await validatePin();
      if (!isValid) return;
    }
    await requestDelete();
    resetPinFlow();
  };

  const confirmResetWithPin = async () => {
    if (settings.pinEnabled) {
      const isValid = await validatePin();
      if (!isValid) return;
    }
    await handleReset();
    resetPinFlow();
  };

  const confirmExportWithPin = async () => {
    if (settings.pinEnabled) {
      const isValid = await validatePin();
      if (!isValid) return;
    }
    const rows = runningEntries.map((entry) => ({
      Tanggal: formatDate(entry.date, settings.timezone || "Asia/Jakarta"),
      Uraian: entry.description,
      Pemasukan: entry.type === "income" ? entry.amount : 0,
      Pengeluaran: entry.type === "expense" ? entry.amount : 0,
      Saldo: entry.runningBalance,
    }));

    const worksheet = XLSXUtils.json_to_sheet(rows, {
      header: ["Tanggal", "Uraian", "Pemasukan", "Pengeluaran", "Saldo"],
    });
    const workbook = XLSXUtils.book_new();
    XLSXUtils.book_append_sheet(workbook, worksheet, "Transaksi");
    const filename = `prava-cash-transactions-${new Date()
      .toISOString()
      .slice(0, 10)}.xlsx`;
    writeXLSXFile(workbook, filename);
    setToast({ type: "success", message: "File Excel siap diunduh." });
    closeExportPinModal();
  };

  const handlePinBack = () => {
    if (pinMode === "create" || pinMode === "edit") {
      setIsPinStep(false);
      setPin("");
      setPinError("");
      setPinMode(null);
      setPendingPayload(null);
      return;
    }
    if (pinMode === "delete") {
      setDeleteTarget(null);
    }
    resetPinFlow();
  };

  const closeExportPinModal = () => {
    setIsExportPinOpen(false);
    setPin("");
    setPinError("");
    setPinMode(null);
  };

  const closeImportPinModal = () => {
    setIsImportPinOpen(false);
    setPin("");
    setPinError("");
    setPinMode(null);
  };

  const closeImportFileModal = () => {
    setIsImportFileOpen(false);
    setImportFile(null);
    setImportPreview([]);
  };

  // Helper untuk parse tanggal dari format Excel (DD MMM YYYY) ke YYYY-MM-DD
  const parseExcelDate = (dateStr) => {
    if (!dateStr) return null;
    
    // Jika sudah dalam format YYYY-MM-DD, return langsung
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return dateStr;
    }

    // Parse format "DD MMM YYYY" (contoh: "15 Des 2024")
    const months = {
      'jan': '01', 'feb': '02', 'mar': '03', 'apr': '04',
      'mei': '05', 'jun': '06', 'jul': '07', 'agu': '08',
      'sep': '09', 'okt': '10', 'nov': '11', 'des': '12',
      'januari': '01', 'februari': '02', 'maret': '03', 'april': '04',
      'juni': '06', 'juli': '07', 'agustus': '08',
      'september': '09', 'oktober': '10', 'november': '11', 'desember': '12'
    };

    // Coba parse berbagai format
    const dateMatch = dateStr.toString().trim().toLowerCase().match(/(\d{1,2})\s+(\w+)\s+(\d{4})/);
    if (dateMatch) {
      const day = dateMatch[1].padStart(2, '0');
      const month = months[dateMatch[2]];
      const year = dateMatch[3];
      if (month) {
        return `${year}-${month}-${day}`;
      }
    }

    // Fallback: coba parse sebagai Date object (untuk format Excel number)
    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }

    return null;
  };

  // Parse Excel file dan convert ke format transaksi
  const parseExcelFile = async (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target.result);
          const workbook = readXLSX(data, { type: 'array' });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          const jsonData = XLSXUtils.sheet_to_json(worksheet, { header: 1 });

          // Skip header row (baris pertama)
          const rows = jsonData.slice(1);
          const transactions = [];

          for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            if (!row || row.length < 5) continue; // Skip baris kosong atau tidak lengkap

            const [tanggal, uraian, pemasukan, pengeluaran, saldo] = row;

            // Skip jika uraian kosong
            if (!uraian || !uraian.toString().trim()) continue;

            // Parse tanggal
            const date = parseExcelDate(tanggal);
            if (!date) {
              console.warn(`Baris ${i + 2}: Tanggal tidak valid: ${tanggal}`);
              continue;
            }

            // Parse jumlah
            const pemasukanNum = Number(pemasukan) || 0;
            const pengeluaranNum = Number(pengeluaran) || 0;

            // Tentukan type berdasarkan mana yang lebih besar dari 0
            let type, amount;
            if (pemasukanNum > 0 && pengeluaranNum === 0) {
              type = "income";
              amount = pemasukanNum;
            } else if (pengeluaranNum > 0 && pemasukanNum === 0) {
              type = "expense";
              amount = pengeluaranNum;
            } else if (pemasukanNum > pengeluaranNum) {
              type = "income";
              amount = pemasukanNum;
            } else if (pengeluaranNum > pemasukanNum) {
              type = "expense";
              amount = pengeluaranNum;
            } else {
              // Jika keduanya 0 atau sama, skip
              continue;
            }

            transactions.push({
              description: uraian.toString().trim(),
              amount: amount,
              type: type,
              date: date,
            });
          }

          resolve(transactions);
        } catch (error) {
          reject(new Error(`Gagal membaca file Excel: ${error.message}`));
        }
      };
      reader.onerror = () => reject(new Error("Gagal membaca file."));
      reader.readAsArrayBuffer(file);
    });
  };

  // Handle file upload
  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    // Validasi file type
    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      setToast({ type: "error", message: "File harus berformat Excel (.xlsx atau .xls)" });
      return;
    }

    setImportFile(file);
    setImporting(true);

    try {
      const transactions = await parseExcelFile(file);
      if (transactions.length === 0) {
        setToast({ type: "error", message: "Tidak ada transaksi valid yang ditemukan di file Excel." });
        setImportFile(null);
        setImporting(false);
        return;
      }

      setImportPreview(transactions);
      setIsImportFileOpen(false);
      setPinMode("import");
      setPin("");
      setPinError("");
      setIsImportPinOpen(true);
    } catch (error) {
      console.error(error);
      setToast({ type: "error", message: error.message });
      setImportFile(null);
    } finally {
      setImporting(false);
    }
  };

  // Import batch transaksi ke API
  const importTransactions = async (transactions) => {
    const apiBase = getApiUrl();
    const results = {
      success: 0,
      failed: 0,
      errors: [],
    };

    // Import satu per satu untuk memastikan semua berhasil
    for (let i = 0; i < transactions.length; i++) {
      const transaction = transactions[i];
      try {
        const response = await authenticatedFetch(`${apiBase}/api/transactions`, {
          method: "POST",
          body: JSON.stringify(transaction),
        });

        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body.message || `Gagal menyimpan transaksi ke-${i + 1}`);
        }

        results.success++;
      } catch (error) {
        results.failed++;
        results.errors.push({
          index: i + 1,
          description: transaction.description,
          error: error.message,
        });
      }
    }

    return results;
  };

  // Confirm import dengan PIN
  const confirmImportWithPin = async () => {
    if (settings.pinEnabled) {
      const isValid = await validatePin();
      if (!isValid) return;
    }

    if (!importPreview || importPreview.length === 0) {
      setToast({ type: "error", message: "Tidak ada data untuk diimpor." });
      return;
    }

    setImporting(true);
    try {
      const results = await importTransactions(importPreview);

      if (results.failed === 0) {
        setToast({
          type: "success",
          message: `Berhasil mengimpor ${results.success} transaksi.`,
        });
      } else {
        setToast({
          type: "warning",
          message: `Berhasil: ${results.success}, Gagal: ${results.failed}. Cek console untuk detail.`,
        });
        console.error("Error import:", results.errors);
      }

      // Reset state
      closeImportPinModal();
      closeImportFileModal();
      fetchEntries();
    } catch (error) {
      console.error(error);
      setToast({ type: "error", message: error.message });
    } finally {
      setImporting(false);
    }
  };

  const handleImportExcel = () => {
    setIsImportFileOpen(true);
  };

  // Update profile
  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    setSettingsLoading(true);
    setSettingsError("");

    try {
      const apiBase = getApiUrl();
      const response = await authenticatedFetch(`${apiBase}/api/user/profile`, {
        method: "PUT",
        body: JSON.stringify({
          name: settingsForm.name,
          email: settingsForm.email,
          timezone: settingsForm.timezone,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Gagal memperbarui profile.");
      }

      setUser({ ...user, name: data.name, email: data.email });
      setSettings({ ...settings, name: data.name, email: data.email, timezone: data.timezone || "Asia/Jakarta" });
      setToast({ type: "success", message: "Profile berhasil diperbarui." });
    } catch (error) {
      console.error(error);
      setSettingsError(error.message);
    } finally {
      setSettingsLoading(false);
    }
  };

  // Update PIN settings
  const handleUpdatePin = async (e) => {
    e.preventDefault();
    setSettingsLoading(true);
    setSettingsError("");

    // Validate PIN if enabled
    if (settingsForm.pinEnabled && settingsForm.pin) {
      if (settingsForm.pin.length !== 4 || !/^\d{4}$/.test(settingsForm.pin)) {
        setSettingsError("PIN harus berupa 4 digit angka.");
        setSettingsLoading(false);
        return;
      }
    }

    try {
      const apiBase = getApiUrl();
      const response = await authenticatedFetch(`${apiBase}/api/user/pin`, {
        method: "PUT",
        body: JSON.stringify({
          pin: settingsForm.pinEnabled ? settingsForm.pin : null,
          pinEnabled: settingsForm.pinEnabled,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Gagal memperbarui PIN.");
      }

      setSettings({ ...settings, pinEnabled: data.pinEnabled });
      setSettingsForm({ ...settingsForm, pin: "" });
      setToast({ type: "success", message: data.message || "Pengaturan PIN berhasil diperbarui." });
    } catch (error) {
      console.error(error);
      setSettingsError(error.message);
    } finally {
      setSettingsLoading(false);
    }
  };

  const handleDownloadExcel = () => {
    if (!runningEntries.length) {
      setToast({ type: "error", message: "Belum ada transaksi untuk diunduh." });
      return;
    }

    // Check if PIN is enabled
    if (settings.pinEnabled) {
      setPinMode("export");
      setPin("");
      setPinError("");
      setIsExportPinOpen(true);
    } else {
      // PIN not enabled, proceed directly
      confirmExportWithPin();
    }
  };

  const openModal = (entry = null) => {
    if (entry) {
      setEditingTarget(entry.id);
      setForm(
        createInitialForm({
          description: entry.description,
          amount: String(entry.amount),
          type: entry.type,
          date: entry.date,
        }, settings.timezone || "Asia/Jakarta")
      );
    } else {
      setEditingTarget(null);
      setForm(createInitialForm({}, settings.timezone || "Asia/Jakarta"));
    }
    setIsPinStep(false);
    setPin("");
    setPinError("");
    setPinMode(null);
    setPendingPayload(null);
    setIsModalOpen(true);
    setTimeout(() => {
      modalRef.current
        ?.querySelector("input[name='description']")
        ?.focus();
    }, 0);
  };

  const closeModal = () => {
    resetPinFlow();
  };

  useEffect(() => {
    const shouldLock = isModalOpen || isConfirmOpen || isDeleteConfirmOpen;
    if (!shouldLock) {
      document.body.style.overflow = "";
      return undefined;
    }

    const handleKey = (event) => {
      if (event.key === "Escape") {
        setIsModalOpen(false);
        setIsConfirmOpen(false);
        setIsDeleteConfirmOpen(false);
        setIsMenuOpen(false);
      }
    };
    window.addEventListener("keydown", handleKey);
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", handleKey);
      document.body.style.overflow = "";
    };
  }, [isModalOpen, isConfirmOpen, isDeleteConfirmOpen]);

  // Close menu when clicking outside
  useEffect(() => {
    if (!isMenuOpen) return;

    const handleClickOutside = (event) => {
      if (!event.target.closest('.relative')) {
        setIsMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isMenuOpen]);

  const modalTitle = !isPinStep
    ? editingTarget
      ? "Edit transaksi"
      : "Tambah data baru"
    : pinMode === "delete"
    ? "Konfirmasi Penghapusan"
    : pinMode === "reset"
    ? "Konfirmasi Bersihkan Data"
    : "Konfirmasi PIN";

  const modalSubtitle = !isPinStep
    ? editingTarget
      ? "Perbarui detail transaksi dan simpan perubahan Anda."
      : "Nilai saldo akan diperbarui otomatis setiap transaksi tersimpan."
    : "";

  // Show loading screen while checking authentication
  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="mb-4 text-4xl">⏳</div>
          <p className="text-sm font-semibold text-slate-600">Memuat...</p>
        </div>
      </div>
    );
  }

  // Show login/register screen if not authenticated
  if (!isAuthenticated) {
    return (
      <>
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-900 to-slate-800 flex items-center justify-center px-4">
          {toast && (
            <div
              className={`fixed right-6 top-6 z-50 rounded-2xl px-4 py-3 text-white shadow-2xl transition-all ${
                toast.type === "error"
                  ? "bg-rose-500/90"
                  : "bg-emerald-500/90"
              }`}
            >
              <p className="text-sm font-semibold">{toast.message}</p>
            </div>
          )}

          <div className="w-full max-w-md">
            <div className="mb-8 text-center text-white">
              <h1 className="text-4xl font-bold mb-2">Prava Cash</h1>
              <p className="text-indigo-200">Cashflow Management Dashboard</p>
            </div>

            {/* Login Modal */}
            {isLoginModalOpen && (
              <div className="rounded-3xl bg-white p-8 shadow-2xl">
                <h2 className="mb-6 text-2xl font-semibold text-slate-900">Login</h2>
                <form onSubmit={handleLogin} className="space-y-4">
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-700">
                      Email
                    </label>
                    <input
                      type="email"
                      value={loginForm.email}
                      onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })}
                      className={inputClasses}
                      placeholder="nama@email.com"
                      required
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-700">
                      Password
                    </label>
                    <input
                      type="password"
                      value={loginForm.password}
                      onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                      className={inputClasses}
                      placeholder="••••••"
                      required
                    />
                  </div>
                  {authError && (
                    <p className="text-sm font-semibold text-rose-500">{authError}</p>
                  )}
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setIsLoginModalOpen(false);
                        setIsRegisterModalOpen(true);
                        setAuthError("");
                      }}
                      className="flex-1 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
                    >
                      Daftar
                    </button>
                    <button
                      type="submit"
                      className="flex-1 rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-soft transition hover:bg-indigo-700"
                    >
                      Login
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* Register Modal */}
            {isRegisterModalOpen && (
              <div className="rounded-3xl bg-white p-8 shadow-2xl">
                <h2 className="mb-6 text-2xl font-semibold text-slate-900">Daftar</h2>
                <form onSubmit={handleRegister} className="space-y-4">
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-700">
                      Nama
                    </label>
                    <input
                      type="text"
                      value={registerForm.name}
                      onChange={(e) => setRegisterForm({ ...registerForm, name: e.target.value })}
                      className={inputClasses}
                      placeholder="Nama Lengkap"
                      required
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-700">
                      Email
                    </label>
                    <input
                      type="email"
                      value={registerForm.email}
                      onChange={(e) => setRegisterForm({ ...registerForm, email: e.target.value })}
                      className={inputClasses}
                      placeholder="nama@email.com"
                      required
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-700">
                      Password
                    </label>
                    <input
                      type="password"
                      value={registerForm.password}
                      onChange={(e) => setRegisterForm({ ...registerForm, password: e.target.value })}
                      className={inputClasses}
                      placeholder="Minimal 6 karakter"
                      required
                      minLength={6}
                    />
                  </div>
                  {authError && (
                    <p className="text-sm font-semibold text-rose-500">{authError}</p>
                  )}
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setIsRegisterModalOpen(false);
                        setIsLoginModalOpen(true);
                        setAuthError("");
                      }}
                      className="flex-1 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
                    >
                      Login
                    </button>
                    <button
                      type="submit"
                      className="flex-1 rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-soft transition hover:bg-indigo-700"
                    >
                      Daftar
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* Default: Show login button */}
            {!isLoginModalOpen && !isRegisterModalOpen && (
              <div className="rounded-3xl bg-white p-8 shadow-2xl text-center">
                <p className="mb-6 text-slate-600">Silakan login untuk melanjutkan</p>
                <button
                  onClick={() => setIsLoginModalOpen(true)}
                  className="w-full rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-soft transition hover:bg-indigo-700"
                >
                  Login
                </button>
                <p className="mt-4 text-sm text-slate-500">
                  Belum punya akun?{" "}
                  <button
                    onClick={() => setIsRegisterModalOpen(true)}
                    className="font-semibold text-indigo-600 hover:text-indigo-700"
                  >
                    Daftar di sini
                  </button>
                </p>
              </div>
            )}
          </div>
        </div>
      </>
    );
  }

  // Show dashboard if authenticated
  return (
    <>
    <div className="min-h-screen bg-slate-50 pb-4">
      {toast && (
        <div
          className={`fixed right-6 top-6 z-50 rounded-2xl px-4 py-3 text-white shadow-2xl transition-all ${
            toast.type === "error"
              ? "bg-rose-500/90"
              : "bg-emerald-500/90"
          }`}
        >
          <p className="text-sm font-semibold">{toast.message}</p>
        </div>
      )}

      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 pt-8 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-5 rounded-3xl bg-gradient-to-r from-slate-900 via-indigo-900 to-slate-800 px-6 py-8 text-white shadow-soft sm:px-8">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-center sm:text-left">
              <p className="text-xs uppercase tracking-[0.4em] text-indigo-200">
                Prava Cash
              </p>
              {user && (
                <p className="mt-1 text-sm font-medium text-white/80">
                  Halo, {user.name}
                </p>
              )}
            </div>
            <div className="text-center sm:text-right">
              <p className="text-sm font-medium text-white/90">
                {currentTime.toLocaleDateString("id-ID", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                  timeZone: settings.timezone || "Asia/Jakarta",
                })}
              </p>
              <p className="text-lg font-semibold text-white">
                {currentTime.toLocaleTimeString("id-ID", {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                  hour12: false,
                  timeZone: settings.timezone || "Asia/Jakarta",
                })}
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            {/* Mobile: Side-by-side buttons, Desktop: Full width primary button */}
            {user?.role !== 'admin' && (
            <div className="flex w-full gap-2 sm:w-auto sm:flex-1">
              {/* Primary Button */}
              <button
                type="button"
                onClick={openModal}
                className="inline-flex flex-1 items-center justify-center rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-slate-900 shadow-soft transition hover:bg-slate-100 sm:flex-initial"
              >
                + Tambah Transaksi
              </button>
              
              {/* Mobile: Menu Button - Side by side with primary button */}
              <div className="relative sm:hidden">
                <button
                  type="button"
                  onClick={() => setIsMenuOpen(!isMenuOpen)}
                  className="inline-flex items-center justify-center rounded-2xl border border-white/30 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
                  aria-label="Menu"
                >
                  <span className="mr-2">Menu</span>
                  <svg
                    className={`h-4 w-4 transition-transform ${isMenuOpen ? "rotate-180" : ""}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </button>

                {/* Dropdown Menu */}
                {isMenuOpen && (
                  <>
                    {/* Backdrop */}
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setIsMenuOpen(false)}
                    />
                    {/* Menu Items */}
                    <div className="absolute right-0 top-full z-20 mt-2 w-48 rounded-2xl border border-white/20 bg-slate-800 shadow-2xl">
                      <div className="py-2">
                        <button
                          type="button"
                          onClick={() => {
                            setIsSettingsOpen(true);
                            fetchSettings();
                            setIsMenuOpen(false);
                          }}
                          className="w-full px-4 py-3 text-left text-sm font-semibold text-white transition hover:bg-white/10"
                        >
                          Settings
                        </button>
                        <div className="my-1 border-t border-white/20" />
                        <button
                          type="button"
                          onClick={() => {
                            setIsConfirmOpen(true);
                            setIsMenuOpen(false);
                          }}
                          className="w-full px-4 py-3 text-left text-sm font-semibold text-white transition hover:bg-white/10"
                        >
                          Bersihkan Data
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            handleImportExcel();
                            setIsMenuOpen(false);
                          }}
                          className="w-full px-4 py-3 text-left text-sm font-semibold text-white transition hover:bg-white/10"
                        >
                          Import Excel
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            handleDownloadExcel();
                            setIsMenuOpen(false);
                          }}
                          className="w-full px-4 py-3 text-left text-sm font-semibold text-white transition hover:bg-white/10"
                        >
                          Download Excel
                        </button>
                        <div className="my-1 border-t border-white/20" />
                        <button
                          type="button"
                          onClick={() => {
                            handleLogout();
                            setIsMenuOpen(false);
                          }}
                          className="w-full px-4 py-3 text-left text-sm font-semibold text-rose-400 transition hover:bg-white/10"
                        >
                          Logout
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
            )}
            
            {/* Mobile: Menu Button for Admin */}
            {user?.role === 'admin' && (
              <div className="relative sm:hidden">
                <button
                  type="button"
                  onClick={() => setIsMenuOpen(!isMenuOpen)}
                  className="inline-flex items-center justify-center rounded-2xl border border-white/30 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
                  aria-label="Menu"
                >
                  <span className="mr-2">Menu</span>
                  <svg
                    className={`h-4 w-4 transition-transform ${isMenuOpen ? "rotate-180" : ""}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </button>

                {/* Dropdown Menu for Admin */}
                {isMenuOpen && (
                  <>
                    {/* Backdrop */}
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setIsMenuOpen(false)}
                    />
                    {/* Menu Items */}
                    <div className="absolute right-0 top-full z-20 mt-2 w-48 rounded-2xl border border-white/20 bg-slate-800 shadow-2xl">
                      <div className="py-2">
                        <button
                          type="button"
                          onClick={() => {
                            setIsSettingsOpen(true);
                            fetchSettings();
                            setIsMenuOpen(false);
                          }}
                          className="w-full px-4 py-3 text-left text-sm font-semibold text-white transition hover:bg-white/10"
                        >
                          Settings
                        </button>
                        <div className="my-1 border-t border-white/20" />
                        <button
                          type="button"
                          onClick={() => {
                            handleLogout();
                            setIsMenuOpen(false);
                          }}
                          className="w-full px-4 py-3 text-left text-sm font-semibold text-rose-400 transition hover:bg-white/10"
                        >
                          Logout
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
            
            {/* Desktop: Secondary Actions - Horizontal */}
            <div className="hidden items-center gap-2 sm:flex">
              {user?.role !== 'admin' && (
                <>
              <button
                type="button"
                onClick={() => {
                  setIsSettingsOpen(true);
                  fetchSettings();
                }}
                className="inline-flex items-center justify-center rounded-2xl border border-white/30 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-white/10 sm:px-4"
              >
                Settings
              </button>
              <button
                type="button"
                onClick={() => setIsConfirmOpen(true)}
                className="inline-flex items-center justify-center rounded-2xl border border-white/30 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-white/10 sm:px-4"
              >
                Bersihkan Data
              </button>
              <button
                type="button"
                onClick={handleImportExcel}
                className="inline-flex items-center justify-center rounded-2xl border border-white/30 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-white/10 sm:px-4"
              >
                Import Excel
              </button>
              <button
                type="button"
                onClick={handleDownloadExcel}
                className="inline-flex items-center justify-center rounded-2xl border border-white/30 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-white/10 sm:px-4"
              >
                Download Excel
              </button>
              <button
                type="button"
                onClick={handleLogout}
                className="inline-flex items-center justify-center rounded-2xl border border-white/30 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-white/10 sm:px-4"
              >
                Logout
              </button>
              </>
              )}
              {user?.role === 'admin' && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setIsSettingsOpen(true);
                      fetchSettings();
                    }}
                    className="inline-flex items-center justify-center rounded-2xl border border-white/30 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-white/10 sm:px-4"
                  >
                    Settings
                  </button>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="inline-flex items-center justify-center rounded-2xl border border-white/30 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-white/10 sm:px-4"
                  >
                    Logout
                  </button>
                </>
              )}
            </div>
          </div>
        </header>

        {/* Admin Page - Auto show if user is admin */}
        {user?.role === 'admin' && (
          <div className="space-y-6">
            {/* Admin Tabs */}
            <div className="flex gap-2 rounded-2xl bg-white p-2 shadow-soft">
              <button
                type="button"
                onClick={() => setAdminTab("dashboard")}
                className={`flex-1 rounded-xl px-4 py-3 text-sm font-semibold transition ${
                  adminTab === "dashboard"
                    ? "bg-indigo-600 text-white"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                Dashboard
              </button>
              <button
                type="button"
                onClick={() => setAdminTab("users")}
                className={`flex-1 rounded-xl px-4 py-3 text-sm font-semibold transition ${
                  adminTab === "users"
                    ? "bg-indigo-600 text-white"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                Users ({adminUsers.length})
              </button>
              <button
                type="button"
                onClick={() => setAdminTab("transactions")}
                className={`flex-1 rounded-xl px-4 py-3 text-sm font-semibold transition ${
                  adminTab === "transactions"
                    ? "bg-indigo-600 text-white"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                Transactions ({adminTransactions.length})
              </button>
            </div>

            {/* Admin Dashboard Tab */}
            {adminTab === "dashboard" && adminStats && (
              <div className="space-y-6">
                {/* Key Metrics - System & User Activity */}
                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                  <StatCard
                    label="Total Users"
                    value={adminStats.totalUsers}
                    className="from-purple-500 via-purple-400 to-purple-500 text-white"
                  />
                  <StatCard
                    label="Active Users (7d)"
                    value={adminStats.activeUsers || 0}
                    className="from-emerald-500 via-emerald-400 to-emerald-500 text-white"
                  />
                  <StatCard
                    label="Inactive Users (30d)"
                    value={adminStats.inactiveUsers || 0}
                    className="from-amber-500 via-amber-400 to-amber-500 text-white"
                  />
                  <StatCard
                    label="Total Transactions"
                    value={adminStats.totalTransactions}
                    className="from-blue-500 via-blue-400 to-blue-500 text-white"
                  />
                </div>

                {/* Transaction Volume Metrics */}
                <div className="grid gap-6 rounded-2xl bg-white p-6 shadow-soft sm:grid-cols-2">
                  <div>
                    <h3 className="mb-4 text-lg font-semibold text-slate-900">Transaction Volume</h3>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-600">Income Transactions</span>
                        <span className="font-semibold text-slate-900">
                          {adminStats.transactionsByType?.find(t => t.type === 'income')?.count || 0}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-600">Expense Transactions</span>
                        <span className="font-semibold text-slate-900">
                          {adminStats.transactionsByType?.find(t => t.type === 'expense')?.count || 0}
                        </span>
                      </div>
                      <div className="mt-3 flex justify-between border-t border-slate-200 pt-2 text-sm font-semibold">
                        <span className="text-slate-900">Avg Transaction Value</span>
                        <span className="text-indigo-600">
                          {formatCurrency(Math.round(adminStats.avgTransactionValue || 0))}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div>
                    <h3 className="mb-4 text-lg font-semibold text-slate-900">User Engagement</h3>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-600">Active Rate</span>
                        <span className="font-semibold text-slate-900">
                          {adminStats.totalUsers > 0 
                            ? Math.round((adminStats.activeUsers / adminStats.totalUsers) * 100) 
                            : 0}%
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-600">Avg Transactions/User</span>
                        <span className="font-semibold text-slate-900">
                          {adminStats.totalUsers > 0 
                            ? Math.round(adminStats.totalTransactions / adminStats.totalUsers) 
                            : 0}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Financial Overview - Not in Cards */}
                <div className="rounded-2xl bg-white p-6 shadow-soft">
                  <h3 className="mb-4 text-lg font-semibold text-slate-900">Financial Overview</h3>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div>
                      <p className="text-sm text-slate-600">Total Income</p>
                      <p className="mt-1 text-xl font-semibold text-emerald-600">
                        {formatCurrency(adminStats.totalIncome || 0)}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-slate-600">Total Expense</p>
                      <p className="mt-1 text-xl font-semibold text-rose-600">
                        {formatCurrency(adminStats.totalExpense || 0)}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-slate-600">Total Balance</p>
                      <p className={`mt-1 text-xl font-semibold ${
                        (adminStats.totalBalance || 0) >= 0 ? 'text-emerald-600' : 'text-rose-600'
                      }`}>
                        {formatCurrency(adminStats.totalBalance || 0)}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Min/Max Statistics */}
                <div className="grid gap-6 rounded-2xl bg-white p-6 shadow-soft sm:grid-cols-3">
                  {/* Income Min/Max */}
                  <div>
                    <h3 className="mb-4 text-lg font-semibold text-slate-900">Pemasukan</h3>
                    <div className="space-y-3">
                      {adminStats.maxIncome && (
                        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                          <p className="text-xs text-emerald-700">
                            Tertinggi {adminStats.maxIncome.count > 1 && `(${adminStats.maxIncome.count} user)`}
                          </p>
                          <p className="mt-1 text-sm font-semibold text-emerald-900">
                            {formatCurrency(adminStats.maxIncome.amount)}
                          </p>
                          <div className="mt-2 space-y-1">
                            {adminStats.maxIncome.users.map((u, idx) => (
                              <p key={idx} className="text-xs text-emerald-600">
                                {u.name}
                              </p>
                            ))}
                          </div>
                        </div>
                      )}
                      {adminStats.minIncome && (
                        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                          <p className="text-xs text-slate-700">
                            Terendah {adminStats.minIncome.count > 1 && `(${adminStats.minIncome.count} user)`}
                          </p>
                          <p className="mt-1 text-sm font-semibold text-slate-900">
                            {formatCurrency(adminStats.minIncome.amount)}
                          </p>
                          <div className="mt-2 space-y-1">
                            {adminStats.minIncome.users.map((u, idx) => (
                              <p key={idx} className="text-xs text-slate-600">
                                {u.name}
                              </p>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Expense Min/Max */}
                  <div>
                    <h3 className="mb-4 text-lg font-semibold text-slate-900">Pengeluaran</h3>
                    <div className="space-y-3">
                      {adminStats.maxExpense && (
                        <div className="rounded-lg border border-rose-200 bg-rose-50 p-3">
                          <p className="text-xs text-rose-700">
                            Tertinggi {adminStats.maxExpense.count > 1 && `(${adminStats.maxExpense.count} user)`}
                          </p>
                          <p className="mt-1 text-sm font-semibold text-rose-900">
                            {formatCurrency(adminStats.maxExpense.amount)}
                          </p>
                          <div className="mt-2 space-y-1">
                            {adminStats.maxExpense.users.map((u, idx) => (
                              <p key={idx} className="text-xs text-rose-600">
                                {u.name}
                              </p>
                            ))}
                          </div>
                        </div>
                      )}
                      {adminStats.minExpense && (
                        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                          <p className="text-xs text-slate-700">
                            Terendah {adminStats.minExpense.count > 1 && `(${adminStats.minExpense.count} user)`}
                          </p>
                          <p className="mt-1 text-sm font-semibold text-slate-900">
                            {formatCurrency(adminStats.minExpense.amount)}
                          </p>
                          <div className="mt-2 space-y-1">
                            {adminStats.minExpense.users.map((u, idx) => (
                              <p key={idx} className="text-xs text-slate-600">
                                {u.name}
                              </p>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Balance Min/Max */}
                  <div>
                    <h3 className="mb-4 text-lg font-semibold text-slate-900">Saldo</h3>
                    <div className="space-y-3">
                      {adminStats.maxBalance && (
                        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                          <p className="text-xs text-emerald-700">
                            Tertinggi {adminStats.maxBalance.count > 1 && `(${adminStats.maxBalance.count} user)`}
                          </p>
                          <p className="mt-1 text-sm font-semibold text-emerald-900">
                            {formatCurrency(adminStats.maxBalance.amount)}
                          </p>
                          <div className="mt-2 space-y-1">
                            {adminStats.maxBalance.users.map((u, idx) => (
                              <p key={idx} className="text-xs text-emerald-600">
                                {u.name}
                              </p>
                            ))}
                          </div>
                        </div>
                      )}
                      {adminStats.minBalance && (
                        <div className="rounded-lg border border-rose-200 bg-rose-50 p-3">
                          <p className="text-xs text-rose-700">
                            Terendah {adminStats.minBalance.count > 1 && `(${adminStats.minBalance.count} user)`}
                          </p>
                          <p className="mt-1 text-sm font-semibold text-rose-900">
                            {formatCurrency(adminStats.minBalance.amount)}
                          </p>
                          <div className="mt-2 space-y-1">
                            {adminStats.minBalance.users.map((u, idx) => (
                              <p key={idx} className="text-xs text-rose-600">
                                {u.name}
                              </p>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Growth Metrics */}
                <div className="grid gap-6 rounded-2xl bg-white p-6 shadow-soft sm:grid-cols-2">
                  <div>
                    <h3 className="mb-4 text-lg font-semibold text-slate-900">New Users</h3>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-600">Today</span>
                        <span className="font-semibold text-slate-900">{adminStats.newUsers?.today || 0}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-600">This Week</span>
                        <span className="font-semibold text-slate-900">{adminStats.newUsers?.thisWeek || 0}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-600">This Month</span>
                        <span className="font-semibold text-slate-900">{adminStats.newUsers?.thisMonth || 0}</span>
                      </div>
                    </div>
                  </div>
                  <div>
                    <h3 className="mb-4 text-lg font-semibold text-slate-900">New Transactions</h3>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-600">Today</span>
                        <span className="font-semibold text-slate-900">{adminStats.newTransactions?.today || 0}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-600">This Week</span>
                        <span className="font-semibold text-slate-900">{adminStats.newTransactions?.thisWeek || 0}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-600">This Month</span>
                        <span className="font-semibold text-slate-900">{adminStats.newTransactions?.thisMonth || 0}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Admin Users Tab */}
            {adminTab === "users" && (
              <div className="rounded-2xl bg-white shadow-soft">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-100">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Name
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Email
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Role
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Transactions
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Last Login
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Created
                        </th>
                        <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {adminUsers.map((u) => (
                        <tr key={u.id}>
                          <td className="px-4 py-3 text-sm font-semibold text-slate-900">
                            {u.name}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-600">{u.email}</td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${
                                u.role === "admin"
                                  ? "bg-purple-100 text-purple-700"
                                  : "bg-slate-100 text-slate-700"
                              }`}
                            >
                              {u.role || "user"}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-600">
                            {u.transaction_count || 0}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-500">
                            {u.last_login_at 
                              ? new Date(u.last_login_at).toLocaleDateString("id-ID", {
                                  day: "numeric",
                                  month: "short",
                                  year: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                  timeZone: settings.timezone || "Asia/Jakarta"
                                })
                              : "Never"}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-500">
                            {new Date(u.created_at).toLocaleDateString("id-ID", {
                              timeZone: settings.timezone || "Asia/Jakarta"
                            })}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex justify-center gap-2">
                              <button
                                onClick={() => handleEditUser(u)}
                                className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-600 transition hover:bg-indigo-100"
                              >
                                Edit
                              </button>
                              {u.id !== user.id && (
                                <button
                                  onClick={() => handleDeleteUser(u.id)}
                                  className="rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-600 transition hover:bg-rose-100"
                                >
                                  Delete
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Admin Transactions Tab - Grouped by User */}
            {adminTab === "transactions" && (
              <div className="space-y-4">
                {(() => {
                  // Group transactions by user
                  const transactionsByUser = adminTransactions.reduce((acc, transaction) => {
                    const userId = transaction.user_id;
                    if (!acc[userId]) {
                      acc[userId] = {
                        user_id: userId,
                        user_name: transaction.user_name,
                        user_email: transaction.user_email,
                        transactions: [],
                        total_income: 0,
                        total_expense: 0,
                      };
                    }
                    acc[userId].transactions.push(transaction);
                    if (transaction.type === 'income') {
                      acc[userId].total_income += transaction.amount;
                    } else {
                      acc[userId].total_expense += transaction.amount;
                    }
                    return acc;
                  }, {});

                  const userGroups = Object.values(transactionsByUser).sort((a, b) => 
                    b.transactions.length - a.transactions.length
                  );

                  return userGroups.map((userGroup) => {
                    const isExpanded = expandedUsers.has(userGroup.user_id);
                    const balance = userGroup.total_income - userGroup.total_expense;

                    return (
                      <div key={userGroup.user_id} className="rounded-2xl border border-slate-200 bg-white shadow-soft">
                        {/* User Header - Clickable */}
                        <button
                          type="button"
                          onClick={() => {
                            const newExpanded = new Set(expandedUsers);
                            if (isExpanded) {
                              newExpanded.delete(userGroup.user_id);
                            } else {
                              newExpanded.add(userGroup.user_id);
                            }
                            setExpandedUsers(newExpanded);
                          }}
                          className="w-full px-6 py-4 text-left transition hover:bg-slate-50"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-3">
                                <h3 className="text-lg font-semibold text-slate-900">
                                  {userGroup.user_name}
                                </h3>
                                <span className="text-sm text-slate-500">
                                  ({userGroup.user_email})
                                </span>
                              </div>
                              <div className="mt-2 flex gap-4 text-sm text-slate-600">
                                <span>
                                  <span className="font-semibold">{userGroup.transactions.length}</span> transaksi
                                </span>
                                <span>
                                  Income: <span className="font-semibold text-emerald-600">{formatCurrency(userGroup.total_income)}</span>
                                </span>
                                <span>
                                  Expense: <span className="font-semibold text-rose-600">{formatCurrency(userGroup.total_expense)}</span>
                                </span>
                                <span>
                                  Balance: <span className={`font-semibold ${balance >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                    {formatCurrency(balance)}
                                  </span>
                                </span>
                              </div>
                            </div>
                            <svg
                              className={`h-5 w-5 text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M19 9l-7 7-7-7"
                              />
                            </svg>
                          </div>
                        </button>

                        {/* Transactions List - Collapsible with Scroll */}
                        {isExpanded && (
                          <div className="border-t border-slate-200">
                            <div className="max-h-[400px] overflow-y-auto">
                              <div className="overflow-x-auto">
                                <table className="min-w-full divide-y divide-slate-100">
                                  <thead className="sticky top-0 bg-slate-50 z-10">
                                    <tr>
                                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                                        Date
                                      </th>
                                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                                        Description
                                      </th>
                                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                                        Type
                                      </th>
                                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                                        Amount
                                      </th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100 bg-white">
                                    {userGroup.transactions
                                      .sort((a, b) => new Date(b.date) - new Date(a.date))
                                      .map((t) => (
                                        <tr key={t.id}>
                                          <td className="px-4 py-3 text-sm text-slate-600">
                                            {formatDate(t.date, settings.timezone || "Asia/Jakarta")}
                                          </td>
                                          <td className="px-4 py-3 text-sm text-slate-600">{t.description}</td>
                                          <td className="px-4 py-3">
                                            <Badge
                                              label={t.type}
                                              variant={t.type}
                                            />
                                          </td>
                                          <td className="px-4 py-3 text-right text-sm font-semibold text-slate-900">
                                            {formatCurrency(t.amount)}
                                          </td>
                                        </tr>
                                      ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  });
                })()}

                {adminTransactions.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-white py-12 text-center">
                    <p className="text-base font-semibold text-slate-800">
                      Belum ada transaksi
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      Transaksi akan muncul di sini setelah user membuat transaksi.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Normal Dashboard - Only for non-admin users */}
        {user?.role !== 'admin' && (
          <>
            <section className="relative pb-2 sm:grid sm:grid-cols-3 sm:gap-6">
              <div className="relative overflow-hidden sm:col-span-3 sm:grid sm:grid-cols-3 sm:gap-6 sm:overflow-visible">
            <div
              className="flex transition-transform duration-300 ease-in-out sm:contents"
              style={{
                transform: `translateX(-${currentCardIndex * 100}%)`,
              }}
            >
              <div className="min-w-full flex-shrink-0 sm:min-w-0">
                <StatCard
                  label="Saldo"
                  value={formatCurrency(totals.balance)}
                  className={STAT_STYLES.balance}
                />
              </div>
              <div className="min-w-full flex-shrink-0 sm:min-w-0">
                <StatCard
                  label="Pemasukan"
                  value={formatCurrency(totals.income)}
                  className={STAT_STYLES.income}
                />
              </div>
              <div className="min-w-full flex-shrink-0 sm:min-w-0">
                <StatCard
                  label="Pengeluaran"
                  value={formatCurrency(totals.expense)}
                  className={STAT_STYLES.expense}
                />
              </div>
            </div>
              </div>
              
              {/* Carousel Dots Indicator - hanya tampil di mobile */}
              <div className="mt-4 flex justify-center gap-2 sm:hidden">
            {[0, 1, 2].map((index) => (
              <button
                key={index}
                type="button"
                onClick={() => setCurrentCardIndex(index)}
                className={`h-2 rounded-full transition-all ${
                  currentCardIndex === index
                    ? "w-8 bg-indigo-500"
                    : "w-2 bg-slate-300"
                }`}
                aria-label={`Go to slide ${index + 1}`}
              />
            ))}
              </div>
            </section>

            <section className="grid gap-6">
          <div className="rounded-3xl bg-white p-6 shadow-soft">
            <div className="flex flex-col gap-2 pb-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                  Daftar Transaksi
                </p>
                <h2 className="text-2xl font-semibold text-slate-900">
                  Histori arus kas
                </h2>
              </div>
              <p className="text-sm text-slate-500">
                {loading
                  ? "Memuat data..."
                  : `${entries.length} transaksi tersimpan`}
              </p>
            </div>

            {loading ? (
              <div className="py-20 text-center text-sm text-slate-500">
                Memuat transaksi...
              </div>
            ) : runningEntries.length === 0 ? (
              <EmptyState />
            ) : (
              <>
                <div className="hidden md:block">
                  <div className="max-h-[320px] overflow-y-auto rounded-2xl border border-slate-100">
                    <table className="min-w-full divide-y divide-slate-100">
                      <thead className="sticky top-0 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="px-4 py-3 text-left">Tanggal</th>
                          <th className="px-4 py-3 text-left">Uraian</th>
                          <th className="px-4 py-3 text-right">Pemasukan</th>
                          <th className="px-4 py-3 text-right">Pengeluaran</th>
                          <th className="px-4 py-3 text-right">Saldo</th>
                          <th className="px-4 py-3 text-center">Aksi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
                        {runningEntries.map((entry, index) => (
                          <tr key={entry.id}>
                            <td className="px-4 py-3 text-slate-500">
                              {formatDate(entry.date, settings.timezone || "Asia/Jakarta")}
                            </td>
                            <td className="px-4 py-3 font-semibold text-slate-900">
                              {entry.description}
                            </td>
                            <td className="px-4 py-3 text-right text-emerald-600">
                              {entry.type === "income"
                                ? formatCurrency(entry.amount)
                                : "-"}
                            </td>
                            <td className="px-4 py-3 text-right text-rose-600">
                              {entry.type === "expense"
                                ? formatCurrency(entry.amount)
                                : "-"}
                            </td>
                            <td className="px-4 py-3 text-right font-semibold text-slate-900">
                              {formatCurrency(entry.runningBalance)}
                            </td>
                          <td className="px-4 py-3">
                            <div className="flex justify-center gap-2">
                              <button
                                onClick={() => openModal(entry)}
                                className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500 transition hover:bg-slate-200"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => {
                                  setDeleteTarget(entry.id);
                                  setIsDeleteConfirmOpen(true);
                                }}
                                className="rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-500 transition hover:bg-rose-100"
                              >
                                Hapus
                              </button>
                            </div>
                          </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="md:hidden">
                  <div className="max-h-[360px] overflow-y-auto rounded-2xl border border-slate-100 p-1">
                    <div className="space-y-3">
                      {runningEntries.map((entry, index) => (
                        <div
                          key={`${entry.id}-scrollable`}
                          className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm"
                        >
                          <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-[11px] uppercase tracking-wide text-slate-400">
                            {formatDate(entry.date)}
                          </p>
                          <p className="text-base font-semibold text-slate-900">
                            {entry.description}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => openModal(entry)}
                            className="text-xs font-semibold text-slate-500"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => {
                              setDeleteTarget(entry.id);
                              setIsDeleteConfirmOpen(true);
                            }}
                            className="text-xs font-semibold text-rose-500"
                          >
                            Hapus
                          </button>
                        </div>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-2 text-[13px]">
                            <Badge
                              label={`${
                                entry.type === "income" ? "+" : "-"
                              }${formatCurrency(entry.amount)}`}
                              variant={entry.type}
                              size="sm"
                            />
                            <Badge
                              label={`Saldo: ${formatCurrency(
                                entry.runningBalance
                              )}`}
                              variant="neutral"
                              size="sm"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </section>
          </>
        )}

      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 px-4">
          <div
            ref={modalRef}
            className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl sm:p-8"
          >
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                  {isPinStep ? "Keamanan PIN" : "Input Transaksi"}
                </p>
                <h2 className="text-2xl font-semibold text-slate-900">
                  {modalTitle}
                </h2>
                {modalSubtitle && (
                  <p className="text-sm text-slate-500">{modalSubtitle}</p>
                )}
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="rounded-full bg-slate-100 p-2 text-slate-500 transition hover:bg-slate-200"
                aria-label="Tutup form"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              {!isPinStep ? (
                <>
                  <Field label="Uraian">
                    <input
                      name="description"
                      value={form.description || ""}
                      onChange={handleChange}
                      placeholder="Contoh: Warung Biru"
                      className={inputClasses}
                    />
                  </Field>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Nominal">
                      <div className="flex items-center rounded-2xl border border-slate-200 bg-slate-50 px-3 py-1">
                        <span className="text-sm font-semibold text-slate-500">
                          Rp
                        </span>
                        <input
                          type="text"
                          name="amount"
                          inputMode="numeric"
                          value={
                            form.amount && form.amount !== "" && !Number.isNaN(Number(form.amount))
                              ? Number(form.amount).toLocaleString("id-ID")
                              : ""
                          }
                          onChange={handleChange}
                          className="ml-2 w-full border-none bg-transparent px-0 py-2 text-base font-semibold text-slate-900 outline-none focus:ring-0"
                          placeholder="0"
                        />
                      </div>
                    </Field>
                    <Field label="Jenis">
                      <select
                        name="type"
                        value={form.type || "expense"}
                        onChange={handleChange}
                        className={inputClasses}
                      >
                        <option value="expense">Pengeluaran</option>
                        <option value="income">Pemasukan</option>
                      </select>
                    </Field>
                  </div>

                  <Field label="Tanggal">
                    <input
                      type="date"
                      name="date"
                      value={form.date || getToday(settings.timezone || "Asia/Jakarta")}
                      onChange={handleChange}
                      className={inputClasses}
                    />
                  </Field>
                </>
              ) : settings.pinEnabled ? (
                <div className="space-y-3">
                  <p className="text-center text-sm text-slate-500">
                    {pinDescriptions[pinMode ?? "create"]}
                  </p>
                  <Field label="PIN">
                    <input
                      type="password"
                      name="pin"
                      value={pin || ""}
                      onChange={(event) => {
                        setPin(event.target.value.slice(0, 4));
                        setPinError("");
                      }}
                      inputMode="numeric"
                      pattern="\d{4}"
                      maxLength={4}
                      className={`${inputClasses} text-center tracking-[0.5em]`}
                      placeholder="••••"
                    />
                  </Field>
                  {pinError && (
                    <p className="text-center text-xs font-semibold text-rose-500">
                      {pinError}
                    </p>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-center text-sm text-slate-500">
                    Konfirmasi untuk melanjutkan.
                  </p>
                </div>
              )}

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <button
                  type="button"
                  onClick={isPinStep ? handlePinBack : closeModal}
                  className="inline-flex w-full items-center justify-center rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 sm:w-auto sm:flex-1"
                >
                  {isPinStep ? "Kembali" : "Batalkan"}
                </button>
                {isPinStep && pinMode === "reset" ? (
                  <button
                    type="button"
                    onClick={confirmResetWithPin}
                    disabled={resetting}
                    className="inline-flex w-full items-center justify-center rounded-2xl bg-rose-600 px-4 py-3 text-sm font-semibold text-white shadow-soft transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:bg-rose-300 sm:w-auto sm:flex-1"
                  >
                    {resetting ? "Menghapus..." : settings.pinEnabled ? "Konfirmasi PIN" : "Konfirmasi"}
                  </button>
                ) : isPinStep && pinMode === "delete" ? (
                  <button
                    type="button"
                    onClick={confirmDeleteWithPin}
                    disabled={deleting}
                    className="inline-flex w-full items-center justify-center rounded-2xl bg-rose-600 px-4 py-3 text-sm font-semibold text-white shadow-soft transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:bg-rose-300 sm:w-auto sm:flex-1"
                  >
                    {deleting ? "Menghapus..." : settings.pinEnabled ? "Konfirmasi PIN" : "Konfirmasi"}
                  </button>
                ) : isPinStep && pinMode === "export" ? (
                  <button
                    type="button"
                    onClick={confirmExportWithPin}
                    className="inline-flex w-full items-center justify-center rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-soft transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300 sm:w-auto sm:flex-1"
                  >
                    {settings.pinEnabled ? "Konfirmasi PIN" : "Konfirmasi"}
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={submitting}
                    className="inline-flex w-full items-center justify-center rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-soft transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-indigo-300 sm:w-auto sm:flex-1"
                  >
                    {submitting
                      ? "Memproses..."
                      : isPinStep
                      ? settings.pinEnabled
                        ? "Konfirmasi PIN"
                        : "Konfirmasi"
                      : editingTarget
                      ? "Simpan Perubahan"
                      : "Lanjutkan"}
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}

      {isConfirmOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/70 px-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 text-center shadow-2xl sm:p-8">
            <p className="text-sm font-semibold uppercase tracking-wide text-rose-500">
              Hapus semua data?
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-slate-900">
              Tindakan ini permanen
            </h2>
            <p className="mt-3 text-sm text-slate-500">
              Semua transaksi akan dihapus dan tidak dapat dikembalikan. Pastikan
              Anda sudah membuat cadangan jika diperlukan.
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setIsConfirmOpen(false)}
                className="inline-flex items-center justify-center rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
              >
                Batalkan
              </button>
              <button
                type="button"
                onClick={() => {
                  if (settings.pinEnabled) {
                    setPinMode("reset");
                    setPin("");
                    setPinError("");
                    setIsPinStep(true);
                    setIsConfirmOpen(false);
                    setIsModalOpen(true);
                    setTimeout(() => {
                      modalRef.current
                        ?.querySelector("input[name='pin']")
                        ?.focus();
                    }, 0);
                  } else {
                    setIsConfirmOpen(false);
                    handleReset();
                  }
                }}
                className="inline-flex items-center justify-center rounded-2xl bg-rose-600 px-4 py-3 text-sm font-semibold text-white shadow-soft transition hover:bg-rose-700"
              >
                Ya, hapus semua
              </button>
            </div>
          </div>
        </div>
      )}

      {isDeleteConfirmOpen && deleteTarget && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/70 px-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 text-center shadow-2xl sm:p-8">
            <p className="text-sm font-semibold uppercase tracking-wide text-rose-500">
              Hapus transaksi?
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-slate-900">
              Tindakan tidak dapat dibatalkan
            </h2>
            <p className="mt-3 text-sm text-slate-500">
              Transaksi ini akan dihapus permanen dari database.
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => {
                  setIsDeleteConfirmOpen(false);
                  setDeleteTarget(null);
                }}
                className="inline-flex items-center justify-center rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
              >
                Batalkan
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsDeleteConfirmOpen(false);
                  if (settings.pinEnabled) {
                    setPinMode("delete");
                    setPin("");
                    setPinError("");
                    setIsPinStep(true);
                    setIsModalOpen(true);
                    setTimeout(() => {
                      modalRef.current
                        ?.querySelector("input[name='pin']")
                        ?.focus();
                    }, 0);
                  } else {
                    requestDelete();
                  }
                }}
                className="inline-flex items-center justify-center rounded-2xl bg-rose-600 px-4 py-3 text-sm font-semibold text-white shadow-soft transition hover:bg-rose-700"
              >
                Ya, hapus
              </button>
            </div>
          </div>
        </div>
      )}

      {isExportPinOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/70 px-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 text-center shadow-2xl sm:p-8">
            <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Keamanan PIN
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-slate-900">
              Konfirmasi PIN
            </h2>
            <p className="mt-3	text-sm text-slate-500">
              Masukkan PIN 4-digit untuk mengunduh transaksi.
            </p>
            <div className="mt-4 space-y-3 text-left">
              <Field label="PIN">
                <input
                  type="password"
                  name="pin"
                  value={pin || ""}
                  onChange={(event) => {
                    setPin(event.target.value.slice(0, 4));
                    setPinError("");
                  }}
                  inputMode="numeric"
                  pattern="\d{4}"
                  maxLength={4}
                  className={`${inputClasses} text-center tracking-[0.5em]`}
                  placeholder="••••"
                />
              </Field>
              {pinError && (
                <p className="text-center text-xs font-semibold text-rose-500">
                  {pinError}
                </p>
              )}
            </div>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={closeExportPinModal}
                className="inline-flex items-center justify-center rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
              >
                Batalkan
              </button>
              <button
                type="button"
                onClick={confirmExportWithPin}
                className="inline-flex items-center justify-center rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-soft transition hover:bg-emerald-700"
              >
                Konfirmasi PIN
              </button>
            </div>
          </div>
        </div>
      )}

      {isImportFileOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/70 px-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 text-center shadow-2xl sm:p-8">
            <p className="text-sm font-semibold uppercase tracking-wide text-indigo-500">
              Import Excel
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-slate-900">
              Upload File Excel
            </h2>
            <p className="mt-3 text-sm text-slate-500">
              Pilih file Excel yang akan diimpor. Format harus sesuai dengan file yang diunduh dari aplikasi ini.
            </p>
            <div className="mt-6 space-y-4">
              <div className="relative">
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleFileUpload}
                  disabled={importing}
                  className="hidden"
                  id="excel-file-input"
                />
                <label
                  htmlFor="excel-file-input"
                  className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-8 transition ${
                    importing
                      ? "border-slate-200 bg-slate-50 cursor-not-allowed"
                      : "border-indigo-300 bg-indigo-50 hover:border-indigo-400 hover:bg-indigo-100"
                  }`}
                >
                  {importing ? (
                    <>
                      <div className="mb-2 text-2xl">⏳</div>
                      <p className="text-sm font-semibold text-slate-600">
                        Memproses file...
                      </p>
                    </>
                  ) : (
                    <>
                      <div className="mb-2 text-2xl">📄</div>
                      <p className="text-sm font-semibold text-indigo-600">
                        Klik untuk memilih file
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Format: .xlsx atau .xls
                      </p>
                    </>
                  )}
                </label>
              </div>
              {importFile && (
                <div className="rounded-xl bg-slate-50 p-3 text-left">
                  <p className="text-xs font-semibold text-slate-500">File terpilih:</p>
                  <p className="text-sm font-medium text-slate-900">{importFile.name}</p>
                </div>
              )}
            </div>
            <div className="mt-6">
              <button
                type="button"
                onClick={closeImportFileModal}
                disabled={importing}
                className="inline-flex w-full items-center justify-center rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
              >
                Batalkan
              </button>
            </div>
          </div>
        </div>
      )}

      {isImportPinOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/70 px-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 text-center shadow-2xl sm:p-8">
            <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Keamanan PIN
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-slate-900">
              Konfirmasi PIN
            </h2>
            <p className="mt-3 text-sm text-slate-500">
              Masukkan PIN 4-digit untuk mengimpor {importPreview.length} transaksi dari Excel.
            </p>
            {importPreview.length > 0 && (
              <div className="mt-4 max-h-40 overflow-y-auto rounded-xl bg-slate-50 p-3 text-left">
                <p className="mb-2 text-xs font-semibold text-slate-500">
                  Preview ({importPreview.length} transaksi):
                </p>
                <div className="space-y-1">
                  {importPreview.slice(0, 5).map((t, idx) => (
                    <p key={idx} className="text-xs text-slate-600">
                      • {formatDate(t.date, settings.timezone || "Asia/Jakarta")} - {t.description} - {formatCurrency(t.amount)} ({t.type === "income" ? "Pemasukan" : "Pengeluaran"})
                    </p>
                  ))}
                  {importPreview.length > 5 && (
                    <p className="text-xs text-slate-400">
                      ... dan {importPreview.length - 5} transaksi lainnya
                    </p>
                  )}
                </div>
              </div>
            )}
            <div className="mt-4 space-y-3 text-left">
              <Field label="PIN">
                <input
                  type="password"
                  name="pin"
                  value={pin || ""}
                  onChange={(event) => {
                    setPin(event.target.value.slice(0, 4));
                    setPinError("");
                  }}
                  inputMode="numeric"
                  pattern="\d{4}"
                  maxLength={4}
                  className={`${inputClasses} text-center tracking-[0.5em]`}
                  placeholder="••••"
                  autoFocus
                />
              </Field>
              {pinError && (
                <p className="text-center text-xs font-semibold text-rose-500">
                  {pinError}
                </p>
              )}
            </div>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={closeImportPinModal}
                disabled={importing}
                className="inline-flex items-center justify-center rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
              >
                Batalkan
              </button>
              <button
                type="button"
                onClick={confirmImportWithPin}
                disabled={importing}
                className="inline-flex items-center justify-center rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-soft transition hover:bg-indigo-700 disabled:opacity-50"
              >
                {importing ? "Mengimpor..." : "Konfirmasi PIN"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Logout Confirmation Modal */}
      {isLogoutConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 px-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl sm:p-8">
            <div className="mb-6 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-rose-100">
                <svg
                  className="h-8 w-8 text-rose-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                  />
                </svg>
              </div>
              <h2 className="text-2xl font-semibold text-slate-900">
                Konfirmasi Logout
              </h2>
              <p className="mt-2 text-sm text-slate-600">
                Apakah Anda yakin ingin logout? Anda perlu login kembali untuk mengakses aplikasi.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setIsLogoutConfirmOpen(false)}
                className="flex-1 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={confirmLogout}
                className="flex-1 rounded-2xl bg-rose-600 px-4 py-3 text-sm font-semibold text-white shadow-soft transition hover:bg-rose-700"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete User Confirmation Modal */}
      {isDeleteUserConfirmOpen && deleteUserTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 px-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl sm:p-8">
            <div className="mb-6 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-rose-100">
                <svg
                  className="h-8 w-8 text-rose-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
              </div>
              <h2 className="text-2xl font-semibold text-slate-900">
                Konfirmasi Hapus User
              </h2>
              <p className="mt-2 text-sm text-slate-600">
                Apakah Anda yakin ingin menghapus user ini? Semua transaksi yang terkait dengan user ini akan ikut terhapus secara permanen. Tindakan ini tidak dapat dibatalkan.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setIsDeleteUserConfirmOpen(false);
                  setDeleteUserTarget(null);
                }}
                className="flex-1 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={confirmDeleteUser}
                disabled={adminLoading}
                className="flex-1 rounded-2xl bg-rose-600 px-4 py-3 text-sm font-semibold text-white shadow-soft transition hover:bg-rose-700 disabled:opacity-50"
              >
                {adminLoading ? "Menghapus..." : "Hapus User"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {isEditUserModalOpen && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 px-4">
          <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl sm:p-8">
            <div className="mb-6 flex items-start justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-wide text-indigo-500">
                  Admin
                </p>
                <h2 className="mt-2 text-2xl font-semibold text-slate-900">
                  Edit User
                </h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsEditUserModalOpen(false);
                  setSelectedUser(null);
                }}
                className="rounded-full bg-slate-100 p-2 text-slate-500 transition hover:bg-slate-200"
                aria-label="Tutup"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleUpdateUser} className="space-y-4">
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">
                  Nama
                </label>
                <input
                  type="text"
                  value={editUserForm.name}
                  onChange={(e) => setEditUserForm({ ...editUserForm, name: e.target.value })}
                  className={inputClasses}
                  placeholder="Nama Lengkap"
                  required
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">
                  Email
                </label>
                <input
                  type="email"
                  value={editUserForm.email}
                  onChange={(e) => setEditUserForm({ ...editUserForm, email: e.target.value })}
                  className={inputClasses}
                  placeholder="nama@email.com"
                  required
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">
                  Role
                </label>
                <select
                  value={editUserForm.role}
                  onChange={(e) => setEditUserForm({ ...editUserForm, role: e.target.value })}
                  className={inputClasses}
                >
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setIsEditUserModalOpen(false);
                    setSelectedUser(null);
                  }}
                  className="flex-1 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={adminLoading}
                  className="flex-1 rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-soft transition hover:bg-indigo-700 disabled:opacity-50"
                >
                  {adminLoading ? "Menyimpan..." : "Simpan"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 px-4">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl sm:p-8">
            <div className="mb-6 flex items-start justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-wide text-indigo-500">
                  Pengaturan
                </p>
                <h2 className="mt-2 text-2xl font-semibold text-slate-900">
                  Profile & Keamanan
                </h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsSettingsOpen(false);
                  setSettingsError("");
                }}
                className="rounded-full bg-slate-100 p-2 text-slate-500 transition hover:bg-slate-200"
                aria-label="Tutup settings"
              >
                ✕
              </button>
            </div>

            <div className="space-y-6">
              {/* Profile Section */}
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6">
                <h3 className="mb-4 text-lg font-semibold text-slate-900">Profile</h3>
                <form onSubmit={handleUpdateProfile} className="space-y-4">
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-700">
                      Nama
                    </label>
                    <input
                      type="text"
                      value={settingsForm.name}
                      onChange={(e) => setSettingsForm({ ...settingsForm, name: e.target.value })}
                      className={inputClasses}
                      placeholder="Nama Lengkap"
                      required
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-700">
                      Email
                    </label>
                    <input
                      type="email"
                      value={settingsForm.email}
                      onChange={(e) => setSettingsForm({ ...settingsForm, email: e.target.value })}
                      className={inputClasses}
                      placeholder="nama@email.com"
                      required
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-700">
                      Timezone
                    </label>
                    <select
                      value={settingsForm.timezone || "Asia/Jakarta"}
                      onChange={(e) => setSettingsForm({ ...settingsForm, timezone: e.target.value })}
                      className={inputClasses}
                    >
                      <optgroup label="Indonesia">
                        <option value="Asia/Jakarta">WIB (Jakarta) - GMT+7</option>
                        <option value="Asia/Makassar">WITA (Makassar) - GMT+8</option>
                        <option value="Asia/Jayapura">WIT (Jayapura) - GMT+9</option>
                      </optgroup>
                      <optgroup label="Asia">
                        <option value="Asia/Singapore">Singapore - GMT+8</option>
                        <option value="Asia/Kuala_Lumpur">Kuala Lumpur - GMT+8</option>
                        <option value="Asia/Bangkok">Bangkok - GMT+7</option>
                        <option value="Asia/Manila">Manila - GMT+8</option>
                        <option value="Asia/Tokyo">Tokyo - GMT+9</option>
                        <option value="Asia/Seoul">Seoul - GMT+9</option>
                        <option value="Asia/Hong_Kong">Hong Kong - GMT+8</option>
                        <option value="Asia/Shanghai">Shanghai - GMT+8</option>
                      </optgroup>
                      <optgroup label="Eropa">
                        <option value="Europe/London">London - GMT+0</option>
                        <option value="Europe/Paris">Paris - GMT+1</option>
                        <option value="Europe/Berlin">Berlin - GMT+1</option>
                        <option value="Europe/Moscow">Moscow - GMT+3</option>
                      </optgroup>
                      <optgroup label="Amerika">
                        <option value="America/New_York">New York - GMT-5</option>
                        <option value="America/Chicago">Chicago - GMT-6</option>
                        <option value="America/Denver">Denver - GMT-7</option>
                        <option value="America/Los_Angeles">Los Angeles - GMT-8</option>
                      </optgroup>
                      <optgroup label="Oceania">
                        <option value="Australia/Sydney">Sydney - GMT+10</option>
                        <option value="Australia/Melbourne">Melbourne - GMT+10</option>
                        <option value="Pacific/Auckland">Auckland - GMT+12</option>
                      </optgroup>
                    </select>
                    <p className="mt-2 text-xs text-slate-500">
                      Pilih timezone untuk menampilkan waktu dan tanggal sesuai lokasi Anda.
                    </p>
                  </div>
                  {settingsError && (
                    <p className="text-sm font-semibold text-rose-500">{settingsError}</p>
                  )}
                  <button
                    type="submit"
                    disabled={settingsLoading}
                    className="w-full rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-soft transition hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {settingsLoading ? "Menyimpan..." : "Simpan Profile"}
                  </button>
                </form>
              </div>

              {/* PIN Settings Section */}
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6">
                <h3 className="mb-4 text-lg font-semibold text-slate-900">Pengaturan PIN</h3>
                <form onSubmit={handleUpdatePin} className="space-y-4">
                  <div className="flex items-center justify-between rounded-xl bg-white p-4">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">Aktifkan PIN</p>
                      <p className="mt-1 text-xs text-slate-500">
                        PIN diperlukan untuk operasi penting (tambah, edit, hapus, export, import)
                      </p>
                    </div>
                    <label className="relative inline-flex cursor-pointer items-center">
                      <input
                        type="checkbox"
                        checked={settingsForm.pinEnabled}
                        onChange={(e) => setSettingsForm({ ...settingsForm, pinEnabled: e.target.checked, pin: "" })}
                        className="peer sr-only"
                      />
                      <div className="peer h-6 w-11 rounded-full bg-slate-200 after:absolute after:top-[2px] after:left-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-slate-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-indigo-600 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-indigo-300"></div>
                    </label>
                  </div>

                  {settingsForm.pinEnabled && (
                    <div>
                      <label className="mb-2 block text-sm font-semibold text-slate-700">
                        PIN 4 Digit
                      </label>
                      <input
                        type="password"
                        value={settingsForm.pin}
                        onChange={(e) => setSettingsForm({ ...settingsForm, pin: e.target.value.slice(0, 4) })}
                        className={`${inputClasses} text-center tracking-[0.5em]`}
                        placeholder="••••"
                        inputMode="numeric"
                        pattern="\d{4}"
                        maxLength={4}
                        required={settingsForm.pinEnabled}
                      />
                      <p className="mt-2 text-xs text-slate-500">
                        {settings.pinEnabled ? "Masukkan PIN baru untuk mengubah, atau kosongkan untuk menghapus PIN." : "Masukkan PIN 4 digit untuk mengaktifkan proteksi PIN."}
                      </p>
                    </div>
                  )}

                  {settingsError && (
                    <p className="text-sm font-semibold text-rose-500">{settingsError}</p>
                  )}
                  <button
                    type="submit"
                    disabled={settingsLoading || (settingsForm.pinEnabled && !settingsForm.pin)}
                    className="w-full rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-soft transition hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {settingsLoading ? "Menyimpan..." : "Simpan Pengaturan PIN"}
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
      <footer className="mx-auto mb-1 mt-2 w-full max-w-6xl px-4 text-center text-xs font-semibold text-slate-400 sm:px-6 lg:px-8">
        © {new Date().getFullYear()} Pilar Labs
      </footer>
    </>
  );
}

const Field = ({ label, children }) => (
  <label className="text-sm font-medium text-slate-600">
    {label}
    <div className="mt-2">{children}</div>
  </label>
);

const StatCard = ({ label, value, className }) => (
  <div
    className={`w-full rounded-3xl bg-gradient-to-br p-6 shadow-soft ${className}`}
  >
    <p className="text-xs uppercase tracking-[0.35em] text-white/70">
      {label}
    </p>
    <p className="mt-3 text-3xl font-semibold">{value}</p>
  </div>
);

const Badge = ({ label, variant, size = "md" }) => {
  const variants = {
    income: "bg-emerald-50 text-emerald-600",
    expense: "bg-rose-50 text-rose-600",
    neutral: "bg-slate-100 text-slate-600",
  };
  const sizes = {
    md: "text-xs px-3 py-1.5",
    sm: "text-[11px] px-2.5 py-1",
  };
  return (
    <span
      className={`inline-flex rounded-full font-semibold ${
        variants[variant] ?? variants.neutral
      } ${sizes[size] ?? sizes.md}`}
    >
      {label}
    </span>
  );
};

const EmptyState = () => (
  <div className="rounded-2xl border border-dashed border-slate-200 py-14 text-center">
    <p className="text-base font-semibold text-slate-800">
      Belum ada transaksi
    </p>
    <p className="mt-1 text-sm text-slate-500">
      Mulai catat pemasukan atau pengeluaran pertama Anda.
    </p>
  </div>
);

const safeJson = async (response) => {
  try {
    return await response.json();
  } catch {
    return {};
  }
};

export default App;

