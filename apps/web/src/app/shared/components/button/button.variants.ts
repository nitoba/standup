import { cva, type VariantProps } from 'class-variance-authority'

import { mergeClasses } from '@/shared/utils/merge-classes'

export const buttonVariants = cva(
  mergeClasses(
    'inline-flex select-none items-center justify-center whitespace-nowrap border bg-clip-padding outline-none',
    'font-[var(--font-jetbrains)] font-medium text-[12px] tracking-[0.02em] [&_svg:not([class*=size-])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0',
    'transition-all duration-150 focus-visible:ring-2 focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-50',
    'group/button shrink-0 focus-visible:border-ring aria-invalid:border-destructive aria-invalid:ring-destructive/20',
  ),
  {
    variants: {
      zType: {
        default:
          'border-primary bg-primary text-black hover:shadow-[0_0_12px_var(--accent-green)] hover:brightness-110',
        destructive:
          'border-[var(--accent-red)] bg-transparent text-[var(--accent-red)] hover:bg-[var(--accent-red)] hover:text-black hover:shadow-[0_0_12px_color-mix(in_srgb,var(--accent-red)_24%,transparent)] focus-visible:border-[var(--accent-red)] focus-visible:ring-[color:color-mix(in_srgb,var(--accent-red)_24%,transparent)]',
        outline:
          'border-input bg-transparent text-muted-foreground hover:border-foreground/60 hover:bg-accent/30 hover:text-foreground aria-expanded:bg-accent/40 aria-expanded:text-foreground',
        secondary:
          'border-[var(--accent-cyan)] bg-transparent text-[var(--accent-cyan)] hover:bg-[var(--accent-cyan)] hover:text-black hover:shadow-[0_0_12px_color-mix(in_srgb,var(--accent-cyan)_24%,transparent)] aria-expanded:bg-[var(--accent-cyan)] aria-expanded:text-black',
        ghost:
          'border-transparent bg-transparent text-muted-foreground hover:border-border hover:bg-accent/30 hover:text-foreground aria-expanded:bg-accent/40 aria-expanded:text-foreground',
        link: 'border-transparent px-0 text-[var(--accent-cyan)] underline-offset-4 hover:underline',
      },
      zSize: {
        default:
          'h-10 gap-2 px-4 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3',
        xs: 'h-7 gap-1 px-2 text-[11px] [&_svg:not([class*=size-])]:size-3',
        sm: 'h-8 gap-1.5 px-3 text-[11px] [&_svg:not([class*=size-])]:size-3.5',
        lg: 'h-11 gap-2 px-5 text-[13px] has-data-[icon=inline-end]:pr-4 has-data-[icon=inline-start]:pl-4',
        icon: 'size-10',
        'icon-xs': 'size-7 [&_svg:not([class*=size-])]:size-3',
        'icon-sm': 'size-8 [&_svg:not([class*=size-])]:size-3.5',
        'icon-lg': 'size-11 [&_svg:not([class*=size-])]:size-4',
      },
      zShape: {
        default: 'rounded-none',
        circle: 'rounded-full',
        square: 'rounded-none',
      },
      zFull: {
        true: 'w-full',
      },
      zLoading: {
        true: 'pointer-events-none opacity-50',
      },
      zDisabled: {
        true: 'pointer-events-none opacity-50',
      },
    },
    defaultVariants: {
      zType: 'default',
      zSize: 'default',
      zShape: 'default',
    },
  },
)
export type ZardButtonShapeVariants = NonNullable<
  VariantProps<typeof buttonVariants>['zShape']
>
export type ZardButtonSizeVariants = NonNullable<
  VariantProps<typeof buttonVariants>['zSize']
>
export type ZardButtonTypeVariants = NonNullable<
  VariantProps<typeof buttonVariants>['zType']
>
