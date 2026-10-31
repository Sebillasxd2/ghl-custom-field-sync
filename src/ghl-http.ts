import { HttpError } from "./errors.ts";
import type { CreateFieldInput, CustomFieldPort, FieldPatch, RemoteField } from "./types.ts";

export interface HttpPortOptions {
  token: string;
  locationId: string;
  baseUrl?: string;
  version?: string;
  fetch?: typeof fetch;
}

/**
 * `CustomFieldPort` over the public API v2 (`services.leadconnectorhq.com`). A sync
 * makes a handful of calls, so there is no retry layer here; see the companion
 * `ghl-api-client` for one.
 */
export function createHttpPort(options: HttpPortOptions): CustomFieldPort {
  const base = `${options.baseUrl ?? "https://services.leadconnectorhq.com"}/locations/${encodeURIComponent(options.locationId)}/customFields`;
  const doFetch = options.fetch ?? fetch;

  async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
    const response = await doFetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${options.token}`,
        Version: options.version ?? "2021-07-28",
        Accept: "application/json",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    if (!response.ok) throw new HttpError(response.status, `${method} ${new URL(url).pathname}: ${text.slice(0, 200)}`);
    return (text ? JSON.parse(text) : {}) as T;
  }

  return {
    async list() {
      const res = await request<{ customFields?: RemoteField[] }>("GET", `${base}?model=contact`);
      return res.customFields ?? [];
    },
    async create(input: CreateFieldInput) {
      const res = await request<{ customField: RemoteField }>("POST", base, { ...input, model: "contact" });
      return res.customField;
    },
    async update(fieldId: string, patch: FieldPatch | { position: number }) {
      if ("position" in patch && Object.keys(patch).length > 1) {
        throw new Error("position must be sent on its own; GHL ignores it otherwise");
      }
      const res = await request<{ customField: RemoteField }>("PUT", `${base}/${encodeURIComponent(fieldId)}`, patch);
      return res.customField;
    },
  };
}
