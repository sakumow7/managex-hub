// Access tokens stay in memory; reloading requires a fresh sign-in.
let token = "";
const apiBase = (import.meta.env.VITE_API_BASE_URL || "/api").replace(
  /\/$/,
  "",
);

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export const setToken = (value: string) => {
  token = value;
};

async function request(path: string, options: RequestInit = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    signal: options.signal
      ? AbortSignal.any([options.signal, AbortSignal.timeout(20_000)])
      : AbortSignal.timeout(20_000),
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new ApiError(
      typeof body.detail === "string"
        ? body.detail
        : "Please check the supplied fields and try again.",
      response.status,
    );
  }
  return response;
}

// Poll only during an explicit visit. Never replay a write after a timeout.
export async function waitForApi(signal: AbortSignal) {
  const deadline = Date.now() + 100_000;
  while (!signal.aborted && Date.now() < deadline) {
    try {
      const response = await fetch(`${apiBase}/health`, {
        signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]),
      });
      if (response.ok) return;
    } catch {
      /* Sleeping hosts can briefly return an error or time out. */
    }
    if (signal.aborted) throw new Error("Demo launch cancelled.");
    await new Promise<void>((resolve) => {
      const finish = () => {
        clearTimeout(timer);
        signal.removeEventListener("abort", finish);
        resolve();
      };
      const timer = setTimeout(finish, 1500);
      signal.addEventListener("abort", finish, { once: true });
    });
  }
  throw new Error(
    "The free demo server is taking longer than expected. Please try again shortly.",
  );
}

export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  return (await request(path, options)).json();
}

export async function download(path: string, name: string) {
  const url = URL.createObjectURL(await (await request(path)).blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const json = (method: string, body: unknown) => ({
  method,
  body: JSON.stringify(body),
});
