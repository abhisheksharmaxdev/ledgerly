/** Thin fetch wrapper: JSON in/out, CSRF header, friendly error messages. */

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly fields?: Record<string, string>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type Listener = () => void;
const unauthorizedListeners = new Set<Listener>();
export function onUnauthorized(fn: Listener): () => void {
  unauthorizedListeners.add(fn);
  return () => unauthorizedListeners.delete(fn);
}

function friendlyStatus(status: number): string {
  if (status === 502 || status === 503 || status === 504) return "The server is unavailable right now. Please make sure it is running and try again.";
  if (status === 429) return "Too many requests. Please slow down and try again shortly.";
  if (status >= 500) return "Something went wrong on the server. Please try again.";
  if (status === 404) return "That item could not be found. It may have been deleted.";
  return "The request could not be completed.";
}

export async function api<T>(method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE", path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        ...(method !== "GET" ? { "X-Requested-With": "ledgerly" } : {}),
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, "network_error", "Can't reach the server. Check your connection and that the backend is running.");
  }

  if (res.status === 204) return undefined as T;
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON response (e.g. proxy error page) */
  }

  if (!res.ok) {
    // A 401 on a data request means the session ended; auth endpoints report their own errors.
    if (res.status === 401 && !path.startsWith("/auth/")) unauthorizedListeners.forEach((fn) => fn());
    const err = (data as { error?: { code?: string; message?: string; fields?: Record<string, string> } } | null)?.error;
    // 422 from the importer carries a preview body, not an error envelope.
    if (res.status === 422 && data && !err) return data as T;
    throw new ApiError(res.status, err?.code ?? "http_error", err?.message ?? friendlyStatus(res.status), err?.fields);
  }
  return data as T;
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error && err.message) return err.message;
  return "Something went wrong.";
}

/** Triggers a browser download for a same-origin API file endpoint. */
export async function downloadFile(path: string, fallbackName: string): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, { credentials: "same-origin" });
  } catch {
    throw new ApiError(0, "network_error", "Can't reach the server to download the file.");
  }
  if (!res.ok) throw new ApiError(res.status, "download_failed", friendlyStatus(res.status));
  const blob = await res.blob();
  const disposition = res.headers.get("Content-Disposition") ?? "";
  const name = /filename="([^"]+)"/.exec(disposition)?.[1] ?? fallbackName;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
