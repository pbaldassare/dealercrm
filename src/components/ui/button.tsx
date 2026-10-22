import type { ButtonHTMLAttributes } from 'react'
import { cn } from '../../lib/cn'

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'ghost'
}

export function Button({ className, variant = 'primary', ...props }: Props) {
  return (
    <button
      className={cn(
        'inline-flex min-h-11 w-full items-center justify-center rounded-xl px-4 text-base font-semibold transition disabled:opacity-50',
        variant === 'primary' && 'bg-[#c45c26] text-white hover:bg-[#a64b1e]',
        variant === 'ghost' && 'bg-transparent text-[#14213d] underline-offset-4 hover:underline',
        className,
      )}
      {...props}
    />
  )
}
