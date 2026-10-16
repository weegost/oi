export const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, init);
  } catch {
    // 連不到伺服器時瀏覽器只會丟出「Failed to fetch」，改成看得懂的說明
    throw new Error(`無法連線到後端（${API_BASE}），請確認後端已經啟動。`);
  }
  const body = await res.json();
  if (!res.ok) throw new Error(body?.detail ?? `API 錯誤（${res.status}）`);
  return body as T;
}

export function apiGet<T>(path: string): Promise<T> {
  return request<T>(path);
}

export function apiSend<T>(method: "POST" | "PUT", path: string, body?: unknown): Promise<T> {
  return request<T>(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
