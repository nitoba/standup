import { cva, type VariantProps } from 'class-variance-authority'

export const checkboxVariants = cva(
  'peer cursor-[unset] appearance-none border bg-background transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50',
  {
    variants: {
      zType: {
        default:
          'border-border checked:border-[var(--accent-green)] checked:bg-[var(--accent-green)] focus-visible:ring-[color:color-mix(in_srgb,var(--accent-green)_20%,transparent)]',
        destructive:
          'border-[var(--accent-red)] checked:border-[var(--accent-red)] checked:bg-[var(--accent-red)] focus-visible:ring-[color:color-mix(in_srgb,var(--accent-red)_20%,transparent)]',
      },
      zSize: {
        default: 'size-4',
        lg: 'size-6',
      },
      zShape: {
        default: 'rounded-[4px]',
        circle: 'rounded-full',
        square: 'rounded-none',
      },
    },
    defaultVariants: {
      zType: 'default',
      zSize: 'default',
      zShape: 'default',
    },
  },
)

export const checkboxLabelVariants = cva(
  'cursor-[unset] select-none text-current empty:hidden',
  {
    variants: {
      zSize: {
        default: 'font-[var(--font-jetbrains)] text-[13px] text-foreground',
        lg: 'font-[var(--font-jetbrains)] text-[14px] text-foreground',
      },
    },
    defaultVariants: {
      zSize: 'default',
    },
  },
)

export type ZardCheckboxShapeVariants = NonNullable<
  VariantProps<typeof checkboxVariants>['zShape']
>
export type ZardCheckboxSizeVariants = NonNullable<
  VariantProps<typeof checkboxVariants>['zSize']
>
export type ZardCheckboxTypeVariants = NonNullable<
  VariantProps<typeof checkboxVariants>['zType']
>
