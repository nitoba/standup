import { cva, type VariantProps } from 'class-variance-authority'

export const switchVariants = cva(
  'peer inline-flex shrink-0 cursor-pointer items-center rounded-full border transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50',
  {
    variants: {
      zType: {
        default:
          'border-border bg-border focus-visible:ring-[color:color-mix(in_srgb,var(--accent-green)_20%,transparent)] data-[state=checked]:border-primary data-[state=checked]:bg-primary',
        destructive:
          'border-border bg-border focus-visible:ring-[color:color-mix(in_srgb,var(--accent-red)_20%,transparent)] data-[state=checked]:border-[var(--accent-red)] data-[state=checked]:bg-[var(--accent-red)]',
      },
      zSize: {
        default: 'h-6 w-11',
        sm: 'h-5 w-9',
        lg: 'h-7 w-13',
      },
    },
    defaultVariants: {
      zType: 'default',
      zSize: 'default',
    },
  },
)

export type ZardSwitchSizeVariants = NonNullable<
  VariantProps<typeof switchVariants>['zSize']
>
export type ZardSwitchTypeVariants = NonNullable<
  VariantProps<typeof switchVariants>['zType']
>
