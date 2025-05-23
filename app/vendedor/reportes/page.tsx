"use client"

import React from "react"

import { useState, useEffect, useCallback, useMemo } from "react"
import { useRouter } from "next/navigation"
import { Input } from "@/components/ui/input"
import { Clock, Ticket, ChevronRight, Search } from "lucide-react"
import { Card } from "@/components/ui/card"
import { ErrorBoundary } from "@/components/ui/error-boundary"
import { debounce } from "@/lib/performance-utils"

// Importar los componentes y utilidades refactorizados
import { PageHeader } from "@/components/ui/page-header"
import { StatsCard } from "@/components/ui/stats-card"
import { getNumberStyle } from "@/lib/prize-utils"
import { PRICE_PER_TIME } from "@/lib/constants"
import { supabase } from "@/lib/supabase"

interface Draw {
  id: string
  name: string
  date: string
  endTime: string
  totalTickets: number
  status: string
  awardedNumbers?: {
    firstPrize: string
    secondPrize: string
    thirdPrize: string
    awardedAt?: string
  }
}

interface TicketData {
  number: string
  timesSold: number
}

// Componente memoizado para mostrar un número
const NumberCell = React.memo(
  ({
    number,
    timesSold,
    style,
  }: {
    number: string
    timesSold: number
    style: React.CSSProperties
  }) => {
    return (
      <div
        className={`flex justify-between items-center p-3 rounded-lg ${timesSold > 0 ? "bg-white/10" : "bg-white/5"}`}
      >
        <span className="text-lg font-medium" style={style}>
          {number}
        </span>
        <span className={`${timesSold > 0 ? "text-[#4ECDC4]" : "text-gray-500"}`}>{timesSold}</span>
      </div>
    )
  },
)
NumberCell.displayName = "NumberCell"

export default function ReportesPage() {
  const router = useRouter()
  const [selectedDate, setSelectedDate] = useState("")
  const [closedDraws, setClosedDraws] = useState<Draw[]>([])
  const [selectedDraw, setSelectedDraw] = useState<Draw | null>(null)
  const [ticketData, setTicketData] = useState<TicketData[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [isResetting, setIsResetting] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  // Debounce search query to avoid excessive filtering
  const debouncedSetSearchQuery = useCallback(
    debounce((value: string) => {
      setSearchQuery(value)
    }, 300),
    [],
  )

  // Función para refrescar la página y recargar los datos
  const handleRefresh = useCallback(() => {
    setIsResetting(true)
    // Limpiar todos los filtros
    setSelectedDate("")
    setSearchQuery("")
    setSelectedDraw(null)
    setTicketData([])
    setClosedDraws([])

    // Efecto visual de reset
    setTimeout(() => {
      setIsResetting(false)
    }, 500)
  }, [])

  // Función para limpiar la pantalla (ahora handleRefresh y handleReset hacen lo mismo)
  const handleReset = handleRefresh

  // Agregar redirección similar en la página de reportes
  const loadClosedDraws = useCallback(
    (date: string) => {
      setIsLoading(true)
      try {
        const events = JSON.parse(localStorage.getItem("events") || "[]")
        const closed = events.filter((event: any) => {
          const eventDate = new Date(event.endDate)
          const searchDate = new Date(date)
          return (
            eventDate.toDateString() === searchDate.toDateString() &&
            (!event.active || new Date(event.endDate + " " + event.endTime) < new Date())
          )
        })

        // Obtener el email del vendedor actual
        const currentVendorEmail = localStorage.getItem("currentVendorEmail")
        if (!currentVendorEmail) {
          console.error("No se encontró email de vendedor actual")
          setIsLoading(false)

          // Redirigir a la página de inicio de sesión
          router.push("/")
          return
        }

        // Procesar eventos en lotes para mejorar el rendimiento
        const formattedDraws: Draw[] = []
        const batchSize = 10

        for (let i = 0; i < closed.length; i += batchSize) {
          const batch = closed.slice(i, i + batchSize)

          for (const event of batch) {
            // Obtener tickets directamente de Supabase
            supabase
              .from("tickets")
              .select("*")
              .eq("event_id", event.id)
              .eq("vendor_email", currentVendorEmail)
              .then(({ data: vendorTickets, error }) => {
                if (error) {
                  console.error("Error fetching tickets for event:", error)
                  return
                }

                formattedDraws.push({
                  id: event.id,
                  name: event.name,
                  date: event.endDate,
                  endTime: event.endTime,
                  totalTickets: vendorTickets?.length || 0,
                  status: "closed",
                  awardedNumbers: event.awardedNumbers,
                })

                // Actualizar el estado cuando se completa el último lote
                if (formattedDraws.length === closed.length) {
                  setClosedDraws(formattedDraws)
                }
              })
          }
        }

        // Si no hay eventos cerrados, establecer un array vacío
        if (closed.length === 0) {
          setClosedDraws([])
        }
      } catch (error) {
        console.error("Error loading closed draws:", error)
        setClosedDraws([])
      } finally {
        setIsLoading(false)
      }
    },
    [router],
  )

  // Efecto para cargar los sorteos cerrados cuando se selecciona una fecha
  useEffect(() => {
    if (selectedDate) {
      loadClosedDraws(selectedDate)
    } else {
      setClosedDraws([])
    }
  }, [selectedDate, loadClosedDraws])

  // Modificar el useEffect para cargar datos de tickets directamente de Supabase
  useEffect(() => {
    if (selectedDraw) {
      setIsLoading(true)
      try {
        // Obtener el email del vendedor actual
        const currentVendorEmail = localStorage.getItem("currentVendorEmail")
        if (!currentVendorEmail) {
          console.error("No se encontró email de vendedor actual")
          setIsLoading(false)
          return
        }

        // Obtener tickets directamente de Supabase
        supabase
          .from("tickets")
          .select("*")
          .eq("event_id", selectedDraw.id)
          .eq("vendor_email", currentVendorEmail)
          .then(({ data: tickets, error }) => {
            if (error) {
              console.error("Error fetching tickets:", error)
              setTicketData([])
              setIsLoading(false)
              return
            }

            // Crear un array de 100 números (00-99) con tiempos inicializados en 0
            const numberCounts: { [key: string]: number } = {}
            for (let i = 0; i < 100; i++) {
              const number = i.toString().padStart(2, "0")
              numberCounts[number] = 0
            }

            // Procesar tickets
            tickets.forEach((ticket) => {
              const ticketRows = Array.isArray(ticket.rows) ? ticket.rows : JSON.parse(String(ticket.rows || "[]"))
              ticketRows.forEach((row: any) => {
                if (row.actions) {
                  const number = row.actions.toString().padStart(2, "0")
                  const times = Number.parseInt(row.times) || 0
                  numberCounts[number] = (numberCounts[number] || 0) + times
                }
              })
            })

            // Convertir a array y ordenar
            const sortedData = Object.entries(numberCounts)
              .map(([number, times]) => ({
                number,
                timesSold: times,
              }))
              .sort((a, b) => Number.parseInt(a.number) - Number.parseInt(b.number))

            setTicketData(sortedData)
            setIsLoading(false)
          })
      } catch (error) {
        console.error("Error loading ticket data:", error)
        setTicketData([])
        setIsLoading(false)
      }
    }
  }, [selectedDraw])

  // Memoizar los números filtrados
  const filteredTicketData = useMemo(() => {
    return ticketData.filter((data) => data.number.includes(searchQuery))
  }, [ticketData, searchQuery])

  // Calcular totales
  const totalTimesSold = useMemo(() => {
    return filteredTicketData.reduce((sum, data) => sum + data.timesSold, 0)
  }, [filteredTicketData])

  const totalAmount = useMemo(() => {
    return totalTimesSold * PRICE_PER_TIME
  }, [totalTimesSold])

  // Organizar números en columnas (00-24, 25-49, 50-74, 75-99)
  const numberColumns = useMemo(
    () => [
      filteredTicketData.slice(0, 25), // 00-24
      filteredTicketData.slice(25, 50), // 25-49
      filteredTicketData.slice(50, 75), // 50-74
      filteredTicketData.slice(75, 100), // 75-99
    ],
    [filteredTicketData],
  )

  // Calcular totales por columna
  const columnTotals = useMemo(() => {
    return numberColumns.map((column) => column.reduce((sum, data) => sum + data.timesSold, 0))
  }, [numberColumns])

  // Memoizar la función getReportNumberStyle
  const getReportNumberStyle = useCallback(
    (number: string): React.CSSProperties => {
      return getNumberStyle(number, selectedDraw?.awardedNumbers)
    },
    [selectedDraw?.awardedNumbers],
  )

  // Mostrar un indicador de carga durante la carga
  if (isLoading) {
    return (
      <div className="min-h-screen bg-black text-white">
        <PageHeader
          title="Reporte General"
          backUrl="/vendedor/dashboard"
          onRefresh={handleRefresh}
          isRefreshing={isResetting}
        />
        <div className="flex items-center justify-center h-[80vh]">
          <div className="flex flex-col items-center">
            <div className="w-12 h-12 border-4 border-t-[#4ECDC4] border-r-transparent border-b-transparent border-l-transparent rounded-full animate-spin mb-4"></div>
            <p>Cargando datos...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <PageHeader
        title="Reporte General"
        backUrl="/vendedor/dashboard"
        onRefresh={handleRefresh}
        isRefreshing={isResetting}
      />

      <div className="p-4 space-y-6">
        <ErrorBoundary>
          {/* Date Selection */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-400">Fecha del sorteo</label>
            <Input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full bg-white/10 border-0 text-white"
            />
          </div>

          {/* Closed Draws List */}
          {selectedDate && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-400">Sorteos cerrados</label>
              <div className="space-y-2">
                {closedDraws.map((draw) => (
                  <Card
                    key={draw.id}
                    className={`bg-white/5 border-0 p-4 rounded-xl cursor-pointer transition-colors ${
                      selectedDraw?.id === draw.id
                        ? "bg-gradient-to-r from-[#FF6B6B]/20 to-[#4ECDC4]/20"
                        : "hover:bg-white/10"
                    }`}
                    onClick={() => setSelectedDraw(draw)}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-medium text-[#4ECDC4]">{draw.name}</h3>
                        <div className="flex items-center space-x-4 text-sm text-gray-400">
                          <span className="flex items-center">
                            <Clock className="h-4 w-4 mr-1" />
                            {draw.endTime}
                          </span>
                          <span className="flex items-center">
                            <Ticket className="h-4 w-4 mr-1" />
                            {draw.totalTickets} tickets
                          </span>
                        </div>
                      </div>
                      <ChevronRight className="h-5 w-5 text-gray-400" />
                    </div>
                  </Card>
                ))}
                {closedDraws.length === 0 && (
                  <div className="text-center text-gray-400 py-8">No hay sorteos cerrados para esta fecha</div>
                )}
              </div>
            </div>
          )}

          {/* Selected Draw Details */}
          {selectedDraw && (
            <div className="space-y-6">
              {/* Números premiados */}
              {selectedDraw.awardedNumbers && (
                <div className="bg-white/5 rounded-xl p-4">
                  <h3 className="text-sm font-medium text-gray-400 mb-2">Números Premiados</h3>
                  <div className="flex items-center space-x-4 justify-center">
                    <div className="flex items-center space-x-2">
                      <span className="text-[#FFD700] font-bold text-lg">{selectedDraw.awardedNumbers.firstPrize}</span>
                      <span className="text-xs text-gray-400">(×11)</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="text-[#9333EA] font-bold text-lg">
                        {selectedDraw.awardedNumbers.secondPrize}
                      </span>
                      <span className="text-xs text-gray-400">(×3)</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="text-[#FF6B6B] font-bold text-lg">{selectedDraw.awardedNumbers.thirdPrize}</span>
                      <span className="text-xs text-gray-400">(×2)</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Search Numbers */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
                <Input
                  type="text"
                  placeholder="Buscar número..."
                  value={searchQuery}
                  onChange={(e) => debouncedSetSearchQuery(e.target.value)}
                  className="pl-10 bg-white/10 border-0 text-white"
                />
              </div>

              {/* Summary Cards */}
              <div className="grid grid-cols-2 gap-4">
                <StatsCard value={totalTimesSold} label="Total tiempos vendidos" />
                <StatsCard value={`$${totalAmount.toFixed(2)}`} label="Total vendido" />
              </div>

              {/* Numbers Table */}
              <div className="bg-white/5 rounded-xl p-4">
                <h3 className="text-lg font-medium mb-4">Detalle de números</h3>
                <div className="grid grid-cols-4 gap-4">
                  {numberColumns.map((column, columnIndex) => (
                    <div key={columnIndex} className="space-y-2">
                      {column.map((data) => (
                        <NumberCell
                          key={data.number}
                          number={data.number}
                          timesSold={data.timesSold}
                          style={getReportNumberStyle(data.number)}
                        />
                      ))}
                      <div className="mt-4 p-3 bg-gradient-to-r from-[#FF6B6B] to-[#4ECDC4] rounded-lg">
                        <span className="text-lg font-bold text-white">{columnTotals[columnIndex]}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </ErrorBoundary>
      </div>
    </div>
  )
}

