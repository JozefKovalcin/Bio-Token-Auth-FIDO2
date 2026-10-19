export type Mode = 'A' | 'B' | 'C';
export type UserSession = { username: string; mode: Mode; totpActive: boolean; expiresAt: string; allowedModes?: Mode[] };
export type Capabilities = { modes: Mode[]; webauthnEnabled: boolean; modeCEnabled: boolean };
export class HttpError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

export async function request<T>(path: string, body?: object, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api/${path}`, {
    credentials: 'same-origin', signal,
    ...(body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  });
  const value = await response.json().catch(() => null);
  if (!response.ok) throw new HttpError(typeof value?.message === 'string' ? value.message : 'Požiadavka sa nepodarila. Skúste znova.', response.status);
  return value as T;
}

export function readableError(error: unknown) {
  if (error instanceof Error && error.name === 'NotAllowedError') return 'Overenie kľúčom bolo zrušené alebo vypršalo. Skúste znova.';
  return error instanceof Error ? error.message : 'Overenie sa nepodarilo.';
}
