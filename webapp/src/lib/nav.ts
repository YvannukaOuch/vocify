export type Route =
  | { name: 'board' }
  | { name: 'add' }
  | { name: 'trim'; videoId: string; start?: number }
  | { name: 'clip'; id: number; fresh?: boolean };

export interface Nav {
  push(route: Route): void;
  back(): void;
  /** Replaces the whole history, e.g. board → new clip after creating it. */
  reset(routes: Route[]): void;
}
