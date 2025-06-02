"use client"

import { useState, useCallback } from "react"
import { createTicket, updateTicket, deleteTicket } from "@/lib/tickets"
import { PRICE_PER_TIME } from "@/lib/constants"
<<<<<<< HEAD
import { generateUUID } from "@/lib/uuid-utils"
=======
>>>>>>> 624c5503d96cf6f2927785c1f1d25f0199826991

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
  numbers?: string
  rows: TicketRow[]
  vendorEmail?: string
}

export function useTickets(eventId: string, onSuccess?: () => void) {
  const [clientName, setClientName] = useState("")
<<<<<<< HEAD
  // Usar generateUUID para el ID inicial para garantizar unicidad en todos los entornos
  const [ticketRows, setTicketRows] = useState<TicketRow[]>([{ id: generateUUID(), times: "", actions: "", value: 0 }])
=======
  const [ticketRows, setTicketRows] = useState<TicketRow[]>([{ id: "1", times: "", actions: "", value: 0 }])
>>>>>>> 624c5503d96cf6f2927785c1f1d25f0199826991
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)

  // Calculate totals
  const totalTimes = ticketRows.reduce((sum, row) => sum + (Number(row.times) || 0), 0)
  const totalPurchase = totalTimes * PRICE_PER_TIME

  const handleInputChange = useCallback((rowId: string, field: "times" | "actions", value: string) => {
<<<<<<< HEAD
    // Solo validar rango 0-99 para el campo "actions", pero permitir valor vacío para borrado
    if (field === "actions" && value !== "") {
      // Verificar si es una operación de borrado (longitud menor que el valor actual)
      const currentRow = ticketRows.find(row => row.id === rowId)
      const isDeleting = currentRow && value.length < currentRow.actions.length
      
      // Solo validar si no es una operación de borrado
      if (!isDeleting) {
        const numValue = Number.parseInt(value, 10)
        if (isNaN(numValue) || numValue < 0 || numValue > 99) return
      }
    }

    // Actualizar el estado
    setTicketRows(rows => 
      rows.map(row => {
=======
    // Solo validar rango 0-99 para el campo "actions"
    if (field === "actions") {
      const numValue = Number.parseInt(value, 10)
      if (isNaN(numValue) || numValue < 0 || numValue > 99) return
    }

    setTicketRows((rows) =>
      rows.map((row) => {
>>>>>>> 624c5503d96cf6f2927785c1f1d25f0199826991
        if (row.id === rowId) {
          return {
            ...row,
            [field]: value,
            value: field === "times" ? Number(value) * PRICE_PER_TIME : row.value,
<<<<<<< HEAD
          };
        }
        return row;
      })
    );
=======
          }
        }
        return row
      }),
    )
>>>>>>> 624c5503d96cf6f2927785c1f1d25f0199826991
  }, [])

  const removeRow = useCallback((rowId: string) => {
    setTicketRows((prevRows) => prevRows.filter((row) => row.id !== rowId))
  }, [])

  const addNewRow = useCallback(() => {
<<<<<<< HEAD
    // Usar generateUUID para garantizar IDs únicos y evitar duplicaciones
    // que podrían ocurrir con Date.now() si se ejecuta muy rápidamente
    const newRowId = generateUUID()
=======
    const newRowId = String(Date.now())
>>>>>>> 624c5503d96cf6f2927785c1f1d25f0199826991
    setTicketRows((prevRows) => [...prevRows, { id: newRowId, times: "", actions: "", value: 0 }])
  }, [])

  const resetForm = useCallback(() => {
    setClientName("")
<<<<<<< HEAD
    // Usar generateUUID para garantizar IDs únicos al resetear el formulario
    setTicketRows([{ id: generateUUID(), times: "", actions: "", value: 0 }])
=======
    setTicketRows([{ id: "1", times: "", actions: "", value: 0 }])
>>>>>>> 624c5503d96cf6f2927785c1f1d25f0199826991
    setSelectedTicket(null)
  }, [])

  const handleComplete = useCallback(async () => {
    // Evitar duplicación de tickets usando un flag global
    if (typeof window !== 'undefined' && window._isProcessingTicket) {
      console.log('Ya hay un proceso de creación de ticket en curso, evitando duplicación')
      return
    }
    
    // Establecer el flag para prevenir duplicación
    if (typeof window !== 'undefined') {
      window._isProcessingTicket = true
    }
    
    try {
      // Obtener el email del vendedor actual
      const currentVendorEmail = localStorage.getItem("currentVendorEmail")

      const ticketData = {
<<<<<<< HEAD
        id: selectedTicket ? selectedTicket.id : generateUUID(),
=======
        id: selectedTicket ? selectedTicket.id : crypto.randomUUID(),
>>>>>>> 624c5503d96cf6f2927785c1f1d25f0199826991
        clientName,
        amount: totalPurchase,
        numbers: ticketRows
          .map((row) => row.actions)
          .filter(Boolean)
          .join(", "),
        rows: ticketRows,
        vendorEmail: currentVendorEmail,
      }

      if (selectedTicket) {
        // Actualizar ticket existente
        await updateTicket(ticketData as Ticket, eventId)
      } else {
        // Crear nuevo ticket
        await createTicket(ticketData, eventId)
      }

      // Llamar al callback de éxito si existe
      if (onSuccess) {
        onSuccess()
      }

      // Reset form
      resetForm()
    } catch (error) {
      console.error("Error saving ticket:", error)
      // Aquí podríamos manejar el error, por ejemplo mostrando una notificación
    } finally {
      // Asegurar que el flag se restablezca incluso si hay errores
      if (typeof window !== 'undefined') {
        // Usar setTimeout para asegurar que el modal no se reabra
        setTimeout(() => {
          window._isProcessingTicket = false
        }, 1000) // Esperar 1 segundo antes de permitir otra operación
      }
    }
  }, [clientName, eventId, onSuccess, resetForm, selectedTicket, ticketRows, totalPurchase])

  const handleDeleteTicket = useCallback(async () => {
    if (!selectedTicket) return

    try {
      // Eliminar el ticket
      await deleteTicket(selectedTicket.id, eventId)

      // Llamar al callback de éxito si existe
      if (onSuccess) {
        onSuccess()
      }

      // Reset form
      resetForm()
      setIsDeleteDialogOpen(false)
    } catch (error) {
      console.error("Error deleting ticket:", error)
      // Aquí podríamos manejar el error, por ejemplo mostrando una notificación
    }
  }, [eventId, onSuccess, resetForm, selectedTicket])

  return {
    clientName,
    setClientName,
    ticketRows,
    selectedTicket,
    setSelectedTicket,
    isDeleteDialogOpen,
    setIsDeleteDialogOpen,
    totalTimes,
    totalPurchase,
    handleInputChange,
    removeRow,
    addNewRow,
    resetForm,
    handleComplete,
    handleDeleteTicket,
  }
}

