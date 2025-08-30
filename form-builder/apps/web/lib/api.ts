const base = process.env.NEXT_PUBLIC_API_BASE!;

async function req(path: string, init?: RequestInit) {
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {})
    },
    cache: "no-store"
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`API ${res.status}: ${t}`);
  }
  const ct = res.headers.get("Content-Type") || "";
  if (ct.includes("application/json")) return res.json();
  return res.text();
}

export async function apiGet(path: string) { return req(path, { method: "GET" }); }
export async function apiPost(path: string, body: any) { return req(path, { method: "POST", body: JSON.stringify(body) }); }
export async function apiPut(path: string, body: any) { return req(path, { method: "PUT", body: JSON.stringify(body) }); }