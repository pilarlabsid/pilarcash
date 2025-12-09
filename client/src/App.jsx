import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { formatCurrency, formatDate, getToday } from "./lib/format";
import { utils as XLSXUtils, writeFile as writeXLSXFile, read as readXLSX } from "xlsx";
import { io } from "socket.io-client";
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

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

const getInputClasses = (darkMode) =>
  `w-full rounded-2xl border px-4 py-3 text-sm font-medium outline-none transition focus:ring-2 focus:ring-indigo-100 ${
    darkMode
      ? "border-slate-600 bg-slate-800 text-white focus:border-indigo-500 focus:bg-slate-700"
      : "border-slate-200 bg-slate-50 text-slate-900 focus:border-indigo-500 focus:bg-white"
  }`;

// Loading Spinner Component
const LoadingSpinner = ({ size = "md", className = "" }) => {
  const sizes = {
    sm: "h-4 w-4 border-2",
    md: "h-6 w-6 border-2",
    lg: "h-8 w-8 border-3",
    xl: "h-12 w-12 border-4",
  };
  return (
    <div className={`inline-block ${className}`}>
      <div
        className={`${sizes[size]} animate-spin rounded-full border-indigo-600 border-t-transparent`}
      />
    </div>
  );
};

// Loading Button Component
const LoadingButton = ({ loading, children, className = "", disabled, ...props }) => {
  return (
    <button
      {...props}
      disabled={loading || disabled}
      className={`${className} ${loading || disabled ? "cursor-not-allowed opacity-70" : ""}`}
    >
      {loading ? (
        <span className="inline-flex items-center gap-2">
          <LoadingSpinner size="sm" />
          <span>Memproses...</span>
        </span>
      ) : (
        children
      )}
    </button>
  );
};

// Loading Overlay Component
const LoadingOverlay = ({ message = "Memuat...", darkMode = false }) => {
  return (
    <div className={`absolute inset-0 z-50 flex items-center justify-center rounded-2xl backdrop-blur-sm ${
      darkMode ? "bg-slate-900/80" : "bg-white/80"
    }`}>
      <div className="text-center">
        <LoadingSpinner size="lg" className="mx-auto mb-3" />
        <p className={`text-sm font-medium ${
          darkMode ? "text-slate-300" : "text-slate-600"
        }`}>{message}</p>
      </div>
    </div>
  );
};

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
  const [settingsForm, setSettingsForm] = useState({ name: "", email: "", password: "", pin: "", pinEnabled: false, timezone: "Asia/Jakarta" });
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsError, setSettingsError] = useState("");

  // Existing state
  const [entries, setEntries] = useState([]);
  const [form, setForm] = useState(() => createInitialForm({}, settings.timezone || "Asia/Jakarta"));
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [authFormLoading, setAuthFormLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [toast, setToast] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [pinMode, setPinMode] = useState(null); // "create" | "delete" | "reset"
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
  const [adminTab, setAdminTab] = useState("dashboard"); // "dashboard" | "users" | "admins" | "transactions"
  const [selectedUser, setSelectedUser] = useState(null);
  const [isEditUserModalOpen, setIsEditUserModalOpen] = useState(false);
  const [editUserForm, setEditUserForm] = useState({ name: "", email: "", password: "" });
  const [isCreateUserModalOpen, setIsCreateUserModalOpen] = useState(false);
  const [createUserForm, setCreateUserForm] = useState({ name: "", email: "", password: "", role: "user" });
  const [createUserLoading, setCreateUserLoading] = useState(false);
  const [expandedUsers, setExpandedUsers] = useState(new Set());
  
  // Dashboard enhancement states
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('darkMode');
    return saved ? JSON.parse(saved) : false;
  });
  const [selectedTheme, setSelectedTheme] = useState(() => {
    return localStorage.getItem('selectedTheme') || 'default';
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterType, setFilterType] = useState(""); // "income" | "expense" | ""
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [chartPeriod, setChartPeriod] = useState("monthly"); // "daily" | "monthly"

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
      password: "", // Password kosong, hanya diisi jika ingin diubah
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
      // Hanya kirim password jika diisi
      const updateData = {
        name: editUserForm.name,
        email: editUserForm.email,
      };
      if (editUserForm.password && editUserForm.password.trim() !== "") {
        updateData.password = editUserForm.password;
      }
      
      const response = await fetch(`${apiBase}/api/admin/users/${selectedUser.id}`, {
        method: "PUT",
        headers,
        body: JSON.stringify(updateData),
      });
      
      if (response.ok) {
        setToast({ type: "success", message: "User berhasil diperbarui." });
        setIsEditUserModalOpen(false);
        setSelectedUser(null);
        setEditUserForm({ name: "", email: "", password: "" }); // Reset form
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

  const handleCreateUser = async (e) => {
    e.preventDefault();
    if (!token) return;
    
    setCreateUserLoading(true);
    
    try {
      const apiBase = getApiUrl();
      const headers = {
        "Content-Type": "application/json",
      };
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }
      const response = await fetch(`${apiBase}/api/admin/users`, {
        method: "POST",
        headers,
        body: JSON.stringify(createUserForm),
      });
      
      if (response.ok) {
        const data = await response.json();
        setToast({ type: "success", message: `${data.role === 'admin' ? 'Admin' : 'User'} berhasil dibuat.` });
        setIsCreateUserModalOpen(false);
        setCreateUserForm({ name: "", email: "", password: "", role: "user" });
        fetchAdminUsers();
      } else {
        const data = await response.json();
        setToast({ type: "error", message: data.message || "Gagal membuat user." });
      }
    } catch (error) {
      setToast({ type: "error", message: "Gagal membuat user." });
    } finally {
      setCreateUserLoading(false);
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
    setAuthFormLoading(true);
    
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
    } finally {
      setAuthFormLoading(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setAuthError("");
    setAuthFormLoading(true);

    if (registerForm.password.length < 6) {
      setAuthError("Password minimal 6 karakter.");
      setAuthLoading(false);
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
    } finally {
      setAuthFormLoading(false);
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

  // Dark mode effect
  useEffect(() => {
    localStorage.setItem('darkMode', JSON.stringify(darkMode));
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  // Theme effect
  useEffect(() => {
    localStorage.setItem('selectedTheme', selectedTheme);
  }, [selectedTheme]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterDateFrom, filterDateTo, filterCategory, filterType]);

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

  // Filtered and searched entries
  const filteredEntries = useMemo(() => {
    let filtered = [...runningEntries];

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(entry => 
        entry.description?.toLowerCase().includes(query)
      );
    }

    // Date range filter
    if (filterDateFrom) {
      filtered = filtered.filter(entry => new Date(entry.date) >= new Date(filterDateFrom));
    }
    if (filterDateTo) {
      filtered = filtered.filter(entry => new Date(entry.date) <= new Date(filterDateTo));
    }

    // Category filter (if we add category field later)
    if (filterCategory) {
      // Placeholder for category filter
      // filtered = filtered.filter(entry => entry.category === filterCategory);
    }

    // Type filter
    if (filterType) {
      filtered = filtered.filter(entry => entry.type === filterType);
    }

    return filtered;
  }, [runningEntries, searchQuery, filterDateFrom, filterDateTo, filterCategory, filterType]);

  // Paginated entries
  const paginatedEntries = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return filteredEntries.slice(startIndex, endIndex);
  }, [filteredEntries, currentPage, itemsPerPage]);

  const totalPages = Math.ceil(filteredEntries.length / itemsPerPage);

  // Reset filters
  const resetFilters = () => {
    setSearchQuery("");
    setFilterDateFrom("");
    setFilterDateTo("");
    setFilterCategory("");
    setFilterType("");
    setCurrentPage(1);
  };

  // Chart data for line chart (daily balance)
  const dailyBalanceData = useMemo(() => {
    const dataMap = new Map();
    let runningBalance = 0;
    
    const sorted = [...entries].sort((a, b) => new Date(a.date) - new Date(b.date));
    
    sorted.forEach(entry => {
      runningBalance += entry.type === "income" ? entry.amount : -entry.amount;
      const dateKey = entry.date;
      dataMap.set(dateKey, runningBalance);
    });

    return Array.from(dataMap.entries()).map(([date, balance]) => ({
      date,
      balance
    }));
  }, [entries]);

  // Monthly balance data
  const monthlyBalanceData = useMemo(() => {
    const dataMap = new Map();
    let runningBalance = 0;
    
    const sorted = [...entries].sort((a, b) => new Date(a.date) - new Date(b.date));
    
    sorted.forEach(entry => {
      runningBalance += entry.type === "income" ? entry.amount : -entry.amount;
      const date = new Date(entry.date);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      dataMap.set(monthKey, runningBalance);
    });

    return Array.from(dataMap.entries()).map(([month, balance]) => ({
      month,
      balance
    }));
  }, [entries]);

  // Income vs Expense data (monthly)
  const incomeExpenseData = useMemo(() => {
    const dataMap = new Map();
    
    entries.forEach(entry => {
      const date = new Date(entry.date);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      
      if (!dataMap.has(monthKey)) {
        dataMap.set(monthKey, { month: monthKey, income: 0, expense: 0 });
      }
      
      const data = dataMap.get(monthKey);
      if (entry.type === "income") {
        data.income += entry.amount;
      } else {
        data.expense += entry.amount;
      }
    });

    return Array.from(dataMap.values()).sort((a, b) => a.month.localeCompare(b.month));
  }, [entries]);

  // Expense by category (pie chart) - using description as category for now
  const expenseByCategory = useMemo(() => {
    const categoryMap = new Map();
    
    entries
      .filter(entry => entry.type === "expense")
      .forEach(entry => {
        const category = entry.description || "Lainnya";
        const current = categoryMap.get(category) || 0;
        categoryMap.set(category, current + entry.amount);
      });

    return Array.from(categoryMap.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10); // Top 10 categories
  }, [entries]);

  // Insights data
  const insights = useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1;
    const lastMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;

    // Current month expenses
    const currentMonthExpenses = entries
      .filter(entry => {
        const date = new Date(entry.date);
        return entry.type === "expense" && 
               date.getMonth() === currentMonth && 
               date.getFullYear() === currentYear;
      })
      .reduce((sum, entry) => sum + entry.amount, 0);

    // Last month expenses
    const lastMonthExpenses = entries
      .filter(entry => {
        const date = new Date(entry.date);
        return entry.type === "expense" && 
               date.getMonth() === lastMonth && 
               date.getFullYear() === lastMonthYear;
      })
      .reduce((sum, entry) => sum + entry.amount, 0);

    // Category with largest expense this month
    const categoryMap = new Map();
    entries
      .filter(entry => {
        const date = new Date(entry.date);
        return entry.type === "expense" && 
               date.getMonth() === currentMonth && 
               date.getFullYear() === currentYear;
      })
      .forEach(entry => {
        const category = entry.description || "Lainnya";
        const current = categoryMap.get(category) || 0;
        categoryMap.set(category, current + entry.amount);
      });
    
    const topCategory = Array.from(categoryMap.entries())
      .sort((a, b) => b[1] - a[1])[0] || ["-", 0];

    // Total transactions per month
    const transactionsByMonth = new Map();
    entries.forEach(entry => {
      const date = new Date(entry.date);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const current = transactionsByMonth.get(monthKey) || 0;
      transactionsByMonth.set(monthKey, current + 1);
    });

    // Day with largest expense
    const dayExpenseMap = new Map();
    entries
      .filter(entry => entry.type === "expense")
      .forEach(entry => {
        const dateKey = entry.date;
        const current = dayExpenseMap.get(dateKey) || 0;
        dayExpenseMap.set(dateKey, current + entry.amount);
      });
    
    const topDay = Array.from(dayExpenseMap.entries())
      .sort((a, b) => b[1] - a[1])[0] || [null, 0];

    return {
      currentMonthExpenses,
      lastMonthExpenses,
      expenseChange: lastMonthExpenses > 0 
        ? ((currentMonthExpenses - lastMonthExpenses) / lastMonthExpenses * 100).toFixed(1)
        : currentMonthExpenses > 0 ? "100" : "0",
      topCategory: { name: topCategory[0], amount: topCategory[1] },
      transactionsByMonth: Array.from(transactionsByMonth.entries())
        .map(([month, count]) => ({ month, count }))
        .sort((a, b) => a.month.localeCompare(b.month))
        .slice(-6), // Last 6 months
      topDay: { date: topDay[0], amount: topDay[1] }
    };
  }, [entries]);

  // Calendar heatmap data
  const heatmapData = useMemo(() => {
    const dataMap = new Map();
    
    entries.forEach(entry => {
      // Pastikan format tanggal konsisten (YYYY-MM-DD)
      let dateKey = entry.date;
      
      // Jika dateKey bukan format YYYY-MM-DD, convert dulu
      if (dateKey && !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
        const date = new Date(dateKey);
        if (!isNaN(date.getTime())) {
          const year = date.getFullYear();
          const month = String(date.getMonth() + 1).padStart(2, '0');
          const day = String(date.getDate()).padStart(2, '0');
          dateKey = `${year}-${month}-${day}`;
        } else {
          return; // Skip jika tidak bisa di-parse
        }
      }
      
      if (dateKey) {
        const current = dataMap.get(dateKey) || 0;
        dataMap.set(dateKey, current + 1); // Count transactions per day
      }
    });

    return dataMap;
  }, [entries]);

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

      // Check if editing (use isEditing or pinMode check)
      if (isEditing || (pinMode === "edit" && editingTarget)) {
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

      // Create new transaction
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
    setExporting(true);
    try {
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
    } catch (error) {
      console.error(error);
      setToast({ type: "error", message: "Gagal membuat file Excel." });
    } finally {
      setExporting(false);
    }
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
      // Hanya kirim password jika diisi
      const updateData = {
        name: settingsForm.name,
        email: settingsForm.email,
        timezone: settingsForm.timezone,
      };
      if (settingsForm.password && settingsForm.password.trim() !== "") {
        updateData.password = settingsForm.password;
      }
      
      const response = await authenticatedFetch(`${apiBase}/api/user/profile`, {
        method: "PUT",
        body: JSON.stringify(updateData),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Gagal memperbarui profile.");
      }

      setUser({ ...user, name: data.name, email: data.email });
      setSettings({ ...settings, name: data.name, email: data.email, timezone: data.timezone || "Asia/Jakarta" });
      setSettingsForm({ ...settingsForm, password: "" }); // Reset password field setelah berhasil
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
          <LoadingSpinner size="xl" className="mx-auto mb-4" />
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
              <div className={`rounded-3xl p-8 shadow-2xl ${
                darkMode ? "bg-slate-800" : "bg-white"
              }`}>
                <h2 className={`mb-6 text-2xl font-semibold ${
                  darkMode ? "text-white" : "text-slate-900"
                }`}>Login</h2>
                <form onSubmit={handleLogin} className="space-y-4">
                  <div>
                    <label className={`mb-2 block text-sm font-semibold ${
                      darkMode ? "text-slate-300" : "text-slate-700"
                    }`}>
                      Email
                    </label>
                    <input
                      type="email"
                      value={loginForm.email}
                      onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })}
                      className={getInputClasses(darkMode)}
                      placeholder="nama@email.com"
                      required
                    />
                  </div>
                  <div>
                    <label className={`mb-2 block text-sm font-semibold ${
                      darkMode ? "text-slate-300" : "text-slate-700"
                    }`}>
                      Password
                    </label>
                    <input
                      type="password"
                      value={loginForm.password}
                      onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                      className={getInputClasses(darkMode)}
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
                      className={`flex-1 rounded-2xl border px-4 py-3 text-sm font-semibold transition ${
                        darkMode
                          ? "border-slate-600 text-slate-300 hover:bg-slate-700"
                          : "border-slate-200 text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      Daftar
                    </button>
                    <LoadingButton
                      type="submit"
                      loading={authFormLoading}
                      className="flex-1 rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-soft transition hover:bg-indigo-700"
                    >
                      Login
                    </LoadingButton>
                  </div>
                </form>
              </div>
            )}

            {/* Register Modal */}
            {isRegisterModalOpen && (
              <div className={`rounded-3xl p-8 shadow-2xl ${
                darkMode ? "bg-slate-800" : "bg-white"
              }`}>
                <h2 className={`mb-6 text-2xl font-semibold ${
                  darkMode ? "text-white" : "text-slate-900"
                }`}>Daftar</h2>
                <form onSubmit={handleRegister} className="space-y-4">
                  <div>
                    <label className={`mb-2 block text-sm font-semibold ${
                      darkMode ? "text-slate-300" : "text-slate-700"
                    }`}>
                      Nama
                    </label>
                    <input
                      type="text"
                      value={registerForm.name}
                      onChange={(e) => setRegisterForm({ ...registerForm, name: e.target.value })}
                      className={getInputClasses(darkMode)}
                      placeholder="Nama Lengkap"
                      required
                    />
                  </div>
                  <div>
                    <label className={`mb-2 block text-sm font-semibold ${
                      darkMode ? "text-slate-300" : "text-slate-700"
                    }`}>
                      Email
                    </label>
                    <input
                      type="email"
                      value={registerForm.email}
                      onChange={(e) => setRegisterForm({ ...registerForm, email: e.target.value })}
                      className={getInputClasses(darkMode)}
                      placeholder="nama@email.com"
                      required
                    />
                  </div>
                  <div>
                    <label className={`mb-2 block text-sm font-semibold ${
                      darkMode ? "text-slate-300" : "text-slate-700"
                    }`}>
                      Password
                    </label>
                    <input
                      type="password"
                      value={registerForm.password}
                      onChange={(e) => setRegisterForm({ ...registerForm, password: e.target.value })}
                      className={getInputClasses(darkMode)}
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
                      className={`flex-1 rounded-2xl border px-4 py-3 text-sm font-semibold transition ${
                        darkMode
                          ? "border-slate-600 text-slate-300 hover:bg-slate-700"
                          : "border-slate-200 text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      Login
                    </button>
                    <LoadingButton
                      type="submit"
                      loading={authFormLoading}
                      className="flex-1 rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-soft transition hover:bg-indigo-700"
                    >
                      Daftar
                    </LoadingButton>
                  </div>
                </form>
              </div>
            )}

            {/* Default: Show login button */}
            {!isLoginModalOpen && !isRegisterModalOpen && (
              <div className={`rounded-3xl p-8 shadow-2xl text-center ${
                darkMode ? "bg-slate-800" : "bg-white"
              }`}>
                <p className={`mb-6 ${
                  darkMode ? "text-slate-300" : "text-slate-600"
                }`}>Silakan login untuk melanjutkan</p>
                <button
                  onClick={() => setIsLoginModalOpen(true)}
                  className="w-full rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-soft transition hover:bg-indigo-700"
                >
                  Login
                </button>
                <p className={`mt-4 text-sm ${
                  darkMode ? "text-slate-400" : "text-slate-500"
                }`}>
                  Belum punya akun?{" "}
                  <button
                    onClick={() => setIsRegisterModalOpen(true)}
                    className="font-semibold text-indigo-400 hover:text-indigo-300"
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
    <div className={`min-h-screen pb-4 transition-colors ${
      darkMode ? "bg-slate-900" : "bg-slate-50"
    }`}>
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
        <header className={`flex flex-col gap-5 rounded-3xl px-6 py-8 shadow-soft sm:px-8 transition-colors duration-300 ${
          darkMode 
            ? "bg-gradient-to-r from-slate-800 via-indigo-900 to-slate-800 text-white" 
            : "bg-gradient-to-r from-slate-900 via-indigo-900 to-slate-800 text-white"
        }`}>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3 text-center sm:text-left">
              {/* Avatar */}
              {user && (
                <div className="relative">
                  <button
                    onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
                    className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20 text-sm font-semibold text-white transition hover:bg-white/30 focus:outline-none focus:ring-2 focus:ring-white/50"
                  >
                    {user.name?.charAt(0).toUpperCase() || "U"}
                  </button>
                  {/* Profile Menu */}
                  {isProfileMenuOpen && (
                    <>
                      <div
                        className="fixed inset-0 z-10"
                        onClick={() => setIsProfileMenuOpen(false)}
                      />
                      <div className={`absolute left-0 top-full z-20 mt-2 w-56 rounded-2xl border shadow-2xl ${
                        darkMode 
                          ? "border-white/20 bg-slate-800" 
                          : "border-slate-200 bg-white"
                      }`}>
                        <div className={`p-4 border-b ${
                          darkMode ? "border-white/20" : "border-slate-200"
                        }`}>
                          <p className={`text-sm font-semibold ${
                            darkMode ? "text-white" : "text-slate-900"
                          }`}>{user.name}</p>
                          <p className={`text-xs ${
                            darkMode ? "text-white/70" : "text-slate-600"
                          }`}>{user.email}</p>
                        </div>
                        <div className="py-2">
                          <button
                            type="button"
                            onClick={() => {
                              setIsSettingsOpen(true);
                              fetchSettings();
                              setIsProfileMenuOpen(false);
                            }}
                            className={`w-full px-4 py-2 text-left text-sm font-medium transition ${
                              darkMode 
                                ? "text-white hover:bg-white/10" 
                                : "text-slate-700 hover:bg-slate-50"
                            }`}
                          >
                            Pengaturan Profil
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedTheme(selectedTheme === 'default' ? 'gradient' : 'default');
                              setIsProfileMenuOpen(false);
                            }}
                            className={`w-full px-4 py-2 text-left text-sm font-medium transition ${
                              darkMode 
                                ? "text-white hover:bg-white/10" 
                                : "text-slate-700 hover:bg-slate-50"
                            }`}
                          >
                            {selectedTheme === 'default' ? 'Tema Gradient' : 'Tema Default'}
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}
              <div>
                <p className="text-xs uppercase tracking-[0.4em] text-indigo-200">
                  Prava Cash
                </p>
                {user && (
                  <p className="mt-1 text-sm font-medium text-white/80">
                    Halo, {user.name}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-4">
              {/* Dark Mode Toggle */}
              <button
                type="button"
                onClick={() => setDarkMode(!darkMode)}
                className="rounded-full p-2 text-white transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white/50"
                aria-label={darkMode ? "Light mode" : "Dark mode"}
              >
                {darkMode ? (
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                ) : (
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                  </svg>
                )}
              </button>
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
            <div className={`flex gap-2 rounded-2xl p-2 shadow-soft ${
              darkMode ? "bg-slate-800" : "bg-white"
            }`}>
              <button
                type="button"
                onClick={() => setAdminTab("dashboard")}
                className={`flex-1 rounded-xl px-4 py-3 text-sm font-semibold transition ${
                  adminTab === "dashboard"
                    ? "bg-indigo-600 text-white"
                    : darkMode
                    ? "text-slate-300 hover:bg-slate-700"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                Dashboard
              </button>
              <button
                type="button"
                onClick={() => setAdminTab("transactions")}
                className={`flex-1 rounded-xl px-4 py-3 text-sm font-semibold transition ${
                  adminTab === "transactions"
                    ? "bg-indigo-600 text-white"
                    : darkMode
                    ? "text-slate-300 hover:bg-slate-700"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                Transactions ({adminTransactions.length})
              </button>
              <button
                type="button"
                onClick={() => setAdminTab("users")}
                className={`flex-1 rounded-xl px-4 py-3 text-sm font-semibold transition ${
                  adminTab === "users"
                    ? "bg-indigo-600 text-white"
                    : darkMode
                    ? "text-slate-300 hover:bg-slate-700"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                Users & Admins ({adminUsers.length})
              </button>
            </div>

            {/* Admin Dashboard Tab */}
            {adminTab === "dashboard" && (
              adminLoading && !adminStats ? (
                <div className="py-20 text-center">
                  <LoadingSpinner size="lg" className="mx-auto mb-3" />
                  <p className={`text-sm font-medium ${
                    darkMode ? "text-slate-400" : "text-slate-500"
                  }`}>Memuat dashboard...</p>
                </div>
              ) : adminStats ? (
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
                <div className={`grid gap-6 rounded-2xl p-6 shadow-soft sm:grid-cols-2 ${
                  darkMode ? "bg-slate-800" : "bg-white"
                }`}>
                  <div>
                    <h3 className={`mb-4 text-lg font-semibold ${
                      darkMode ? "text-white" : "text-slate-900"
                    }`}>Transaction Volume</h3>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className={darkMode ? "text-slate-400" : "text-slate-600"}>Income Transactions</span>
                        <span className={`font-semibold ${
                          darkMode ? "text-white" : "text-slate-900"
                        }`}>
                          {adminStats.transactionsByType?.find(t => t.type === 'income')?.count || 0}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className={darkMode ? "text-slate-400" : "text-slate-600"}>Expense Transactions</span>
                        <span className={`font-semibold ${
                          darkMode ? "text-white" : "text-slate-900"
                        }`}>
                          {adminStats.transactionsByType?.find(t => t.type === 'expense')?.count || 0}
                        </span>
                      </div>
                      <div className={`mt-3 flex justify-between border-t pt-2 text-sm font-semibold ${
                        darkMode ? "border-slate-700" : "border-slate-200"
                      }`}>
                        <span className={darkMode ? "text-white" : "text-slate-900"}>Avg Transaction Value</span>
                        <span className={darkMode ? "text-indigo-400" : "text-indigo-600"}>
                          {formatCurrency(Math.round(adminStats.avgTransactionValue || 0))}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div>
                    <h3 className={`mb-4 text-lg font-semibold ${
                      darkMode ? "text-white" : "text-slate-900"
                    }`}>User Engagement</h3>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className={darkMode ? "text-slate-400" : "text-slate-600"}>Active Rate</span>
                        <span className={`font-semibold ${
                          darkMode ? "text-white" : "text-slate-900"
                        }`}>
                          {adminStats.totalUsers > 0 
                            ? Math.round((adminStats.activeUsers / adminStats.totalUsers) * 100) 
                            : 0}%
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className={darkMode ? "text-slate-400" : "text-slate-600"}>Avg Transactions/User</span>
                        <span className={`font-semibold ${
                          darkMode ? "text-white" : "text-slate-900"
                        }`}>
                          {adminStats.totalUsers > 0 
                            ? Math.round(adminStats.totalTransactions / adminStats.totalUsers) 
                            : 0}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Financial Overview - Not in Cards */}
                <div className={`rounded-2xl p-6 shadow-soft ${
                  darkMode ? "bg-slate-800" : "bg-white"
                }`}>
                  <h3 className={`mb-4 text-lg font-semibold ${
                    darkMode ? "text-white" : "text-slate-900"
                  }`}>Financial Overview</h3>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div>
                      <p className={`text-sm ${
                        darkMode ? "text-slate-400" : "text-slate-600"
                      }`}>Total Income</p>
                      <p className={`mt-1 text-xl font-semibold ${
                        darkMode ? "text-emerald-400" : "text-emerald-600"
                      }`}>
                        {formatCurrency(adminStats.totalIncome || 0)}
                      </p>
                    </div>
                    <div>
                      <p className={`text-sm ${
                        darkMode ? "text-slate-400" : "text-slate-600"
                      }`}>Total Expense</p>
                      <p className={`mt-1 text-xl font-semibold ${
                        darkMode ? "text-rose-400" : "text-rose-600"
                      }`}>
                        {formatCurrency(adminStats.totalExpense || 0)}
                      </p>
                    </div>
                    <div>
                      <p className={`text-sm ${
                        darkMode ? "text-slate-400" : "text-slate-600"
                      }`}>Total Balance</p>
                      <p className={`mt-1 text-xl font-semibold ${
                        (adminStats.totalBalance || 0) >= 0 
                          ? darkMode ? 'text-emerald-400' : 'text-emerald-600'
                          : darkMode ? 'text-rose-400' : 'text-rose-600'
                      }`}>
                        {formatCurrency(adminStats.totalBalance || 0)}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Min/Max Statistics */}
                <div className={`grid gap-6 rounded-2xl p-6 shadow-soft sm:grid-cols-3 ${
                  darkMode ? "bg-slate-800" : "bg-white"
                }`}>
                  {/* Income Min/Max */}
                  <div>
                    <h3 className={`mb-4 text-lg font-semibold ${
                      darkMode ? "text-white" : "text-slate-900"
                    }`}>Pemasukan</h3>
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
                        <div className={`rounded-lg border p-3 ${
                          darkMode 
                            ? "border-slate-700 bg-slate-700/50" 
                            : "border-slate-200 bg-slate-50"
                        }`}>
                          <p className={`text-xs ${
                            darkMode ? "text-slate-400" : "text-slate-700"
                          }`}>
                            Terendah {adminStats.minIncome.count > 1 && `(${adminStats.minIncome.count} user)`}
                          </p>
                          <p className={`mt-1 text-sm font-semibold ${
                            darkMode ? "text-white" : "text-slate-900"
                          }`}>
                            {formatCurrency(adminStats.minIncome.amount)}
                          </p>
                          <div className="mt-2 space-y-1">
                            {adminStats.minIncome.users.map((u, idx) => (
                              <p key={idx} className={`text-xs ${
                                darkMode ? "text-slate-400" : "text-slate-600"
                              }`}>
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
                    <h3 className={`mb-4 text-lg font-semibold ${
                      darkMode ? "text-white" : "text-slate-900"
                    }`}>Pengeluaran</h3>
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
                        <div className={`rounded-lg border p-3 ${
                          darkMode 
                            ? "border-slate-700 bg-slate-700/50" 
                            : "border-slate-200 bg-slate-50"
                        }`}>
                          <p className={`text-xs ${
                            darkMode ? "text-slate-400" : "text-slate-700"
                          }`}>
                            Terendah {adminStats.minExpense.count > 1 && `(${adminStats.minExpense.count} user)`}
                          </p>
                          <p className={`mt-1 text-sm font-semibold ${
                            darkMode ? "text-white" : "text-slate-900"
                          }`}>
                            {formatCurrency(adminStats.minExpense.amount)}
                          </p>
                          <div className="mt-2 space-y-1">
                            {adminStats.minExpense.users.map((u, idx) => (
                              <p key={idx} className={`text-xs ${
                                darkMode ? "text-slate-400" : "text-slate-600"
                              }`}>
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
                    <h3 className={`mb-4 text-lg font-semibold ${
                      darkMode ? "text-white" : "text-slate-900"
                    }`}>Saldo</h3>
                    <div className="space-y-3">
                      {adminStats.maxBalance && (
                        <div className={`rounded-lg border p-3 ${
                          darkMode 
                            ? "border-emerald-800 bg-emerald-900/20" 
                            : "border-emerald-200 bg-emerald-50"
                        }`}>
                          <p className={`text-xs ${
                            darkMode ? "text-emerald-400" : "text-emerald-700"
                          }`}>
                            Tertinggi {adminStats.maxBalance.count > 1 && `(${adminStats.maxBalance.count} user)`}
                          </p>
                          <p className={`mt-1 text-sm font-semibold ${
                            darkMode ? "text-emerald-300" : "text-emerald-900"
                          }`}>
                            {formatCurrency(adminStats.maxBalance.amount)}
                          </p>
                          <div className="mt-2 space-y-1">
                            {adminStats.maxBalance.users.map((u, idx) => (
                              <p key={idx} className={`text-xs ${
                                darkMode ? "text-emerald-400" : "text-emerald-600"
                              }`}>
                                {u.name}
                              </p>
                            ))}
                          </div>
                        </div>
                      )}
                      {adminStats.minBalance && (
                        <div className={`rounded-lg border p-3 ${
                          darkMode 
                            ? "border-rose-800 bg-rose-900/20" 
                            : "border-rose-200 bg-rose-50"
                        }`}>
                          <p className={`text-xs ${
                            darkMode ? "text-rose-400" : "text-rose-700"
                          }`}>
                            Terendah {adminStats.minBalance.count > 1 && `(${adminStats.minBalance.count} user)`}
                          </p>
                          <p className={`mt-1 text-sm font-semibold ${
                            darkMode ? "text-rose-300" : "text-rose-900"
                          }`}>
                            {formatCurrency(adminStats.minBalance.amount)}
                          </p>
                          <div className="mt-2 space-y-1">
                            {adminStats.minBalance.users.map((u, idx) => (
                              <p key={idx} className={`text-xs ${
                                darkMode ? "text-rose-400" : "text-rose-600"
                              }`}>
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
                <div className={`grid gap-6 rounded-2xl p-6 shadow-soft sm:grid-cols-2 ${
                  darkMode ? "bg-slate-800" : "bg-white"
                }`}>
                  <div>
                    <h3 className={`mb-4 text-lg font-semibold ${
                      darkMode ? "text-white" : "text-slate-900"
                    }`}>New Users</h3>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className={darkMode ? "text-slate-400" : "text-slate-600"}>Today</span>
                        <span className={`font-semibold ${
                          darkMode ? "text-white" : "text-slate-900"
                        }`}>{adminStats.newUsers?.today || 0}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className={darkMode ? "text-slate-400" : "text-slate-600"}>This Week</span>
                        <span className={`font-semibold ${
                          darkMode ? "text-white" : "text-slate-900"
                        }`}>{adminStats.newUsers?.thisWeek || 0}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className={darkMode ? "text-slate-400" : "text-slate-600"}>This Month</span>
                        <span className={`font-semibold ${
                          darkMode ? "text-white" : "text-slate-900"
                        }`}>{adminStats.newUsers?.thisMonth || 0}</span>
                      </div>
                    </div>
                  </div>
                  <div>
                    <h3 className={`mb-4 text-lg font-semibold ${
                      darkMode ? "text-white" : "text-slate-900"
                    }`}>New Transactions</h3>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className={darkMode ? "text-slate-400" : "text-slate-600"}>Today</span>
                        <span className={`font-semibold ${
                          darkMode ? "text-white" : "text-slate-900"
                        }`}>{adminStats.newTransactions?.today || 0}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className={darkMode ? "text-slate-400" : "text-slate-600"}>This Week</span>
                        <span className={`font-semibold ${
                          darkMode ? "text-white" : "text-slate-900"
                        }`}>{adminStats.newTransactions?.thisWeek || 0}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className={darkMode ? "text-slate-400" : "text-slate-600"}>This Month</span>
                        <span className={`font-semibold ${
                          darkMode ? "text-white" : "text-slate-900"
                        }`}>{adminStats.newTransactions?.thisMonth || 0}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              ) : null
            )}

            {/* Admin Users & Admins Tab - Combined */}
            {adminTab === "users" && (
              <div className="space-y-6">
                {/* Users Section */}
                <div className={`relative rounded-2xl shadow-soft ${
                  darkMode ? "bg-slate-800" : "bg-white"
                }`}>
                  {adminLoading && adminUsers.length === 0 && (
                    <LoadingOverlay message="Memuat data users..." darkMode={darkMode} />
                  )}
                  <div className={`border-b p-4 ${
                    darkMode ? "border-slate-700" : "border-slate-200"
                  }`}>
                    <div className="flex items-center justify-between">
                      <h2 className={`text-lg font-semibold ${
                        darkMode ? "text-white" : "text-slate-900"
                      }`}>
                        Daftar Users ({adminUsers.filter(u => u.role !== 'admin').length})
                      </h2>
                      <button
                        type="button"
                        onClick={() => {
                          setCreateUserForm({ name: "", email: "", password: "", role: "user" });
                          setIsCreateUserModalOpen(true);
                        }}
                        className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700"
                      >
                        + Tambah User
                      </button>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className={`min-w-full divide-y ${
                      darkMode ? "divide-slate-700" : "divide-slate-100"
                    }`}>
                      <thead className={darkMode ? "bg-slate-700" : "bg-slate-50"}>
                        <tr>
                          <th className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide ${
                            darkMode ? "text-slate-300" : "text-slate-500"
                          }`}>
                            Name
                          </th>
                          <th className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide ${
                            darkMode ? "text-slate-300" : "text-slate-500"
                          }`}>
                            Email
                          </th>
                          <th className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide ${
                            darkMode ? "text-slate-300" : "text-slate-500"
                          }`}>
                            Transactions
                          </th>
                          <th className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide ${
                            darkMode ? "text-slate-300" : "text-slate-500"
                          }`}>
                            Last Login
                          </th>
                          <th className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide ${
                            darkMode ? "text-slate-300" : "text-slate-500"
                          }`}>
                            Created
                          </th>
                          <th className={`px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide ${
                            darkMode ? "text-slate-300" : "text-slate-500"
                          }`}>
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody className={`divide-y ${
                        darkMode ? "divide-slate-700 bg-slate-800" : "divide-slate-100 bg-white"
                      }`}>
                        {adminUsers.filter(u => u.role !== 'admin').length === 0 ? (
                          <tr>
                            <td colSpan="6" className={`px-4 py-8 text-center text-sm ${
                              darkMode ? "text-slate-400" : "text-slate-500"
                            }`}>
                              Belum ada user.
                            </td>
                          </tr>
                        ) : (
                          adminUsers.filter(u => u.role !== 'admin').map((u) => (
                            <tr key={u.id} className={darkMode ? "hover:bg-slate-700/50" : "hover:bg-slate-50"}>
                              <td className={`px-4 py-3 text-sm font-semibold ${
                                darkMode ? "text-white" : "text-slate-900"
                              }`}>
                                {u.name}
                              </td>
                              <td className={`px-4 py-3 text-sm ${
                                darkMode ? "text-slate-300" : "text-slate-600"
                              }`}>{u.email}</td>
                              <td className={`px-4 py-3 text-sm ${
                                darkMode ? "text-slate-300" : "text-slate-600"
                              }`}>
                                {u.transaction_count || 0}
                              </td>
                              <td className={`px-4 py-3 text-sm ${
                                darkMode ? "text-slate-400" : "text-slate-500"
                              }`}>
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
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Admins Section */}
                <div className={`relative rounded-2xl shadow-soft ${
                  darkMode ? "bg-slate-800" : "bg-white"
                }`}>
                  {adminLoading && adminUsers.length === 0 && (
                    <LoadingOverlay message="Memuat data admins..." darkMode={darkMode} />
                  )}
                  <div className={`border-b p-4 ${
                    darkMode ? "border-slate-700" : "border-slate-200"
                  }`}>
                    <div className="flex items-center justify-between">
                      <h2 className={`text-lg font-semibold ${
                        darkMode ? "text-white" : "text-slate-900"
                      }`}>
                        Daftar Admins ({adminUsers.filter(u => u.role === 'admin').length})
                      </h2>
                      <button
                        type="button"
                        onClick={() => {
                          setCreateUserForm({ name: "", email: "", password: "", role: "admin" });
                          setIsCreateUserModalOpen(true);
                        }}
                        className="rounded-xl bg-purple-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-purple-700"
                      >
                        + Tambah Admin
                      </button>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className={`min-w-full divide-y ${
                      darkMode ? "divide-slate-700" : "divide-slate-100"
                    }`}>
                      <thead className={darkMode ? "bg-slate-700" : "bg-slate-50"}>
                        <tr>
                          <th className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide ${
                            darkMode ? "text-slate-300" : "text-slate-500"
                          }`}>
                            Name
                          </th>
                          <th className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide ${
                            darkMode ? "text-slate-300" : "text-slate-500"
                          }`}>
                            Email
                          </th>
                          <th className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide ${
                            darkMode ? "text-slate-300" : "text-slate-500"
                          }`}>
                            Transactions
                          </th>
                          <th className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide ${
                            darkMode ? "text-slate-300" : "text-slate-500"
                          }`}>
                            Last Login
                          </th>
                          <th className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide ${
                            darkMode ? "text-slate-300" : "text-slate-500"
                          }`}>
                            Created
                          </th>
                          <th className={`px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide ${
                            darkMode ? "text-slate-300" : "text-slate-500"
                          }`}>
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody className={`divide-y ${
                        darkMode ? "divide-slate-700 bg-slate-800" : "divide-slate-100 bg-white"
                      }`}>
                        {adminUsers.filter(u => u.role === 'admin').length === 0 ? (
                          <tr>
                            <td colSpan="6" className={`px-4 py-8 text-center text-sm ${
                              darkMode ? "text-slate-400" : "text-slate-500"
                            }`}>
                              Belum ada admin.
                            </td>
                          </tr>
                        ) : (
                          adminUsers.filter(u => u.role === 'admin').map((u) => (
                            <tr key={u.id} className={darkMode ? "hover:bg-slate-700/50" : "hover:bg-slate-50"}>
                              <td className={`px-4 py-3 text-sm font-semibold ${
                                darkMode ? "text-white" : "text-slate-900"
                              }`}>
                                {u.name}
                              </td>
                              <td className={`px-4 py-3 text-sm ${
                                darkMode ? "text-slate-300" : "text-slate-600"
                              }`}>{u.email}</td>
                              <td className={`px-4 py-3 text-sm ${
                                darkMode ? "text-slate-300" : "text-slate-600"
                              }`}>
                                {u.transaction_count || 0}
                              </td>
                              <td className={`px-4 py-3 text-sm ${
                                darkMode ? "text-slate-400" : "text-slate-500"
                              }`}>
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
                              <td className={`px-4 py-3 text-sm ${
                                darkMode ? "text-slate-400" : "text-slate-500"
                              }`}>
                                {new Date(u.created_at).toLocaleDateString("id-ID", {
                                  timeZone: settings.timezone || "Asia/Jakarta"
                                })}
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex justify-center gap-2">
                                  <button
                                    onClick={() => handleEditUser(u)}
                                    className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                                      darkMode
                                        ? "bg-indigo-900/30 text-indigo-400 hover:bg-indigo-900/50"
                                        : "bg-indigo-50 text-indigo-600 hover:bg-indigo-100"
                                    }`}
                                  >
                                    Edit
                                  </button>
                                  {u.id !== user.id && (
                                    <button
                                      onClick={() => handleDeleteUser(u.id)}
                                      className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                                        darkMode
                                          ? "bg-rose-900/30 text-rose-400 hover:bg-rose-900/50"
                                          : "bg-rose-50 text-rose-600 hover:bg-rose-100"
                                      }`}
                                  >
                                    Delete
                                  </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* Admin Transactions Tab - Grouped by User */}
            {adminTab === "transactions" && (
              <div className="relative space-y-4">
                {adminLoading && adminTransactions.length === 0 && (
                  <LoadingOverlay message="Memuat data transaksi..." darkMode={darkMode} />
                )}
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
                      <div key={userGroup.user_id} className={`rounded-2xl border shadow-soft ${
                        darkMode ? "border-slate-700 bg-slate-800" : "border-slate-200 bg-white"
                      }`}>
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
                          className={`w-full px-6 py-4 text-left transition ${
                            darkMode ? "hover:bg-slate-700" : "hover:bg-slate-50"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-3">
                                <h3 className={`text-lg font-semibold ${
                                  darkMode ? "text-white" : "text-slate-900"
                                }`}>
                                  {userGroup.user_name}
                                </h3>
                                <span className={`text-sm ${
                                  darkMode ? "text-slate-400" : "text-slate-500"
                                }`}>
                                  ({userGroup.user_email})
                                </span>
                              </div>
                              <div className={`mt-2 flex gap-4 text-sm ${
                                darkMode ? "text-slate-300" : "text-slate-600"
                              }`}>
                                <span>
                                  <span className="font-semibold">{userGroup.transactions.length}</span> transaksi
                                </span>
                                <span>
                                  Income: <span className={`font-semibold ${
                                    darkMode ? "text-emerald-400" : "text-emerald-600"
                                  }`}>{formatCurrency(userGroup.total_income)}</span>
                                </span>
                                <span>
                                  Expense: <span className={`font-semibold ${
                                    darkMode ? "text-rose-400" : "text-rose-600"
                                  }`}>{formatCurrency(userGroup.total_expense)}</span>
                                </span>
                                <span>
                                  Balance: <span className={`font-semibold ${
                                    balance >= 0 
                                      ? darkMode ? 'text-emerald-400' : 'text-emerald-600'
                                      : darkMode ? 'text-rose-400' : 'text-rose-600'
                                  }`}>
                                    {formatCurrency(balance)}
                                  </span>
                                </span>
                              </div>
                            </div>
                            <svg
                              className={`h-5 w-5 transition-transform ${
                                darkMode ? "text-slate-400" : "text-slate-400"
                              } ${isExpanded ? 'rotate-180' : ''}`}
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
                          <div className={`border-t ${
                            darkMode ? "border-slate-700" : "border-slate-200"
                          }`}>
                            <div className="max-h-[400px] overflow-y-auto">
                              <div className="overflow-x-auto">
                                <table className={`min-w-full divide-y ${
                                  darkMode ? "divide-slate-700" : "divide-slate-100"
                                }`}>
                                  <thead className={`sticky top-0 z-10 ${
                                    darkMode ? "bg-slate-700" : "bg-slate-50"
                                  }`}>
                                    <tr>
                                      <th className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide ${
                                        darkMode ? "text-slate-300" : "text-slate-500"
                                      }`}>
                                        Date
                                      </th>
                                      <th className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide ${
                                        darkMode ? "text-slate-300" : "text-slate-500"
                                      }`}>
                                        Description
                                      </th>
                                      <th className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide ${
                                        darkMode ? "text-slate-300" : "text-slate-500"
                                      }`}>
                                        Type
                                      </th>
                                      <th className={`px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide ${
                                        darkMode ? "text-slate-300" : "text-slate-500"
                                      }`}>
                                        Amount
                                      </th>
                                    </tr>
                                  </thead>
                                  <tbody className={`divide-y ${
                                    darkMode ? "divide-slate-700 bg-slate-800" : "divide-slate-100 bg-white"
                                  }`}>
                                    {userGroup.transactions
                                      .sort((a, b) => new Date(b.date) - new Date(a.date))
                                      .map((t) => (
                                        <tr key={t.id} className={darkMode ? "hover:bg-slate-700/50" : "hover:bg-slate-50"}>
                                          <td className={`px-4 py-3 text-sm ${
                                            darkMode ? "text-slate-300" : "text-slate-600"
                                          }`}>
                                            {formatDate(t.date, settings.timezone || "Asia/Jakarta")}
                                          </td>
                                          <td className={`px-4 py-3 text-sm ${
                                            darkMode ? "text-slate-300" : "text-slate-600"
                                          }`}>{t.description}</td>
                                          <td className="px-4 py-3">
                                            <Badge
                                              label={t.type}
                                              variant={t.type}
                                            />
                                          </td>
                                          <td className={`px-4 py-3 text-right text-sm font-semibold ${
                                            darkMode ? "text-white" : "text-slate-900"
                                          }`}>
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
                  <div className={`rounded-2xl border border-dashed py-12 text-center ${
                    darkMode ? "border-slate-700 bg-slate-800" : "border-slate-200 bg-white"
                  }`}>
                    <p className={`text-base font-semibold ${
                      darkMode ? "text-slate-200" : "text-slate-800"
                    }`}>
                      Belum ada transaksi
                    </p>
                    <p className={`mt-1 text-sm ${
                      darkMode ? "text-slate-400" : "text-slate-500"
                    }`}>
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

            {/* Charts Section */}
            {entries.length > 0 && (
              <section className="grid gap-6 lg:grid-cols-2">
                {/* Line Chart - Balance Trend */}
                <div className={`rounded-3xl p-6 shadow-soft transition-colors ${
                  darkMode ? "bg-slate-800" : "bg-white"
                }`}>
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <p className={`text-sm font-semibold uppercase tracking-wide ${
                        darkMode ? "text-slate-400" : "text-slate-600"
                      }`}>
                        Perkembangan Saldo
                      </p>
                      <h3 className={`text-xl font-semibold ${
                        darkMode ? "text-white" : "text-slate-900"
                      }`}>
                        {chartPeriod === "daily" ? "Harian" : "Bulanan"}
                      </h3>
                    </div>
                    <select
                      value={chartPeriod}
                      onChange={(e) => setChartPeriod(e.target.value)}
                      className={getInputClasses(darkMode)}
                    >
                      <option value="daily">Harian</option>
                      <option value="monthly">Bulanan</option>
                    </select>
                  </div>
                  <ResponsiveContainer width="100%" height={250}>
                    <LineChart data={chartPeriod === "daily" ? dailyBalanceData : monthlyBalanceData}>
                      <CartesianGrid strokeDasharray="3 3" stroke={darkMode ? "#475569" : "#e2e8f0"} />
                      <XAxis 
                        dataKey={chartPeriod === "daily" ? "date" : "month"} 
                        stroke={darkMode ? "#94a3b8" : "#64748b"}
                        tick={{ fill: darkMode ? "#94a3b8" : "#64748b", fontSize: 12 }}
                      />
                      <YAxis 
                        stroke={darkMode ? "#94a3b8" : "#64748b"}
                        tick={{ fill: darkMode ? "#94a3b8" : "#64748b", fontSize: 12 }}
                        tickFormatter={(value) => `Rp${(value / 1000).toFixed(0)}k`}
                      />
                      <Tooltip 
                        contentStyle={{
                          backgroundColor: darkMode ? "#1e293b" : "#fff",
                          border: `1px solid ${darkMode ? "#475569" : "#e2e8f0"}`,
                          borderRadius: "12px",
                          color: darkMode ? "#fff" : "#0f172a"
                        }}
                        formatter={(value) => formatCurrency(value)}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="balance" 
                        stroke="#6366f1" 
                        strokeWidth={2}
                        dot={{ fill: "#6366f1", r: 4 }}
                        activeDot={{ r: 6 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                {/* Bar Chart - Income vs Expense */}
                <div className={`rounded-3xl p-6 shadow-soft transition-colors ${
                  darkMode ? "bg-slate-800" : "bg-white"
                }`}>
                  <div className="mb-4">
                    <p className={`text-sm font-semibold uppercase tracking-wide ${
                      darkMode ? "text-slate-400" : "text-slate-600"
                    }`}>
                      Pemasukan vs Pengeluaran
                    </p>
                    <h3 className={`text-xl font-semibold ${
                      darkMode ? "text-white" : "text-slate-900"
                    }`}>
                      Perbandingan Bulanan
                    </h3>
                  </div>
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={incomeExpenseData}>
                      <CartesianGrid strokeDasharray="3 3" stroke={darkMode ? "#475569" : "#e2e8f0"} />
                      <XAxis 
                        dataKey="month" 
                        stroke={darkMode ? "#94a3b8" : "#64748b"}
                        tick={{ fill: darkMode ? "#94a3b8" : "#64748b", fontSize: 12 }}
                      />
                      <YAxis 
                        stroke={darkMode ? "#94a3b8" : "#64748b"}
                        tick={{ fill: darkMode ? "#94a3b8" : "#64748b", fontSize: 12 }}
                        tickFormatter={(value) => `Rp${(value / 1000).toFixed(0)}k`}
                      />
                      <Tooltip 
                        contentStyle={{
                          backgroundColor: darkMode ? "#1e293b" : "#fff",
                          border: `1px solid ${darkMode ? "#475569" : "#e2e8f0"}`,
                          borderRadius: "12px",
                          color: darkMode ? "#fff" : "#0f172a"
                        }}
                        formatter={(value) => formatCurrency(value)}
                      />
                      <Legend />
                      <Bar dataKey="income" fill="#10b981" radius={[8, 8, 0, 0]} />
                      <Bar dataKey="expense" fill="#ef4444" radius={[8, 8, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Pie Chart - Expense by Category */}
                {expenseByCategory.length > 0 && (
                  <div className={`rounded-3xl p-6 shadow-soft transition-colors ${
                    darkMode ? "bg-slate-800" : "bg-white"
                  }`}>
                    <div className="mb-4">
                      <p className={`text-sm font-semibold uppercase tracking-wide ${
                        darkMode ? "text-slate-400" : "text-slate-600"
                      }`}>
                        Komposisi Pengeluaran
                      </p>
                      <h3 className={`text-xl font-semibold ${
                        darkMode ? "text-white" : "text-slate-900"
                      }`}>
                        Berdasarkan Kategori
                      </h3>
                    </div>
                    <ResponsiveContainer width="100%" height={250}>
                      <PieChart>
                        <Pie
                          data={expenseByCategory}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={false}
                          outerRadius={80}
                          fill="#8884d8"
                          dataKey="value"
                        >
                          {expenseByCategory.map((entry, index) => {
                            const colors = ["#ef4444", "#f97316", "#f59e0b", "#eab308", "#84cc16", "#22c55e", "#10b981", "#14b8a6", "#06b6d4", "#3b82f6"];
                            return <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />;
                          })}
                        </Pie>
                        <Tooltip 
                          contentStyle={{
                            backgroundColor: darkMode ? "#1e293b" : "#fff",
                            border: `1px solid ${darkMode ? "#475569" : "#e2e8f0"}`,
                            borderRadius: "12px",
                            color: darkMode ? "#fff" : "#0f172a",
                            padding: "8px 12px"
                          }}
                          labelStyle={{
                            color: darkMode ? "#cbd5e1" : "#64748b",
                            fontWeight: "600",
                            marginBottom: "4px"
                          }}
                          itemStyle={{
                            color: darkMode ? "#fff" : "#0f172a"
                          }}
                          formatter={(value, name) => [formatCurrency(value), name]}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* Insights Section */}
                <div className={`rounded-3xl p-6 shadow-soft transition-colors ${
                  darkMode ? "bg-slate-800" : "bg-white"
                }`}>
                  <div className="mb-4">
                    <p className={`text-sm font-semibold uppercase tracking-wide ${
                      darkMode ? "text-slate-400" : "text-slate-500"
                    }`}>
                      Insight & Statistik
                    </p>
                    <h3 className={`text-xl font-semibold ${
                      darkMode ? "text-white" : "text-slate-900"
                    }`}>
                      Analisis Keuangan
                    </h3>
                  </div>
                  <div className="space-y-4">
                    {/* Top Category */}
                    <div className={`rounded-xl border p-4 ${
                      darkMode 
                        ? "border-slate-700 bg-slate-700/50" 
                        : "border-slate-200 bg-slate-50"
                    }`}>
                      <p className={`text-xs font-semibold uppercase tracking-wide ${
                        darkMode ? "text-slate-400" : "text-slate-500"
                      }`}>
                        Kategori Pengeluaran Terbesar Bulan Ini
                      </p>
                      <p className={`mt-1 text-lg font-semibold ${
                        darkMode ? "text-white" : "text-slate-900"
                      }`}>
                        {insights.topCategory.name}
                      </p>
                      <p className={`text-sm ${
                        darkMode ? "text-rose-400" : "text-rose-600"
                      }`}>
                        {formatCurrency(insights.topCategory.amount)}
                      </p>
                    </div>

                    {/* Expense Comparison */}
                    <div className={`rounded-xl border p-4 ${
                      darkMode 
                        ? "border-slate-700 bg-slate-700/50" 
                        : "border-slate-200 bg-slate-50"
                    }`}>
                      <p className={`text-xs font-semibold uppercase tracking-wide ${
                        darkMode ? "text-slate-400" : "text-slate-500"
                      }`}>
                        Perbandingan dengan Bulan Lalu
                      </p>
                      <p className={`mt-1 text-lg font-semibold ${
                        darkMode ? "text-white" : "text-slate-900"
                      }`}>
                        {parseFloat(insights.expenseChange) > 0 ? "+" : ""}{insights.expenseChange}%
                      </p>
                      <p className={`text-sm ${
                        darkMode ? "text-slate-400" : "text-slate-600"
                      }`}>
                        Bulan ini: {formatCurrency(insights.currentMonthExpenses)}
                      </p>
                    </div>

                    {/* Top Day */}
                    {insights.topDay.date && (
                      <div className={`rounded-xl border p-4 ${
                        darkMode 
                          ? "border-slate-700 bg-slate-700/50" 
                          : "border-slate-200 bg-slate-50"
                      }`}>
                        <p className={`text-xs font-semibold uppercase tracking-wide ${
                          darkMode ? "text-slate-400" : "text-slate-500"
                        }`}>
                          Hari dengan Pengeluaran Terbesar
                        </p>
                        <p className={`mt-1 text-lg font-semibold ${
                          darkMode ? "text-white" : "text-slate-900"
                        }`}>
                          {formatDate(insights.topDay.date, settings.timezone || "Asia/Jakarta")}
                        </p>
                        <p className={`text-sm ${
                          darkMode ? "text-rose-400" : "text-rose-600"
                        }`}>
                          {formatCurrency(insights.topDay.amount)}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </section>
            )}

            {/* Calendar Heatmap */}
            {entries.length > 0 && (
              <section className="grid gap-6">
                <div className={`rounded-3xl p-6 shadow-soft transition-colors animate-fade-in ${
                  darkMode ? "bg-slate-800" : "bg-white"
                }`}>
                  <div className="mb-4">
                    <p className={`text-sm font-semibold uppercase tracking-wide ${
                      darkMode ? "text-slate-400" : "text-slate-500"
                    }`}>
                      Aktivitas Transaksi
                    </p>
                    <h3 className={`text-xl font-semibold ${
                      darkMode ? "text-white" : "text-slate-900"
                    }`}>
                      Calendar Heatmap
                    </h3>
                    <p className={`mt-1 text-sm ${
                      darkMode ? "text-slate-400" : "text-slate-500"
                    }`}>
                      Intensitas transaksi per hari
                    </p>
                  </div>
                  <div className="w-full">
                    <CalendarHeatmap data={heatmapData} darkMode={darkMode} />
                  </div>
                </div>
              </section>
            )}

            <section className="grid gap-6">
          <div className={`rounded-3xl p-6 shadow-soft transition-colors ${
            darkMode ? "bg-slate-800" : "bg-white"
          }`}>
            <div className="flex flex-col gap-4 pb-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className={`text-sm font-semibold uppercase tracking-wide ${
                  darkMode ? "text-slate-400" : "text-slate-500"
                }`}>
                  Daftar Transaksi
                </p>
                <h2 className={`text-2xl font-semibold ${
                  darkMode ? "text-white" : "text-slate-900"
                }`}>
                  Histori arus kas
                </h2>
              </div>
              <p className={`text-sm ${
                darkMode ? "text-slate-400" : "text-slate-500"
              }`}>
                {loading
                  ? "Memuat data..."
                  : `${filteredEntries.length} dari ${entries.length} transaksi`}
              </p>
            </div>

            {/* Filters and Search */}
            <div className={`mb-4 space-y-3 rounded-2xl border p-4 ${
              darkMode 
                ? "border-slate-700 bg-slate-700/50" 
                : "border-slate-200 bg-slate-50"
            }`}>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {/* Search */}
                <div className="sm:col-span-2 lg:col-span-1">
                  <label className={`mb-1 block text-xs font-semibold ${
                    darkMode ? "text-slate-400" : "text-slate-600"
                  }`}>
                    Cari Transaksi
                  </label>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Cari nama/deskripsi..."
                    className={getInputClasses(darkMode)}
                  />
                </div>

                {/* Date From */}
                <div>
                  <label className={`mb-1 block text-xs font-semibold ${
                    darkMode ? "text-slate-400" : "text-slate-600"
                  }`}>
                    Dari Tanggal
                  </label>
                  <input
                    type="date"
                    value={filterDateFrom}
                    onChange={(e) => setFilterDateFrom(e.target.value)}
                    className={getInputClasses(darkMode)}
                  />
                </div>

                {/* Date To */}
                <div>
                  <label className={`mb-1 block text-xs font-semibold ${
                    darkMode ? "text-slate-400" : "text-slate-600"
                  }`}>
                    Sampai Tanggal
                  </label>
                  <input
                    type="date"
                    value={filterDateTo}
                    onChange={(e) => setFilterDateTo(e.target.value)}
                    className={getInputClasses(darkMode)}
                  />
                </div>

                {/* Type Filter */}
                <div>
                  <label className={`mb-1 block text-xs font-semibold ${
                    darkMode ? "text-slate-400" : "text-slate-600"
                  }`}>
                    Tipe Transaksi
                  </label>
                  <select
                    value={filterType}
                    onChange={(e) => setFilterType(e.target.value)}
                    className={getInputClasses(darkMode)}
                  >
                    <option value="">Semua</option>
                    <option value="income">Pemasukan</option>
                    <option value="expense">Pengeluaran</option>
                  </select>
                </div>
              </div>

              {/* Reset Button */}
              {(searchQuery || filterDateFrom || filterDateTo || filterType) && (
                <button
                  onClick={resetFilters}
                  className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                    darkMode
                      ? "bg-slate-600 text-white hover:bg-slate-500"
                      : "bg-slate-200 text-slate-700 hover:bg-slate-300"
                  }`}
                >
                  Reset Filter
                </button>
              )}
            </div>

            {loading ? (
              <div className="py-20 text-center">
                <LoadingSpinner size="lg" className="mx-auto mb-3" />
                <p className={`text-sm font-medium ${
                  darkMode ? "text-slate-400" : "text-slate-500"
                }`}>Memuat transaksi...</p>
              </div>
            ) : filteredEntries.length === 0 ? (
              <EmptyState darkMode={darkMode} />
            ) : (
              <>
                {/* Pagination Controls - Top */}
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2">
                    <label className={`text-sm font-medium ${
                      darkMode ? "text-slate-400" : "text-slate-600"
                    }`}>
                      Tampilkan:
                    </label>
                    <select
                      value={itemsPerPage}
                      onChange={(e) => {
                        setItemsPerPage(Number(e.target.value));
                        setCurrentPage(1);
                      }}
                      className={getInputClasses(darkMode)}
                    >
                      <option value={10}>10</option>
                      <option value={25}>25</option>
                      <option value={50}>50</option>
                    </select>
                    <span className={`text-sm ${
                      darkMode ? "text-slate-400" : "text-slate-500"
                    }`}>
                      per halaman
                    </span>
                  </div>
                  {totalPages > 1 && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        className={`rounded-xl border px-3 py-1.5 text-sm font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed ${
                          darkMode
                            ? "border-slate-600 bg-slate-800 text-white hover:bg-slate-700"
                            : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        Sebelumnya
                      </button>
                      <span className={`text-sm font-medium ${
                        darkMode ? "text-slate-400" : "text-slate-600"
                      }`}>
                        Halaman {currentPage} dari {totalPages}
                      </span>
                      <button
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                        className={`rounded-xl border px-3 py-1.5 text-sm font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed ${
                          darkMode
                            ? "border-slate-600 bg-slate-800 text-white hover:bg-slate-700"
                            : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        Selanjutnya
                      </button>
                    </div>
                  )}
                </div>

                <div className="hidden md:block">
                  <div className={`max-h-[320px] overflow-y-auto rounded-2xl border ${
                    darkMode ? "border-slate-700" : "border-slate-100"
                  }`}>
                    <table className={`min-w-full divide-y ${
                      darkMode ? "divide-slate-700" : "divide-slate-100"
                    }`}>
                      <thead className={`sticky top-0 text-xs uppercase tracking-wide ${
                        darkMode 
                          ? "bg-slate-800 text-slate-400" 
                          : "bg-slate-50 text-slate-500"
                      }`}>
                        <tr>
                          <th className="px-4 py-3 text-left">Tanggal</th>
                          <th className="px-4 py-3 text-left">Uraian</th>
                          <th className="px-4 py-3 text-right">Pemasukan</th>
                          <th className="px-4 py-3 text-right">Pengeluaran</th>
                          <th className="px-4 py-3 text-right">Saldo</th>
                          <th className="px-4 py-3 text-center">Aksi</th>
                        </tr>
                      </thead>
                      <tbody className={`divide-y text-sm ${
                        darkMode 
                          ? "divide-slate-700 text-slate-300" 
                          : "divide-slate-100 text-slate-700"
                      }`}>
                        {paginatedEntries.map((entry, index) => (
                          <tr key={entry.id} className={`transition-colors ${
                            darkMode ? "hover:bg-slate-700/50" : "hover:bg-slate-50"
                          }`}>
                            <td className={`px-4 py-3 ${
                              darkMode ? "text-slate-400" : "text-slate-500"
                            }`}>
                              {formatDate(entry.date, settings.timezone || "Asia/Jakarta")}
                            </td>
                            <td className={`px-4 py-3 font-semibold ${
                              darkMode ? "text-white" : "text-slate-900"
                            }`}>
                              {entry.description}
                            </td>
                            <td className={`px-4 py-3 text-right ${
                              darkMode ? "text-emerald-400" : "text-emerald-600"
                            }`}>
                              {entry.type === "income"
                                ? formatCurrency(entry.amount)
                                : "-"}
                            </td>
                            <td className={`px-4 py-3 text-right ${
                              darkMode ? "text-rose-400" : "text-rose-600"
                            }`}>
                              {entry.type === "expense"
                                ? formatCurrency(entry.amount)
                                : "-"}
                            </td>
                            <td className={`px-4 py-3 text-right font-semibold ${
                              darkMode ? "text-white" : "text-slate-900"
                            }`}>
                              {formatCurrency(entry.runningBalance)}
                            </td>
                          <td className="px-4 py-3">
                            <div className="flex justify-center gap-2">
                              <button
                                onClick={() => openModal(entry)}
                                className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                                  darkMode
                                    ? "bg-slate-700 text-slate-300 hover:bg-slate-600"
                                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                                }`}
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => {
                                  setDeleteTarget(entry.id);
                                  setIsDeleteConfirmOpen(true);
                                }}
                                className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                                  darkMode
                                    ? "bg-rose-900/30 text-rose-400 hover:bg-rose-900/50"
                                    : "bg-rose-50 text-rose-600 hover:bg-rose-100"
                                }`}
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

                {/* Pagination Controls - Bottom */}
                {totalPages > 1 && (
                  <div className="mt-4 flex justify-center">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        className={`rounded-xl border px-3 py-1.5 text-sm font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed ${
                          darkMode
                            ? "border-slate-600 bg-slate-800 text-white hover:bg-slate-700"
                            : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        Sebelumnya
                      </button>
                      <span className={`text-sm font-medium ${
                        darkMode ? "text-slate-400" : "text-slate-600"
                      }`}>
                        {currentPage} / {totalPages}
                      </span>
                      <button
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                        className={`rounded-xl border px-3 py-1.5 text-sm font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed ${
                          darkMode
                            ? "border-slate-600 bg-slate-800 text-white hover:bg-slate-700"
                            : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        Selanjutnya
                      </button>
                    </div>
                  </div>
                )}

                <div className="md:hidden">
                  <div className={`max-h-[360px] overflow-y-auto rounded-2xl border p-1 ${
                    darkMode ? "border-slate-700" : "border-slate-100"
                  }`}>
                    <div className="space-y-3">
                      {paginatedEntries.map((entry, index) => (
                        <div
                          key={`${entry.id}-scrollable`}
                          className={`rounded-2xl border p-4 shadow-sm transition-all hover:shadow-md ${
                            darkMode 
                              ? "border-slate-700 bg-slate-800" 
                              : "border-slate-100 bg-white"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className={`text-[11px] uppercase tracking-wide ${
                            darkMode ? "text-slate-500" : "text-slate-400"
                          }`}>
                            {formatDate(entry.date)}
                          </p>
                          <p className={`text-base font-semibold ${
                            darkMode ? "text-white" : "text-slate-900"
                          }`}>
                            {entry.description}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => openModal(entry)}
                            className={`text-xs font-semibold ${
                              darkMode ? "text-slate-400" : "text-slate-500"
                            }`}
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => {
                              setDeleteTarget(entry.id);
                              setIsDeleteConfirmOpen(true);
                            }}
                            className={`text-xs font-semibold ${
                              darkMode ? "text-rose-400" : "text-rose-500"
                            }`}
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

      {/* Floating Action Button (FAB) for Mobile */}
      {user?.role !== 'admin' && isAuthenticated && (
        <button
          onClick={openModal}
          className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-indigo-600 text-white shadow-2xl transition-all hover:bg-indigo-700 hover:scale-110 active:scale-95 md:hidden"
          aria-label="Tambah Transaksi"
        >
          <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 px-4">
          <div
            ref={modalRef}
            className={`w-full max-w-lg rounded-3xl p-6 shadow-2xl sm:p-8 ${
              darkMode ? "bg-slate-800" : "bg-white"
            }`}
          >
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <p className={`text-sm font-semibold uppercase tracking-wide ${
                  darkMode ? "text-slate-400" : "text-slate-500"
                }`}>
                  {isPinStep ? "Keamanan PIN" : "Input Transaksi"}
                </p>
                <h2 className={`text-2xl font-semibold ${
                  darkMode ? "text-white" : "text-slate-900"
                }`}>
                  {modalTitle}
                </h2>
                {modalSubtitle && (
                  <p className={`text-sm ${
                    darkMode ? "text-slate-400" : "text-slate-500"
                  }`}>{modalSubtitle}</p>
                )}
              </div>
              <button
                type="button"
                onClick={closeModal}
                className={`rounded-full p-2 transition ${
                  darkMode
                    ? "bg-slate-700 text-slate-300 hover:bg-slate-600"
                    : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                }`}
                aria-label="Tutup form"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              {!isPinStep ? (
                <>
                  <Field label="Uraian" darkMode={darkMode}>
                    <input
                      name="description"
                      value={form.description || ""}
                      onChange={handleChange}
                      placeholder="Contoh: Warung Biru"
                      className={getInputClasses(darkMode)}
                    />
                  </Field>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Nominal" darkMode={darkMode}>
                      <div className={`flex items-center rounded-2xl border px-3 py-1 ${
                        darkMode
                          ? "border-slate-600 bg-slate-700"
                          : "border-slate-200 bg-slate-50"
                      }`}>
                        <span className={`text-sm font-semibold ${
                          darkMode ? "text-slate-400" : "text-slate-500"
                        }`}>
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
                          className={`ml-2 w-full border-none bg-transparent px-0 py-2 text-base font-semibold outline-none focus:ring-0 ${
                            darkMode ? "text-white" : "text-slate-900"
                          }`}
                          placeholder="0"
                        />
                      </div>
                    </Field>
                    <Field label="Jenis" darkMode={darkMode}>
                      <select
                        name="type"
                        value={form.type || "expense"}
                        onChange={handleChange}
                        className={getInputClasses(darkMode)}
                      >
                        <option value="expense">Pengeluaran</option>
                        <option value="income">Pemasukan</option>
                      </select>
                    </Field>
                  </div>

                  <Field label="Tanggal" darkMode={darkMode}>
                    <input
                      type="date"
                      name="date"
                      value={form.date || getToday(settings.timezone || "Asia/Jakarta")}
                      onChange={handleChange}
                      className={getInputClasses(darkMode)}
                    />
                  </Field>
                </>
              ) : settings.pinEnabled ? (
                <div className="space-y-3">
                  <p className={`text-center text-sm ${
                    darkMode ? "text-slate-400" : "text-slate-500"
                  }`}>
                    {pinDescriptions[pinMode ?? "create"]}
                  </p>
                  <Field label="PIN" darkMode={darkMode}>
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
                      className={`${getInputClasses(darkMode)} text-center tracking-[0.5em]`}
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
                  <LoadingButton
                    type="button"
                    onClick={confirmDeleteWithPin}
                    loading={deleting}
                    className="inline-flex w-full items-center justify-center rounded-2xl bg-rose-600 px-4 py-3 text-sm font-semibold text-white shadow-soft transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:bg-rose-300 sm:w-auto sm:flex-1"
                  >
                    {settings.pinEnabled ? "Konfirmasi PIN" : "Konfirmasi"}
                  </LoadingButton>
                ) : isPinStep && pinMode === "export" ? (
                  <LoadingButton
                    type="button"
                    onClick={confirmExportWithPin}
                    loading={exporting}
                    className="inline-flex w-full items-center justify-center rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-soft transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300 sm:w-auto sm:flex-1"
                  >
                    {settings.pinEnabled ? "Konfirmasi PIN" : "Konfirmasi"}
                  </LoadingButton>
                ) : (
                  <LoadingButton
                    type="submit"
                    loading={submitting}
                    className="inline-flex w-full items-center justify-center rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-soft transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-indigo-300 sm:w-auto sm:flex-1"
                  >
                    {isPinStep
                      ? settings.pinEnabled
                        ? "Konfirmasi PIN"
                        : "Konfirmasi"
                      : editingTarget
                      ? "Simpan Perubahan"
                      : "Lanjutkan"}
                  </LoadingButton>
                )}
              </div>
            </form>
          </div>
        </div>
      )}

      {isConfirmOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/70 px-4">
          <div className={`w-full max-w-md rounded-3xl p-6 text-center shadow-2xl sm:p-8 ${
            darkMode ? "bg-slate-800" : "bg-white"
          }`}>
            <p className={`text-sm font-semibold uppercase tracking-wide ${
              darkMode ? "text-rose-400" : "text-rose-500"
            }`}>
              Hapus semua data?
            </p>
            <h2 className={`mt-2 text-2xl font-semibold ${
              darkMode ? "text-white" : "text-slate-900"
            }`}>
              Tindakan ini permanen
            </h2>
            <p className={`mt-3 text-sm ${
              darkMode ? "text-slate-400" : "text-slate-500"
            }`}>
              Semua transaksi akan dihapus dan tidak dapat dikembalikan. Pastikan
              Anda sudah membuat cadangan jika diperlukan.
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setIsConfirmOpen(false)}
                className={`inline-flex items-center justify-center rounded-2xl border px-4 py-3 text-sm font-semibold transition ${
                  darkMode
                    ? "border-slate-600 text-slate-300 hover:bg-slate-700"
                    : "border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
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
          <div className={`w-full max-w-md rounded-3xl p-6 text-center shadow-2xl sm:p-8 ${
            darkMode ? "bg-slate-800" : "bg-white"
          }`}>
            <p className={`text-sm font-semibold uppercase tracking-wide ${
              darkMode ? "text-rose-400" : "text-rose-500"
            }`}>
              Hapus transaksi?
            </p>
            <h2 className={`mt-2 text-2xl font-semibold ${
              darkMode ? "text-white" : "text-slate-900"
            }`}>
              Tindakan tidak dapat dibatalkan
            </h2>
            <p className={`mt-3 text-sm ${
              darkMode ? "text-slate-400" : "text-slate-500"
            }`}>
              Transaksi ini akan dihapus permanen dari database.
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => {
                  setIsDeleteConfirmOpen(false);
                  setDeleteTarget(null);
                }}
                className={`inline-flex items-center justify-center rounded-2xl border px-4 py-3 text-sm font-semibold transition ${
                  darkMode
                    ? "border-slate-600 text-slate-300 hover:bg-slate-700"
                    : "border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
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
          <div className={`w-full max-w-md rounded-3xl p-6 text-center shadow-2xl sm:p-8 ${
            darkMode ? "bg-slate-800" : "bg-white"
          }`}>
            <p className={`text-sm font-semibold uppercase tracking-wide ${
              darkMode ? "text-slate-400" : "text-slate-500"
            }`}>
              Keamanan PIN
            </p>
            <h2 className={`mt-2 text-2xl font-semibold ${
              darkMode ? "text-white" : "text-slate-900"
            }`}>
              Konfirmasi PIN
            </h2>
            <p className={`mt-3 text-sm ${
              darkMode ? "text-slate-400" : "text-slate-500"
            }`}>
              Masukkan PIN 4-digit untuk mengunduh transaksi.
            </p>
            <div className="mt-4 space-y-3 text-left">
              <Field label="PIN" darkMode={darkMode}>
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
                  className={`${getInputClasses(darkMode)} text-center tracking-[0.5em]`}
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
                className={`inline-flex items-center justify-center rounded-2xl border px-4 py-3 text-sm font-semibold transition ${
                  darkMode
                    ? "border-slate-600 text-slate-300 hover:bg-slate-700"
                    : "border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
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
          <div className={`relative w-full max-w-md rounded-3xl p-6 text-center shadow-2xl sm:p-8 ${
            darkMode ? "bg-slate-800" : "bg-white"
          }`}>
            {importing && <LoadingOverlay message="Mengimpor transaksi..." darkMode={darkMode} />}
            <p className={`text-sm font-semibold uppercase tracking-wide ${
              darkMode ? "text-indigo-400" : "text-indigo-500"
            }`}>
              Import Excel
            </p>
            <h2 className={`mt-2 text-2xl font-semibold ${
              darkMode ? "text-white" : "text-slate-900"
            }`}>
              Upload File Excel
            </h2>
            <p className={`mt-3 text-sm ${
              darkMode ? "text-slate-400" : "text-slate-500"
            }`}>
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
                      ? darkMode
                        ? "border-slate-700 bg-slate-700/50 cursor-not-allowed"
                        : "border-slate-200 bg-slate-50 cursor-not-allowed"
                      : darkMode
                      ? "border-indigo-600 bg-indigo-900/30 hover:border-indigo-500 hover:bg-indigo-900/50"
                      : "border-indigo-300 bg-indigo-50 hover:border-indigo-400 hover:bg-indigo-100"
                  }`}
                >
                  {importing ? (
                    <>
                      <div className="mb-2 text-2xl">⏳</div>
                      <p className={`text-sm font-semibold ${
                        darkMode ? "text-slate-300" : "text-slate-600"
                      }`}>
                        Memproses file...
                      </p>
                    </>
                  ) : (
                    <>
                      <div className="mb-2 text-2xl">📄</div>
                      <p className={`text-sm font-semibold ${
                        darkMode ? "text-indigo-400" : "text-indigo-600"
                      }`}>
                        Klik untuk memilih file
                      </p>
                      <p className={`mt-1 text-xs ${
                        darkMode ? "text-slate-400" : "text-slate-500"
                      }`}>
                        Format: .xlsx atau .xls
                      </p>
                    </>
                  )}
                </label>
              </div>
              {importFile && (
                <div className={`rounded-xl p-3 text-left ${
                  darkMode ? "bg-slate-700/50" : "bg-slate-50"
                }`}>
                  <p className={`text-xs font-semibold ${
                    darkMode ? "text-slate-400" : "text-slate-500"
                  }`}>File terpilih:</p>
                  <p className={`text-sm font-medium ${
                    darkMode ? "text-white" : "text-slate-900"
                  }`}>{importFile.name}</p>
                </div>
              )}
            </div>
            <div className="mt-6">
              <button
                type="button"
                onClick={closeImportFileModal}
                disabled={importing}
                className={`inline-flex w-full items-center justify-center rounded-2xl border px-4 py-3 text-sm font-semibold transition disabled:opacity-50 ${
                  darkMode
                    ? "border-slate-600 text-slate-300 hover:bg-slate-700"
                    : "border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                Batalkan
              </button>
            </div>
          </div>
        </div>
      )}

      {isImportPinOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/70 px-4">
          <div className={`relative w-full max-w-md rounded-3xl p-6 text-center shadow-2xl sm:p-8 ${
            darkMode ? "bg-slate-800" : "bg-white"
          }`}>
            {importing && <LoadingOverlay message="Mengimpor transaksi..." darkMode={darkMode} />}
            <p className={`text-sm font-semibold uppercase tracking-wide ${
              darkMode ? "text-slate-400" : "text-slate-500"
            }`}>
              Keamanan PIN
            </p>
            <h2 className={`mt-2 text-2xl font-semibold ${
              darkMode ? "text-white" : "text-slate-900"
            }`}>
              Konfirmasi PIN
            </h2>
            <p className={`mt-3 text-sm ${
              darkMode ? "text-slate-400" : "text-slate-500"
            }`}>
              Masukkan PIN 4-digit untuk mengimpor {importPreview.length} transaksi dari Excel.
            </p>
            {importPreview.length > 0 && (
              <div className={`mt-4 max-h-40 overflow-y-auto rounded-xl p-3 text-left ${
                darkMode ? "bg-slate-700/50" : "bg-slate-50"
              }`}>
                <p className={`mb-2 text-xs font-semibold ${
                  darkMode ? "text-slate-400" : "text-slate-500"
                }`}>
                  Preview ({importPreview.length} transaksi):
                </p>
                <div className="space-y-1">
                  {importPreview.slice(0, 5).map((t, idx) => (
                    <p key={idx} className={`text-xs ${
                      darkMode ? "text-slate-300" : "text-slate-600"
                    }`}>
                      • {formatDate(t.date, settings.timezone || "Asia/Jakarta")} - {t.description} - {formatCurrency(t.amount)} ({t.type === "income" ? "Pemasukan" : "Pengeluaran"})
                    </p>
                  ))}
                  {importPreview.length > 5 && (
                    <p className={`text-xs ${
                      darkMode ? "text-slate-400" : "text-slate-400"
                    }`}>
                      ... dan {importPreview.length - 5} transaksi lainnya
                    </p>
                  )}
                </div>
              </div>
            )}
            <div className="mt-4 space-y-3 text-left">
              <Field label="PIN" darkMode={darkMode}>
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
                  className={`${getInputClasses(darkMode)} text-center tracking-[0.5em]`}
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
                className={`inline-flex items-center justify-center rounded-2xl border px-4 py-3 text-sm font-semibold transition disabled:opacity-50 ${
                  darkMode
                    ? "border-slate-600 text-slate-300 hover:bg-slate-700"
                    : "border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
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
          <div className={`w-full max-w-md rounded-3xl p-6 shadow-2xl sm:p-8 ${
            darkMode ? "bg-slate-800" : "bg-white"
          }`}>
            <div className="mb-6 text-center">
              <div className={`mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full ${
                darkMode ? "bg-rose-900/30" : "bg-rose-100"
              }`}>
                <svg
                  className={`h-8 w-8 ${
                    darkMode ? "text-rose-400" : "text-rose-600"
                  }`}
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
              <h2 className={`text-2xl font-semibold ${
                darkMode ? "text-white" : "text-slate-900"
              }`}>
                Konfirmasi Hapus User
              </h2>
              <p className={`mt-2 text-sm ${
                darkMode ? "text-slate-400" : "text-slate-600"
              }`}>
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
                className={`flex-1 rounded-2xl border px-4 py-3 text-sm font-semibold transition ${
                  darkMode
                    ? "border-slate-600 text-slate-300 hover:bg-slate-700"
                    : "border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                Batal
              </button>
              <LoadingButton
                type="button"
                onClick={confirmDeleteUser}
                loading={adminLoading}
                className="flex-1 rounded-2xl bg-rose-600 px-4 py-3 text-sm font-semibold text-white shadow-soft transition hover:bg-rose-700"
              >
                Hapus User
              </LoadingButton>
            </div>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {isEditUserModalOpen && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 px-4">
          <div className={`w-full max-w-lg rounded-3xl p-6 shadow-2xl sm:p-8 ${
            darkMode ? "bg-slate-800" : "bg-white"
          }`}>
            <div className="mb-6 flex items-start justify-between">
              <div>
                <p className={`text-sm font-semibold uppercase tracking-wide ${
                  darkMode ? "text-indigo-400" : "text-indigo-500"
                }`}>
                  Admin
                </p>
                <h2 className={`mt-2 text-2xl font-semibold ${
                  darkMode ? "text-white" : "text-slate-900"
                }`}>
                  Edit User
                </h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsEditUserModalOpen(false);
                  setSelectedUser(null);
                }}
                className={`rounded-full p-2 transition ${
                  darkMode
                    ? "bg-slate-700 text-slate-300 hover:bg-slate-600"
                    : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                }`}
                aria-label="Tutup"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleUpdateUser} className="space-y-4">
              <div>
                <label className={`mb-2 block text-sm font-semibold ${
                  darkMode ? "text-slate-300" : "text-slate-700"
                }`}>
                  Nama
                </label>
                <input
                  type="text"
                  value={editUserForm.name}
                  onChange={(e) => setEditUserForm({ ...editUserForm, name: e.target.value })}
                  className={getInputClasses(darkMode)}
                  placeholder="Nama Lengkap"
                  required
                />
              </div>
              <div>
                <label className={`mb-2 block text-sm font-semibold ${
                  darkMode ? "text-slate-300" : "text-slate-700"
                }`}>
                  Email
                </label>
                <input
                  type="email"
                  value={editUserForm.email}
                  onChange={(e) => setEditUserForm({ ...editUserForm, email: e.target.value })}
                  className={getInputClasses(darkMode)}
                  placeholder="nama@email.com"
                  required
                />
              </div>
              <div>
                <label className={`mb-2 block text-sm font-semibold ${
                  darkMode ? "text-slate-300" : "text-slate-700"
                }`}>
                  Password Baru (opsional)
                </label>
                <input
                  type="password"
                  value={editUserForm.password}
                  onChange={(e) => setEditUserForm({ ...editUserForm, password: e.target.value })}
                  className={getInputClasses(darkMode)}
                  placeholder="Kosongkan jika tidak ingin mengubah password"
                  minLength={6}
                />
                <p className={`mt-1 text-xs ${
                  darkMode ? "text-slate-400" : "text-slate-500"
                }`}>
                  Kosongkan jika tidak ingin mengubah password. Minimal 6 karakter jika diisi.
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setIsEditUserModalOpen(false);
                    setSelectedUser(null);
                  }}
                  className={`flex-1 rounded-2xl border px-4 py-3 text-sm font-semibold transition ${
                    darkMode
                      ? "border-slate-600 text-slate-300 hover:bg-slate-700"
                      : "border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  Batal
                </button>
                <LoadingButton
                  type="submit"
                  loading={adminLoading}
                  className="flex-1 rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-soft transition hover:bg-indigo-700"
                >
                  Simpan
                </LoadingButton>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create User/Admin Modal */}
      {isCreateUserModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 px-4">
          <div className={`w-full max-w-lg rounded-3xl p-6 shadow-2xl sm:p-8 ${
            darkMode ? "bg-slate-800" : "bg-white"
          }`}>
            <div className="mb-6 flex items-start justify-between">
              <div>
                <p className={`text-sm font-semibold uppercase tracking-wide ${
                  darkMode ? "text-indigo-400" : "text-indigo-500"
                }`}>
                  Admin
                </p>
                <h2 className={`mt-2 text-2xl font-semibold ${
                  darkMode ? "text-white" : "text-slate-900"
                }`}>
                  Tambah {createUserForm.role === 'admin' ? 'Admin' : 'User'}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsCreateUserModalOpen(false);
                  setCreateUserForm({ name: "", email: "", password: "", role: "user" });
                }}
                className={`rounded-full p-2 transition ${
                  darkMode
                    ? "bg-slate-700 text-slate-300 hover:bg-slate-600"
                    : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                }`}
                aria-label="Tutup"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="space-y-4">
              <div>
                <label className={`mb-2 block text-sm font-semibold ${
                  darkMode ? "text-slate-300" : "text-slate-700"
                }`}>
                  Nama
                </label>
                <input
                  type="text"
                  value={createUserForm.name}
                  onChange={(e) => setCreateUserForm({ ...createUserForm, name: e.target.value })}
                  className={getInputClasses(darkMode)}
                  placeholder="Nama lengkap"
                  required
                />
              </div>
              <div>
                <label className={`mb-2 block text-sm font-semibold ${
                  darkMode ? "text-slate-300" : "text-slate-700"
                }`}>
                  Email
                </label>
                <input
                  type="email"
                  value={createUserForm.email}
                  onChange={(e) => setCreateUserForm({ ...createUserForm, email: e.target.value })}
                  className={getInputClasses(darkMode)}
                  placeholder="nama@email.com"
                  required
                />
              </div>
              <div>
                <label className={`mb-2 block text-sm font-semibold ${
                  darkMode ? "text-slate-300" : "text-slate-700"
                }`}>
                  Password
                </label>
                <input
                  type="password"
                  value={createUserForm.password}
                  onChange={(e) => setCreateUserForm({ ...createUserForm, password: e.target.value })}
                  className={getInputClasses(darkMode)}
                  placeholder="Minimal 6 karakter"
                  required
                  minLength={6}
                />
                <p className={`mt-1 text-xs ${
                  darkMode ? "text-slate-400" : "text-slate-500"
                }`}>
                  Password minimal 6 karakter
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setIsCreateUserModalOpen(false);
                    setCreateUserForm({ name: "", email: "", password: "", role: "user" });
                  }}
                  className={`flex-1 rounded-2xl border px-4 py-3 text-sm font-semibold transition ${
                    darkMode
                      ? "border-slate-600 text-slate-300 hover:bg-slate-700"
                      : "border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  Batal
                </button>
                <LoadingButton
                  type="submit"
                  loading={createUserLoading}
                  className={`flex-1 rounded-2xl px-4 py-3 text-sm font-semibold text-white shadow-soft transition ${
                    createUserForm.role === 'admin' 
                      ? 'bg-purple-600 hover:bg-purple-700' 
                      : 'bg-indigo-600 hover:bg-indigo-700'
                  }`}
                >
                  Buat {createUserForm.role === 'admin' ? 'Admin' : 'User'}
                </LoadingButton>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 px-4">
          <div className={`w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl p-6 shadow-2xl sm:p-8 ${
            darkMode ? "bg-slate-800" : "bg-white"
          }`}>
            <div className="mb-6 flex items-start justify-between">
              <div>
                <p className={`text-sm font-semibold uppercase tracking-wide ${
                  darkMode ? "text-indigo-400" : "text-indigo-500"
                }`}>
                  Pengaturan
                </p>
                <h2 className={`mt-2 text-2xl font-semibold ${
                  darkMode ? "text-white" : "text-slate-900"
                }`}>
                  Profile & Keamanan
                </h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsSettingsOpen(false);
                  setSettingsError("");
                }}
                className={`rounded-full p-2 transition ${
                  darkMode
                    ? "bg-slate-700 text-slate-300 hover:bg-slate-600"
                    : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                }`}
                aria-label="Tutup settings"
              >
                ✕
              </button>
            </div>

            <div className="space-y-6">
              {/* Profile Section */}
              <div className={`rounded-2xl border p-6 ${
                darkMode ? "border-slate-700 bg-slate-700/50" : "border-slate-200 bg-slate-50"
              }`}>
                <h3 className={`mb-4 text-lg font-semibold ${
                  darkMode ? "text-white" : "text-slate-900"
                }`}>Profile</h3>
                <form onSubmit={handleUpdateProfile} className="space-y-4">
                  <div>
                    <label className={`mb-2 block text-sm font-semibold ${
                      darkMode ? "text-slate-300" : "text-slate-700"
                    }`}>
                      Nama
                    </label>
                    <input
                      type="text"
                      value={settingsForm.name}
                      onChange={(e) => setSettingsForm({ ...settingsForm, name: e.target.value })}
                      className={getInputClasses(darkMode)}
                      placeholder="Nama Lengkap"
                      required
                    />
                  </div>
                  <div>
                    <label className={`mb-2 block text-sm font-semibold ${
                      darkMode ? "text-slate-300" : "text-slate-700"
                    }`}>
                      Email
                    </label>
                    <input
                      type="email"
                      value={settingsForm.email}
                      onChange={(e) => setSettingsForm({ ...settingsForm, email: e.target.value })}
                      className={getInputClasses(darkMode)}
                      placeholder="nama@email.com"
                      required
                    />
                  </div>
                  <div>
                    <label className={`mb-2 block text-sm font-semibold ${
                      darkMode ? "text-slate-300" : "text-slate-700"
                    }`}>
                      Password Baru (opsional)
                    </label>
                    <input
                      type="password"
                      value={settingsForm.password}
                      onChange={(e) => setSettingsForm({ ...settingsForm, password: e.target.value })}
                      className={getInputClasses(darkMode)}
                      placeholder="Kosongkan jika tidak ingin mengubah password"
                      minLength={6}
                    />
                    <p className={`mt-1 text-xs ${
                      darkMode ? "text-slate-400" : "text-slate-500"
                    }`}>
                      Kosongkan jika tidak ingin mengubah password. Minimal 6 karakter jika diisi.
                    </p>
                  </div>
                  <div>
                    <label className={`mb-2 block text-sm font-semibold ${
                      darkMode ? "text-slate-300" : "text-slate-700"
                    }`}>
                      Timezone
                    </label>
                    <select
                      value={settingsForm.timezone || "Asia/Jakarta"}
                      onChange={(e) => setSettingsForm({ ...settingsForm, timezone: e.target.value })}
                      className={getInputClasses(darkMode)}
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
                  <LoadingButton
                    type="submit"
                    loading={settingsLoading}
                    className="w-full rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-soft transition hover:bg-indigo-700"
                  >
                    Simpan Profile
                  </LoadingButton>
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
                        className={`${getInputClasses(darkMode)} text-center tracking-[0.5em]`}
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
                  <LoadingButton
                    type="submit"
                    loading={settingsLoading}
                    disabled={settingsForm.pinEnabled && !settingsForm.pin}
                    className="w-full rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-soft transition hover:bg-indigo-700 disabled:opacity-50"
                  >
                    Simpan Pengaturan PIN
                  </LoadingButton>
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

const Field = ({ label, children, darkMode = false }) => (
  <label className={`text-sm font-medium ${
    darkMode ? "text-slate-400" : "text-slate-600"
  }`}>
    {label}
    <div className="mt-2">{children}</div>
  </label>
);

// Calendar Heatmap Component
const CalendarHeatmap = ({ data, darkMode }) => {
  // Helper untuk format tanggal ke format Indonesia
  const formatDateID = (dateString) => {
    if (!dateString) return "";
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return "";
    
    return date.toLocaleDateString("id-ID", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  // Helper untuk mendapatkan nama bulan
  const getMonthName = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("id-ID", { month: "short" });
  };

  // Helper untuk mendapatkan intensitas berdasarkan jumlah transaksi
  const getIntensity = (count, maxCount) => {
    if (count === 0) return 0;
    if (maxCount === 0) return 0;
    
    const percentage = count / maxCount;
    if (percentage <= 0.2) return 1;
    if (percentage <= 0.4) return 2;
    if (percentage <= 0.6) return 3;
    if (percentage <= 0.8) return 4;
    return 5;
  };

  // Helper untuk mendapatkan warna berdasarkan intensitas
  const getColor = (intensity) => {
    // Menggunakan skema warna seperti GitHub (hijau)
    // Dark mode: dari gelap ke terang
    // Light mode: dari terang ke gelap
    const colors = darkMode 
      ? [
          '#161b22', // Level 0: tidak ada transaksi
          '#0e4429', // Level 1: sedikit
          '#006d32', // Level 2: sedang
          '#26a641', // Level 3: banyak
          '#39d353', // Level 4: sangat banyak
          '#40c463'  // Level 5: maksimal
        ]
      : [
          '#ebedf0', // Level 0: tidak ada transaksi
          '#9be9a8', // Level 1: sedikit
          '#40c463', // Level 2: sedang
          '#30a14e', // Level 3: banyak
          '#216e39', // Level 4: sangat banyak
          '#0e4429'  // Level 5: maksimal
        ];
    return colors[intensity] || colors[0];
  };

  // Generate last 365 days (1 tahun terakhir)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const days = [];
  for (let i = 364; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dateKey = date.toISOString().split('T')[0];
    const count = data.get(dateKey) || 0;
    days.push({
      date: dateKey,
      dateObj: date,
      count,
    });
  }

  // Hitung max count untuk normalisasi intensitas
  const maxCount = Math.max(...days.map(d => d.count), 1);

  // Tambahkan intensitas ke setiap hari
  days.forEach(day => {
    day.intensity = getIntensity(day.count, maxCount);
  });

  // Group by weeks (Minggu = 0, Senin = 1, ..., Sabtu = 6)
  // GitHub menggunakan format: Minggu di kolom pertama
  const weeks = [];
  let currentWeek = [];
  
  days.forEach((day, index) => {
    const dayOfWeek = day.dateObj.getDay(); // 0 = Minggu, 1 = Senin, ..., 6 = Sabtu
    
    // Jika ini hari pertama dan bukan Minggu, isi dengan null untuk hari-hari sebelumnya
    if (index === 0 && dayOfWeek > 0) {
      for (let i = 0; i < dayOfWeek; i++) {
        currentWeek.push(null);
      }
    }
    
    currentWeek.push(day);
    
    // Jika ini hari Sabtu (6) atau hari terakhir, selesaikan minggu ini
    if (dayOfWeek === 6 || index === days.length - 1) {
      // Jika hari terakhir bukan Sabtu, isi sisa hari dengan null
      if (index === days.length - 1 && dayOfWeek !== 6) {
        for (let i = dayOfWeek + 1; i < 7; i++) {
          currentWeek.push(null);
        }
      }
      weeks.push([...currentWeek]);
      currentWeek = [];
    }
  });

  // Label hari dalam seminggu (Minggu sampai Sabtu)
  const dayLabels = ['M', 'S', 'S', 'R', 'K', 'J', 'S']; // Minggu, Senin, Selasa, Rabu, Kamis, Jumat, Sabtu

  // Deteksi bulan untuk label bulan
  const monthLabels = [];
  let lastMonth = -1;
  weeks.forEach((week, weekIndex) => {
    const firstDay = week.find(d => d !== null);
    if (firstDay) {
      const month = firstDay.dateObj.getMonth();
      if (month !== lastMonth) {
        monthLabels.push({
          weekIndex,
          month: getMonthName(firstDay.date),
          date: firstDay.date
        });
        lastMonth = month;
      }
    }
  });

  return (
    <div className="w-full">
      {/* Label bulan di atas */}
      <div className="mb-2 flex items-start gap-1" style={{ paddingLeft: '20px' }}>
        {monthLabels.map((label, idx) => {
          const nextLabel = monthLabels[idx + 1];
          const weekSpan = nextLabel 
            ? nextLabel.weekIndex - label.weekIndex 
            : weeks.length - label.weekIndex;
          
          return (
            <div
              key={idx}
              className={`text-xs ${
                darkMode ? "text-slate-400" : "text-slate-500"
              }`}
              style={{ 
                width: `${weekSpan * 11}px`, // 11px = width (10px) + gap (1px)
                textAlign: 'left'
              }}
            >
              {label.month}
            </div>
          );
        })}
      </div>

      <div className="flex gap-2 w-full">
        {/* Label hari dalam seminggu */}
        <div className="flex flex-col gap-1 pt-0.5 flex-shrink-0">
          {dayLabels.map((label, index) => (
            <div
              key={index}
              className={`h-[10px] text-xs leading-[10px] ${
                darkMode ? "text-slate-400" : "text-slate-500"
              }`}
              style={{ 
                visibility: index % 2 === 0 ? 'visible' : 'hidden' // Hanya tampilkan M, S, R, J
              }}
            >
              {label}
            </div>
          ))}
        </div>

        {/* Grid kalender - Full width */}
        <div className="flex-1 min-w-0">
          <div className="flex gap-1 w-full">
            {weeks.map((week, weekIndex) => (
              <div key={weekIndex} className="flex flex-col gap-1" style={{ flex: '1 0 0', minWidth: '10px' }}>
                {week.map((day, dayIndex) => {
                  if (!day) {
                    return (
                      <div 
                        key={`empty-${dayIndex}`} 
                        className="w-full aspect-square rounded-sm"
                        style={{
                          backgroundColor: getColor(0),
                          minWidth: '10px'
                        }}
                      />
                    );
                  }
                  
                  return (
                    <div
                      key={day.date}
                      className="w-full aspect-square rounded-sm transition-all hover:scale-125 hover:ring-2 hover:ring-indigo-400 hover:z-10 relative"
                      style={{
                        backgroundColor: getColor(day.intensity),
                        cursor: day.count > 0 ? 'pointer' : 'default',
                        minWidth: '10px'
                      }}
                      title={day.count > 0 
                        ? `${formatDateID(day.date)}: ${day.count} transaksi`
                        : `${formatDateID(day.date)}: Tidak ada transaksi`
                      }
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Legenda - Di bawah, center */}
      <div className={`mt-4 flex items-center justify-center gap-2 text-xs ${
        darkMode ? "text-slate-400" : "text-slate-500"
      }`}>
        <span>Kurang</span>
        <div className="flex gap-1">
          {[0, 1, 2, 3, 4, 5].map((intensity) => (
            <div
              key={intensity}
              className="w-[10px] h-[10px] rounded-sm"
              style={{ backgroundColor: getColor(intensity) }}
              title={`Level ${intensity}`}
            />
          ))}
        </div>
        <span>Lebih</span>
      </div>
    </div>
  );
};

const StatCard = ({ label, value, className }) => (
  <div
    className={`w-full rounded-3xl bg-gradient-to-br p-6 shadow-soft transition-all duration-300 hover:scale-105 hover:shadow-xl ${className}`}
  >
    <p className="text-xs uppercase tracking-[0.35em] text-white/70">
      {label}
    </p>
    <p className="mt-3 text-3xl font-semibold transition-all duration-300">{value}</p>
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

const EmptyState = ({ darkMode = false }) => (
  <div className={`rounded-2xl border border-dashed py-14 text-center ${
    darkMode ? "border-slate-700" : "border-slate-200"
  }`}>
    <p className={`text-base font-semibold ${
      darkMode ? "text-slate-200" : "text-slate-800"
    }`}>
      Belum ada transaksi
    </p>
    <p className={`mt-1 text-sm ${
      darkMode ? "text-slate-400" : "text-slate-500"
    }`}>
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

