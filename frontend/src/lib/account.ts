"use client";

import { useSyncExternalStore } from "react";
import { apiGet, apiSend } from "@/lib/api";

export type Account = { id: number; username: string; display_name: string };

// 登入狀態全站共用一份：undefined＝還在確認，null＝沒登入
let current: Account | null | undefined;
let loading = false;
const listeners = new Set<() => void>();

function set(a: Account | null) {
  current = a;
  listeners.forEach((l) => l());
}

function load() {
  if (loading || current !== undefined) return;
  loading = true;
  apiGet<Account | null>("/api/auth/me")
    .then(set)
    .catch(() => set(null)) // 後端連不上時當作沒登入，不影響其他功能
    .finally(() => (loading = false));
}

function subscribe(l: () => void) {
  listeners.add(l);
  load();
  return () => listeners.delete(l);
}

export function useAccount(): Account | null | undefined {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => undefined,
  );
}

export async function login(username: string, password: string) {
  set(await apiSend<Account>("POST", "/api/auth/login", { username, password }));
}

export async function register(email: string, password: string, displayName: string) {
  set(await apiSend<Account>("POST", "/api/auth/register", { email, password, display_name: displayName }));
}

export async function logout() {
  await apiSend("POST", "/api/auth/logout");
  set(null);
}
