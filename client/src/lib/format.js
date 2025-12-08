export const formatCurrency = (value = 0) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);

export const formatDate = (dateString, timezone = 'Asia/Jakarta') => {
  if (!dateString) return "-";
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "-";

  // Format menggunakan timezone dari parameter (default: Asia/Jakarta)
  return date.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: timezone,
  });
};

export const getToday = (timezone = 'Asia/Jakarta') => {
  // Get today's date dalam timezone yang ditentukan (default: Asia/Jakarta)
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  
  // Format sebagai YYYY-MM-DD
  return formatter.format(now);
};

