import { useEffect, useRef } from 'react';
import { loadYouTubeApi, type YTPlayer } from '@/lib/youtube';
import { cn } from '@/lib/utils';

export interface PlayerEvents {
  onReady(player: YTPlayer): void;
  onStateChange(state: number): void;
  onError(code: number): void;
}

interface YouTubePlayerProps {
  videoId: string;
  /** Where the video is cued when it first loads, in seconds. */
  start?: number;
  events: PlayerEvents;
  className?: string;
}

/** YouTube's IFrame player. Remount it (change `key`) to switch videos. */
export function YouTubePlayer({ videoId, start = 0, events, className }: YouTubePlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const eventsRef = useRef(events);
  const startRef = useRef(start);

  useEffect(() => {
    eventsRef.current = events;
  }, [events]);

  useEffect(() => {
    const container = containerRef.current!;
    // The API replaces this element with its iframe, so keep it out of React's hands.
    const host = document.createElement('div');
    container.append(host);
    let player: YTPlayer | null = null;
    let cancelled = false;

    loadYouTubeApi().then(
      (YT) => {
        if (cancelled) return;
        player = new YT.Player(host, {
          videoId,
          width: '100%',
          height: '100%',
          playerVars: {
            playsinline: 1,
            rel: 0,
            start: Math.floor(startRef.current),
            origin: window.location.origin,
          },
          events: {
            onReady: (event) => eventsRef.current.onReady(event.target),
            onStateChange: (event) => eventsRef.current.onStateChange(event.data),
            onError: (event) => eventsRef.current.onError(event.data),
          },
        });
      },
      () => {
        if (!cancelled) eventsRef.current.onError(-1);
      },
    );

    return () => {
      cancelled = true;
      player?.destroy();
      container.replaceChildren();
    };
  }, [videoId]);

  return (
    <div
      ref={containerRef}
      className={cn('aspect-video w-full overflow-hidden rounded-xl bg-muted [&>iframe]:size-full', className)}
    />
  );
}
