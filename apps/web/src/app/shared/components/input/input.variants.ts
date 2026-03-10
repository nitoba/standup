import { cva, type VariantProps } from 'class-variance-authority'

export type zInputIcon = 'email' | 'password' | 'text'

export const inputVariants = cva('w-full font-[var(--font-jetbrains)]', {
  variants: {
    zType: {
      default:
        'flex rounded-none border border-border bg-background px-4 font-normal text-foreground outline-none transition-all duration-150 file:border-0 file:bg-transparent file:font-medium file:text-foreground placeholder:text-muted-foreground/80 focus-visible:border-[var(--accent-green)] focus-visible:ring-[3px] focus-visible:ring-[color:color-mix(in_srgb,var(--accent-green)_18%,transparent)] disabled:cursor-not-allowed disabled:opacity-50',
      textarea:
        'flex h-auto min-h-20 rounded-none border border-border bg-background px-4 py-3 text-[13px] text-foreground leading-[1.6] outline-none transition-all duration-150 placeholder:text-muted-foreground/80 focus-visible:border-[var(--accent-cyan)] focus-visible:ring-[3px] focus-visible:ring-[color:color-mix(in_srgb,var(--accent-cyan)_18%,transparent)] disabled:cursor-not-allowed disabled:opacity-50',
    },
    zSize: {
      default: 'text-[13px]',
      sm: 'text-[12px]',
      lg: 'text-[14px]',
    },
    zStatus: {
      error:
        'border-[var(--accent-red)] focus-visible:border-[var(--accent-red)] focus-visible:ring-[color:color-mix(in_srgb,var(--accent-red)_18%,transparent)]',
      warning:
        'border-[var(--accent-amber)] focus-visible:border-[var(--accent-amber)] focus-visible:ring-[color:color-mix(in_srgb,var(--accent-amber)_18%,transparent)]',
      success:
        'border-[var(--accent-green)] focus-visible:border-[var(--accent-green)] focus-visible:ring-[color:color-mix(in_srgb,var(--accent-green)_18%,transparent)]',
    },
    zBorderless: {
      true: 'flex-1 border-0 bg-transparent p-0 outline-none focus-visible:ring-0 focus-visible:ring-offset-0',
    },
  },
  defaultVariants: {
    zType: 'default',
    zSize: 'default',
  },
  compoundVariants: [
    { zType: 'default', zSize: 'default', class: 'h-11 py-2' },
    { zType: 'default', zSize: 'sm', class: 'h-9 py-1.5' },
    { zType: 'default', zSize: 'lg', class: 'h-12 py-2.5' },
  ],
})

export type ZardInputTypeVariants = NonNullable<
  VariantProps<typeof inputVariants>['zType']
>
export type ZardInputSizeVariants = NonNullable<
  VariantProps<typeof inputVariants>['zSize']
>
export type ZardInputStatusVariants = NonNullable<
  VariantProps<typeof inputVariants>['zStatus']
>
