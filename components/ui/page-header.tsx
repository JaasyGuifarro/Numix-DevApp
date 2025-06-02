"use client"

import { Button } from "@/components/ui/button"
import { ArrowLeft, RotateCcw } from "lucide-react"
import { useRouter } from "next/navigation"
import type { ReactNode } from "react"

interface PageHeaderProps {
  title: ReactNode
  backUrl?: string
  onRefresh?: () => void
  isRefreshing?: boolean
  rightContent?: ReactNode
}

export function PageHeader({ title, backUrl, onRefresh, isRefreshing, rightContent }: PageHeaderProps) {
  const router = useRouter()

  return (
    <header className="sticky top-0 bg-black/90 backdrop-blur-sm z-10 border-b border-white/10">
      <div className="flex items-center justify-between p-4">
        <div className="flex items-center space-x-4">
          {backUrl && (
            <Button
              variant="ghost"
              onClick={() => router.push(backUrl)}
              className="p-2 hover:bg-white/10 rounded-full"
              aria-label={`Volver a ${backUrl.replace("/", "")}`}
            >
              <ArrowLeft className="h-6 w-6" aria-hidden="true" />
            </Button>
          )}
          <h1 className="text-lg md:text-2xl font-bold">{title}</h1>
        </div>
        <div className="flex items-center gap-2">
          {onRefresh && (
            <Button
              variant="ghost"
              onClick={onRefresh}
              className={`text-[#4ECDC4] hover:text-[#3DBCB4] p-2 transition-transform ${
                isRefreshing ? "animate-spin" : ""
              }`}
              disabled={isRefreshing}
              aria-label="Refrescar"
              aria-busy={isRefreshing}
            >
              <RotateCcw className="h-5 w-5" aria-hidden="true" />
              <span className="sr-only">Refrescar</span>
            </Button>
          )}
          {rightContent}
        </div>
      </div>
    </header>
  )
}

