"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ArrowRight, LogOut, Calendar, DollarSign, Users, Award } from "lucide-react"
import Link from "next/link"

interface Stats {
  totalSales: number
  activeDraws: number
  totalCustomers: number
  lastDrawWinners: number
}

export default function VendorDashboard() {
  const router = useRouter()
  const [stats, setStats] = useState<Stats>({
    totalSales: 0,
    activeDraws: 0,
    totalCustomers: 0,
    lastDrawWinners: 0,
  })

  useEffect(() => {
    // Fetch stats from localStorage
    const fetchStats = () => {
      const events = JSON.parse(localStorage.getItem("events") || "[]")
      const activeDraws = events.filter((event: any) => event.active).length

      // Calculate total sales and customers from tickets
      let totalSales = 0
      const customers = new Set()
      events.forEach((event: any) => {
        const tickets = JSON.parse(localStorage.getItem(`tickets_${event.id}`) || "[]")
        tickets.forEach((ticket: any) => {
          totalSales += ticket.amount
          customers.add(ticket.clientName)
        })
      })

      setStats({
        totalSales,
        activeDraws,
        totalCustomers: customers.size,
        lastDrawWinners: 0, // This would be updated when implementing winner tracking
      })
    }

    fetchStats()
  }, [])

  return (
    <div className="min-h-screen bg-black">
      {/* Header */}
      <header className="border-b border-white/10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex justify-between items-center">
            <h1 className="text-2xl font-bold bg-gradient-to-r from-[#FF6B6B] to-[#4ECDC4] bg-clip-text text-transparent">
              NUMIX
            </h1>
            <Button onClick={() => router.push("/")} variant="ghost" className="text-white hover:bg-white/10">
              <LogOut className="h-4 w-4 mr-2" />
              Cerrar Sesión
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <Card className="bg-white/5 border-0 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-400">Ventas Totales</p>
                <h3 className="text-2xl font-bold text-[#4ECDC4]">${stats.totalSales.toFixed(2)}</h3>
              </div>
              <div className="h-12 w-12 rounded-lg bg-[#4ECDC4]/10 flex items-center justify-center">
                <DollarSign className="h-6 w-6 text-[#4ECDC4]" />
              </div>
            </div>
          </Card>

          <Card className="bg-white/5 border-0 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-400">Sorteos Activos</p>
                <h3 className="text-2xl font-bold text-[#4ECDC4]">{stats.activeDraws}</h3>
              </div>
              <div className="h-12 w-12 rounded-lg bg-[#4ECDC4]/10 flex items-center justify-center">
                <Calendar className="h-6 w-6 text-[#4ECDC4]" />
              </div>
            </div>
          </Card>

          <Card className="bg-white/5 border-0 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-400">Total Clientes</p>
                <h3 className="text-2xl font-bold text-[#4ECDC4]">{stats.totalCustomers}</h3>
              </div>
              <div className="h-12 w-12 rounded-lg bg-[#4ECDC4]/10 flex items-center justify-center">
                <Users className="h-6 w-6 text-[#4ECDC4]" />
              </div>
            </div>
          </Card>

          <Card className="bg-white/5 border-0 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-400">Ganadores Recientes</p>
                <h3 className="text-2xl font-bold text-[#4ECDC4]">{stats.lastDrawWinners}</h3>
              </div>
              <div className="h-12 w-12 rounded-lg bg-[#4ECDC4]/10 flex items-center justify-center">
                <Award className="h-6 w-6 text-[#4ECDC4]" />
              </div>
            </div>
          </Card>
        </div>

        {/* Quick Actions */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-white">Acciones Rápidas</h2>

          <Link href="/sorteos" className="block">
            <Card className="bg-white/5 border-0 p-6 hover:bg-white/10 transition-colors cursor-pointer">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <h3 className="text-lg font-medium text-white">Gestionar Sorteos</h3>
                  <p className="text-sm text-gray-400">Ver y gestionar todos los sorteos activos</p>
                </div>
                <ArrowRight className="h-5 w-5 text-gray-400" />
              </div>
            </Card>
          </Link>

          <Link href="/sorteos" className="block">
            <Card className="bg-white/5 border-0 p-6 hover:bg-white/10 transition-colors cursor-pointer">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <h3 className="text-lg font-medium text-white">Historial de Ventas</h3>
                  <p className="text-sm text-gray-400">Ver el historial completo de ventas y tickets</p>
                </div>
                <ArrowRight className="h-5 w-5 text-gray-400" />
              </div>
            </Card>
          </Link>
        </div>
      </main>
    </div>
  )
}

