// Access tokens stay in memory; reloading requires a fresh sign-in.
let token = "";
export const setToken = (value: string) => {
  token = value;
};

async function request(path: string, options: RequestInit = {}) {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(
      typeof body.detail === "string"
        ? body.detail
        : "Please check the supplied fields and try again.",
    );
  }
  return response;
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
