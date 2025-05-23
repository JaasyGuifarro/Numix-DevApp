import { cn } from "@/lib/utils"
import type { ReactNode } from "react"

interface GradientHeaderProps {
  children: ReactNode
  className?: string
}

export function GradientHeader({ children, className }: GradientHeaderProps) {
  return (
    <div className={cn("bg-gradient-to-r from-[#FF6B6B] to-[#4ECDC4] py-4", className)}>
      <h2 className="text-center text-xl font-semibold">{children}</h2>
    </div>
  )
}

