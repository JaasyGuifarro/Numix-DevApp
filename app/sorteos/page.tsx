"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { ChevronRight } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useRouter } from "next/navigation"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Award, AlertCircle } from "lucide-react"
import { Card } from "@/components/ui/card"
import { supabase } from "@/lib/supabase" // Corregir esta importación

// Importar el componente PageHeader
import { PageHeader } from "@/components/ui/page-header"
import { SearchFilter } from "@/components/ui/search-filter"
import { SyncStatusIndicator } from "@/components/ui/sync-status-indicator"

interface Draw {
  id: string
  name: string
  datetime: string
  status: "active" | "closed" | `closed_${"awarded" | "pending"}`
  awardedNumbers?: {
    firstPrize: string
    secondPrize: string
    thirdPrize: string
  }
}

export default function SorteosPage() {
  const router = useRouter()
  const [stateActiveDraws, setStateActiveDraws] = useState<Draw[]>([])
  const [stateClosedDraws, setStateClosedDraws] = useState<Draw[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [filterDate, setFilterDate] = useState<Date | null>(null)
  const [filterTime, setFilterTime] = useState<string>("")
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "closed">("all")
  // Add state for reset animation
  const [isResetting, setIsResetting] = useState(false)

  const handleReset = () => {
    setIsResetting(true)
    setSearchQuery("")
    setFilterDate(null)
    setFilterTime("")
    setFilterStatus("all")

    // Visual feedback for reset action
    setTimeout(() => {
      setIsResetting(false)
    }, 500)
  }

  const handleRefresh = () => {
    fetchDraws()
  }

  // Modificar fetchDraws para mejorar la carga de eventos
  const fetchDraws = useCallback(async () => {
    try {
      // Verificar primero la conexión a Supabase
      const { checkSupabaseConnection } = await import("@/lib/check-supabase")
      const connectionStatus = await checkSupabaseConnection()
      
      if (!connectionStatus.connected) {
        console.error("Error de conexión a Supabase:", connectionStatus.error)
        // Mostrar mensaje específico de error de conexión
        console.error("No se pudo conectar a Supabase. Usando datos locales.")
        fetchDrawsFromLocalStorage()
        return
      }
      
      // Intentar obtener eventos de Supabase primero
      const { data: eventsData, error } = await supabase
        .from("events")
        .select("*")
        .order("created_at", { ascending: false })

      if (error) {
        // Mejorar el registro de errores para proporcionar información más detallada
        console.error("Error fetching events from Supabase:", {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
          status: error.status
        })
        // Fallback a localStorage
        fetchDrawsFromLocalStorage()
      } else {
        console.log("Events fetched from Supabase:", eventsData)
        const currentDate = new Date()

        // Filtrar eventos activos y cerrados
        const active = eventsData.filter((draw) => {
          const drawDate = new Date(draw.end_date + " " + draw.end_time)
          return drawDate > currentDate && draw.active
        })

        const closed = eventsData.filter((draw) => {
          const drawDate = new Date(draw.end_date + " " + draw.end_time)
          return drawDate <= currentDate || !draw.active
        })

        // Mapear a formato esperado por el componente
        setStateActiveDraws(
          active.map((draw) => ({
            id: draw.id,
            name: draw.name,
            datetime: `${draw.start_date} ${draw.start_time}`,
            status: "active",
          })),
        )

        setStateClosedDraws(
          closed.map((draw) => ({
            id: draw.id,
            name: draw.name,
            datetime: `${draw.end_date} ${draw.end_time}`,
            status: draw.status || "closed_pending",
            awardedNumbers: draw.first_prize
              ? {
                  firstPrize: draw.first_prize,
                  secondPrize: draw.second_prize,
                  thirdPrize: draw.third_prize,
                }
              : undefined,
          })),
        )

        // Actualizar localStorage para mantener sincronización
        localStorage.setItem(
          "events",
          JSON.stringify(
            [...active, ...closed].map((event) => ({
              id: event.id,
              name: event.name,
              startDate: event.start_date,
              endDate: event.end_date,
              startTime: event.start_time,
              endTime: event.end_time,
              active: event.active,
              status: event.status || "active",
              awardedNumbers: event.first_prize
                ? {
                    firstPrize: event.first_prize,
                    secondPrize: event.second_prize,
                    thirdPrize: event.third_prize,
                    awardedAt: event.awarded_at,
                  }
                : undefined,
            })),
          ),
        )
      }
    } catch (error) {
      // Mejorar el registro de errores para proporcionar información más detallada
      console.error("Error in fetchDraws:", 
        error instanceof Error 
          ? { message: error.message, stack: error.stack } 
          : String(error)
      )
      // Fallback a localStorage
      fetchDrawsFromLocalStorage()
    }
  }, [])

  // Función para obtener sorteos de localStorage como fallback
  const fetchDrawsFromLocalStorage = () => {
    const storedDraws = localStorage.getItem("events")
    if (storedDraws) {
      const parsedDraws = JSON.parse(storedDraws)
      const currentDate = new Date()

      const active = parsedDraws.filter((draw) => {
        const drawDate = new Date(draw.endDate + " " + draw.endTime)
        return drawDate > currentDate && draw.active
      })

      const closed = parsedDraws.filter((draw) => {
        const drawDate = new Date(draw.endDate + " " + draw.endTime)
        return drawDate <= currentDate || !draw.active
      })

      setStateActiveDraws(
        active.map((draw) => ({
          id: draw.id,
          name: draw.name,
          datetime: `${draw.startDate} ${draw.startTime}`,
          status: "active",
        })),
      )

      setStateClosedDraws(
        closed.map((draw) => ({
          id: draw.id,
          name: draw.name,
          datetime: `${draw.endDate} ${draw.endTime}`,
          status: draw.status || "closed_pending",
          awardedNumbers: draw.awardedNumbers,
        })),
      )
    }
  }

  useEffect(() => {
    fetchDraws()
    const interval = setInterval(fetchDraws, 60000)
    return () => clearInterval(interval)
  }, [fetchDraws])

  const filteredDraws = [...stateActiveDraws, ...stateClosedDraws].filter((draw) => {
    const matchesSearch = draw.name.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesStatus =
      filterStatus === "all" ||
      (filterStatus === "active" ? draw.status === "active" : draw.status.startsWith("closed_"))

    if (!filterDate && !filterTime) return matchesSearch && matchesStatus

    const drawDate = new Date(draw.datetime)
    const searchDate = filterDate

    const matchesDate =
      !filterDate ||
      (drawDate.getDate() === filterDate.getDate() &&
        drawDate.getMonth() === filterDate.getMonth() &&
        drawDate.getFullYear() === filterDate.getFullYear())

    const matchesTime = !filterTime || draw.datetime.includes(filterTime)

    return matchesSearch && matchesStatus && matchesDate && matchesTime
  })

  const activeDraws = filteredDraws.filter((draw) => draw.status === "active")
  const closedDraws = filteredDraws.filter((draw) => draw.status.startsWith("closed_"))

  return (
    <div className="min-h-screen bg-black text-white">
      <PageHeader
        title="Sorteos"
        backUrl="/vendedor/dashboard"
        onRefresh={handleReset}
        isRefreshing={isResetting}
        rightContent={<SyncStatusIndicator />}
      />

      <SearchFilter
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onFilterClick={() => setIsFilterOpen(true)}
      />

      <div className="container mx-auto max-w-4xl px-4 sm:px-6">
        <div className="py-6">
          <h2 className="text-xl md:text-2xl font-bold mb-4">Sorteos activos</h2>
          <div className="grid gap-4">
            {activeDraws.map((draw) => (
              <Link key={draw.id} href={`/sorteos/${draw.id}`} className="block w-full">
                <Card className="bg-white/5 border-0 p-4 hover:bg-white/10 transition-colors">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                      <h3 className="text-base md:text-lg font-semibold">{draw.name}</h3>
                      <p className="text-sm text-gray-400">{draw.datetime}</p>
                    </div>
                    <ChevronRight className="h-5 w-5 text-gray-400" />
                  </div>
                </Card>
              </Link>
            ))}
            {activeDraws.length === 0 && (
              <div className="text-center text-gray-400 py-8">No hay sorteos activos que coincidan con los filtros</div>
            )}
          </div>
        </div>

        <div className="py-6">
          <h2 className="text-xl md:text-2xl font-bold mb-4">Sorteos cerrados</h2>
          <div className="grid gap-4">
            {closedDraws.map((draw) => (
              <Link key={draw.id} href={`/sorteos/${draw.id}`} className="block w-full">
                <Card className="bg-white/5 border-0 p-4 hover:bg-white/10 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="text-base md:text-lg font-semibold">{draw.name}</h3>
                        <Badge
                          className={
                            draw.status === "closed_awarded"
                              ? "bg-green-500 hover:bg-green-600"
                              : "bg-yellow-500 hover:bg-yellow-600"
                          }
                        >
                          {draw.status === "closed_awarded" ? (
                            <Award className="h-4 w-4 mr-1" />
                          ) : (
                            <AlertCircle className="h-4 w-4 mr-1" />
                          )}
                          {draw.status === "closed_awarded" ? "Premiado" : "Pendiente"}
                        </Badge>
                      </div>
                      <p className="text-sm text-gray-400">{draw.datetime}</p>
                    </div>

                    <div className="flex items-center gap-3">
                      {draw.status === "closed_awarded" && draw.awardedNumbers && (
                        <div className="flex items-center gap-2">
                          <span className="text-yellow-500 font-bold">{draw.awardedNumbers.firstPrize}</span>
                          <span className="text-[#9333EA] font-bold">{draw.awardedNumbers.secondPrize}</span>
                          <span className="text-[#FF6B6B] font-bold">{draw.awardedNumbers.thirdPrize}</span>
                        </div>
                      )}
                      <ChevronRight className="h-5 w-5 text-gray-400" />
                    </div>
                  </div>
                </Card>
              </Link>
            ))}
            {closedDraws.length === 0 && (
              <div className="text-center text-gray-400 py-8">
                No hay sorteos cerrados que coincidan con los filtros
              </div>
            )}
          </div>
        </div>
      </div>

      <Dialog open={isFilterOpen} onOpenChange={setIsFilterOpen}>
        <DialogContent className="bg-black/95 text-white border-gray-800 w-[95%] max-w-md mx-auto">
          <DialogHeader>
            <DialogTitle>Filtrar sorteos</DialogTitle>
          </DialogHeader>
          <div className="space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-400">Estado</label>
              <RadioGroup
                value={filterStatus}
                onValueChange={(value: "all" | "active" | "closed") => setFilterStatus(value)}
                className="grid grid-cols-3 gap-2"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="all" id="all" className="peer sr-only" />
                  <Label
                    htmlFor="all"
                    className="flex-1 cursor-pointer rounded-lg border border-gray-700 p-2 text-center peer-data-[state=checked]:border-primary peer-data-[state=checked]:text-primary"
                  >
                    Todos
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="active" id="active" className="peer sr-only" />
                  <Label
                    htmlFor="active"
                    className="flex-1 cursor-pointer rounded-lg border border-gray-700 p-2 text-center peer-data-[state=checked]:border-primary peer-data-[state=checked]:text-primary"
                  >
                    Activos
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="closed" id="closed" className="peer sr-only" />
                  <Label
                    htmlFor="closed"
                    className="flex-1 cursor-pointer rounded-lg border border-gray-700 p-2 text-center peer-data-[state=checked]:border-primary peer-data-[state=checked]:text-primary"
                  >
                    Cerrados
                  </Label>
                </div>
              </RadioGroup>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Fecha</label>
              <Input
                type="date"
                value={filterDate ? filterDate.toISOString().split("T")[0] : ""}
                onChange={(e) => setFilterDate(e.target.value ? new Date(e.target.value) : null)}
                className="w-full bg-white/10 border-0 text-white"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Hora</label>
              <Input
                type="time"
                value={filterTime}
                onChange={(e) => setFilterTime(e.target.value)}
                className="bg-white/10 border-0 text-white"
              />
            </div>

            <div className="flex gap-2">
              <Button onClick={handleReset} variant="secondary" className="flex-1">
                Limpiar
              </Button>
              <Button
                onClick={() => setIsFilterOpen(false)}
                className="flex-1 bg-gradient-to-r from-[#FF6B6B] to-[#4ECDC4] hover:opacity-90"
              >
                Aplicar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

