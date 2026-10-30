import { useId, useState } from 'react';
import { Crosshair, Minus, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { haptic } from '@/lib/telegram';
import { formatTime, parseTime } from '@/lib/time';

const NUDGE = 0.1;

interface TimeRowProps {
  label: string;
  value: number;
  onChange(seconds: number): void;
  /** Sets the value to the player's current position; omitted when there's no player. */
  onMarkNow?: () => void;
}

/** "Start  [−] 0:12.4 [+]  [Now]" — fine control for one end of the selection. */
export function TimeRow({ label, value, onChange, onMarkNow }: TimeRowProps) {
  const id = useId();
  const lower = label.toLowerCase();

  const nudge = (delta: number) => {
    haptic.select();
    onChange(value + delta);
  };

  return (
    <div className="flex items-center gap-1.5">
      <Label htmlFor={id} className="w-10 shrink-0 text-muted-foreground">
        {label}
      </Label>
      <Button variant="secondary" size="icon-sm" onClick={() => nudge(-NUDGE)} aria-label={`Move ${lower} 0.1 seconds earlier`}>
        <Minus />
      </Button>
      <TimeInput id={id} value={value} onCommit={onChange} />
      <Button variant="secondary" size="icon-sm" onClick={() => nudge(NUDGE)} aria-label={`Move ${lower} 0.1 seconds later`}>
        <Plus />
      </Button>
      {onMarkNow && (
        <Button
          variant="secondary"
          size="sm"
          className="ml-auto"
          onClick={() => {
            haptic.tap();
            onMarkNow();
          }}
          aria-label={`Set ${lower} to the current video time`}
        >
          <Crosshair /> Now
        </Button>
      )}
    </div>
  );
}

/** Shows the time as m:ss.s; accepts "1:23.4" or plain seconds when typed. */
function TimeInput({ id, value, onCommit }: { id: string; value: number; onCommit(seconds: number): void }) {
  const [draft, setDraft] = useState<string | null>(null);

  const commit = () => {
    if (draft === null) return;
    const parsed = parseTime(draft);
    setDraft(null);
    if (parsed !== null) onCommit(parsed);
  };

  return (
    <Input
      id={id}
      value={draft ?? formatTime(value)}
      onChange={(event) => setDraft(event.target.value)}
      onFocus={(event) => event.currentTarget.select()}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
      }}
      inputMode="decimal"
      autoComplete="off"
      className="h-8 w-20 px-1 text-center tabular-nums"
    />
  );
}
