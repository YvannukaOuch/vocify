import { useEffect, useRef, useState } from 'react';
import { CircleAlert, LoaderCircle, Play, Scissors, Square } from 'lucide-react';
import { toast } from 'sonner';
import { Page, Section } from '@/components/layout';
import { TimeRow } from '@/components/time-row';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { YouTubePlayer } from '@/components/youtube-player';
import { useSegmentPlayer } from '@/hooks/use-segment-player';
import { ApiError, errorMessage } from '@/lib/api';
import { useClips } from '@/lib/clips';
import type { Nav } from '@/lib/nav';
import { haptic, requestWriteAccess, useNoVerticalSwipes } from '@/lib/telegram';
import { formatTime } from '@/lib/time';
import { cn, splitTags } from '@/lib/utils';
import { playerErrorMessage } from '@/lib/youtube';

const DEFAULT_LENGTH = 5;
const MIN_LENGTH = 0.3;

const tenth = (seconds: number) => Math.round(seconds * 10) / 10;
const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

interface TrimViewProps {
  videoId: string;
  start?: number;
  nav: Nav;
}

export function TrimView({ videoId, start: initialStart = 0, nav }: TrimViewProps) {
  useNoVerticalSwipes();
  const { me, create } = useClips();
  const player = useSegmentPlayer();
  const maxLength = me?.maxClipSeconds ?? 60;

  const [range, setRange] = useState<[number, number]>(() => [tenth(initialStart), tenth(initialStart + DEFAULT_LENGTH)]);
  const [title, setTitle] = useState('');
  const [tags, setTags] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const { duration } = player;
  const limit = duration ?? Infinity;
  const [start, end] = range;
  const length = tenth(end - start);

  // Once the real duration is known, pull a selection that runs past the end back inside the video.
  useEffect(() => {
    if (!duration) return;
    setRange(([s, e]) => {
      const nextStart = tenth(clamp(s, 0, Math.max(0, duration - 1)));
      return [nextStart, tenth(clamp(e, nextStart + MIN_LENGTH, duration))];
    });
  }, [duration]);

  const tooLong = length > maxLength;
  const tooShort = length < MIN_LENGTH;
  const valid = !tooLong && !tooShort && end <= limit + 0.1;
  const hasPlayer = player.errorCode === null;

  function setStart(value: number) {
    const next = tenth(clamp(value, 0, Math.max(0, limit - MIN_LENGTH)));
    setRange(([, e]) => [next, e - next >= MIN_LENGTH ? e : tenth(Math.min(limit, next + DEFAULT_LENGTH))]);
    if (!player.playing) player.seek(next);
  }

  function setEnd(value: number) {
    const next = tenth(clamp(value, MIN_LENGTH, limit));
    setRange(([s]) => [next - s >= MIN_LENGTH ? s : tenth(Math.max(0, next - DEFAULT_LENGTH)), next]);
    player.updateSegmentEnd(next);
  }

  async function submit(retried = false) {
    setCreating(true);
    setError(null);
    haptic.tap();
    try {
      const clip = await create({ videoId, start, end, title: title.trim(), tags: splitTags(tags) });
      haptic.success();
      if (mounted.current) nav.reset([{ name: 'board' }, { name: 'clip', id: clip.id, fresh: true }]);
      else toast.success(`“${clip.title}” is ready`);
    } catch (caught) {
      // The bot can't message people who never pressed Start — ask Telegram for permission once, then retry.
      if (!retried && caught instanceof ApiError && caught.code === 'cannot_message' && (await requestWriteAccess())) {
        await submit(true);
        return;
      }
      haptic.error();
      if (mounted.current) setError(errorMessage(caught));
      else toast.error(errorMessage(caught));
    } finally {
      if (mounted.current) setCreating(false);
    }
  }

  const fallbackTitle = player.title?.slice(0, 64) ?? '';

  return (
    <Page
      title="Pick the part"
      subtitle={player.title ?? (hasPlayer ? 'Loading video…' : 'Preview unavailable')}
      onBack={nav.back}
      footer={
        <>
          <Button size="lg" className="w-full" disabled={!valid || creating} onClick={() => submit()}>
            {creating ? (
              <>
                <LoaderCircle className="animate-spin" /> Cutting your clip…
              </>
            ) : (
              <>
                <Scissors /> Create clip · {length.toFixed(1)}s
              </>
            )}
          </Button>
          {creating && (
            <p className="mt-2 text-center text-xs text-muted-foreground">
              Grabbing just those seconds from YouTube — usually 5–15 seconds.
            </p>
          )}
          {error && !creating && (
            <p role="alert" className="mt-2 text-center text-sm text-destructive">
              {error}
            </p>
          )}
        </>
      }
    >
      {hasPlayer ? (
        <YouTubePlayer key={videoId} videoId={videoId} start={initialStart} events={player.events} />
      ) : (
        <div className="flex gap-3 rounded-xl bg-card p-4 text-sm">
          <CircleAlert className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <p>{playerErrorMessage(player.errorCode!, 'trim')}</p>
        </div>
      )}

      <Section title="Selection">
        <div className="flex flex-col gap-4">
          {duration ? (
            <div className="flex flex-col gap-2">
              <Slider
                value={range}
                min={0}
                max={duration}
                step={0.1}
                minStepsBetweenThumbs={3}
                thumbLabels={['Start', 'End']}
                onValueChange={([s, e]) => {
                  setRange([tenth(s!), tenth(e!)]);
                  player.updateSegmentEnd(e!);
                }}
                onValueCommit={([s]) => {
                  if (!player.playing) player.seek(s!);
                }}
              />
              <div className="flex justify-between text-xs text-muted-foreground tabular-nums">
                <span>0:00</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>
          ) : null}

          <div className="flex flex-col gap-2">
            <TimeRow
              label="Start"
              value={start}
              onChange={setStart}
              onMarkNow={hasPlayer && player.ready ? () => setStart(player.currentTime()) : undefined}
            />
            <TimeRow
              label="End"
              value={end}
              onChange={setEnd}
              onMarkNow={hasPlayer && player.ready ? () => setEnd(player.currentTime()) : undefined}
            />
          </div>

          <p className={cn('text-sm', tooLong || tooShort ? 'text-destructive' : 'text-muted-foreground')}>
            {tooLong
              ? `${length.toFixed(1)}s selected — clips can be at most ${maxLength}s.`
              : tooShort
                ? 'Select at least 0.3 seconds.'
                : hasPlayer
                  ? `${length.toFixed(1)}s selected. Play the video and tap Now to mark the start and end.`
                  : `${length.toFixed(1)}s selected.`}
          </p>

          {hasPlayer && (
            <div className="flex flex-col gap-2">
              <Button
                variant="secondary"
                className="w-full"
                disabled={!player.ready || !valid}
                onClick={() => (player.previewing ? player.stop() : player.playSegment(start, end))}
              >
                {player.previewing ? (
                  <>
                    <Square /> Stop · {formatTime(player.time)}
                  </>
                ) : (
                  <>
                    <Play /> Preview selection
                  </>
                )}
              </Button>
              {player.needsTap && (
                <p className="text-center text-xs text-muted-foreground">
                  Tap the video once so your phone allows playback, then preview again.
                </p>
              )}
            </div>
          )}
        </div>
      </Section>

      <Section title="Name">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="clip-title">
              Name <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="clip-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={64}
              placeholder={fallbackTitle || 'e.g. vine boom'}
              enterKeyHint="next"
              autoComplete="off"
            />
            <p className="text-xs text-muted-foreground">
              {me?.botUsername ? `What you'll type after @${me.botUsername} to find it. ` : ''}
              Empty uses the video title.
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="clip-tags">
              Tags <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="clip-tags"
              value={tags}
              onChange={(event) => setTags(event.target.value)}
              placeholder="funny, reaction"
              enterKeyHint="done"
              autoComplete="off"
            />
          </div>
        </div>
      </Section>
    </Page>
  );
}
