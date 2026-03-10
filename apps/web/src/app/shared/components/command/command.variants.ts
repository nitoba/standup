import { cva, type VariantProps } from 'class-variance-authority'

export const commandVariants = cva(
  'flex size-full flex-col overflow-hidden border border-border bg-card text-foreground shadow-[0_20px_60px_rgba(0,0,0,0.32)]',
  {
    variants: {
      size: {
        sm: 'min-h-64',
        default: 'min-h-80',
        lg: 'min-h-96',
        xl: 'min-h-120',
      },
    },
    defaultVariants: {
      size: 'default',
    },
  },
)

export const commandInputVariants = cva(
  'flex h-11 w-full bg-transparent py-3 font-[var(--font-jetbrains)] text-[13px] text-foreground outline-none placeholder:text-muted-foreground/80 disabled:cursor-not-allowed disabled:opacity-50',
  {
    variants: {},
    defaultVariants: {},
  },
)

export const commandListVariants = cva(
  'max-h-75 overflow-y-auto overflow-x-hidden p-2',
  {
    variants: {},
    defaultVariants: {},
  },
)

export const commandEmptyVariants = cva(
  'py-6 text-center font-[var(--font-ibm)] text-[12px] text-muted-foreground',
  {
    variants: {},
    defaultVariants: {},
  },
)

export const commandGroupVariants = cva('overflow-hidden text-foreground', {
  variants: {},
  defaultVariants: {},
})

export const commandGroupHeadingVariants = cva(
  'px-2 py-2 font-[var(--font-jetbrains)] text-[11px] text-muted-foreground/70 uppercase tracking-[0.18em]',
  {
    variants: {},
    defaultVariants: {},
  },
)

export const commandItemVariants = cva(
  'relative flex cursor-default select-none items-center border border-transparent px-3 py-2 font-[var(--font-jetbrains)] text-[12px] text-foreground outline-none transition-colors duration-150 hover:border-border hover:bg-accent/30 hover:text-foreground aria-selected:border-border aria-selected:bg-accent aria-selected:text-foreground data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50',
  {
    variants: {
      variant: {
        default: '',
        destructive:
          'text-[var(--accent-red)] hover:border-[var(--accent-red)] hover:bg-[color:color-mix(in_srgb,var(--accent-red)_12%,transparent)] hover:text-[var(--accent-red)] aria-selected:border-[var(--accent-red)] aria-selected:bg-[color:color-mix(in_srgb,var(--accent-red)_16%,transparent)] aria-selected:text-[var(--accent-red)]',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
)

export const commandSeparatorVariants = cva('-mx-1 my-1 h-px bg-border', {
  variants: {},
  defaultVariants: {},
})

export const commandShortcutVariants = cva(
  'ml-auto font-[var(--font-ibm)] text-[11px] text-muted-foreground/70 tracking-[0.12em]',
  {
    variants: {},
    defaultVariants: {},
  },
)

export type ZardCommandSizeVariants = NonNullable<
  VariantProps<typeof commandVariants>['size']
>
export type ZardCommandItemVariants = NonNullable<
  VariantProps<typeof commandItemVariants>['variant']
>
