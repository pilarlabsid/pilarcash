import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { formatCurrency, formatDate, getToday } from "./lib/format";
import { utils as XLSXUtils, writeFile as writeXLSXFile } from "xlsx";
import { io } from "socket.io-client";

// PIN Code dari environment variable, fallback ke default jika tidak di-set
const PIN_CODE = import.meta.env.VITE_PIN_CODE || "6745";

const createInitialForm = (overrides = {}) => ({
  description: "",
  amount: "",
  type: "expense",
  date: getToday(),
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
  const [entries, setEntries] = useState([]);
  const [form, setForm] = useState(createInitialForm);
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
  const [pendingPayload, setPendingPayload] = useState(null);
  const [currentCardIndex, setCurrentCardIndex] = useState(0);

  const resetPinFlow = () => {
    setPin("");
    setPinError("");
    setPinMode(null);
    setIsPinStep(false);
    setIsModalOpen(false);
    setDeleteTarget(null);
    setIsDeleteConfirmOpen(false);
    setEditingTarget(null);
    setForm(createInitialForm());
    setPendingPayload(null);
    setTimeout(() => {
      modalRef.current
        ?.querySelector("input[name='description']")
        ?.focus();
    }, 0);
  };

  const validatePin = () => {
    if (pin !== PIN_CODE) {
      setPinError("PIN salah. Coba lagi.");
      return false;
    }
    setPinError("");
    return true;
  };

  const pinDescriptions = {
    create: "Masukkan PIN 4-digit untuk menyimpan transaksi ini.",
    edit: "Masukkan PIN 4-digit untuk memperbarui transaksi ini.",
    delete: "Masukkan PIN 4-digit untuk menghapus transaksi ini.",
    reset: "Masukkan PIN 4-digit untuk menghapus semua transaksi.",
    export: "Masukkan PIN 4-digit untuk mengunduh transaksi.",
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

  const fetchEntries = useCallback(async (silent = false) => {
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
      
      const response = await fetch(apiUrl);
      
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
  }, []);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  // WebSocket untuk realtime update (menggantikan polling)
  useEffect(() => {
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

    // Connect ke WebSocket server
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
    });

    // Event listeners untuk debugging dan monitoring
    socket.on("connect", () => {
      // Log hanya di development
      if (import.meta.env.DEV) {
        console.log('✅ Socket connected:', socket.id);
        console.log('📡 Transport:', socket.io.engine.transport.name);
      }
    });

    socket.on("disconnect", (reason) => {
      // Log hanya di development
      if (import.meta.env.DEV) {
        console.log('❌ Socket disconnected:', reason);
      }
    });

    socket.on("connect_error", (error) => {
      // Suppress error WebSocket di production karena kita sudah force polling
      // Error ini normal terjadi ketika WebSocket tidak tersedia
      if (import.meta.env.DEV) {
        console.error('❌ Socket connection error:', error.message);
      }
      // Jika koneksi gagal, tetap gunakan polling untuk fetch data
      // fetchEntries akan tetap berjalan untuk fallback
    });

    socket.on("reconnect", (attemptNumber) => {
      if (import.meta.env.DEV) {
        console.log('🔄 WebSocket reconnected after', attemptNumber, 'attempts');
      }
    });

    socket.on("reconnect_attempt", () => {
      if (import.meta.env.DEV) {
        console.log('🔄 Attempting to reconnect WebSocket...');
      }
    });

    socket.on("reconnect_error", (error) => {
      // Suppress error di production karena kita sudah force polling
      if (import.meta.env.DEV) {
        console.error('❌ Socket reconnection error:', error.message);
      }
    });

    socket.on("reconnect_failed", () => {
      // Log hanya di development
      if (import.meta.env.DEV) {
        console.error('❌ Socket reconnection failed. Using polling fallback.');
      }
    });

    // Listen untuk update transaksi dari server
    socket.on("transactions:updated", (transactions) => {
      // Log di production juga untuk debugging
      if (import.meta.env.DEV) {
        console.log('📨 Received transactions update via Socket');
      }
      // Update data tanpa loading indicator
      setEntries(
        (transactions ?? []).map((entry) => ({
          ...entry,
          amount: Number(entry.amount) || 0,
        }))
      );
    });

    // Cleanup saat component unmount
    return () => {
      socket.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!toast) return undefined;
    const timeout = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(timeout);
  }, [toast]);

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
      date: form.date || getToday(),
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
      date: finalPayload.date || getToday(),
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
      if (!validatePin()) {
        setSubmitting(false);
        return;
      }

      if (pinMode === "edit" && editingTarget) {
      const apiBase = getApiUrl();
      const response = await fetch(
        `${apiBase}/api/transactions/${editingTarget}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(normalizedPayload),
          }
        );
        if (!response.ok) {
          const body = await safeJson(response);
          throw new Error(body.message || "Gagal memperbarui transaksi.");
        }
        setForm(createInitialForm());
        setToast({ type: "success", message: "Transaksi diperbarui." });
        fetchEntries();
        resetPinFlow();
        return;
      }

      const apiBase = getApiUrl();
      const response = await fetch(`${apiBase}/api/transactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(normalizedPayload),
      });
      if (!response.ok) {
        const body = await safeJson(response);
        throw new Error(body.message || "Gagal menyimpan transaksi.");
      }
      setForm(createInitialForm());
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
      const response = await fetch(`${apiBase}/api/transactions/${deleteTarget}`, {
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
      const response = await fetch(`${apiBase}/api/transactions`, { method: "DELETE" });
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
    if (!validatePin()) return;
    await requestDelete();
    resetPinFlow();
  };

  const confirmResetWithPin = async () => {
    if (!validatePin()) return;
    await handleReset();
    resetPinFlow();
  };

  const confirmExportWithPin = () => {
    if (!validatePin()) return;
    const rows = runningEntries.map((entry) => ({
      Tanggal: formatDate(entry.date),
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

  const handleDownloadExcel = () => {
    if (!runningEntries.length) {
      setToast({ type: "error", message: "Belum ada transaksi untuk diunduh." });
      return;
    }

    setPinMode("export");
    setPin("");
    setPinError("");
    setIsExportPinOpen(true);
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
        })
      );
    } else {
      setEditingTarget(null);
      setForm(createInitialForm());
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
      }
    };
    window.addEventListener("keydown", handleKey);
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", handleKey);
      document.body.style.overflow = "";
    };
  }, [isModalOpen, isConfirmOpen, isDeleteConfirmOpen]);

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
          <div className="text-center sm:text-left">
            <p className="text-xs uppercase tracking-[0.4em] text-indigo-200">
              Prava Cash
            </p>
          </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-1">
              <button
                type="button"
                onClick={openModal}
                className="inline-flex items-center justify-center rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-slate-900 shadow-soft transition hover:bg-slate-100"
              >
                + Tambah Transaksi
              </button>
                <div className="flex flex-row gap-3 sm:flex-grow-0">
                  <button
                    type="button"
                    onClick={() => setIsConfirmOpen(true)}
                    className="inline-flex flex-1 items-center justify-center rounded-2xl border border-white/30 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/10 sm:flex-initial sm:px-6"
                  >
                    Bersihkan Data
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadExcel}
                    className="inline-flex flex-1 items-center justify-center rounded-2xl border border-white/30 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/10 sm:flex-initial sm:px-6"
                  >
                    Download Excel
                  </button>
                </div>
            </div>
          </div>
        </header>

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
                              {formatDate(entry.date)}
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
                      value={form.date || getToday()}
                      onChange={handleChange}
                      className={inputClasses}
                    />
                  </Field>
                </>
              ) : (
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
                    {resetting ? "Menghapus..." : "Konfirmasi PIN"}
                  </button>
                ) : isPinStep && pinMode === "delete" ? (
                  <button
                    type="button"
                    onClick={confirmDeleteWithPin}
                    disabled={deleting}
                    className="inline-flex w-full items-center justify-center rounded-2xl bg-rose-600 px-4 py-3 text-sm font-semibold text-white shadow-soft transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:bg-rose-300 sm:w-auto sm:flex-1"
                  >
                    {deleting ? "Menghapus..." : "Konfirmasi PIN"}
                  </button>
                ) : isPinStep && pinMode === "export" ? (
                  <button
                    type="button"
                    onClick={confirmExportWithPin}
                    className="inline-flex w-full items-center justify-center rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-soft transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300 sm:w-auto sm:flex-1"
                  >
                    Konfirmasi PIN
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
                      ? "Konfirmasi PIN"
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
    </div>
      <footer className="mx-auto mb-1 mt-2 w-full max-w-6xl px-4 text-center text-xs font-semibold text-slate-400 sm:px-6 lg:px-8">
        © {new Date().getFullYear()} Developed by Prava Labs
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

