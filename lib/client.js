'use client';
// Browser-side helpers: per-room login token kept in localStorage.
export const tokenKey = (code) => `ou:token:${code.toUpperCase()}`;

export function getToken(code) {
  try { return localStorage.getItem(tokenKey(code)); } catch { return null; }
}
export function saveToken(code, token) {
  try { localStorage.setItem(tokenKey(code), token); } catch {}
}
export function clearToken(code) {
  try { localStorage.removeItem(tokenKey(code)); } catch {}
}

export async function api(path, { body, token } = {}) {
  const res = await fetch(path, {
    method: body ? 'POST' : 'GET',
    headers: { 'content-type': 'application/json', ...(token ? { 'x-token': token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}
