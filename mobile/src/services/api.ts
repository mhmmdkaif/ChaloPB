/**
 * API Client - Axios instance with interceptors
 * Handles token injection, error handling, and retry logic
 */

import axios, {
  AxiosInstance,
  AxiosRequestConfig,
  AxiosResponse,
  AxiosError,
} from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { config, RETRY_MAX, TIMEOUT_RETRY_MS } from "../constants/config";

type ApiError = AxiosError;

let api: AxiosInstance;
let authCallback: ((error: ApiError) => void) | null = null;

/**
 * Initialize API client with base URL and interceptors
 */
export function initializeApi(
  onAuthError?: (error: ApiError) => void
): AxiosInstance {
  if (api) return api;

  authCallback = onAuthError || null;

  api = axios.create({
    baseURL: config.apiUrl,
    timeout: 8000,
  });

  // Request interceptor - inject auth token
  api.interceptors.request.use(
    async (configReq) => {
      try {
        const token = await AsyncStorage.getItem("auth_token");
        if (token) {
          configReq.headers = configReq.headers || {};
          configReq.headers.Authorization = `Bearer ${token}`;
        }
      } catch (err) {
        console.error("[API] Failed to retrieve token:", err);
      }
      return configReq;
    },
    (error) => Promise.reject(error)
  );

  // Response interceptor - handle errors and retries
  api.interceptors.response.use(
    (response) => response,
    async (error: ApiError) => {
      const status = error.response?.status;

      // Handle 401 - token expired or invalid
      if (status === 401) {
        try {
          await AsyncStorage.removeItem("auth_token");
          await AsyncStorage.removeItem("auth_user");
        } catch (err) {
          console.error("[API] Failed to clear auth storage:", err);
        }

        if (authCallback) {
          authCallback(error);
        }
        return Promise.reject(error);
      }

      // Retry logic for GET/HEAD requests on network errors or server errors
      const config = error.config as AxiosRequestConfig & { __retryCount?: number };
      const method = String(config.method || "get").toLowerCase();
      const isRetryableMethod = method === "get" || method === "head";
      const isNetworkError = !error.response;
      const isServerError = status && status >= 500 && status < 600;
      const shouldRetry = isRetryableMethod && (isNetworkError || isServerError);

      if (shouldRetry) {
        config.__retryCount = config.__retryCount || 0;
        if (config.__retryCount < RETRY_MAX) {
          config.__retryCount += 1;
          await wait(TIMEOUT_RETRY_MS * config.__retryCount);
          return api(config);
        }
      }

      return Promise.reject(error);
    }
  );

  return api;
}

/**
 * Get the API instance
 */
export function getApi(): AxiosInstance {
  if (!api) {
    initializeApi();
  }
  return api;
}

/**
 * Helper to wait
 */
function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Set new auth callback
 */
export function setAuthErrorCallback(callback: (error: ApiError) => void) {
  authCallback = callback;
}
