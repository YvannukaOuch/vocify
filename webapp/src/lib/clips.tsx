import { createContext, use, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, errorMessage, type Clip, type Me, type NewClip } from '@/lib/api';

interface ClipsContextValue {
  /** null while the first load is in flight. */
  clips: Clip[] | null;
  me: Me | null;
  error: string | null;
  reload(): void;
  create(clip: NewClip): Promise<Clip>;
  update(id: number, changes: { title?: string; tags?: string[] }): Promise<Clip>;
  remove(id: number): Promise<void>;
  markUsed(id: number): void;
}

const ClipsContext = createContext<ClipsContextValue | null>(null);

export function ClipsProvider({ children }: { children: ReactNode }) {
  const [clips, setClips] = useState<Clip[] | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.me(), api.clips()]).then(
      ([me, clips]) => {
        if (cancelled) return;
        setMe(me);
        setClips(clips);
        setError(null);
      },
      (error: unknown) => {
        if (!cancelled) setError(errorMessage(error));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const reload = useCallback(() => {
    setError(null);
    setAttempt((n) => n + 1);
  }, []);

  const create = useCallback(async (input: NewClip) => {
    const clip = await api.createClip(input);
    setClips((current) => [clip, ...(current ?? []).filter((c) => c.id !== clip.id)]);
    return clip;
  }, []);

  const update = useCallback(async (id: number, changes: { title?: string; tags?: string[] }) => {
    const clip = await api.updateClip(id, changes);
    setClips((current) => (current ?? []).map((c) => (c.id === id ? clip : c)));
    return clip;
  }, []);

  const remove = useCallback(async (id: number) => {
    await api.deleteClip(id);
    setClips((current) => (current ?? []).filter((c) => c.id !== id));
  }, []);

  const markUsed = useCallback((id: number) => {
    setClips((current) =>
      (current ?? []).map((c) => (c.id === id ? { ...c, useCount: c.useCount + 1, lastUsedAt: Date.now() } : c)),
    );
  }, []);

  const value = useMemo(
    () => ({ clips, me, error, reload, create, update, remove, markUsed }),
    [clips, me, error, reload, create, update, remove, markUsed],
  );
  return <ClipsContext value={value}>{children}</ClipsContext>;
}

export function useClips(): ClipsContextValue {
  const value = use(ClipsContext);
  if (!value) throw new Error('useClips must be used inside <ClipsProvider>');
  return value;
}
