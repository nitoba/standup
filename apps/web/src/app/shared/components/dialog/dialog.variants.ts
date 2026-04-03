import { cva, type VariantProps } from 'class-variance-authority'

export const dialogVariants = cva(
  'fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-5 rounded-none border border-border bg-card p-5 text-foreground shadow-[0_24px_80px_rgba(0,0,0,0.45)] sm:max-w-[520px] sm:p-6',
)
export type ZardDialogVariants = VariantProps<typeof dialogVariants>
