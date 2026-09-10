import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva('inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium leading-4 whitespace-nowrap', {
  variants: {
    variant: {
      default: 'border-transparent bg-secondary text-secondary-foreground',
      outline: 'border-border text-foreground',
      passed: 'border-status-passed/25 bg-status-passed/10 text-status-passed',
      failed: 'border-status-failed/25 bg-status-failed/10 text-status-failed',
      flaky: 'border-status-flaky/30 bg-status-flaky/10 text-status-flaky',
      skipped: 'border-status-skipped/30 bg-status-skipped/10 text-status-skipped',
      info: 'border-blue-500/25 bg-blue-500/10 text-blue-600 dark:text-blue-400',
    },
  },
  defaultVariants: { variant: 'default' },
});

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
