import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { ReactNode } from "react"

interface StatusBadgeProps {
  children: ReactNode
  status: "success" | "warning" | "error" | "info"
  icon?: ReactNode
  className?: string
}

export function StatusBadge({ children, status, icon, className }: StatusBadgeProps) {
  const statusClasses = {
    success: "bg-green-500 hover:bg-green-600",
    warning: "bg-yellow-500 hover:bg-yellow-600",
    error: "bg-red-500 hover:bg-red-600",
    info: "bg-blue-500 hover:bg-blue-600",
  }

  return (
    <Badge className={cn("inline-flex items-center gap-1", statusClasses[status], className)}>
      {icon}
      {children}
    </Badge>
  )
}

