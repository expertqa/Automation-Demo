import { cn } from '@/lib/utils';

export function Switch({ checked, onCheckedChange, id }: { checked: boolean; onCheckedChange: (v: boolean) => void; id?: string }) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onCheckedChange(!checked)}
      className={cn('relative inline-flex h-5 w-9 items-center rounded-full border border-transparent transition-colors', checked ? 'bg-primary' : 'bg-muted')}
    >
      <span className={cn('inline-block h-4 w-4 rounded-full bg-background shadow transition-transform', checked ? 'translate-x-4' : 'translate-x-0.5')} />
    </button>
  );
}
