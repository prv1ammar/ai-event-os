import { getToken, clearToken } from "./auth";

// In production, use relative URLs so nginx can proxy /api/ → backend.
// In local dev, set VITE_API_URL=http://localhost:8001 in .env.local
export const API_BASE = (import.meta.env.VITE_API_URL as string) ?? "";

export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  });

  if (res.status === 401) {
    clearToken();
    window.location.href = "/login";
    throw new Error("Session expirée, veuillez vous reconnecter.");
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const detail = err.detail;
    const errText =
      typeof detail === "string" ? detail
      : Array.isArray(detail) ? detail.map((d: Record<string, unknown>) => d.msg ?? d.message ?? String(d)).join("; ")
      : typeof err.message === "string" ? err.message
      : typeof err.msg === "string" ? err.msg
      : `Erreur ${res.status}`;
    throw new Error(errText);
  }

  return res.json() as Promise<T>;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
  userData: {
    email: string;
    first_name: string;
    last_name: string;
    username?: string;
    phone?: number;
    id: string;
    role?: string;
    is_active?: boolean;
  };
  tybot_response?: Record<string, unknown>;
}

// POST → /api/v1/{table}
// PATCH → /api/v1/{table}/{data.id}
// DELETE → /api/v1/{table}/{data.id}
export async function smartDbRequest(
  table: string,
  method: "POST" | "PATCH" | "DELETE",
  data: Record<string, unknown> = {}
): Promise<unknown> {
  const { id, ...body } = data;
  const path =
    method === "POST"
      ? `/api/v1/${table}`
      : `/api/v1/${table}/${id}`;
  return apiRequest(path, {
    method,
    body: method !== "DELETE" ? JSON.stringify(method === "PATCH" ? body : data) : undefined,
  });
}

export async function loginRequest(email: string, password: string): Promise<LoginResponse> {
  // Backend expects OAuth2PasswordRequestForm (form-encoded)
  const body = new URLSearchParams({ username: email, password });
  const res = await fetch(`${API_BASE}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: body.toString(),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || err.message || "Email ou mot de passe incorrect.");
  }

  return res.json();
}
