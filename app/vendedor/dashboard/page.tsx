"use client"

import React from "react"
import { useRouter } from "next/navigation"
import { LogOut, DollarSign, Calendar, Users, FileText, BarChart3 } from "lucide-react"
import { useState, useEffect, useCallback, useMemo } from "react"
import { subscribeToEvents } from "@/lib/events"
import { ErrorBoundary } from "@/components/ui/error-boundary"
import { supabase } from "@/lib/supabase"
import { ProtectedRoute } from "@/components/protected-route"
import { useAuth } from "@/lib/auth-context"
import type { Event } from "@/types"

// Importar los componentes reutilizables
import { PageHeader } from "@/components/ui/page-header"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ActionCard } from "@/components/ui/action-card"
import { SyncStatusIndicator } from "@/components/ui/sync-status-indicator"

// Componente memoizado para las estadísticas
const StatCard = React.memo(
  ({
    value,
    label,
    icon,
  }: {
    value: string | number
    label: string
    icon: React.ReactNode
  }) => {
    return (
      <Card className="bg-white/5 border-0 p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-400">{label}</p>
            <h3 className="text-2xl font-bold text-[#4ECDC4]">{value}</h3>
          </div>
          <div className="h-12 w-12 rounded-lg bg-[#4ECDC4]/10 flex items-center justify-center">{icon}</div>
        </div>
      </Card>
    )
  },
)
StatCard.displayName = "StatCard"

function VendorDashboardContent() {
  const router = useRouter()
  const { user, signOut } = useAuth()
  const [stats, setStats] = useState({
    totalSales: 0,
    activeDraws: 0,
    totalCustomers: 0,
  })
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Función para cargar estadísticas
  const fetchStats = useCallback(async () => {
    try {
      // Verificar que tenemos un usuario autenticado
      if (!user) {
        setError("Error: No hay usuario autenticado")
        setIsLoading(false)
        return
      }

      // Obtener eventos del localStorage con validación
      let events = []
      try {
        const eventsData = localStorage.getItem("events")
        events = eventsData ? JSON.parse(eventsData) : []
        if (!Array.isArray(events)) events = []
      } catch (parseError) {
        console.error("Error al parsear eventos del localStorage:", parseError)
        events = []
      }
      
      const activeDraws = events.filter((event) => event.active).length

      // Intentar obtener tickets de Supabase primero
      try {
        const { data: allTickets, error: supabaseError } = await supabase
          .from("tickets")
          .select("*")
          .eq("vendor_email", user.email)

        if (supabaseError) throw supabaseError

        // Verificar que allTickets es un array antes de procesarlo
        if (!allTickets || !Array.isArray(allTickets)) {
          throw new Error("Formato de datos inválido")
        }

        // Calculate total sales and customers con validación de datos
        let totalSales = 0
        const customers = new Set()

        allTickets.forEach((ticket) => {
          // Verificar que ticket tiene las propiedades necesarias
          if (ticket && typeof ticket === 'object') {
            // Usar valores por defecto si las propiedades no existen
            totalSales += Number(ticket.amount) || 0
            if (ticket.client_name) {
              customers.add(ticket.client_name)
            }
          }
        })

        setStats({
          totalSales,
          activeDraws,
          totalCustomers: customers.size,
        })

        setIsLoading(false)
        setError(null) // Limpiar errores previos si la operación fue exitosa
      } catch (supabaseError) {
        console.error("Error al obtener tickets de Supabase:", supabaseError)
        
        // Intentar obtener datos del localStorage como fallback
        try {
          const localTicketsData = localStorage.getItem("tickets")
          const localTickets = localTicketsData ? JSON.parse(localTicketsData) : []
          
          if (Array.isArray(localTickets)) {
            // Filtrar tickets del vendedor actual
            const vendorTickets = localTickets.filter(
              (ticket) => ticket.vendorEmail === user.email
            )
            
            let totalSales = 0
            const customers = new Set()
            
            vendorTickets.forEach((ticket) => {
              totalSales += Number(ticket.amount) || 0
              if (ticket.clientName) {
                customers.add(ticket.clientName)
              }
            })
            
            setStats({
              totalSales,
              activeDraws,
              totalCustomers: customers.size,
            })
            
            setIsLoading(false)
            // Mostrar advertencia pero no error bloqueante
            console.warn("Usando datos locales (sin conexión a Supabase)")
          } else {
            throw new Error("No se pudieron cargar los tickets locales")
          }
        } catch (localError) {
          console.error("Error al cargar datos locales:", localError)
          setError("Error al cargar estadísticas. Intente nuevamente.")
          setIsLoading(false)
        }
      }
    } catch (error) {
      console.error("Error general en fetchStats:", error)
      setError("Error al cargar estadísticas. Intente nuevamente.")
      setIsLoading(false)
    }
  }, [user])

  // Efecto para cargar estadísticas iniciales
  useEffect(() => {
    fetchStats()

    // Suscribirse a cambios en eventos con manejo de errores mejorado
    let unsubscribe: (() => void) | undefined = undefined
    let isMounted = true;
    
    const setupSubscription = async () => {
      try {
        // Verificar si el componente sigue montado antes de suscribirse
        if (!isMounted) return;
        
        // Usar un timeout para detectar problemas de suscripción
        const subscriptionPromise = subscribeToEvents((updatedEvents) => {
          // Verificar si el componente sigue montado antes de actualizar estado
          if (isMounted) {
            // Si recibimos un array vacío, podría indicar una desconexión permanente
            if (Array.isArray(updatedEvents) && updatedEvents.length === 0) {
              console.warn("Se recibió un array vacío de eventos, posible desconexión")
              // Intentar obtener datos de localStorage como respaldo
              const localEvents = localStorage.getItem("events")
              if (localEvents) {
                console.log("Usando datos de eventos desde localStorage como respaldo")
                // No es necesario actualizar estadísticas aquí, ya que usamos datos en caché
              }
            } else {
              console.log("Eventos actualizados, recargando estadísticas...")
              fetchStats()
            }
          }
        });
        
        // Establecer un timeout para la suscripción
        const timeoutPromise = new Promise<(() => void)>((_, reject) => {
          setTimeout(() => {
            reject(new Error("Timeout al suscribirse a eventos"));
          }, 10000); // 10 segundos de timeout
        });
        
        // Esperar a que se complete la suscripción o se agote el tiempo
        unsubscribe = await Promise.race([subscriptionPromise, timeoutPromise]);
        
        console.log("Suscripción a eventos establecida correctamente");
      } catch (subscriptionError) {
        console.warn("Error al suscribirse a eventos:", subscriptionError)
        // Intentar continuar con datos locales si están disponibles
        const localEvents = localStorage.getItem("events")
        if (localEvents && isMounted) {
          console.log("Usando datos locales debido a error de suscripción")
        }
      }
    }
    
    setupSubscription();

    // Limpiar suscripción al desmontar
    return () => {
      isMounted = false;
      try {
        if (typeof unsubscribe === 'function') {
          // Envolver la llamada a unsubscribe en un try-catch independiente
          try {
            unsubscribe();
            console.log("Suscripción limpiada correctamente");
          } catch (unsubError) {
            console.warn("Error al ejecutar unsubscribe:", unsubError);
            // No lanzar el error para que no interrumpa el proceso de desmontaje
          }
        } else {
          console.log("No hay suscripción activa para limpiar");
        }
      } catch (cleanupError) {
        console.warn("Error al limpiar suscripción:", cleanupError);
        // No es necesario hacer nada más aquí, ya que el componente se está desmontando
      }
      // Establecer explícitamente a undefined para ayudar al recolector de basura
      unsubscribe = undefined;
    }
  }, [fetchStats])

  // Memoizar las acciones rápidas para evitar recreaciones innecesarias
  const quickActions = useMemo(
    () => [
      {
        title: "Gestionar Sorteos",
        description: "Ver y gestionar todos los sorteos activos",
        icon: <FileText className="h-5 w-5 text-gray-400" />,
        href: "/sorteos",
      },
      {
        title: "Reporte General",
        description: "Ver el reporte general de ventas",
        icon: <BarChart3 className="h-5 w-5 text-gray-400" />,
        href: "/vendedor/reportes",
      },
    ],
    [],
  )

  // Mostrar un indicador de carga durante la carga inicial
  if (isLoading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="flex flex-col items-center">
          <div className="w-12 h-12 border-4 border-t-[#4ECDC4] border-r-transparent border-b-transparent border-l-transparent rounded-full animate-spin mb-4"></div>
          <p>Cargando dashboard...</p>
        </div>
      </div>
    )
  }

  // Mostrar un mensaje de error si hay un error
  if (error) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 max-w-md mx-auto">
          <h3 className="text-lg font-semibold mb-2">Error</h3>
          <p className="text-sm text-gray-300 mb-4">{error}</p>
          <Button onClick={fetchStats} className="w-full">
            Reintentar
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-black/90 backdrop-blur-sm border-b border-white/10">
        <PageHeader
          title={
            <span className="bg-gradient-to-r from-[#FF6B6B] to-[#4ECDC4] bg-clip-text text-transparent">NUMIX</span>
          }
          rightContent={
            <div className="flex items-center gap-2">
              <SyncStatusIndicator />
              <Button onClick={signOut} variant="ghost" className="text-white hover:bg-white/10">
                <LogOut className="h-4 w-4 md:mr-2" />
                <span className="hidden md:inline">Cerrar Sesión</span>
              </Button>
            </div>
          }
        />
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6 md:py-8">
        <ErrorBoundary>
          {/* Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-3 gap-4 mb-8">
            <StatCard
              value={`$${stats.totalSales.toFixed(2)}`}
              label="Ventas Totales"
              icon={<DollarSign className="h-6 w-6 text-[#4ECDC4]" />}
            />
            <StatCard
              value={stats.activeDraws}
              label="Total Sorteos"
              icon={<Calendar className="h-6 w-6 text-[#4ECDC4]" />}
            />
            <StatCard
              value={stats.totalCustomers}
              label="Total Clientes"
              icon={<Users className="h-6 w-6 text-[#4ECDC4]" />}
            />
          </div>

          {/* Quick Actions */}
          <div className="space-y-4">
            <h2 className="text-lg md:text-xl font-semibold text-white">Acciones Rápidas</h2>

            <div className="grid gap-4 md:grid-cols-2">
              {quickActions.map((action, index) => (
                <ActionCard
                  key={index}
                  title={action.title}
                  description={action.description}
                  icon={action.icon}
                  href={action.href}
                />
              ))}
            </div>
          </div>
        </ErrorBoundary>
      </main>
    </div>
  )
}

export default function VendorDashboard() {
  return (
    <ProtectedRoute requiredRole="vendor">
      <VendorDashboardContent />
    </ProtectedRoute>
  )
}

