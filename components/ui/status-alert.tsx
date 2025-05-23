import { Alert, AlertDescription } from "@/components/ui/alert"
import { cn } from "@/lib/utils"
import type { ReactNode } from "react"

interface StatusAlertProps {
  children: ReactNode
  status: "success" | "warning" | "error" | "info"
  icon?: ReactNode
  className?: string
}

export function StatusAlert({ children, status, icon, className }: StatusAlertProps) {
  const statusClasses = {
    success: "bg-green-500/10 text-green-400 border-green-500/50",
    warning: "bg-yellow-500/10 text-yellow-400 border-yellow-500/50",
    error: "bg-red-500/10 text-red-400 border-red-500/50",
    info: "bg-blue-500/10 text-blue-400 border-blue-500/50",
  }

  return (
    <Alert className={cn(statusClasses[status], className)}>
      <div className="flex items-center gap-2">
        {icon}
        <AlertDescription className="text-sm">{children}</AlertDescription>
      </div>
    </Alert>
  )
}

