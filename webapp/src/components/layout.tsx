import type { ReactNode } from 'react';
import { ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { inTelegram } from '@/lib/telegram';
import { cn } from '@/lib/utils';

interface PageProps {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Inside Telegram the native header back button is used instead of an in-page one. */
  onBack?: () => void;
  actions?: ReactNode;
  /** Sticks to the bottom of the screen — for the page's main action. */
  footer?: ReactNode;
  children: ReactNode;
}

export function Page({ title, subtitle, onBack, actions, footer, children }: PageProps) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col">
      <header className="flex items-center gap-2 px-4 pt-4 pb-3">
        {onBack && !inTelegram && (
          <Button variant="ghost" size="icon" className="-ml-2" onClick={onBack} aria-label="Back">
            <ChevronLeft className="size-5" />
          </Button>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-semibold tracking-tight">{title}</h1>
          {subtitle && <p className="truncate text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        {actions}
      </header>
      <main className="flex flex-1 flex-col gap-4 px-4 pb-6">{children}</main>
      {footer && (
        <footer className="sticky bottom-0 border-t bg-background/95 px-4 pt-3 pb-safe backdrop-blur">{footer}</footer>
      )}
    </div>
  );
}

export function Section({ title, children, className }: { title?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-xl bg-card p-4', className)}>
      {title && <h2 className="mb-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">{title}</h2>}
      {children}
    </section>
  );
}

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <div className="mb-4 flex size-14 items-center justify-center rounded-full bg-secondary text-secondary-foreground [&_svg]:size-6">
        {icon}
      </div>
      <p className="font-medium">{title}</p>
      {description && <p className="mt-1 max-w-xs text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
