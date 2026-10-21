import { supabase } from './supabase';

let Config: any = {};
try { Config = require('react-native-config').default || {}; } catch {}

const BASE = Config.API_BASE_URL || '';

export class NetworkError extends Error {
  constructor(cause?: unknown) {
    super('Could not reach the server — check your connection and try again.');
    this.name = 'NetworkError';
    this.cause = cause;
  }
}

export class SessionExpiredError extends Error {
  constructor() {
    super('Your session has expired — please sign in again.');
    this.name = 'SessionExpiredError';
  }
}

async function authHeader(headers: Headers): Promise<void> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (token) headers.set('Authorization', `Bearer ${token}`);
}

async function renewAfter401(): Promise<boolean> {
  const { data, error } = await supabase.auth.refreshSession();
  if (!error && data.session) return true;
  await supabase.auth.signOut({ scope: 'local' });
  return false;
}

export async function api<T>(
  path: string,
  init: RequestInit = {},
  retried = false,
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  await authHeader(headers);

  let res: Response;
  try {
    res = await fetch(`${BASE}/api${path}`, { ...init, headers });
  } catch (err) {
    throw new NetworkError(err);
  }

  if (res.status === 401 && headers.has('Authorization')) {
    if (!retried && (await renewAfter401())) return api<T>(path, init, true);
    if (retried) await supabase.auth.signOut({ scope: 'local' });
    throw new SessionExpiredError();
  }

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      (body as { error?: string }).error ?? `Request failed (${res.status})`,
    );
  }
  return (body as { data: T }).data;
}

export interface StreamEvent {
  [key: string]: unknown;
}

export async function apiStream(
  path: string,
  body: unknown,
  onEvent: (event: StreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const headers = new Headers({
    'Content-Type': 'application/json',
    Accept: 'application/x-ndjson',
  });
  await authHeader(headers);

  let res: Response;
  try {
    res = await fetch(`${BASE}/api${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw new NetworkError(err);
  }

  if (res.status === 401 && headers.has('Authorization')) {
    await renewAfter401();
    throw new SessionExpiredError();
  }
  if (!res.ok) {
    const failure = await res.json().catch(() => ({}));
    throw new Error(
      (failure as { error?: string }).error ?? `Request failed (${res.status})`,
    );
  }

  // Try incremental streaming via ReadableStream if available (RN 0.73+),
  // otherwise fall back to reading the full response at once.
  if (res.body && typeof res.body.getReader === 'function') {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffered = '';
    try {
      for (;;) {
        const { value, done } = await reader.read();
        buffered += decoder.decode(value, { stream: !done });
        let nl: number;
        while ((nl = buffered.indexOf('\n')) >= 0) {
          const raw = buffered.slice(0, nl).trim();
          buffered = buffered.slice(nl + 1);
          if (raw) onEvent(JSON.parse(raw));
        }
        if (done) break;
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') throw err;
      if (err instanceof TypeError) throw new NetworkError(err);
      throw err;
    }
    if (buffered.trim()) onEvent(JSON.parse(buffered));
  } else {
    const text = await res.text();
    for (const raw of text.split('\n')) {
      if (raw.trim()) onEvent(JSON.parse(raw));
    }
  }
}

export async function apiUpload<T>(path: string, file: Blob): Promise<T> {
  const headers = new Headers({
    'Content-Type': file.type || 'application/octet-stream',
  });
  await authHeader(headers);

  let res: Response;
  try {
    res = await fetch(`${BASE}/api${path}`, { method: 'POST', headers, body: file });
  } catch (err) {
    throw new NetworkError(err);
  }

  if (res.status === 401) {
    await renewAfter401();
    throw new SessionExpiredError();
  }

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      (body as { error?: string }).error ?? `Upload failed (${res.status})`,
    );
  }
  return (body as { data: T }).data;
}
