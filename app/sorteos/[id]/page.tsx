"use client"

// Eliminar la importación de tipo React que causa el error
import { useState, useEffect, useCallback, useRef } from "react"
import { AlertCircle } from "lucide-react"
import { useRouter } from "next/navigation"
import { createTicket, deleteTicket, getTickets, updateTicket } from "@/lib/tickets"
import { NumberLimitsDisplay } from "@/components/ui/number-limits-display"
import { getNumberStyle } from "@/lib/prize-utils"
import { SkipLink } from "@/components/ui/skip-link"
import { LiveRegion } from "@/components/ui/live-region"
import { generateUUID } from "@/lib/uuid-utils" // Importar la función de generación de UUID

// Importar los componentes reutilizables
import { PageHeader } from "@/components/ui/page-header"
import { SearchFilter } from "@/components/ui/search-filter"
import { StatusAlert } from "@/components/ui/status-alert"
import { GradientHeader } from "@/components/ui/gradient-header"
import { PageContainer } from "@/components/ui/page-container"
import { InfoCard } from "@/components/ui/info-card"
import { FloatingButton } from "@/components/ui/floating-button"
import TicketDialog from "@/components/ui/ticket-dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { SyncStatusIndicator } from "@/components/ui/sync-status-indicator"
import { migrateTicketsWithoutVendor } from "@/lib/tickets"

// Mantener las interfaces existentes
interface TicketRow {
  id: string
  times: string
  actions: string
  value: number
}

interface Ticket {
  id: string
  clientName: string
  amount: number
  numbers: string
  rows: TicketRow[]
  vendorEmail?: string
}

interface Event {
  id: string
  name: string
  startDateTime: string
  endDateTime: string
  totalSold: number
  sellerTimes: number
  tickets: Ticket[]
  status: string
  prize: number
  awardedNumbers?: {
    firstPrize: string
    secondPrize: string
    thirdPrize: string
    awardedAt: string
  }
}

export default function EventDetailsPage({ params }: { params: { id: string } | Promise<{ id: string }> }) {
  // Acceder a params.id de manera segura
  const eventId = typeof params === "object" && !("then" in params) ? params.id : undefined

  // Mantener todos los estados y lógica existentes
  const router = useRouter()
  const [event, setEvent] = useState<Event | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [isCreateTicketOpen, setIsCreateTicketOpen] = useState(false)
  const [clientName, setClientName] = useState("")
  const [ticketRows, setTicketRows] = useState<TicketRow[]>([{ id: "1", times: "", actions: "", value: 0 }])
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [startDate, setStartDate] = useState<Date | null>(null)
  const [isResetting, setIsResetting] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string | { status: "success" | "warning" | "error" | "info", text: string }>("")
  const [isLoading, setIsLoading] = useState(true)
  const [resolvedEventId, setResolvedEventId] = useState<string | undefined>(eventId)
  const [showStatusMessage, setShowStatusMessage] = useState(false)
  const [ticketError, setTicketError] = useState<{
    message: string;
    status: "warning" | "error" | "info";
    numberInfo?: { number: string; remaining: number; requested: number };
  } | null>(null)
  // Bandera para controlar si se está realizando una operación crítica (crear/editar ticket)
  const [isProcessingTicket, setIsProcessingTicket] = useState(false)

  // Efecto para resolver el ID del evento si es una promesa
  useEffect(() => {
    if (eventId) {
      setResolvedEventId(eventId)
    } else if (params && typeof params === "object" && "then" in params) {
      // Si params es una promesa, resolverla
      const resolveParams = async () => {
        try {
          const resolvedParams = await params
          setResolvedEventId(resolvedParams.id)
        } catch (error) {
          console.error("Error resolving params:", error)
          router.push("/sorteos")
        }
      }
      resolveParams()
    }
  }, [params, eventId, router])

  // Calculate totals
  const totalTimes = ticketRows.reduce((sum, row) => sum + (Number(row.times) || 0), 0)
  const pricePerTime = 0.2
  const totalPurchase = totalTimes * pricePerTime

  // Mantener todas las funciones existentes
  const isDrawClosed = useCallback((event: Event | null) => {
    if (!event) return false
    const endDateTime = new Date(event.endDateTime)
    const now = new Date()
    return now > endDateTime || event.status === "closed"
  }, [])

  const calculateTotalPrizeMemoized = useCallback((event: Event | null) => {
    // Mantener la implementación existente
    if (!event || !event.awardedNumbers) return 0

    const { firstPrize, secondPrize, thirdPrize } = event.awardedNumbers
    let firstPrizeTimes = 0,
      secondPrizeTimes = 0,
      thirdPrizeTimes = 0

    event.tickets.forEach((ticket) => {
      ticket.rows.forEach((row) => {
        if (row.actions === firstPrize) firstPrizeTimes += Number(row.times) || 0
        else if (row.actions === secondPrize) secondPrizeTimes += Number(row.times) || 0
        else if (row.actions === thirdPrize) thirdPrizeTimes += Number(row.times) || 0
      })
    })

    const primerPremio = firstPrizeTimes * 11
    const segundoPremio = secondPrizeTimes * 3
    const tercerPremio = thirdPrizeTimes * 2

    return primerPremio + segundoPremio + tercerPremio
  }, [])

  // Mantener todas las demás funciones y efectos
  const handleRefresh = () => fetchEvent()

  const handleReset = () => {
    setIsResetting(true)
    setSearchQuery("")
    setStartDate(null)
    setTimeout(() => setIsResetting(false), 500)
  }

  // Referencia para el controlador de cancelación
  const abortControllerRef = useRef<AbortController | null>(null);

  // En la función fetchEvent, modificar cómo se obtienen los tickets
  const fetchEvent = useCallback(async () => {
    // No actualizar si el modal de creación de tickets está abierto o se está procesando un ticket
    if (!resolvedEventId || isCreateTicketOpen || isProcessingTicket) return

    // Cancelar cualquier solicitud pendiente anterior
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    
    // Crear un nuevo controlador para esta solicitud
    abortControllerRef.current = new AbortController()
    const signal = abortControllerRef.current.signal

    setIsLoading(true)
    setStatusMessage("Cargando datos del sorteo...")

    // Obtener el email del vendedor actual
    const currentVendorEmail = localStorage.getItem("currentVendorEmail")
    if (!currentVendorEmail) {
      setStatusMessage("Error: No se encontró email de vendedor actual")
      setShowStatusMessage(true)
      return
    }

    try {
      // Verificar si la operación ya fue cancelada
      if (signal.aborted) {
        console.log("Operación fetchEvent cancelada antes de iniciar")
        return
      }

      // Obtener tickets usando la función actualizada con señal de cancelación
      const tickets = await getTickets(resolvedEventId, signal)

      // Verificar nuevamente si la operación fue cancelada después de obtener tickets
      if (signal.aborted) {
        console.log("Operación fetchEvent cancelada después de obtener tickets")
        return
      }

      const storedEvents = localStorage.getItem("events")
      if (storedEvents) {
        const events = JSON.parse(storedEvents)
        const currentEvent = events.find((e: any) => e.id === resolvedEventId)
        if (currentEvent) {
          const endDateTime = new Date(`${currentEvent.endDate} ${currentEvent.endTime}`)
          const now = new Date()
          const isClosed = now > endDateTime || !currentEvent.active

          const totalSellerTimes = tickets.reduce(
            (sum, ticket) => sum + (ticket.rows || []).reduce((rowSum, row) => rowSum + (Number(row.times) || 0), 0),
            0,
          )

          const totalSold = tickets.reduce((sum, ticket) => sum + ticket.amount, 0)

          // Verificar nuevamente si la operación fue cancelada
          if (signal.aborted) {
            console.log("Operación fetchEvent cancelada durante el procesamiento")
            return
          }

          const eventObj: Event = {
            id: currentEvent.id,
            name: currentEvent.name,
            startDateTime: `${currentEvent.startDate} ${currentEvent.startTime}`,
            endDateTime: `${currentEvent.endDate} ${currentEvent.endTime}`,
            totalSold,
            sellerTimes: totalSellerTimes,
            tickets: tickets.map(ticket => ({
              ...ticket,
              numbers: ticket.numbers || '' // Ensure numbers is always a string
            })),
            status: isClosed ? "closed" : "active",
            prize: 0,
            awardedNumbers: currentEvent.awardedNumbers,
          }

          eventObj.prize = calculateTotalPrizeMemoized(eventObj)
          
          // Solo actualizar el estado si la operación no fue cancelada
          if (!signal.aborted) {
            setEvent(eventObj)
            setStatusMessage(`Sorteo ${currentEvent.name} cargado con ${tickets.length} tickets`)
          }
        }
      }
    } catch (error) {
      // No reportar errores si la operación fue cancelada intencionalmente
      if (error instanceof DOMException && error.name === 'AbortError') {
        console.log("Operación fetchEvent abortada controladamente")
        return
      }
      console.error("Error in fetchEvent:", error)
      if (!signal.aborted) {
        setStatusMessage("Error al cargar los datos del sorteo")
      }
    } finally {
      // Solo actualizar el estado si la operación no fue cancelada
      if (!signal.aborted) {
        setIsLoading(false)
      }
    }
  }, [calculateTotalPrizeMemoized, resolvedEventId, router])

  useEffect(() => {
    if (resolvedEventId) {
      fetchEvent()
      
      // Usar un intervalo más largo (180000 ms = 3 minutos) para reducir la frecuencia de actualizaciones
      // y solo actualizar cuando no hay operaciones críticas en curso
      const interval = setInterval(() => {
        // Solo ejecutar fetchEvent si no hay operaciones críticas en curso
        if (!isCreateTicketOpen && !isProcessingTicket) {
          fetchEvent()
        }
      }, 180000)
      
      // Función de limpieza que se ejecuta cuando el componente se desmonta
      return () => {
        clearInterval(interval)
        
        // Cancelar cualquier solicitud pendiente para evitar actualizaciones de estado en componentes desmontados
        if (abortControllerRef.current) {
          abortControllerRef.current.abort()
        }
      }
    }
  }, [fetchEvent, resolvedEventId, isCreateTicketOpen, isProcessingTicket])

  // Efecto para migrar tickets sin vendedor
  useEffect(() => {
    if (resolvedEventId) {
      migrateTicketsWithoutVendor(resolvedEventId)
        .then((success) => {
          if (success) {
            console.log("Tickets sin vendedor migrados correctamente")
          }
        })
        .catch((error) => {
          console.error("Error migrando tickets sin vendedor:", error)
        })
    }
  }, [resolvedEventId])
  
  // Efecto para ocultar el mensaje de estado después de un tiempo
  useEffect(() => {
    if (showStatusMessage) {
      // Solo ocultar automáticamente los mensajes de éxito, no los de error o advertencia
      if (typeof statusMessage === 'object' && (statusMessage.status === 'warning' || statusMessage.status === 'error')) {
        // No ocultar automáticamente los mensajes de error o advertencia
        return;
      }
      
      const timer = setTimeout(() => {
        setShowStatusMessage(false);
      }, 5000); // Ocultar después de 5 segundos
      
      return () => clearTimeout(timer);
    }
  }, [showStatusMessage, statusMessage]);

  // Mantener las demás funciones
  const handleInputChange = (rowId: string, field: "times" | "actions", value: string) => {
    // Mantener la implementación existente
    if (field === "actions") {
      const numValue = Number.parseInt(value, 10)
      if (isNaN(numValue) || numValue < 0 || numValue > 99) return
    }

    setTicketRows((rows) =>
      rows.map((row) => {
        if (row.id === rowId) {
          return {
            ...row,
            [field]: value,
            value: field === "times" ? Number(value) * 0.2 : row.value,
          }
        }
        return row
      }),
    )
  }

  const handleEditTicket = (ticket: Ticket) => {
    // Mantener la implementación existente
    setSelectedTicket(ticket)
    setClientName(ticket.clientName)
    setTicketRows(ticket.rows)
    setIsCreateTicketOpen(true)
    // Activar la bandera de procesamiento para evitar actualizaciones durante la edición
    setIsProcessingTicket(true)
    setStatusMessage(`Editando ticket de ${ticket.clientName}`)
  }

  const handleDeleteTicket = async () => {
    // Mantener la implementación existente
    if (!event || !selectedTicket || !resolvedEventId) return

    // Activar la bandera de procesamiento para evitar actualizaciones durante la eliminación
    setIsProcessingTicket(true)
    setStatusMessage("Eliminando ticket...")
    const currentVendorEmail = localStorage.getItem("currentVendorEmail")
    const canDelete = !selectedTicket.vendorEmail || selectedTicket.vendorEmail === currentVendorEmail

    if (!canDelete) {
      alert("No puedes eliminar tickets de otros vendedores")
      setStatusMessage("No se puede eliminar: el ticket pertenece a otro vendedor")
      setShowStatusMessage(true)
      setIsDeleteDialogOpen(false)
      setIsProcessingTicket(false) // Desactivar la bandera si no se puede eliminar
      return
    }

    try {
      await deleteTicket(selectedTicket.id, resolvedEventId)
      setSelectedTicket(null)
      setIsDeleteDialogOpen(false)
      setStatusMessage("Ticket eliminado correctamente")
      setShowStatusMessage(true)
      // Desactivar la bandera antes de actualizar los datos
      setIsProcessingTicket(false)
      // Actualizar datos después de completar la operación
      fetchEvent()
    } catch (error) {
      console.error("Error deleting ticket:", error)
      setStatusMessage("Error al eliminar el ticket")
      setShowStatusMessage(true)
      setIsProcessingTicket(false) // Desactivar la bandera en caso de error
      // Mantener el fallback a localStorage
    }
  }

  const handleComplete = async () => {
    // Mantener la implementación existente
    if (!event || !resolvedEventId) return
    
    // Activar la bandera de procesamiento para evitar actualizaciones durante la operación
    setIsProcessingTicket(true)
    
    // Cancelar cualquier solicitud pendiente anterior
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    
    // Crear un nuevo controlador para esta solicitud
    abortControllerRef.current = new AbortController()
    const signal = abortControllerRef.current.signal

    setStatusMessage(selectedTicket ? "Actualizando ticket..." : "Creando nuevo ticket...")
    const currentVendorEmail = localStorage.getItem("currentVendorEmail")
    if (!currentVendorEmail) {
      setStatusMessage("Error: No se encontró email de vendedor actual")
      setIsProcessingTicket(false) // Desactivar la bandera si hay error
      return
    }

    const totalTimes = ticketRows.reduce((sum, row) => sum + (Number(row.times) || 0), 0)
    const totalPurchase = totalTimes * 0.2

    const ticketData = {
      // Usar nuestra función generateUUID en lugar de crypto.randomUUID()
      id: selectedTicket ? selectedTicket.id : generateUUID(),
      clientName,
      amount: totalPurchase,
      numbers: ticketRows
        .map((row) => row.actions)
        .filter(Boolean)
        .join(", "),
      rows: ticketRows,
      vendorEmail: currentVendorEmail, // Asegurar que siempre tenga vendorEmail
    }

    try {
      let result;
      
      if (selectedTicket) {
        // Si estamos actualizando un ticket existente, usar updateTicket
        result = await updateTicket(ticketData as Ticket, resolvedEventId, signal);
      } else {
        // Si estamos creando un nuevo ticket, usar createTicket
        result = await createTicket(ticketData, resolvedEventId, signal);
      }
      
      // Verificar si el resultado es un objeto de error (para createTicket y updateTicket)
      if (result && 'success' in result && result.success === false) {
        // Guardar el error en el estado para mostrarlo en el modal
        setTicketError({
          message: result.message,
          status: result.status as "warning" | "error" | "info",
          numberInfo: result.numberInfo
        })
        // No cerrar el diálogo cuando hay un error de límites de números
        return
      }
      
      // Limpiar cualquier error previo
      setTicketError(null)
      
      if (selectedTicket) {
        setStatusMessage({
          status: "success",
          text: "Ticket actualizado correctamente"
        })
      } else {
        setStatusMessage({
          status: "success",
          text: "Ticket creado correctamente"
        })
      }
      setShowStatusMessage(true)

      // Desactivar la bandera de procesamiento antes de cerrar el modal
      setIsProcessingTicket(false)
      
      // Actualizar datos después de completar la operación
      fetchEvent()
      setClientName("")
      setTicketRows([{ id: "1", times: "", actions: "", value: 0 }])
      setSelectedTicket(null)
      setIsCreateTicketOpen(false)
    } catch (error) {
      console.error("Error saving ticket:", error)
      setStatusMessage({
        status: "error",
        text: `Error al guardar el ticket: ${error instanceof Error ? error.message : "Error desconocido"}`
      })
      setShowStatusMessage(true)
      // Desactivar la bandera de procesamiento en caso de error
      setIsProcessingTicket(false)
      // No cerrar el diálogo cuando hay un error
    }
  }

  const addNewRow = () => {
    const newRowId = String(Date.now())
    setTicketRows((prevRows) => [...prevRows, { id: newRowId, times: "", actions: "", value: 0 }])
  }

  const removeRow = (rowId: string) => {
    setTicketRows((prevRows) => prevRows.filter((row) => row.id !== rowId))
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="flex flex-col items-center">
          <div
            className="w-12 h-12 border-4 border-t-[#4ECDC4] border-r-transparent border-b-transparent border-l-transparent rounded-full animate-spin mb-4"
            role="status"
            aria-label="Cargando"
          ></div>
          <p>Cargando datos del sorteo...</p>
        </div>
      </div>
    )
  }

  if (!event) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div
          className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 max-w-md mx-auto"
          role="alert"
          aria-live="assertive"
        >
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle className="h-5 w-5 text-red-500" aria-hidden="true" />
            <h3 className="text-lg font-semibold">Error al cargar el sorteo</h3>
          </div>
          <p className="text-sm text-gray-300 mb-4">
            No se pudo cargar la información del sorteo. Por favor, intenta de nuevo.
          </p>
          <Button onClick={() => router.push("/sorteos")} className="w-full">
            Volver a sorteos
          </Button>
        </div>
      </div>
    )
  }

  const filteredTickets = event.tickets.filter((ticket) => {
    const matchesSearch =
      ticket.clientName.toLowerCase().includes(searchQuery.toLowerCase()) || ticket.numbers.includes(searchQuery)

    if (!startDate) return matchesSearch

    const ticketDate = new Date(event.startDateTime)
    const filterDate = startDate

    return (
      matchesSearch &&
      ticketDate.getDate() === filterDate.getDate() &&
      ticketDate.getMonth() === filterDate.getMonth() &&
      ticketDate.getFullYear() === filterDate.getFullYear() &&
      (!filterDate || ticketDate.getHours() === filterDate.getHours())
    )
  })

  // Usar la función importada getNumberStyle
  const getTicketNumberStyle = (number: string): React.CSSProperties => {
    return getNumberStyle(number, event?.awardedNumbers)
  }

  return (
    <>
      <SkipLink />
      <LiveRegion role="status">
        {typeof statusMessage === 'string' 
          ? statusMessage 
          : statusMessage.text ? statusMessage.text : ''}
      </LiveRegion>

      <div className="min-h-screen bg-black text-white">
        {/* Header */}
        <PageHeader
          title="Detalles del Sorteo"
          backUrl="/sorteos"
          onRefresh={handleReset}
          isRefreshing={isResetting}
          rightContent={<SyncStatusIndicator />}
        />

        {/* Search Bar */}
        <SearchFilter
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onFilterClick={() => setIsFilterOpen(true)}
        />

        {/* Alerta de sorteo cerrado */}
        {isDrawClosed(event) && (
          <PageContainer maxWidth="md">
            <StatusAlert
              status="error"
              icon={<AlertCircle className="h-4 w-4" aria-hidden="true" />}
              className="mt-4 mb-2"
            >
              Este sorteo está cerrado. Solo puedes ver la información de los tickets vendidos.
            </StatusAlert>
          </PageContainer>
        )}
        
        {/* Mensaje de estado para límites de números */}
        {showStatusMessage && (
          <PageContainer maxWidth="md">
            <StatusAlert
              status={typeof statusMessage === 'object' ? statusMessage.status : 'info'}
              icon={<AlertCircle className="h-4 w-4" aria-hidden="true" />}
              className="mt-4 mb-2"
            >
              {typeof statusMessage === 'object' ? statusMessage.text : statusMessage}
            </StatusAlert>
          </PageContainer>
        )}

        {/* Event Name Banner */}
        <GradientHeader>{event.name}</GradientHeader>

        {/* Event Details */}
        <main id="main-content" className="p-4 pb-20 bg-gray-900/50" tabIndex={-1}>
          <div className="flex justify-between items-center mb-4">
            <div>
              <h3 className="text-sm font-medium text-gray-400">Inicio</h3>
              <p className="text-lg">{event.startDateTime}</p>
            </div>
            <div className="text-right">
              <h3 className="text-sm font-medium text-gray-400">Finalización</h3>
              <p className="text-lg">{event.endDateTime}</p>
            </div>
          </div>

          <PageContainer maxWidth="md">
            {/* Mostrar límites de números */}
            {resolvedEventId && <NumberLimitsDisplay eventId={resolvedEventId} />}
            
            {/* Stats Grid */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              <InfoCard>
                <div className="text-xl font-bold text-[#4ECDC4]" aria-label="Total vendido">
                  ${event.totalSold.toFixed(2)}
                </div>
                <div className="text-sm text-gray-400">Total vendido</div>
              </InfoCard>
              <InfoCard>
                <div className="text-xl font-bold text-[#4ECDC4]" aria-label="Tiempos del vendedor">
                  {event.sellerTimes}
                </div>
                <div className="text-sm text-gray-400">Tiempos del vendedor</div>
              </InfoCard>
              <InfoCard>
                <div className="text-xl font-bold text-[#4ECDC4]" aria-label="Ganancias">
                  ${(event.totalSold - event.prize).toFixed(2)}
                </div>
                <div className="text-sm text-gray-400">Ganancias</div>
              </InfoCard>
              <InfoCard>
                <div className="text-xl font-bold text-[#4ECDC4]" aria-label="Premio">
                  ${event.prize.toFixed(2)}
                </div>
                <div className="text-sm text-gray-400">Premio</div>
              </InfoCard>
            </div>

            {/* Tickets Section */}
            <div className="space-y-4 mb-20">
              <div className="flex justify-between items-center">
                <h3 className="text-xl font-bold">Tickets</h3>
                <div aria-live="polite" aria-atomic="true">
                  {filteredTickets.length > 0 && (
                    <span className="text-sm text-gray-400">
                      {filteredTickets.length} {filteredTickets.length === 1 ? "ticket" : "tickets"}
                    </span>
                  )}
                </div>
              </div>

              {filteredTickets.map((ticket) => (
                <InfoCard
                  key={ticket.id}
                  onClick={() => handleEditTicket(ticket)}
                  hover={true}
                  className="py-2 sm:py-4" // Reducir el padding vertical solo en móviles
                >
                  <div className="flex flex-row justify-between items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <h4 className="text-base font-semibold text-[#4ECDC4] truncate">{ticket.clientName}</h4>
                      <div className="text-sm sm:text-base font-bold text-[#4ECDC4]">${ticket.amount.toFixed(2)}</div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-xs text-gray-400">Números</div>
                      <div className="text-sm sm:text-base font-bold text-[#4ECDC4]">{ticket.numbers}</div>
                    </div>
                  </div>
                </InfoCard>
              ))}

              {filteredTickets.length === 0 && (
                <div className="text-center text-gray-400 py-8" aria-live="polite">
                  No hay tickets que coincidan con los filtros
                </div>
              )}
            </div>
          </PageContainer>
        </main>

        {/* Bottom Navigation Bar - Solo mostrar si el sorteo NO está cerrado */}
        {!isDrawClosed(event) && (
          <FloatingButton
            onClick={() => {
              setSelectedTicket(null)
              setClientName("")
              setTicketRows([{ id: "1", times: "", actions: "", value: 0 }])
              // Abrir directamente el diálogo sin mostrar pantalla de carga
              setIsCreateTicketOpen(true)
              // Asegurar que no se muestre la pantalla de carga
              setIsLoading(false)
            }}
            aria-label="Crear nuevo ticket"
          >
            Crear nuevo ticket 🎟️
          </FloatingButton>
        )}

        {/* Add padding to prevent content from being hidden behind the navigation bar */}
        <div className="pb-20" aria-hidden="true" />

        {/* Ticket Dialog */}
        <TicketDialog
          open={isCreateTicketOpen}
          onOpenChange={(open) => {
            setIsCreateTicketOpen(open);
            if (!open) {
              // Limpiar errores cuando se cierra el modal
              setTicketError(null);
            }
          }}
          clientName={clientName}
          onClientNameChange={setClientName}
          ticketRows={ticketRows}
          onInputChange={handleInputChange}
          onAddRow={addNewRow}
          onRemoveRow={removeRow}
          onComplete={async () => {
            // Evitar duplicación de tickets usando un flag
            if (window._isProcessingTicket) {
              console.log('Ya hay un proceso de creación de ticket en curso, evitando duplicación')
              return
            }
            
            // Establecer una variable local para evitar múltiples clics
            const submitButton = document.activeElement;
            if (submitButton) {
              (submitButton as HTMLElement).setAttribute('disabled', 'true');
            }
            
            try {
              window._isProcessingTicket = true
              await handleComplete()
              // Cerrar explícitamente el diálogo después de completar
              setIsCreateTicketOpen(false)
            } finally {
              // Asegurar que el flag se restablezca incluso si hay errores
              setTimeout(() => {
                window._isProcessingTicket = false
                // Restaurar el botón
                if (submitButton) {
                  (submitButton as HTMLElement).removeAttribute('disabled');
                }
              }, 1000) // Esperar 1 segundo antes de permitir otra operación
            }
          }}
          onDelete={
            selectedTicket
              ? () => {
                  setIsCreateTicketOpen(false)
                  setIsDeleteDialogOpen(true)
                }
              : undefined
          }
          isReadOnly={isDrawClosed(event)}
          title={isDrawClosed(event) ? "Detalles del ticket" : selectedTicket ? "Editar ticket" : "Nuevo ticket"}
          selectedTicket={selectedTicket}
          errorMessage={ticketError?.message}
          errorStatus={ticketError?.status}
          numberInfo={ticketError?.numberInfo}
        />

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={isDeleteDialogOpen && !isDrawClosed(event)} onOpenChange={setIsDeleteDialogOpen}>
          <AlertDialogContent className="bg-black/95 text-white border-gray-800">
            <AlertDialogHeader>
              <AlertDialogTitle>¿Eliminar ticket?</AlertDialogTitle>
              <AlertDialogDescription>
                Esta acción no se puede deshacer. El ticket será eliminado permanentemente.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel
                onClick={() => {
                  setIsDeleteDialogOpen(false)
                  setIsCreateTicketOpen(true)
                }}
                className="bg-gray-700 hover:bg-gray-600"
              >
                Cancelar
              </AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteTicket} className="bg-red-500 hover:bg-red-600">
                Eliminar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Filter Dialog */}
        <Dialog open={isFilterOpen} onOpenChange={setIsFilterOpen}>
          <DialogContent className="bg-black/95 text-white border-gray-800">
            <DialogHeader>
              <DialogTitle>Filtrar tickets</DialogTitle>
              <DialogDescription>Selecciona una fecha para filtrar los tickets</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label htmlFor="filter-date" className="block text-sm font-medium text-gray-400 mb-1">
                  Fecha
                </label>
                <Input
                  id="filter-date"
                  type="date"
                  value={startDate ? startDate.toISOString().split("T")[0] : ""}
                  onChange={(e) => setStartDate(e.target.value ? new Date(e.target.value) : null)}
                  className="bg-white/10 border-0 text-white"
                  aria-label="Filtrar por fecha"
                />
              </div>
              <Button
                onClick={() => setIsFilterOpen(false)}
                className="w-full bg-gradient-to-r from-[#FF6B6B] to-[#4ECDC4] hover:opacity-90"
              >
                Aplicar filtro
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </>
  )
}

