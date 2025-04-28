import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import type { InputHTMLAttributes, ReactNode } from "react"

interface StyledInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  icon?: ReactNode
  error?: string
}

export function StyledInput({ label, icon, error, className, ...props }: StyledInputProps) {
  return (
    <div className="space-y-2">
      {label && (
        <label className="text-sm font-medium text-gray-200">
          {label}
          {props.required && <span className="text-[#FF6B6B]">*</span>}
        </label>
      )}
      <div className="relative">
        {icon && <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400">{icon}</div>}
        <Input
          className={cn(
            "bg-white/10 border-0 text-white",
            icon && "pl-10",
            error && "border-red-500 focus:border-red-500",
            className,
          )}
          {...props}
        />
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  )
}

