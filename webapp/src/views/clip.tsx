import { useState } from 'react';
import { CircleAlert, CircleCheck, FileQuestion, LoaderCircle, Play, Scissors, Send, Square, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { EmptyState, Page, Section } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { YouTubePlayer } from '@/components/youtube-player';
import { useSegmentPlayer } from '@/hooks/use-segment-player';
import { useSendClip } from '@/hooks/use-send-clip';
import { errorMessage } from '@/lib/api';
import { useClips } from '@/lib/clips';
import type { Nav } from '@/lib/nav';
import { confirmDialog, haptic } from '@/lib/telegram';
import { formatLength, formatTime } from '@/lib/time';
import { splitTags } from '@/lib/utils';
import { playerErrorMessage } from '@/lib/youtube';

export function ClipView({ id, fresh, nav }: { id: number; fresh?: boolean; nav: Nav }) {
  const { clips, me, update, remove } = useClips();
  const clip = clips?.find((c) => c.id === id);
  const player = useSegmentPlayer();
  const { send, sendingId } = useSendClip();
  const [title, setTitle] = useState(clip?.title ?? '');
  const [tags, setTags] = useState(clip?.tags.join(', ') ?? '');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if (!clip) {
    return (
      <Page title="Sound" onBack={nav.back}>
        <EmptyState
          icon={<FileQuestion />}
          title={clips ? 'This sound is gone' : 'Loading…'}
          action={clips ? <Button variant="secondary" onClick={nav.back}>Back to the board</Button> : undefined}
        />
      </Page>
    );
  }

  const startSec = clip.startMs / 1000;
  const endSec = clip.endMs / 1000;
  const changed = title.trim() !== clip.title || splitTags(tags).join(',') !== clip.tags.join(',');

  async function save() {
    if (!clip) return;
    setSaving(true);
    try {
      const saved = await update(clip.id, { title: title.trim(), tags: splitTags(tags) });
      setTitle(saved.title);
      setTags(saved.tags.join(', '));
      haptic.success();
      toast.success('Saved');
    } catch (error) {
      haptic.error();
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function destroy() {
    if (!clip || !(await confirmDialog(`Delete “${clip.title}”? It stays in your chat with the bot, but disappears from the soundboard.`))) return;
    setDeleting(true);
    try {
      await remove(clip.id);
      haptic.success();
      nav.back();
    } catch (error) {
      haptic.error();
      toast.error(errorMessage(error));
      setDeleting(false);
    }
  }

  return (
    <Page
      title={clip.title}
      subtitle={`${formatLength(clip.durationMs)}${clip.videoTitle ? ` · ${clip.videoTitle}` : ''}`}
      onBack={nav.back}
      footer={
        <Button size="lg" className="w-full" onClick={() => send(clip)} disabled={sendingId === clip.id}>
          {sendingId === clip.id ? <LoaderCircle className="animate-spin" /> : <Send />} Send to a chat
        </Button>
      }
    >
      {fresh && (
        <div className="flex gap-3 rounded-xl bg-secondary p-4 text-sm text-secondary-foreground">
          <CircleCheck className="mt-0.5 size-4 shrink-0" />
          <p>
            Saved! It's also in your chat with {me?.botUsername ? `@${me.botUsername}` : 'the bot'} — forward it from there
            with <span className="font-medium">“Hide sender name”</span> and it shows up as your own voice message.
          </p>
        </div>
      )}

      {player.errorCode === null && <YouTubePlayer key={clip.videoId} videoId={clip.videoId} start={startSec} events={player.events} />}

      <Section title="Preview">
        <p className="mb-3 text-sm text-muted-foreground tabular-nums">
          {formatTime(startSec)} → {formatTime(endSec)} of the video
        </p>
        {player.errorCode !== null ? (
          <p className="flex gap-2 text-sm">
            <CircleAlert className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            {playerErrorMessage(player.errorCode, 'clip')}
          </p>
        ) : (
          <Button
            variant="secondary"
            className="w-full"
            disabled={!player.ready}
            onClick={() => (player.previewing ? player.stop() : player.playSegment(startSec, endSec))}
          >
            {player.previewing ? (
              <>
                <Square /> Stop
              </>
            ) : (
              <>
                <Play /> Play clip
              </>
            )}
          </Button>
        )}
        {player.needsTap && (
          <p className="mt-2 text-center text-xs text-muted-foreground">
            Tap the video once so your phone allows playback, then try again.
          </p>
        )}
      </Section>

      <Section title="Details">
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (changed && title.trim()) void save();
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-title">
              Name <span aria-hidden="true" className="text-destructive">*</span>
            </Label>
            <Input
              id="edit-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={64}
              required
              aria-invalid={!title.trim()}
              aria-describedby={!title.trim() ? 'edit-title-error' : undefined}
              autoComplete="off"
            />
            {!title.trim() && (
              <p id="edit-title-error" className="text-xs text-destructive">
                The name can't be empty.
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-tags">
              Tags <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="edit-tags"
              value={tags}
              onChange={(event) => setTags(event.target.value)}
              placeholder="funny, reaction"
              autoComplete="off"
            />
          </div>
          <Button type="submit" variant="secondary" disabled={!changed || !title.trim() || saving}>
            {saving && <LoaderCircle className="animate-spin" />} Save changes
          </Button>
        </form>
      </Section>

      <div className="flex flex-col gap-2">
        <Button
          variant="ghost"
          onClick={() => nav.push({ name: 'trim', videoId: clip.videoId, start: startSec })}
        >
          <Scissors /> Cut another part of this video
        </Button>
        <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={destroy} disabled={deleting}>
          {deleting ? <LoaderCircle className="animate-spin" /> : <Trash2 />} Delete sound
        </Button>
      </div>
    </Page>
  );
}
