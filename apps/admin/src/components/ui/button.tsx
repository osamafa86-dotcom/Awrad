import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';
import type { ComponentProps } from 'react';

import { cn } from '@/lib/utils';

/** DESIGN.md §6 Button: primary · primary-disabled · secondary · quiet, sizes md (44) and lg (52). */
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-8 rounded-md border px-20 py-8 t-label-md transition-colors ' +
    'outline-none focus-visible:ring-2 focus-visible:ring-line-focus focus-visible:ring-offset-2 ' +
    'focus-visible:ring-offset-canvas disabled:cursor-not-allowed [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary:
          'border-action bg-action text-on-primary hover:border-action-pressed hover:bg-action-pressed ' +
          'disabled:border-sunken disabled:bg-sunken disabled:text-fg-tertiary',
        secondary: 'border-line-input bg-surface text-link hover:bg-action-tint disabled:opacity-50',
        quiet: 'border-transparent bg-transparent text-link hover:bg-action-tint disabled:opacity-50',
      },
      size: {
        md: 'min-h-44',
        lg: 'min-h-52',
      },
    },
    defaultVariants: { variant: 'primary', size: 'lg' },
  },
);

export interface ButtonProps extends ComponentProps<'button'>, VariantProps<typeof buttonVariants> {
  /** Render the single child (e.g. a link) with the button's styles instead of a <button>. */
  asChild?: boolean;
}

export function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Component = asChild ? Slot.Root : 'button';
  return <Component className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
