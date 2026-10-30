import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Toaster } from '@/components/ui/sonner';
import { ClipsProvider } from '@/lib/clips';
import type { Nav, Route } from '@/lib/nav';
import { startParam, useBackButton } from '@/lib/telegram';
import { parseVideoId } from '@/lib/youtube';
import { AddView } from '@/views/add';
import { BoardView } from '@/views/board';
import { ClipView } from '@/views/clip';
import { TrimView } from '@/views/trim';

/**
 * The bot opens the trimmer directly with ?v=VIDEO&t=SECONDS (after you share a
 * YouTube link with it); t.me/<bot>/<app>?startapp=VIDEO works too.
 */
function initialStack(): Route[] {
  const params = new URLSearchParams(window.location.search);
  const videoId = parseVideoId(params.get('v') ?? startParam ?? '');
  if (!videoId) return [{ name: 'board' }];
  return [{ name: 'board' }, { name: 'trim', videoId, start: Number(params.get('t')) || 0 }];
}

function routeKey(route: Route, depth: number): string {
  switch (route.name) {
    case 'trim':
      return `${depth}-trim-${route.videoId}`;
    case 'clip':
      return `${depth}-clip-${route.id}`;
    default:
      return `${depth}-${route.name}`;
  }
}

export default function App() {
  const [stack, setStack] = useState(initialStack);
  // Scroll position of each screen in the stack, so going back lands where you left off.
  const scrollPositions = useRef<number[]>([]);

  const push = useCallback((route: Route) => {
    setStack((current) => {
      scrollPositions.current[current.length - 1] = window.scrollY;
      return [...current, route];
    });
  }, []);
  const back = useCallback(() => setStack((current) => (current.length > 1 ? current.slice(0, -1) : current)), []);
  const reset = useCallback((routes: Route[]) => {
    scrollPositions.current = [];
    setStack(routes);
  }, []);
  const nav = useMemo<Nav>(() => ({ push, back, reset }), [push, back, reset]);

  useBackButton(stack.length > 1 ? back : null);

  useLayoutEffect(() => {
    window.scrollTo(0, scrollPositions.current[stack.length - 1] ?? 0);
    scrollPositions.current.length = stack.length;
  }, [stack]);

  const route = stack[stack.length - 1]!;
  let view;
  switch (route.name) {
    case 'board':
      view = <BoardView nav={nav} />;
      break;
    case 'add':
      view = <AddView nav={nav} />;
      break;
    case 'trim':
      view = <TrimView videoId={route.videoId} start={route.start} nav={nav} />;
      break;
    case 'clip':
      view = <ClipView id={route.id} fresh={route.fresh} nav={nav} />;
      break;
  }

  return (
    <ClipsProvider>
      <div key={routeKey(route, stack.length)}>{view}</div>
      <Toaster position="top-center" />
    </ClipsProvider>
  );
}
