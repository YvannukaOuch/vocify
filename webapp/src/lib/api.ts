import { initData } from '@/lib/telegram';

export interface Clip {
  id: number;
  title: string;
  tags: string[];
  videoId: string;
  videoTitle: string | null;
  startMs: number;
  endMs: number;
  durationMs: number;
  useCount: number;
  createdAt: number;
  lastUsedAt: number | null;
}

export interface SearchResult {
  id: string;
  title: string;
  channel: string | null;
  durationSec: number | null;
  thumbnail: string;
}

export interface Me {
  user: { id: number; firstName: string };
  botUsername: string | null;
  maxClipSeconds: number;
}

export interface NewClip {
  videoId: string;
  start: number;
  end: number;
  title: string;
  tags: string[];
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string | null;

  constructor(message: string, status: number, code: string | null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      ...init,
      headers: {
        'content-type': 'application/json',
        authorization: `tma ${initData}`,
        ...init.headers,
      },
    });
  } catch {
    throw new ApiError("Can't reach the server — check your connection.", 0, 'network');
  }

  const body = (await response.json().catch(() => ({}))) as { error?: string; code?: string };
  if (!response.ok) throw new ApiError(body.error ?? `Request failed (${response.status})`, response.status, body.code ?? null);
  return body as T;
}

export const api = {
  me: () => request<Me>('/me'),
  clips: () => request<{ clips: Clip[] }>('/clips').then((r) => r.clips),
  search: (query: string) => request<{ results: SearchResult[] }>(`/search?q=${encodeURIComponent(query)}`).then((r) => r.results),
  createClip: (clip: NewClip) => request<{ clip: Clip }>('/clips', { method: 'POST', body: JSON.stringify(clip) }).then((r) => r.clip),
  updateClip: (id: number, changes: { title?: string; tags?: string[] }) =>
    request<{ clip: Clip }>(`/clips/${id}`, { method: 'PATCH', body: JSON.stringify(changes) }).then((r) => r.clip),
  deleteClip: (id: number) => request<{ ok: true }>(`/clips/${id}`, { method: 'DELETE' }),
  prepareShare: (id: number) => request<{ preparedMessageId: string }>(`/clips/${id}/share`, { method: 'POST' }).then((r) => r.preparedMessageId),
};

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong.';
}
