import { LoaderCircle, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Clip } from '@/lib/api';
import { formatLength } from '@/lib/time';

interface ClipTileProps {
  clip: Clip;
  sending: boolean;
  onOpen(): void;
  onSend(): void;
}

export function ClipTile({ clip, sending, onOpen, onSend }: ClipTileProps) {
  return (
    <div className="relative flex min-h-28 flex-col rounded-xl bg-card p-3">
      {/* The ::after overlay stretches this button over the whole tile; the send button sits above it. */}
      <button
        type="button"
        onClick={onOpen}
        className="text-left outline-none after:absolute after:inset-0 after:rounded-xl after:transition-colors focus-visible:after:ring-[3px] focus-visible:after:ring-ring/50 active:after:bg-foreground/5"
      >
        <span className="line-clamp-2 leading-snug font-medium break-words">{clip.title}</span>
        {clip.tags.length > 0 && (
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
            {clip.tags.map((tag) => `#${tag}`).join(' ')}
          </span>
        )}
      </button>
      <div className="mt-auto flex items-end justify-between pt-3">
        <span className="text-xs text-muted-foreground tabular-nums">{formatLength(clip.durationMs)}</span>
        <Button
          size="icon"
          className="relative z-10 rounded-full"
          onClick={onSend}
          disabled={sending}
          aria-label={`Send “${clip.title}”`}
        >
          {sending ? <LoaderCircle className="animate-spin" /> : <Send />}
        </Button>
      </div>
    </div>
  );
}
