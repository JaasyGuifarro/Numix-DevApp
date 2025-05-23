"use client"

import { TableHeader } from "@/components/ui/table"
import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import {
  UserPlus,
  Clock,
  LogOut,
  Edit,
  Trash2,
  Award,
  Eye,
  EyeOff,
  Settings,
  AlertTriangle,
  Menu,
  AlertCircle,
  Hash,
} from "lucide-react"
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
import { Card } from "@/components/ui/card"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { cn } from "@/lib/utils"
import { useAuth } from "@/lib/auth-context"
// Importar funciones de Supabase
import { getVendors, createVendor, updateVendor, deleteVendor } from "@/lib/vendors"
import { getEvents, createEvent, updateEvent, deleteEvent, awardEvent, subscribeToEvents } from "@/lib/events"
import { migrateAllData } from "@/lib/migration"
// Actualizar imports de los diálogos
import { AddVendorDialog } from "@/components/dialogs/add-vendor"
import { AddEventDialog } from "@/components/dialogs/add-event"
import { EditVendorDialog } from "@/components/dialogs/edit-vendor"
import { EditEventDialog } from "@/components/dialogs/edit-event"
import { AwardEventDialog } from "@/components/dialogs/award-event"
import { SettingsDialog } from "@/components/dialogs/settings"
import { NumberLimitsDialog } from "@/components/dialogs/number-limits"
import type { Vendor, Event, ClosedDraw } from "@/types"

export default function SuperUserDashboard() {
  const router = useRouter()
  const { signOut } = useAuth()
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [events, setEvents] = useState<Event[]>([])
  const [closedDraws, setClosedDraws] = useState<ClosedDraw[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isMigrating, setIsMigrating] = useState(false)

  const [isConfigOpen, setIsConfigOpen] = useState(false)
  const [isDarkMode, setIsDarkMode] = useState(false)
  const [superUserName, setSuperUserName] = useState("Admin")
  const [superUserPassword, setSuperUserPassword] = useState("12345")
  const [showNewVendorPassword, setShowNewVendorPassword] = useState(false)

  // Cargar datos iniciales
  useEffect(() => {
    // Solo ejecutar en el cliente
    if (typeof window === "undefined") return

    const loadInitialData = async () => {
      setIsLoading(true)
      try {
        // Obtener vendedores y eventos de Supabase
        const fetchedVendors = await getVendors()
        const fetchedEvents = await getEvents()

        setVendors(fetchedVendors)
        setEvents(fetchedEvents)

        // Extraer sorteos cerrados de los eventos
        const closedEvents = fetchedEvents
          .filter((event) => event.status.startsWith("closed_"))
          .map((event) => ({
            id: event.id,
            name: event.name,
            date: event.endDate,
            endTime: event.endTime,
            firstPrize: event.awardedNumbers?.firstPrize || "",
            secondPrize: event.awardedNumbers?.secondPrize || "",
            thirdPrize: event.awardedNumbers?.thirdPrize || "",
            awardDate: event.awardedNumbers?.awardedAt || "",
          }))

        setClosedDraws(closedEvents)
      } catch (error) {
        console.error("Error loading initial data:", error)

        // Fallback a localStorage si hay error
        if (typeof window !== "undefined") {
          const storedVendors = localStorage.getItem("vendors")
          if (storedVendors) {
            setVendors(JSON.parse(storedVendors))
          }

          const storedEvents = localStorage.getItem("events")
          if (storedEvents) {
            setEvents(JSON.parse(storedEvents))
          }

          const storedClosedDraws = localStorage.getItem("closedDraws")
          if (storedClosedDraws) {
            setClosedDraws(JSON.parse(storedClosedDraws))
          }
        }
      } finally {
        setIsLoading(false)
      }
    }

    loadInitialData()

    // Suscribirse a cambios en eventos
    const unsubscribe = subscribeToEvents((updatedEvents) => {
      setEvents(updatedEvents)

      // Actualizar también los sorteos cerrados
      const closedEvents = updatedEvents
        .filter((event) => event.status.startsWith("closed_"))
        .map((event) => ({
          id: event.id,
          name: event.name,
          date: event.endDate,
          endTime: event.endTime,
          firstPrize: event.awardedNumbers?.firstPrize || "",
          secondPrize: event.awardedNumbers?.secondPrize || "",
          thirdPrize: event.awardedNumbers?.thirdPrize || "",
          awardDate: event.awardedNumbers?.awardedAt || "",
        }))

      setClosedDraws(closedEvents)
    })

    // Limpiar suscripción al desmontar
    return () => {
      if (typeof unsubscribe === 'function') {
        try {
          unsubscribe();
          console.log('Suscripción a eventos cancelada correctamente');
        } catch (error) {
          console.error('Error al cancelar suscripción a eventos:', error);
        }
      }
    }
  }, [])

  // Cargar configuración del superusuario
  useEffect(() => {
    // Solo ejecutar en el cliente
    if (typeof window !== "undefined") {
      const storedName = localStorage.getItem("superUserName")
      const storedPassword = localStorage.getItem("superUserPassword")
      const storedDarkMode = localStorage.getItem("darkMode")

      if (storedName) setSuperUserName(storedName)
      if (storedPassword) setSuperUserPassword(storedPassword)
      if (storedDarkMode === "true") {
        setIsDarkMode(true)
        document.documentElement.classList.add("dark")
        document.body.classList.add("light-mode")
      } else {
        setIsDarkMode(false)
        document.documentElement.classList.remove("dark")
        document.body.classList.remove("light-mode")
      }
    }
  }, [])

  const [isAddingVendor, setIsAddingVendor] = useState(false)
  const [isAddingEvent, setIsAddingEvent] = useState(false)
  const [isEditingVendor, setIsEditingVendor] = useState(false)
  const [isEditingEvent, setIsEditingEvent] = useState(false)
  const [isAwardingEvent, setIsAwardingEvent] = useState(false)
  const [isNumberLimitsOpen, setIsNumberLimitsOpen] = useState(false)
  const [currentVendor, setCurrentVendor] = useState<Vendor | null>(null)
  const [currentEvent, setCurrentEvent] = useState<Event | null>(null)
  const [awardNumbers, setAwardNumbers] = useState({
    firstPrize: "",
    secondPrize: "",
    thirdPrize: "",
  })
  const [deleteConfirmation, setDeleteConfirmation] = useState<{
    type: "vendor" | "event" | "closedDraw"
    id: string
    isOpen: boolean
  }>({
    type: "vendor",
    id: "",
    isOpen: false,
  })

  // Función para agregar un nuevo vendedor
  const handleAddVendor = async (vendor: Omit<Vendor, "id" | "active" | "showPassword">) => {
    try {
      const newVendor = await createVendor({
        ...vendor,
        active: true,
      })

      if (newVendor) {
        setVendors((prev) => [...prev, { ...newVendor, showPassword: false }])
      }

      setIsAddingVendor(false)
    } catch (error) {
      console.error("Error adding vendor:", error)
    }
  }

  // Función para agregar un nuevo evento
  const handleAddEvent = async (event: Omit<Event, "id" | "active">) => {
    try {
      const newEvent = await createEvent({
        ...event,
        active: true,
        status: "active",
      })

      if (newEvent) {
        setEvents((prev) => [...prev, newEvent])
      }

      setIsAddingEvent(false)
    } catch (error) {
      console.error("Error adding event:", error)
    }
  }

  // Función para editar un vendedor existente
  const handleEditVendor = async (vendor: Vendor) => {
    try {
      const updatedVendor = await updateVendor(vendor)

      if (updatedVendor) {
        setVendors((prev) => prev.map((v) => (v.id === vendor.id ? { ...updatedVendor, showPassword: false } : v)))
      }

      setIsEditingVendor(false)
    } catch (error) {
      console.error("Error updating vendor:", error)
    }
  }

  // Función para editar un evento existente
  const handleEditEvent = async (event: Event) => {
    try {
      const updatedEvent = await updateEvent(event)

      if (updatedEvent) {
        setEvents((prev) => prev.map((e) => (e.id === event.id ? updatedEvent : e)))
      }

      setIsEditingEvent(false)
    } catch (error) {
      console.error("Error updating event:", error)
    }
  }

  // Se eliminó la función para actualizar límites de números

  // Función para confirmar eliminación
  const handleDeleteConfirm = (type: "vendor" | "event" | "closedDraw", id: string) => {
    setDeleteConfirmation({
      type,
      id,
      isOpen: true,
    })
  }

  // Función para eliminar después de confirmación
  const handleConfirmDelete = async () => {
    try {
      switch (deleteConfirmation.type) {
        case "vendor":
          const vendorDeleted = await deleteVendor(deleteConfirmation.id)
          if (vendorDeleted) {
            setVendors((prev) => prev.filter((v) => v.id !== deleteConfirmation.id))
          }
          break
        case "event":
          const eventDeleted = await deleteEvent(deleteConfirmation.id)
          if (eventDeleted) {
            setEvents((prev) => prev.filter((e) => e.id !== deleteConfirmation.id))
          }
          break
        case "closedDraw":
          // Los sorteos cerrados son eventos con status 'closed_*'
          const closedDrawDeleted = await deleteEvent(deleteConfirmation.id)
          if (closedDrawDeleted) {
            setClosedDraws((prev) => prev.filter((d) => d.id !== deleteConfirmation.id))
          }
          break
      }
    } catch (error) {
      console.error("Error deleting item:", error)
    } finally {
      setDeleteConfirmation((prev) => ({ ...prev, isOpen: false }))
    }
  }

  // Función para mostrar/ocultar contraseña de vendedor
  const toggleVendorPasswordVisibility = (id: string) => {
    // Buscar el vendedor actual para obtener su contraseña real
    const vendor = vendors.find(v => v.id === id);
    if (!vendor) return;
    
    // Si showPassword es true, ya estamos mostrando la contraseña, así que la ocultamos
    // Si showPassword es false, necesitamos mostrar la contraseña real
    setVendors(vendors.map((v) => {
      if (v.id === id) {
        // Alternar entre mostrar la contraseña real o mostrar asteriscos
        return { 
          ...v, 
          showPassword: !v.showPassword,
          // Guardamos la contraseña real en el estado para poder mostrarla/ocultarla
          passwordVisible: !v.showPassword
        }
      }
      return v;
    }))
  }

  // Función para premiar un evento
  const handleAwardEvent = async (numbers: { firstPrize: string; secondPrize: string; thirdPrize: string }) => {
    if (!currentEvent) return

    try {
      const updatedEvent = await awardEvent(currentEvent.id, numbers)

      if (updatedEvent) {
        // Actualizar eventos
        setEvents((prev) => prev.map((e) => (e.id === currentEvent.id ? updatedEvent : e)))

        // Si el evento tiene repetición diaria, crear uno nuevo
        if (currentEvent.repeatDaily) {
          // Obtener las fechas del evento actual
          const currentStartDate = new Date(currentEvent.startDate)
          const currentEndDate = new Date(currentEvent.endDate)

          // Crear fechas para el día siguiente
          const nextStartDate = new Date(currentStartDate)
          nextStartDate.setDate(nextStartDate.getDate() + 1)
          const nextEndDate = new Date(currentEndDate)
          nextEndDate.setDate(nextEndDate.getDate() + 1)
          
          // Asegurarse de que las fechas estén en formato YYYY-MM-DD
          const formattedNextStartDate = nextStartDate.toISOString().split('T')[0]
          const formattedNextEndDate = nextEndDate.toISOString().split('T')[0]

          // Crear el nuevo evento
          const newEventData = {
            name: currentEvent.name,
            startDate: formattedNextStartDate,
            endDate: formattedNextEndDate,
            startTime: currentEvent.startTime,
            endTime: currentEvent.endTime,
            repeatDaily: currentEvent.repeatDaily,
            active: true,
            status: "active" as const,
          }

          // Crear el nuevo evento en Supabase
          const newEvent = await createEvent(newEventData)
          if (newEvent) {
            setEvents((prev) => [...prev, newEvent])
          }
        }

        // Actualizar sorteos cerrados
        const newClosedDraw = {
          id: currentEvent.id,
          name: currentEvent.name,
          date: currentEvent.endDate,
          endTime: currentEvent.endTime,
          firstPrize: numbers.firstPrize,
          secondPrize: numbers.secondPrize,
          thirdPrize: numbers.thirdPrize,
          awardDate: new Date().toISOString(),
        }

        setClosedDraws((prev) => [...prev, newClosedDraw])
      }
    } catch (error) {
      console.error("Error awarding event:", error)
    } finally {
      setIsAwardingEvent(false)
      setCurrentEvent(null)
    }
  }

  // Función para cambiar modo oscuro
  const toggleDarkMode = () => {
    setIsDarkMode(!isDarkMode)
    if (!isDarkMode) {
      document.documentElement.classList.add("dark")
      document.body.classList.add("light-mode")
    } else {
      document.documentElement.classList.remove("dark")
      document.body.classList.remove("light-mode")
    }
    localStorage.setItem("darkMode", (!isDarkMode).toString())
  }

  // Función para limpiar caché
  const clearCache = () => {
    localStorage.clear()
    window.location.reload()
  }

  // Función para actualizar datos del superusuario
  const handleSuperUserUpdate = (data: { superUserName: string; superUserPassword: string }) => {
    setSuperUserName(data.superUserName)
    setSuperUserPassword(data.superUserPassword)
    localStorage.setItem("superUserName", data.superUserName)
    localStorage.setItem("superUserPassword", data.superUserPassword)
    setIsConfigOpen(false)
  }

  // Función para arreglar errores

  // Función para arreglar errores
  const fixErrors = async () => {
    try {
      // Asegurar que los datos estén sincronizados con Supabase
      const fetchedVendors = await getVendors()
      const fetchedEvents = await getEvents()

      setVendors(fetchedVendors)
      setEvents(fetchedEvents)

      // Extraer sorteos cerrados
      const closedEvents = fetchedEvents
        .filter((event) => event.status.startsWith("closed_"))
        .map((event) => ({
          id: event.id,
          name: event.name,
          date: event.endDate,
          endTime: event.endTime,
          firstPrize: event.awardedNumbers?.firstPrize || "",
          secondPrize: event.awardedNumbers?.secondPrize || "",
          thirdPrize: event.awardedNumbers?.thirdPrize || "",
          awardDate: event.awardedNumbers?.awardedAt || "",
        }))

      setClosedDraws(closedEvents)

      alert("Datos sincronizados correctamente")
    } catch (error) {
      console.error("Error fixing data:", error)
      alert("Error al sincronizar datos")
    }
  }

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-black/90 backdrop-blur-sm border-b border-white/10">
        <div className="flex items-center justify-between p-4">
          <h1 className="text-xl md:text-2xl font-bold bg-gradient-to-r from-[#FF6B6B] to-[#4ECDC4] bg-clip-text text-transparent">
            NUMIX Admin
          </h1>
          <div className="flex items-center gap-2">
            {/* Menú móvil */}
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" className="md:hidden p-2">
                  <Menu className="h-6 w-6" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="bg-black/95 text-white border-gray-800 w-[280px]">
                <SheetHeader>
                  <SheetTitle className="text-white">Menú</SheetTitle>
                  <SheetDescription className="text-gray-400">Acciones rápidas</SheetDescription>
                </SheetHeader>
                <div className="mt-4 space-y-3">
                  <Button
                    variant="outline"
                    onClick={() => setIsAddingVendor(true)}
                    className="w-full bg-[#2a2a2a] hover:bg-[#3a3a3a] text-white border-0"
                  >
                    <UserPlus className="mr-2 h-4 w-4" />
                    Agregar Vendedor
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setIsAddingEvent(true)}
                    className="w-full bg-[#2a2a2a] hover:bg-[#3a3a3a] text-white border-0"
                  >
                    <Clock className="mr-2 h-4 w-4" />
                    Agregar Evento
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setIsConfigOpen(true)}
                    className="w-full bg-[#2a2a2a] hover:bg-[#3a3a3a] text-white border-0"
                  >
                    <Settings className="mr-2 h-4 w-4" />
                    Configuración
                  </Button>
                </div>
              </SheetContent>
            </Sheet>

            {/* Botones de escritorio */}
            <div className="hidden md:flex gap-2">
              <Button
                variant="outline"
                className="bg-[#2a2a2a] hover:bg-[#3a3a3a] text-white border-0"
                onClick={() => setIsAddingVendor(true)}
              >
                <UserPlus className="mr-2 h-4 w-4" />
                Agregar Vendedor
              </Button>
              <Button
                variant="outline"
                className="bg-[#2a2a2a] hover:bg-[#3a3a3a] text-white border-0"
                onClick={() => setIsAddingEvent(true)}
              >
                <Clock className="mr-2 h-4 w-4" />
                Agregar Evento
              </Button>
              <Button
                variant="outline"
                className="bg-[#2a2a2a] hover:bg-[#3a3a3a] text-white border-0"
                onClick={() => setIsConfigOpen(true)}
              >
                <Settings className="mr-2 h-4 w-4" />
                Configuración
              </Button>
            </div>

            <Button onClick={signOut} className="bg-[#FF6B6B] hover:bg-[#FF5252] text-white">
              <LogOut className="h-4 w-4 md:mr-2" />
              <span className="hidden md:inline">Cerrar Sesión</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Stats Section */}
      <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-4 py-6">
          <Card className="bg-white/10 border-0 p-4 rounded-xl">
            <div className="text-lg md:text-xl font-bold text-[#4ECDC4]">$0.00</div>
            <div className="text-xs md:text-sm text-gray-400">Ganancias</div>
          </Card>
        </div>

        {/* Vendors Section */}
        <div className="bg-[#2a2a2a] rounded-lg mb-6 p-4 sm:p-6">
          <div className="flex items-center gap-2 mb-4">
            <UserPlus className="h-5 w-5" />
            <h2 className="text-lg font-medium">Vendedores</h2>
          </div>
          <div className="overflow-x-auto -mx-4 px-4">
            <div className="min-w-[800px] lg:w-full">
              <Table aria-label="Lista de vendedores">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[20%]">Nombre</TableHead>
                    <TableHead className="w-[30%]">Email</TableHead>
                    <TableHead className="w-[25%]">Contraseña</TableHead>
                    <TableHead className="w-[12%] text-center">Estado</TableHead>
                    <TableHead className="w-[13%] text-center">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {vendors.map((vendor) => (
                    <TableRow key={vendor.id}>
                      <TableCell className="font-medium">{vendor.name}</TableCell>
                      <TableCell>{vendor.email}</TableCell>
                      <TableCell>
                        <div className="flex items-center">
                          <span className="mr-2">{vendor.showPassword ? vendor.password : "••••••"}</span>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0"
                            onClick={() => toggleVendorPasswordVisibility(vendor.id)}
                          >
                            {vendor.showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge
                          className={cn(
                            "inline-flex justify-center min-w-[80px]",
                            vendor.active ? "bg-[#4ECDC4] hover:bg-[#3DBCB4]" : "bg-[#FF6B6B] hover:bg-[#FF5252]",
                          )}
                          onClick={() => handleEditVendor({ ...vendor, active: !vendor.active })}
                        >
                          {vendor.active ? "Activo" : "Inactivo"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-center gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0"
                            onClick={() => {
                              setCurrentVendor(vendor)
                              setIsEditingVendor(true)
                            }}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0 text-[#FF6B6B]"
                            onClick={() => handleDeleteConfirm("vendor", vendor.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>

        {/* Active Events Section */}
        <div className="bg-[#2a2a2a] rounded-lg mb-6 p-4 sm:p-6">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="h-5 w-5" />
            <h2 className="text-lg font-medium">Eventos Activos</h2>
          </div>
          <div className="overflow-x-auto -mx-4 px-4">
            <div className="min-w-[800px] lg:w-full">
              <Table aria-label="Lista de eventos activos">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[20%]">Nombre</TableHead>
                    <TableHead className="w-[25%]">Fecha Inicio</TableHead>
                    <TableHead className="w-[25%]">Fecha Fin</TableHead>
                    <TableHead className="w-[12%] text-center">Estado</TableHead>
                    <TableHead className="w-[18%] text-center">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {events
                    .filter((event) => event.status === "active")
                    .map((event) => (
                      <TableRow key={event.id}>
                        <TableCell className="font-medium">{event.name}</TableCell>
                        <TableCell>{`${event.startDate} ${event.startTime}`}</TableCell>
                        <TableCell>{`${event.endDate} ${event.endTime}`}</TableCell>
                        <TableCell className="text-center">
                          <Badge
                            className={cn(
                              "inline-flex justify-center min-w-[80px]",
                              event.active ? "bg-[#4ECDC4] hover:bg-[#3DBCB4]" : "bg-[#FF6B6B] hover:bg-[#FF5252]",
                            )}
                            onClick={() => handleEditEvent({ ...event, active: !event.active })}
                          >
                            {event.active ? "Activo" : "Inactivo"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-center gap-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 w-8 p-0"
                              onClick={() => {
                                setCurrentEvent(event)
                                setIsEditingEvent(true)
                              }}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 w-8 p-0 text-[#FF6B6B]"
                              onClick={() => handleDeleteConfirm("event", event.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 w-8 p-0 text-yellow-500"
                              onClick={() => {
                                setCurrentEvent(event)
                                setIsAwardingEvent(true)
                              }}
                            >
                              <Award className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 w-8 p-0 text-blue-500"
                              onClick={() => {
                                setCurrentEvent(event)
                                setIsNumberLimitsOpen(true)
                              }}
                            >
                              <Hash className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>

        {/* Closed Events Section */}
        <div className="bg-[#2a2a2a] rounded-lg mb-6 p-4 sm:p-6">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
            <h2 className="text-lg font-medium">Sorteos Cerrados</h2>
          </div>
          <div className="overflow-x-auto -mx-4 px-4">
            <div className="min-w-[800px] lg:w-full">
              <Table aria-label="Lista de sorteos cerrados">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[20%]">Nombre</TableHead>
                    <TableHead className="w-[20%]">Fecha Fin</TableHead>
                    <TableHead className="w-[15%] text-center">Estado</TableHead>
                    <TableHead className="w-[20%] text-center">Números Premiados</TableHead>
                    <TableHead className="w-[15%]">Fecha Premiación</TableHead>
                    <TableHead className="w-[10%] text-center">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {events
                    .filter((event) => event.status.startsWith("closed_"))
                    .map((event) => (
                      <TableRow key={event.id}>
                        <TableCell className="font-medium">{event.name}</TableCell>
                        <TableCell>{event.endDateTime}</TableCell>
                        <TableCell className="text-center">
                          <Badge
                            className={cn(
                              "inline-flex justify-center min-w-[80px]",
                              event.status === "closed_awarded"
                                ? "bg-green-500 hover:bg-green-600"
                                : "bg-yellow-500 hover:bg-yellow-600",
                            )}
                          >
                            {event.status === "closed_awarded" ? (
                              <Award className="h-4 w-4 mr-1" />
                            ) : (
                              <AlertCircle className="h-4 w-4 mr-1" />
                            )}
                            {event.status === "closed_awarded" ? "Premiado" : "Pendiente"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {event.awardedNumbers ? (
                            <div className="flex items-center justify-center space-x-4">
                              <span className="text-yellow-500 font-bold">{event.awardedNumbers.firstPrize}</span>
                              <span className="text-[#9333EA] font-bold">{event.awardedNumbers.secondPrize}</span>
                              <span className="text-[#FF6B6B] font-bold">{event.awardedNumbers.thirdPrize}</span>
                            </div>
                          ) : (
                            <span className="text-center block text-gray-400">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {event.awardedNumbers && event.awardedNumbers.awardedAt ? (
                            <div className="text-center">
                              {new Date(event.awardedNumbers.awardedAt).toLocaleDateString("es-ES")}{" "}
                              {new Date(event.awardedNumbers.awardedAt).toLocaleTimeString("es-ES", {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </div>
                          ) : (
                            <span className="text-center block text-gray-400">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-center gap-2">
                            {event.status === "closed_not_awarded" && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 w-8 p-0 text-yellow-500"
                                onClick={() => {
                                  setCurrentEvent(event)
                                  setIsAwardingEvent(true)
                                }}
                              >
                                <Award className="h-4 w-4" />
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 w-8 p-0 text-[#FF6B6B]"
                              onClick={() => handleDeleteConfirm("event", event.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
      </div>

      {/* Add Vendor Dialog */}
      <AddVendorDialog open={isAddingVendor} onOpenChange={setIsAddingVendor} onSubmit={handleAddVendor} />

      {/* Add Event Dialog */}
      <AddEventDialog 
        open={isAddingEvent} 
        onOpenChange={setIsAddingEvent} 
        onSubmit={(data) => handleAddEvent({
          ...data,
          endDateTime: `${data.endDate} ${data.endTime}`,
          totalSold: 0,
          sellerTimes: [],
          tickets: [],
          status: 'active'
        })} 
      />

      {/* Edit Vendor Dialog */}
      {currentVendor && (
        <EditVendorDialog
          open={isEditingVendor}
          onOpenChange={setIsEditingVendor}
          vendor={currentVendor}
          onSubmit={handleEditVendor}
        />
      )}

      {/* Edit Event Dialog */}
      {currentEvent && (
        <EditEventDialog
          open={isEditingEvent}
          onOpenChange={setIsEditingEvent}
          event={currentEvent}
          onSubmit={handleEditEvent}
        />
      )}

      {/* Award Event Dialog */}
      {currentEvent && (
        <AwardEventDialog
          open={isAwardingEvent}
          onOpenChange={setIsAwardingEvent}
          event={currentEvent}
          onSubmit={handleAwardEvent}
        />
      )}

      {/* Se eliminó el diálogo para configurar límites de números */}

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={deleteConfirmation.isOpen}
        onOpenChange={(isOpen) => setDeleteConfirmation((prev) => ({ ...prev, isOpen }))}
      >
        <AlertDialogContent className="bg-[#1a1a1a] text-white border-gray-700">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
            <AlertDialogDescription className="text-gray-400">Esta acción no se puede deshacer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-gray-800 text-white hover:bg-gray-700">No</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete} className="bg-[#FF6B6B] hover:bg-[#FF5252]">
              Sí
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Configuration Dialog */}
      <SettingsDialog
        open={isConfigOpen}
        onOpenChange={setIsConfigOpen}
        settings={{
          superUserName,
          superUserPassword,
          isDarkMode,
        }}
        onSubmit={handleSuperUserUpdate}
        onDarkModeChange={toggleDarkMode}
        onClearCache={clearCache}
        onFixErrors={fixErrors}
      />

      {/* Number Limits Dialog */}
      {currentEvent && (
        <NumberLimitsDialog
          open={isNumberLimitsOpen}
          onOpenChange={setIsNumberLimitsOpen}
          eventId={currentEvent.id}
        />
      )}
    </div>
  )
}

