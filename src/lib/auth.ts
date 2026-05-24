const TOKEN_KEY = "aievent_auth_token";
const USER_KEY = "aievent_user";

export interface StoredUser {
  email: string;
  first_name: string;
  last_name: string;
  username: string;
  id: string;
  schema: string;
  schema_id: number;
  role: string;
  domains: { id: number; name: string; storage_bucket_name: string }[];
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function getUser(): StoredUser | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw) as StoredUser; } catch { return null; }
}

export function setUser(user: StoredUser): void {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function isAuthenticated(): boolean {
  return !!getToken();
}
