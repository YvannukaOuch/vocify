import { useMemo, useState } from 'react';
import { AudioLines, CloudOff, Plus, Search, SearchX } from 'lucide-react';
import { ClipTile } from '@/components/clip-tile';
import { EmptyState, Page } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useSendClip } from '@/hooks/use-send-clip';
import type { Clip } from '@/lib/api';
import { useClips } from '@/lib/clips';
import type { Nav } from '@/lib/nav';

function normalize(text: string) {
  return text.toLowerCase().normalize('NFKD').replace(/\p{M}/gu, '');
}

function matches(clip: Clip, words: string[]) {
  const haystack = normalize([clip.title, ...clip.tags, clip.videoTitle ?? ''].join(' '));
  return words.every((word) => haystack.includes(word));
}

export function BoardView({ nav }: { nav: Nav }) {
  const { clips, me, error, reload } = useClips();
  const { send, sendingId } = useSendClip();
  const [filter, setFilter] = useState('');

  const visible = useMemo(() => {
    const words = normalize(filter).split(/\s+/).filter(Boolean);
    return (clips ?? []).filter((clip) => matches(clip, words));
  }, [clips, filter]);

  const addButton = (
    <Button onClick={() => nav.push({ name: 'add' })}>
      <Plus /> Add
    </Button>
  );

  let content;
  if (error && !clips) {
    content = (
      <EmptyState
        icon={<CloudOff />}
        title="Couldn't load your sounds"
        description={error}
        action={<Button variant="secondary" onClick={reload}>Try again</Button>}
      />
    );
  } else if (!clips) {
    content = (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3" aria-busy="true" aria-label="Loading sounds">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl bg-card" />
        ))}
      </div>
    );
  } else if (clips.length === 0) {
    content = (
      <EmptyState
        icon={<AudioLines />}
        title="No sounds yet"
        description="Find a meme on YouTube, pick the seconds you want, and it becomes a voice message you can send anywhere."
        action={addButton}
      />
    );
  } else if (visible.length === 0) {
    content = <EmptyState icon={<SearchX />} title="No matching sounds" description={`Nothing called “${filter.trim()}”.`} />;
  } else {
    content = (
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {visible.map((clip) => (
          <li key={clip.id} className="contents">
            <ClipTile
              clip={clip}
              sending={sendingId === clip.id}
              onOpen={() => nav.push({ name: 'clip', id: clip.id })}
              onSend={() => send(clip)}
            />
          </li>
        ))}
      </ul>
    );
  }

  const count = clips?.length ?? 0;
  return (
    <Page
      title="Soundboard"
      subtitle={
        clips && count > 0
          ? me?.botUsername
            ? `${count} ${count === 1 ? 'sound' : 'sounds'} · or type @${me.botUsername} in any chat`
            : `${count} ${count === 1 ? 'sound' : 'sounds'}`
          : undefined
      }
      actions={count > 0 ? addButton : undefined}
    >
      {count > 0 && (
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Search your sounds"
            aria-label="Search your sounds"
            className="h-10 border-transparent bg-card pl-9 shadow-none"
          />
        </div>
      )}
      {content}
    </Page>
  );
}
