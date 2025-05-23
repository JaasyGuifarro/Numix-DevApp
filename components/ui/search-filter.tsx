"use client"

import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Search, Filter } from "lucide-react"

interface SearchFilterProps {
  searchQuery: string
  onSearchChange: (value: string) => void
  onFilterClick?: () => void
}

export function SearchFilter({ searchQuery, onSearchChange, onFilterClick }: SearchFilterProps) {
  return (
    <div className="px-4 pb-4 pt-2 flex gap-2">
      <div className="relative flex-1">
        <label htmlFor="search-input" className="sr-only">
          Buscar
        </label>
        <Search
          className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5"
          aria-hidden="true"
        />
        <Input
          id="search-input"
          type="text"
          placeholder="Buscar"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-10 h-12 bg-white/10 border-0 rounded-xl text-white placeholder-gray-400 w-full"
          aria-label="Buscar tickets"
        />
      </div>
      {onFilterClick && (
        <Button
          onClick={onFilterClick}
          variant="ghost"
          className="h-12 w-12 rounded-xl bg-[#FF6B6B] hover:bg-[#FF5252] transition-colors"
          aria-label="Abrir filtros"
        >
          <Filter className="h-5 w-5" aria-hidden="true" />
        </Button>
      )}
    </div>
  )
}

