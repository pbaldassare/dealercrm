import type { InputHTMLAttributes } from 'react'
import { cn } from '../../lib/cn'

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'min-h-11 w-full rounded-xl border border-[#d9d1c7] bg-white px-3 text-base text-[#14213d] outline-none focus:border-[#c45c26]',
        className,
      )}
      {...props}
    />
  )
}
