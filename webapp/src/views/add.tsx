import { useRef, useState, type FormEvent } from 'react';
import { CloudOff, Link2, LoaderCircle, Search, SearchX, Share2 } from 'lucide-react';
import { EmptyState, Page } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { api, errorMessage, type SearchResult } from '@/lib/api';
import { useClips } from '@/lib/clips';
import type { Nav } from '@/lib/nav';
import { haptic } from '@/lib/telegram';
import { formatDuration } from '@/lib/time';
import { linkStartTime, parseVideoId, thumbnailUrl } from '@/lib/youtube';

type SearchState =
  | { status: 'idle' }
  | { status: 'loading'; query: string }
  | { status: 'done'; query: string; results: SearchResult[] }
  | { status: 'error'; message: string };

export function AddView({ nav }: { nav: Nav }) {
  const { me } = useClips();
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState<SearchState>({ status: 'idle' });
  const latest = useRef(0);
  const linkedId = parseVideoId(query);

  function openTrimmer(videoId: string, start = 0) {
    haptic.tap();
    nav.push({ name: 'trim', videoId, start });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const text = query.trim();
    if (!text) return;
    if (linkedId) {
      openTrimmer(linkedId, linkStartTime(text));
      return;
    }
    (document.activeElement as HTMLElement | null)?.blur(); // hide the keyboard so results are visible
    const ticket = ++latest.current;
    setSearch({ status: 'loading', query: text });
    try {
      const results = await api.search(text);
      if (ticket === latest.current) setSearch({ status: 'done', query: text, results });
    } catch (error) {
      if (ticket === latest.current) setSearch({ status: 'error', message: errorMessage(error) });
    }
  }

  return (
    <Page title="Add a sound" subtitle="Search YouTube or paste a link" onBack={nav.back}>
      <form onSubmit={submit} className="flex gap-2" role="search">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            enterKeyHint={linkedId ? 'go' : 'search'}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="vine boom, bruh… or a link"
            aria-label="Search YouTube or paste a link"
            autoFocus
            className="h-10 border-transparent bg-card pl-9 shadow-none"
          />
        </div>
        <Button type="submit" className="h-10" disabled={!query.trim() || search.status === 'loading'}>
          {search.status === 'loading' ? <LoaderCircle className="animate-spin" /> : linkedId ? 'Open' : 'Search'}
        </Button>
      </form>

      {linkedId ? (
        <ul>
          <li>
            <VideoRow
              title="Clip this video"
              detail={<span className="inline-flex items-center gap-1"><Link2 className="size-3" /> From your link</span>}
              thumbnail={thumbnailUrl(linkedId)}
              onClick={() => openTrimmer(linkedId, linkStartTime(query))}
            />
          </li>
        </ul>
      ) : search.status === 'loading' ? (
        <ul className="flex flex-col gap-2" aria-busy="true" aria-label="Searching">
          {Array.from({ length: 5 }, (_, i) => (
            <li key={i} className="flex items-center gap-3 rounded-xl bg-card p-2">
              <Skeleton className="aspect-video w-28 rounded-lg" />
              <div className="flex flex-1 flex-col gap-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </li>
          ))}
        </ul>
      ) : search.status === 'error' ? (
        <EmptyState icon={<CloudOff />} title="Search failed" description={search.message} />
      ) : search.status === 'done' && search.results.length === 0 ? (
        <EmptyState icon={<SearchX />} title="No videos found" description={`Nothing on YouTube for “${search.query}”.`} />
      ) : search.status === 'done' ? (
        <ul className="flex flex-col gap-2">
          {search.results.map((video) => (
            <li key={video.id}>
              <VideoRow
                title={video.title}
                detail={video.channel}
                thumbnail={video.thumbnail}
                duration={video.durationSec}
                onClick={() => openTrimmer(video.id)}
              />
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex gap-3 rounded-xl bg-card p-4 text-sm text-muted-foreground">
          <Share2 className="mt-0.5 size-4 shrink-0" />
          <p>
            Shortcut: in the YouTube app tap <span className="font-medium text-foreground">Share → Telegram</span>
            {me?.botUsername ? <> and pick <span className="font-medium text-foreground">@{me.botUsername}</span></> : ' and pick this bot'}
            {' '}— you'll get a button that opens the video right here.
          </p>
        </div>
      )}
    </Page>
  );
}

interface VideoRowProps {
  title: string;
  detail?: React.ReactNode;
  thumbnail: string;
  duration?: number | null;
  onClick(): void;
}

function VideoRow({ title, detail, thumbnail, duration, onClick }: VideoRowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-xl bg-card p-2 text-left transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 active:bg-accent"
    >
      <div className="relative aspect-video w-28 shrink-0 overflow-hidden rounded-lg bg-muted">
        <img src={thumbnail} alt="" loading="lazy" className="size-full object-cover" />
        {duration ? (
          <span className="absolute right-1 bottom-1 rounded bg-black/75 px-1 py-0.5 text-xs leading-none font-medium text-white tabular-nums">
            {formatDuration(duration)}
          </span>
        ) : null}
      </div>
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-sm leading-snug font-medium">{title}</p>
        {detail && <p className="mt-0.5 truncate text-xs text-muted-foreground">{detail}</p>}
      </div>
    </button>
  );
}
