import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PlayerEvents } from '@/components/youtube-player';
import { PlayerState, type YTPlayer } from '@/lib/youtube';

/**
 * Drives a <YouTubePlayer>: reads duration/title, tracks the playhead and
 * plays a [start, end] segment, pausing at the end. Everything runs in the
 * browser — previews never touch our server.
 */
export function useSegmentPlayer() {
  const playerRef = useRef<YTPlayer | null>(null);
  const segmentEnd = useRef<number | null>(null);
  const [ready, setReady] = useState(false);
  const [duration, setDuration] = useState<number | null>(null);
  const [title, setTitle] = useState<string | null>(null);
  const [state, setState] = useState(-1);
  const [time, setTime] = useState(0);
  const [previewing, setPreviewing] = useState(false);
  const [errorCode, setErrorCode] = useState<number | null>(null);
  /** iOS sometimes refuses script-started playback until the video itself has been tapped once. */
  const [needsTap, setNeedsTap] = useState(false);

  const endPreview = useCallback(() => {
    segmentEnd.current = null;
    setPreviewing(false);
  }, []);

  const events = useMemo<PlayerEvents>(() => {
    const readMetadata = (player: YTPlayer) => {
      const length = player.getDuration();
      if (length > 0) setDuration(length);
      const videoTitle = player.getVideoData?.()?.title;
      if (videoTitle) setTitle(videoTitle);
    };
    return {
      onReady(player) {
        playerRef.current = player;
        setReady(true);
        readMetadata(player);
      },
      onStateChange(next) {
        setState(next);
        if (playerRef.current) readMetadata(playerRef.current);
        if (next === PlayerState.PLAYING || next === PlayerState.BUFFERING) setNeedsTap(false);
        if (next === PlayerState.PAUSED || next === PlayerState.ENDED) endPreview();
      },
      onError(code) {
        // YouTube fires onReady *before* reporting non-embeddable videos, so un-ready the player here.
        playerRef.current = null;
        setReady(false);
        setErrorCode(code);
        endPreview();
      },
    };
  }, [endPreview]);

  const playing = state === PlayerState.PLAYING;
  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      const player = playerRef.current;
      if (!player) return;
      const now = player.getCurrentTime();
      setTime(now);
      if (segmentEnd.current !== null && now >= segmentEnd.current) {
        player.pauseVideo();
        endPreview();
      }
    }, 50);
    return () => window.clearInterval(timer);
  }, [playing, endPreview]);

  const playSegment = useCallback((start: number, end: number) => {
    const player = playerRef.current;
    if (!player) return;
    segmentEnd.current = end;
    setPreviewing(true);
    setNeedsTap(false);
    player.seekTo(start, true);
    player.playVideo();
    window.setTimeout(() => {
      const current = player.getPlayerState();
      if (segmentEnd.current !== null && current !== PlayerState.PLAYING && current !== PlayerState.BUFFERING) {
        endPreview();
        setNeedsTap(true);
      }
    }, 1500);
  }, [endPreview]);

  const stop = useCallback(() => {
    endPreview();
    playerRef.current?.pauseVideo();
  }, [endPreview]);

  const seek = useCallback((seconds: number) => {
    playerRef.current?.seekTo(seconds, true);
    setTime(seconds);
  }, []);

  /** Moves the stopping point of a running preview (e.g. while the end is being nudged). */
  const updateSegmentEnd = useCallback((end: number) => {
    if (segmentEnd.current !== null) segmentEnd.current = end;
  }, []);

  const currentTime = useCallback(() => playerRef.current?.getCurrentTime() ?? 0, []);

  return {
    events,
    ready,
    duration,
    title,
    playing,
    time,
    previewing,
    errorCode,
    needsTap,
    playSegment,
    stop,
    seek,
    updateSegmentEnd,
    currentTime,
  };
}
