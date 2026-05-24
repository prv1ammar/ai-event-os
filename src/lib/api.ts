import { getToken, clearToken } from "./auth";

export const API_BASE = "https://api.tybotflow.com";
export const BASE_ID = "ponz2aspv049r7c";

// Table IDs for the smart-db write API (PATCH / POST / DELETE)
// Format: "schemaId/tableId" — copy from network tab on app.tybotflow.com
export const TABLE_IDS = {
  events:        "m2ub7jp03t6p2tx",
  exhibitors:    "ponz2aspv049r7c/mrdg571gqvhuiz0",
  visitors:      "", // open visiteurs on app.tybotflow.com → edit → network tab
  leads:         "", // open leads on app.tybotflow.com → edit → network tab
  badges:        "", // open badges on app.tybotflow.com → edit → network tab
  stands:        "",
  organizations: "",
} as const;

export type TableName = keyof typeof TABLE_IDS;

// Write API — no schema headers, id goes in the body
export async function smartDbRequest<T = void>(
  table: TableName,
  method: "POST" | "PATCH" | "DELETE",
  body: Record<string, unknown>,
): Promise<T> {
  const tableId = TABLE_IDS[table];
  if (!tableId) throw new Error(`Table ID for "${table}" not configured yet.`);
  const token = getToken();
  const res = await fetch(`${API_BASE}/api/v1/smart-db/tables/${tableId}/records`, {
    method,
    headers: {
      "Content-Type": "application/json",
      accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (res.status === 401) { clearToken(); window.location.href = "/login"; throw new Error("Session expirée."); }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || err.msg || `Erreur ${res.status}`);
  }
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      accept: "application/json",
      "Accept-Profile": BASE_ID,
      "Content-Profile": BASE_ID,
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
    throw new Error(err.message || err.msg || `Erreur ${res.status}`);
  }

  return res.json() as Promise<T>;
}

export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  role: string;
  roleId: number;
  roles: string[];
  schema: string;
  schema_id: number;
  domains: { id: number; name: string; avatar_url: string | null; storage_bucket_name: string; api_key_shorty: string }[];
  userData: {
    email: string;
    first_name: string;
    last_name: string;
    username: string;
    phone: number;
    id: string;
    schema: string;
    schema_id: number;
    is_super_admin: boolean;
    is_active: boolean;
    workspaces: { id: number; name: string }[];
  };
}

export async function loginRequest(email: string, password: string): Promise<LoginResponse> {
  const res = await fetch(`${API_BASE}/api/v1/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || err.msg || "Email ou mot de passe incorrect.");
  }

  return res.json();
}
