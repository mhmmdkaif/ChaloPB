import axios from "axios";

const baseURL = import.meta.env.VITE_API_URL || "http://localhost:5000/api";
const api = axios.create({
  baseURL,
  timeout: 8000,
});

const RETRY_MAX = 2;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clearAuth() {
  localStorage.removeItem("user");
  localStorage.removeItem("token");
  if (window.location.pathname !== "/login") {
    window.location.href = "/login";
  }
}

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("token");
    if (token) {
      config.headers = config.headers || {};
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const status = error.response?.status;
    if (status === 401) {
      clearAuth();
      return Promise.reject(error);
    }

    const config = error.config || {};
    const method = String(config.method || "get").toLowerCase();
    const isRetryableMethod = method === "get" || method === "head";
    const isNetworkError = !error.response;
    const isServerError = status >= 500 && status < 600;
    const shouldRetry = isRetryableMethod && (isNetworkError || isServerError);

    if (shouldRetry) {
      config.__retryCount = config.__retryCount || 0;
      if (config.__retryCount < RETRY_MAX) {
        config.__retryCount += 1;
        await wait(250 * config.__retryCount);
        return api(config);
      }
    }

    return Promise.reject(error);
  }
);

export default api;