import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export const Card = ({ className, ...p }: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('rounded-lg border border-border p-5', className)} {...p} />
);
export const CardTitle = ({ className, ...p }: HTMLAttributes<HTMLHeadingElement>) => (
  <h3 className={cn('text-sm font-medium text-muted-foreground', className)} {...p} />
);
export const CardValue = ({ className, ...p }: HTMLAttributes<HTMLParagraphElement>) => (
  <p className={cn('mt-1 text-2xl font-semibold tabular-nums', className)} {...p} />
);
