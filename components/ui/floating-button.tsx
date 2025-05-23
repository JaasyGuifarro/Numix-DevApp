import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { ButtonHTMLAttributes, ReactNode } from "react"

interface FloatingButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode
  className?: string
}

export function FloatingButton({ children, className, ...props }: FloatingButtonProps) {
  return (
    <div
      className="fixed bottom-0 left-0 right-0 bg-black/90 backdrop-blur-sm border-t border-white/10"
      role="region"
      aria-label="Acciones"
    >
      <div className="max-w-md mx-auto px-4 h-16 flex items-center justify-center">
        <Button
          className={cn(
            "h-10 px-6 text-base font-semibold rounded-full bg-gradient-to-r from-[#FF6B6B] to-[#4ECDC4] hover:opacity-90 transition-opacity text-black",
            className,
          )}
          {...props}
        >
          {children}
        </Button>
      </div>
    </div>
  )
}

