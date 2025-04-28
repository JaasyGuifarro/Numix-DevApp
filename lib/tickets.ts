import { supabase, supabaseAdmin } from "./supabase"
import type { Ticket } from "@/types"
import { generateUUID } from "./uuid-utils"
import { checkNumberAvailability, incrementNumberSold } from "./number-limits"

// Modificar la declaración de mapTicketFromSupabase para exportarla
export const mapTicketFromSupabase = (ticket: any): Ticket => ({
  id: ticket.id,
  clientName: ticket.client_name,
  amount: ticket.amount,
  numbers: ticket.numbers || "",
  vendorEmail: ticket.vendor_email,
  rows: Array.isArray(ticket.rows) ? ticket.rows : JSON.parse(ticket.rows || "[]"),
})

// Convertir de formato de la aplicación a formato Supabase
const mapTicketToSupabase = (ticket: Ticket, eventId: string) => ({
  id: ticket.id,
  event_id: eventId,
  client_name: ticket.clientName,
  amount: ticket.amount,
  numbers: ticket.numbers,
  vendor_email: ticket.vendorEmail || "unknown", // Asegurar que siempre haya un valor
  rows: ticket.rows,
})

// Función de utilidad para acceder a localStorage de forma segura
function safeGetItem(key: string): string | null {
  if (typeof window === "undefined") return null
  try {
    return localStorage.getItem(key)
  } catch (error) {
    console.error(`Error al acceder a localStorage (${key}):`, error)
    return null
  }
}

// Modificar la función getTickets para que solo obtenga datos de Supabase
export async function getTickets(eventId: string, signal?: AbortSignal): Promise<Ticket[]> {
  try {
    // Verificar si la operación ya fue cancelada
    if (signal?.aborted) {
      console.log("Operación getTickets cancelada")
      return []
    }

    // Obtener el email del vendedor actual
    const currentVendorEmail = safeGetItem("currentVendorEmail")

    if (!currentVendorEmail) {
      console.error("No se encontró email de vendedor actual")
      return []
    }

    // Consultar tickets del evento específico para el vendedor actual
    const { data, error } = await supabase
      .from("tickets")
      .select("*")
      .eq("event_id", eventId)
      .eq("vendor_email", currentVendorEmail)
      .order("created_at", { ascending: false })
      .abortSignal(signal) // Pasar la señal de cancelación a Supabase

    // Verificar nuevamente si la operación fue cancelada después de la consulta
    if (signal?.aborted) {
      console.log("Operación getTickets cancelada después de la consulta")
      return []
    }

    if (error) {
      console.error("Error fetching tickets:", error)
      return []
    }

    return data.map(mapTicketFromSupabase)
  } catch (error) {
    // No reportar errores si la operación fue cancelada intencionalmente
    if (error instanceof DOMException && error.name === 'AbortError') {
      console.log("Operación getTickets abortada controladamente")
      return []
    }
    console.error("Error in getTickets:", error)
    return []
  }
}

// Verificar si un ticket es duplicado
async function isTicketDuplicate(ticket: Ticket, eventId: string): Promise<boolean> {
  try {
    // Verificar si ya existe un ticket con la misma información
    const { data, error } = await supabase
      .from("tickets")
      .select("id")
      .eq("event_id", eventId)
      .eq("client_name", ticket.clientName)
      .eq("vendor_email", ticket.vendorEmail || "")

    if (error) {
      console.error("Error checking for duplicate ticket:", error)
      return false
    }

    // Si encontramos algún ticket (excluyendo el actual en caso de actualización)
    return data.some((t) => t.id !== ticket.id)
  } catch (error) {
    console.error("Error in isTicketDuplicate:", error)
    return false
  }
}

// Se eliminó la importación de funciones de límites de números

// Modificar la función createTicket para que solo guarde en Supabase con verificación estricta de límites
export async function createTicket(ticket: Omit<Ticket, "id">, eventId: string, signal?: AbortSignal): Promise<Ticket | null | { success: false, message: string, status: string, numberInfo?: { number: string, remaining: number, requested: number } }> {
  try {
    // Asegurar que el ticket tenga un vendedor asociado
    const currentVendorEmail = safeGetItem("currentVendorEmail")
    if (!currentVendorEmail) {
      throw new Error("No se encontró email de vendedor actual")
    }

    // PRIMERA VERIFICACIÓN: Comprobar límites de números para cada fila del ticket antes de cualquier operación
    console.log("VERIFICACIÓN PREVIA: Comprobando límites de números antes de crear el ticket")
    
    // Verificar que no haya números duplicados en el mismo ticket
    const numbersInTicket = new Map<string, number>()
    for (const row of ticket.rows) {
      if (row.actions && row.times) {
        const number = row.actions
        const times = parseInt(row.times, 10) || 0
        
        // Si el número ya existe en el ticket, sumar los tiempos
        if (numbersInTicket.has(number)) {
          numbersInTicket.set(number, (numbersInTicket.get(number) || 0) + times)
        } else {
          numbersInTicket.set(number, times)
        }
      }
    }
    
    // Verificar cada número consolidado
    for (const [numberToCheck, timesToSell] of numbersInTicket.entries()) {
        if (isNaN(timesToSell) || timesToSell <= 0) {
          return {
            success: false,
            status: "error",
            message: `Cantidad inválida para el número ${numberToCheck}: ${timesToSell}`
          }
        }
        
        // Verificación estricta de disponibilidad del número
        const { available, remaining } = await checkNumberAvailability(eventId, numberToCheck, timesToSell, signal)
        
        if (!available) {
          console.warn(`VERIFICACIÓN PREVIA FALLIDA: El número ${numberToCheck} no tiene suficientes tiempos disponibles. Disponible: ${remaining}, Solicitado: ${timesToSell}`)
          return {
            success: false,
            status: "warning",
            message: `El número ${numberToCheck} solo tiene ${remaining} tiempos disponibles y estás intentando vender ${timesToSell}`,
            numberInfo: {
              number: numberToCheck,
              remaining: remaining,
              requested: timesToSell
            }
          }
        }
    }
    
    // Verificación adicional para cada fila individual
    for (const row of ticket.rows) {
      if (row.actions && row.times) {
        const numberToCheck = row.actions
        const timesToSell = parseInt(row.times, 10) || 0
        
        if (timesToSell <= 0) continue;
        
        // Verificación estricta de disponibilidad del número
        const { available, remaining } = await checkNumberAvailability(eventId, numberToCheck, timesToSell)
        
        if (!available) {
          console.warn(`VERIFICACIÓN FILA INDIVIDUAL FALLIDA: El número ${numberToCheck} no tiene suficientes tiempos disponibles`)
          return {
            success: false,
            status: "warning",
            message: `El número ${numberToCheck} solo tiene ${remaining} tiempos disponibles y estás intentando vender ${timesToSell}`,
            numberInfo: {
              number: numberToCheck,
              remaining: remaining,
              requested: timesToSell
            }
          }
        }
      }
    }

    // Verificar si es un ticket duplicado
    const isDuplicate = await isTicketDuplicate(
      { ...ticket, id: "", vendorEmail: currentVendorEmail } as Ticket,
      eventId
    )

    if (isDuplicate) {
      throw new Error("Ya existe un ticket con la misma información")
    }

    // Generar un ID único para el ticket
    const ticketId = generateUUID()

    // Crear el ticket completo con ID y vendedor
    const completeTicket: Ticket = {
      ...ticket,
      id: ticketId,
      vendorEmail: currentVendorEmail,
    }

    // Convertir al formato de Supabase
    const supabaseTicket = mapTicketToSupabase(completeTicket, eventId)

    // SEGUNDA VERIFICACIÓN: Verificar nuevamente los límites justo antes de incrementar contadores
    // Esta es una verificación adicional para evitar condiciones de carrera
    console.log("VERIFICACIÓN SECUNDARIA: Comprobando límites de números antes de incrementar contadores")
    for (const row of ticket.rows) {
      if (row.actions && row.times) {
        const numberToCheck = row.actions
        const timesToSell = parseInt(row.times, 10)
        
        // Verificación estricta de disponibilidad del número
        const { available, remaining } = await checkNumberAvailability(eventId, numberToCheck, timesToSell)
        
        if (!available) {
          console.warn(`VERIFICACIÓN SECUNDARIA FALLIDA: El número ${numberToCheck} ya no tiene suficientes tiempos disponibles`)
          return {
            success: false,
            status: "error",
            message: `El número ${numberToCheck} ya no tiene suficientes tiempos disponibles. Otro usuario puede haber comprado este número mientras procesabas la venta. Disponible: ${remaining}, Solicitado: ${timesToSell}`,
            numberInfo: {
              number: numberToCheck,
              remaining: remaining,
              requested: timesToSell
            }
          }
        }
      }
    }

    // Incrementar contadores de números vendidos ANTES de crear el ticket
    // Esto asegura que no se pueda crear un ticket si no se pueden incrementar los contadores
    const incrementResults: {number: string, success: boolean, remaining: number, requested: number}[] = []
    
    for (const row of ticket.rows) {
      if (row.actions && row.times) {
        const numberToIncrement = row.actions
        const timesToIncrement = parseInt(row.times, 10)
        
        // Verificar si se puede incrementar el contador sin exceder el límite
        const incrementSuccess = await incrementNumberSold(eventId, numberToIncrement, timesToIncrement)
        
        // Guardar el resultado para cada número
        const { remaining } = await checkNumberAvailability(eventId, numberToIncrement, timesToIncrement)
        incrementResults.push({
          number: numberToIncrement,
          success: incrementSuccess,
          remaining: remaining,
          requested: timesToIncrement
        })
        
        // Si alguno falla, revertir todos los incrementos anteriores y retornar error
        if (!incrementSuccess) {
          console.error(`INCREMENTO FALLIDO: No se pudo incrementar el contador para ${numberToIncrement}`)
          
          // Revertir incrementos previos exitosos
          for (const result of incrementResults) {
            if (result.success) {
              // Intentar decrementar (revertir) el contador
              // Nota: Aquí deberíamos tener una función para decrementar, pero usamos una solución temporal
              console.log(`Intentando revertir incremento para ${result.number}`)
              // Esta es una solución temporal y no ideal
              await supabaseAdmin.rpc('decrement_number_sold_safely', {
                p_event_id: eventId,
                p_number_range: result.number,
                p_decrement: result.requested
              }).catch(e => console.error(`Error al revertir incremento para ${result.number}:`, e))
            }
          }
          
          return {
            success: false,
            status: "error",
            message: `No se pudo crear el ticket. El número ${numberToIncrement} ha alcanzado su límite máximo de ventas (${remaining} disponibles).`,
            numberInfo: {
              number: numberToIncrement,
              remaining: remaining,
              requested: timesToIncrement
            }
          }
        }
      }
    }

    // Solo si todos los incrementos fueron exitosos, guardar el ticket en Supabase
    const { data, error } = await supabaseAdmin
      .from("tickets")
      .insert({
        id: supabaseTicket.id,
        event_id: supabaseTicket.event_id,
        client_name: supabaseTicket.client_name,
        amount: supabaseTicket.amount,
        numbers: supabaseTicket.numbers,
        vendor_email: supabaseTicket.vendor_email,
        rows: JSON.stringify(supabaseTicket.rows)
      })
      .select()
      .single()

    if (error) {
      console.error("Error creating ticket in Supabase:", error)
      
      // Si hay error al guardar el ticket, revertir los incrementos
      for (const result of incrementResults) {
        if (result.success) {
          console.log(`Revirtiendo incremento para ${result.number} debido a error al guardar ticket`)
          await supabaseAdmin.rpc('decrement_number_sold_safely', {
            p_event_id: eventId,
            p_number_range: result.number,
            p_decrement: result.requested
          }).catch(e => console.error(`Error al revertir incremento para ${result.number}:`, e))
        }
      }
      
      return null
    }

    console.log(`Ticket creado exitosamente: ${supabaseTicket.id}`)
    return mapTicketFromSupabase(data)
  } catch (error) {
    console.error("Error in createTicket:", error)
    return null
  }
}

// Modificar la función updateTicket para que solo actualice en Supabase
export async function updateTicket(ticket: Ticket, eventId: string, signal?: AbortSignal): Promise<Ticket | null | { success: false, message: string, status: string, numberInfo?: { number: string, remaining: number, requested: number } }> {
  try {
    // Asegurar que el ticket tenga un vendedor asociado
    const currentVendorEmail = safeGetItem("currentVendorEmail")
    if (!currentVendorEmail) {
      throw new Error("No se encontró email de vendedor actual")
    }

    // Asegurar que solo se puedan actualizar tickets propios
    if (ticket.vendorEmail && ticket.vendorEmail !== currentVendorEmail) {
      throw new Error("No puedes modificar tickets de otros vendedores")
    }
    
    // Obtener el ticket original para comparar cambios
    const { data: originalTicket, error: fetchError } = await supabase
      .from("tickets")
      .select("*")
      .eq("id", ticket.id)
      .single()
      
    if (fetchError) {
      console.error("Error al obtener el ticket original:", fetchError)
      return null
    }
    
    // Mapear el ticket original al formato de la aplicación
    const originalTicketMapped = mapTicketFromSupabase(originalTicket)
    
    // Crear un mapa de los números originales y sus tiempos para comparar
    const originalNumbersMap = new Map<string, number>()
    originalTicketMapped.rows.forEach(row => {
      if (row.actions && row.times) {
        originalNumbersMap.set(row.actions, parseInt(row.times, 10) || 0)
      }
    })
    
    // PRIMERA VERIFICACIÓN: Comprobar límites de números para cada fila del ticket antes de cualquier operación
    console.log("VERIFICACIÓN PREVIA: Comprobando límites de números antes de actualizar el ticket")
    
    // Actualizar contadores de números vendidos ANTES de actualizar el ticket
    // Esto asegura que no se pueda actualizar un ticket si no se pueden incrementar los contadores
    const incrementResults: {number: string, success: boolean, remaining: number, requested: number}[] = []
    const decrementResults: {number: string, success: boolean, amount: number}[] = []
    
    // Primero, decrementar contadores para números que disminuyen su cantidad o se eliminan
    // Crear un mapa de los nuevos números y sus tiempos para comparar
    const newNumbersMap = new Map<string, number>()
    ticket.rows.forEach(row => {
      if (row.actions && row.times) {
        newNumbersMap.set(row.actions, parseInt(row.times, 10) || 0)
      }
    })
    
    // Verificar números que disminuyen o se eliminan
    for (const [originalNumber, originalTimes] of originalNumbersMap.entries()) {
      const newTimes = newNumbersMap.get(originalNumber) || 0
      const timesToDecrement = Math.max(0, originalTimes - newTimes)
      
      if (timesToDecrement > 0) {
        console.log(`Decrementando tiempos para el número ${originalNumber}: ${originalTimes} -> ${newTimes} (decremento: ${timesToDecrement})`)
        
        // Decrementar el contador para este número
        const decrementSuccess = await import("./number-limits").then(module => {
          return module.decrementNumberSold(eventId, originalNumber, timesToDecrement)
        })
        
        decrementResults.push({
          number: originalNumber,
          success: decrementSuccess,
          amount: timesToDecrement
        })
        
        if (!decrementSuccess) {
          console.warn(`No se pudo decrementar el contador para ${originalNumber} en ${timesToDecrement}`)
        }
      }
    }
    
    // Luego, incrementar contadores para números que aumentan su cantidad
    for (const row of ticket.rows) {
      if (row.actions && row.times) {
        const numberToCheck = row.actions
        const newTimesToSell = parseInt(row.times, 10) || 0
        
        if (isNaN(newTimesToSell) || newTimesToSell < 0) {
          return {
            success: false,
            status: "error",
            message: `Cantidad inválida para el número ${numberToCheck}: ${row.times}`
          }
        }
        
        // Obtener la cantidad original de tiempos para este número
        const originalTimes = originalNumbersMap.get(numberToCheck) || 0
        
        // Calcular la diferencia (solo incrementar si hay más tiempos que antes)
        const timesToIncrement = Math.max(0, newTimesToSell - originalTimes)
        
        // Si no hay incremento, continuar con el siguiente número
        if (timesToIncrement === 0) {
          console.log(`No hay cambio en tiempos para el número ${numberToCheck}: ${originalTimes} -> ${newTimesToSell}`)
          continue
        }
        
        console.log(`Incrementando tiempos para el número ${numberToCheck}: ${originalTimes} -> ${newTimesToSell} (incremento: ${timesToIncrement})`)
        
        // Verificación estricta de disponibilidad del número solo para el incremento
        const { available, remaining } = await checkNumberAvailability(eventId, numberToCheck, timesToIncrement)
        
        if (!available) {
          console.warn(`VERIFICACIÓN PREVIA FALLIDA: El número ${numberToCheck} no tiene suficientes tiempos disponibles`)
          return {
            success: false,
            status: "warning",
            message: `El número ${numberToCheck} solo tiene ${remaining} tiempos disponibles y estás intentando agregar ${timesToIncrement} más.`,
            numberInfo: {
              number: numberToCheck,
              remaining: remaining,
              requested: timesToIncrement
            }
          }
        }
        
        // Verificar si se puede incrementar el contador sin exceder el límite
        const incrementSuccess = await incrementNumberSold(eventId, numberToCheck, timesToIncrement)
        
        // Guardar el resultado para cada número
        incrementResults.push({
          number: numberToCheck,
          success: incrementSuccess,
          remaining: remaining,
          requested: timesToIncrement
        })
        
        // Si alguno falla, revertir todos los incrementos anteriores y retornar error
        if (!incrementSuccess) {
          console.error(`INCREMENTO FALLIDO: No se pudo incrementar el contador para ${numberToCheck}`)
          
          // Revertir incrementos previos exitosos
          for (const result of incrementResults) {
            if (result.success) {
              // Intentar decrementar (revertir) el contador
              console.log(`Intentando revertir incremento para ${result.number}`)
              await supabaseAdmin.rpc('decrement_number_sold_safely', {
                p_event_id: eventId,
                p_number_range: result.number,
                p_decrement: result.requested
              }).catch(e => console.error(`Error al revertir incremento para ${result.number}:`, e))
            }
          }
          
          return {
            success: false,
            status: "error",
            message: `No se pudo actualizar el ticket. El número ${numberToCheck} ha alcanzado su límite máximo de ventas (${remaining} disponibles).`,
            numberInfo: {
              number: numberToCheck,
              remaining: remaining,
              requested: timesToIncrement
            }
          }
        }
      }
    }

    // Asegurar que el ticket tenga vendorEmail
    const updatedTicket = {
      ...ticket,
      vendorEmail: currentVendorEmail,
    }

    const supabaseTicket = mapTicketToSupabase(updatedTicket, eventId)

    // Solo si todos los incrementos fueron exitosos, actualizar el ticket en Supabase
    const { data, error } = await supabaseAdmin
      .from("tickets")
      .update({
        id: supabaseTicket.id,
        event_id: supabaseTicket.event_id,
        client_name: supabaseTicket.client_name,
        amount: supabaseTicket.amount,
        numbers: supabaseTicket.numbers,
        vendor_email: supabaseTicket.vendor_email,
        rows: JSON.stringify(supabaseTicket.rows)
      })
      .eq("id", ticket.id)
      .select()
      .single()

    if (error) {
      console.error("Error updating ticket in Supabase:", error)
      
      // Si hay error al actualizar el ticket, revertir los incrementos
      for (const result of incrementResults) {
        if (result.success) {
          console.log(`Revirtiendo incremento para ${result.number} debido a error al actualizar ticket`)
          await supabaseAdmin.rpc('decrement_number_sold_safely', {
            p_event_id: eventId,
            p_number_range: result.number,
            p_decrement: result.requested
          }).catch(e => console.error(`Error al revertir incremento para ${result.number}:`, e))
        }
      }
      
      return null
    }

    console.log(`Ticket actualizado exitosamente: ${supabaseTicket.id}`)
    return mapTicketFromSupabase(data)
  } catch (error) {
    console.error("Error in updateTicket:", error)
    return null
  }
}

// Modificar la función deleteTicket para que decremente los contadores de números al eliminar
export async function deleteTicket(ticketId: string, eventId: string): Promise<boolean> {
  try {
    // Asegurar que el ticket tenga un vendedor asociado
    const currentVendorEmail = safeGetItem("currentVendorEmail")
    if (!currentVendorEmail) {
      throw new Error("No se encontró email de vendedor actual")
    }

    // Obtener el ticket completo para acceder a sus números y decrementar contadores
    const { data: ticketData, error: ticketError } = await supabase
      .from("tickets")
      .select("*")
      .eq("id", ticketId)
      .single()

    if (ticketError) {
      console.error("Error obteniendo datos del ticket:", ticketError)
      return false
    }

    // Verificar que el ticket pertenezca al vendedor actual
    if (ticketData.vendor_email && ticketData.vendor_email !== currentVendorEmail) {
      throw new Error("No puedes eliminar tickets de otros vendedores")
    }

    // Parsear las filas del ticket para obtener los números y sus cantidades
    let ticketRows = []
    try {
      ticketRows = Array.isArray(ticketData.rows) ? ticketData.rows : JSON.parse(ticketData.rows || "[]")
    } catch (parseError) {
      console.error("Error al parsear filas del ticket:", parseError)
      // Continuar con la eliminación aunque no se puedan decrementar contadores
    }

    // Decrementar contadores para cada número en el ticket ANTES de eliminarlo
    const decrementPromises = []
    const decrementResults = []

    // Crear un mapa para consolidar números duplicados en el ticket
    const numbersMap = new Map()
    for (const row of ticketRows) {
      if (row.actions && row.times) {
        const number = row.actions
        const times = parseInt(row.times, 10) || 0
        
        if (numbersMap.has(number)) {
          numbersMap.set(number, numbersMap.get(number) + times)
        } else {
          numbersMap.set(number, times)
        }
      }
    }

    // Decrementar cada número consolidado
    for (const [number, times] of numbersMap.entries()) {
      if (times > 0) {
        console.log(`Decrementando contador para número ${number} en ${times} al eliminar ticket ${ticketId}`)
        const decrementPromise = import("./number-limits").then(module => {
          return module.decrementNumberSold(eventId, number, times)
            .then(success => {
              decrementResults.push({ number, times, success })
              return success
            })
            .catch(error => {
              console.error(`Error al decrementar contador para ${number}:`, error)
              decrementResults.push({ number, times, success: false })
              return false
            })
        })
        decrementPromises.push(decrementPromise)
      }
    }

    // Esperar a que todos los decrementos se completen
    await Promise.all(decrementPromises)

    // Registrar resultados de los decrementos
    const allDecrementsSuccessful = decrementResults.every(result => result.success)
    if (!allDecrementsSuccessful) {
      console.warn("Algunos contadores no pudieron ser decrementados correctamente:", 
        decrementResults.filter(r => !r.success).map(r => `${r.number}:${r.times}`).join(", "))
    }

    // Eliminar de Supabase
    const { error: deleteError } = await supabaseAdmin.from("tickets").delete().eq("id", ticketId)

    if (deleteError) {
      console.error("Error deleting ticket from Supabase:", deleteError)
      return false
    }

    console.log(`Ticket ${ticketId} eliminado exitosamente y contadores actualizados`)
    return true
  } catch (error) {
    console.error("Error in deleteTicket:", error)
    return false
  }
}

// Eliminar la función updateLocalTickets ya que no la necesitamos más
// function updateLocalTickets(eventId: string, vendorEmail: string, updateFn: (tickets: Ticket[]) => Ticket[]) {
//   ...
// }

// Función para migrar tickets sin vendedor
export async function migrateTicketsWithoutVendor(eventId: string): Promise<boolean> {
  try {
    // Obtener el email del vendedor actual
    const currentVendorEmail = safeGetItem("currentVendorEmail")
    if (!currentVendorEmail) {
      console.error("No se encontró email de vendedor actual")
      return false
    }

    // Obtener tickets sin vendedor para este evento
    const { data: ticketsWithoutVendor, error } = await supabase
      .from("tickets")
      .select("*")
      .eq("event_id", eventId)
      .is("vendor_email", null)

    if (error) {
      console.error("Error al buscar tickets sin vendedor:", error)
      return false
    }

    if (!ticketsWithoutVendor || ticketsWithoutVendor.length === 0) {
      console.log("No hay tickets sin vendedor para migrar")
      return true
    }

    console.log(`Migrando ${ticketsWithoutVendor.length} tickets sin vendedor...`)

    // Actualizar cada ticket sin vendedor
    const updatePromises = ticketsWithoutVendor.map(async (ticket) => {
      try {
        const { error: updateError } = await supabaseAdmin
          .from("tickets")
          .update({ vendor_email: currentVendorEmail })
          .eq("id", ticket.id)

        if (updateError) {
          console.error(`Error al actualizar ticket ${ticket.id}:`, updateError)
          return false
        }

        return true
      } catch (updateError) {
        console.error(`Error al procesar ticket ${ticket.id}:`, updateError)
        return false
      }
    })

    // Esperar a que todas las actualizaciones terminen
    const results = await Promise.all(updatePromises)
    const allSuccessful = results.every((result) => result === true)

    if (allSuccessful) {
      console.log("Todos los tickets fueron migrados exitosamente")
    } else {
      console.warn("Algunos tickets no pudieron ser migrados")
    }

    return allSuccessful
  } catch (error) {
    console.error("Error en migrateTicketsWithoutVendor:", error)
    return false
  }
}

// Modificar la función subscribeToTickets para mantenerla funcional
export function subscribeToTickets(eventId: string, callback: (tickets: Ticket[]) => void): () => void {
  // Verificar si estamos en el navegador
  if (typeof window === "undefined") {
    console.log("No se puede suscribir a tickets en el servidor")
    return () => {} // Retornar función vacía en el servidor
  }

  // Obtener el email del vendedor actual
  const currentVendorEmail = safeGetItem("currentVendorEmail")
  if (!currentVendorEmail) {
    console.error("No se encontró email de vendedor actual")
    return () => {}
  }

  try {
    // Crear un canal con un ID único para evitar conflictos
    const channelId = `tickets-changes-${eventId}-${currentVendorEmail}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`

    console.log(`Creando canal de suscripción para tickets: ${channelId}`)

    // Verificar si ya existe una suscripción activa y eliminarla
    const existingChannels = supabase.getChannels()
    existingChannels.forEach(channel => {
      if (channel.topic.startsWith(`realtime:tickets-changes-${eventId}-${currentVendorEmail}`)) {
        console.log(`Eliminando canal existente: ${channel.topic}`)
        try {
          supabase.removeChannel(channel)
        } catch (removeError) {
          console.error("Error al eliminar canal existente:", removeError)
          // Continuar con la operación incluso si hay error al eliminar
        }
      }
    })
    
    // Esperar un momento después de eliminar canales para evitar conflictos
    // Variable para rastrear si el canal está activo
    let isChannelActive = true;

    const channel = supabase.channel(channelId, {
      config: {
        broadcast: { self: true },
        presence: { key: "" },
        // Aumentar el tiempo de espera para evitar cierres prematuros
        timeout: 60000, // 60 segundos
        retryIntervalMs: 3000, // 3 segundos entre reintentos
      },
    })

    // Configurar la suscripción con manejo de errores mejorado
    channel
      .on(
        "postgres_changes",
        {
          event: "*", // Escuchar todos los eventos (INSERT, UPDATE, DELETE)
          schema: "public",
          table: "tickets",
          filter: `event_id=eq.${eventId}&vendor_email=eq.${currentVendorEmail}`,
        },
        async (payload) => {
          // Evitar procesamiento si el canal ya no está activo
          if (!isChannelActive) return;
          
          try {
            console.log("Cambio detectado en tickets:", payload)
            // Cuando hay un cambio, obtener todos los tickets actualizados
            const tickets = await getTickets(eventId)
            
            // Verificar nuevamente si el canal sigue activo antes de llamar al callback
            if (isChannelActive) {
              try {
                callback(tickets)
              } catch (callbackError) {
                console.error("Error en callback de tickets:", callbackError)
              }
            }
          } catch (error) {
            console.error("Error al procesar cambio en tickets:", error)
          }
        },
      )
      .subscribe((status, error) => {
        console.log(`Estado de suscripción a tickets (${channelId}):`, status)

        if (status === 'SUBSCRIBED') {
          console.log(`Suscripción activa para tickets: ${channelId}`)
          // Cargar datos iniciales después de suscribirse
          getTickets(eventId)
            .then(tickets => {
              if (isChannelActive) {
                try {
                  callback(tickets)
                } catch (initialCallbackError) {
                  console.error("Error en callback inicial:", initialCallbackError)
                }
              }
            })
            .catch(initialDataError => {
              console.error("Error al cargar datos iniciales:", initialDataError)
            })
        } else if (status === 'CHANNEL_ERROR') {
          console.error(`Error en la suscripción a tickets (${channelId}):`, error)
        } else if (status === 'CLOSED') {
          console.log(`Canal cerrado: ${channelId}`)
          isChannelActive = false;
        } else if (status === 'TIMED_OUT') {
          console.log(`Canal con timeout: ${channelId}`)
          isChannelActive = false;
        }
      })

    // Devolver función para cancelar la suscripción
    return () => {
      console.log(`Cancelando suscripción al canal de tickets ${channelId}`)
      isChannelActive = false;
      try {
        supabase.removeChannel(channel)
      } catch (cleanupError) {
        console.error("Error al limpiar canal:", cleanupError)
        // Continuar incluso si hay error al limpiar
      }
    }
  } catch (error) {
    console.error("Error al crear suscripción a tickets:", error)
    // Retornar una función vacía en caso de error
    return () => {
      console.log("Limpieza de suscripción a tickets fallida")
    }
  }
}

// Eliminar o simplificar la función migrateTicketsFormat ya que no la necesitamos más
export async function migrateTicketsFormat(): Promise<boolean> {
  // Ya no necesitamos migrar tickets de localStorage a Supabase
  return true
}

