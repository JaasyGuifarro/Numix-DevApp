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
    // Verificar si ya existe un ticket con exactamente la misma información
    // Ahora no solo verificamos el nombre del cliente, sino también los números y cantidades
    const { data, error } = await supabase
      .from("tickets")
      .select("*")
      .eq("event_id", eventId)
      .eq("client_name", ticket.clientName)
      .eq("vendor_email", ticket.vendorEmail || "")

    if (error) {
      console.error("Error checking for duplicate ticket:", error)
      return false
    }

    // Si no hay tickets con el mismo nombre, no es duplicado
    if (!data || data.length === 0) {
      return false
    }

    // Verificar si alguno de los tickets existentes tiene exactamente los mismos números y cantidades
    return data.some((existingTicket) => {
      // Excluir el ticket actual en caso de actualización
      if (existingTicket.id === ticket.id) {
        return false
      }
      
      // Convertir el ticket de Supabase al formato de la aplicación
      const mappedTicket = mapTicketFromSupabase(existingTicket);
      
      // Verificar si tienen exactamente los mismos números y cantidades
      // Primero, verificar si tienen la misma cantidad de filas
      if (mappedTicket.rows.length !== ticket.rows.length) {
        return false
      }
      
      // Crear mapas de números y cantidades para comparación eficiente
      const ticketNumberMap = new Map();
      ticket.rows.forEach(row => {
        if (row.actions && row.times) {
          ticketNumberMap.set(row.actions, parseInt(row.times, 10));
        }
      });
      
      const existingNumberMap = new Map();
      mappedTicket.rows.forEach(row => {
        if (row.actions && row.times) {
          existingNumberMap.set(row.actions, parseInt(row.times, 10));
        }
      });
      
      // Verificar si los mapas tienen las mismas claves (números)
      if (ticketNumberMap.size !== existingNumberMap.size) {
        return false;
      }
      
      // Verificar si cada número tiene la misma cantidad
      for (const [number, times] of ticketNumberMap.entries()) {
        if (existingNumberMap.get(number) !== times) {
          return false;
        }
      }
      
      // Si llegamos aquí, los tickets tienen exactamente los mismos números y cantidades
      return true;
    });
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
      const { available, remaining, limitId } = await checkNumberAvailability(eventId, numberToCheck, timesToSell, signal)
      
      // Solo aplicar restricciones si el número tiene un límite configurado
      if (limitId) {
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

    // Incrementar contadores de números vendidos ANTES de crear el ticket
    const incrementResults: {number: string, success: boolean, remaining: number, requested: number}[] = []
    
    for (const row of ticket.rows) {
      if (row.actions && row.times) {
        const numberToIncrement = row.actions
        const timesToIncrement = parseInt(row.times, 10)
        
        // Verificar si el número tiene límite antes de intentar incrementar
        const { limitId } = await checkNumberAvailability(eventId, numberToIncrement, timesToIncrement)
        
        // Solo incrementar el contador si el número tiene un límite configurado
        if (limitId) {
          const incrementSuccess = await incrementNumberSold(eventId, numberToIncrement, timesToIncrement)
          const { remaining } = await checkNumberAvailability(eventId, numberToIncrement, timesToIncrement)
          
          incrementResults.push({
            number: numberToIncrement,
            success: incrementSuccess,
            remaining: remaining,
            requested: timesToIncrement
          })
          
          if (!incrementSuccess) {
            console.error(`INCREMENTO FALLIDO: No se pudo incrementar el contador para ${numberToIncrement}`)
            
            // Revertir incrementos previos exitosos
            for (const result of incrementResults) {
              if (result.success) {
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
        rows: JSON.stringify(supabaseTicket.rows),
        created_at: new Date().toISOString(), // Añadir timestamp de creación
        updated_at: new Date().toISOString() // Añadir timestamp de actualización
      })
      .select()
      .single()
      
    // Verificar si la operación fue cancelada
    if (signal?.aborted) {
      console.log("Operación createTicket cancelada después de la inserción")
      return null
    }

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

// Modificar la función updateTicket para que solo actualice en Supabase con mejor manejo de errores
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

    // Solo si todos los incrementos fueron exitosos, actualizar el ticket en Supabase con mejor manejo de errores
    const { data, error } = await supabaseAdmin
      .from("tickets")
      .update({
        id: supabaseTicket.id,
        event_id: supabaseTicket.event_id,
        client_name: supabaseTicket.client_name,
        amount: supabaseTicket.amount,
        numbers: supabaseTicket.numbers,
        vendor_email: supabaseTicket.vendor_email,
        rows: JSON.stringify(supabaseTicket.rows),
        updated_at: new Date().toISOString() // Añadir timestamp de actualización
      })
      .eq("id", ticket.id)
      .select()
      .single()
      
    // Verificar si la operación fue cancelada
    if (signal?.aborted) {
      console.log("Operación updateTicket cancelada después de la actualización")
      return null
    }

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
      
      // Y restaurar los decrementos
      for (const result of decrementResults) {
        if (result.success) {
          console.log(`Restaurando decremento para ${result.number} debido a error al actualizar ticket`)
          await supabaseAdmin.rpc('increment_number_sold_safely', {
            p_event_id: eventId,
            p_number_range: result.number,
            p_increment: result.amount
          }).catch(e => console.error(`Error al restaurar decremento para ${result.number}:`, e))
        }
      }
      
      return {
        success: false,
        status: "error",
        message: `Error al actualizar el ticket: ${error.message || "Error desconocido"}`
      }
    }
    
    // Verificar que el ticket se actualizó correctamente
    if (!data) {
      console.error("No se recibieron datos después de actualizar el ticket")
      return {
        success: false,
        status: "error",
        message: "No se pudo actualizar el ticket. Por favor, intente nuevamente."
      }
    }

    console.log(`Ticket actualizado exitosamente: ${supabaseTicket.id}`)
    
    // Realizar una verificación adicional para confirmar que el ticket existe en la base de datos
    try {
      const { data: verificationData, error: verificationError } = await supabase
        .from("tickets")
        .select("id")
        .eq("id", ticket.id)
        .single()
      
      if (verificationError || !verificationData) {
        console.warn(`Verificación post-actualización: No se encontró el ticket ${ticket.id}`)
      } else {
        console.log(`Verificación post-actualización: Ticket ${ticket.id} confirmado en la base de datos`)
      }
    } catch (verificationError) {
      console.error("Error en verificación post-actualización:", verificationError)
    }
    
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

// Modificar la función subscribeToTickets para optimizar rendimiento y evitar actualizaciones innecesarias
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

  // Variables para control de reconexión
  let reconnectAttempts = 0
  const maxReconnectAttempts = 5
  const baseReconnectDelay = 2000
  let reconnectTimer: NodeJS.Timeout | null = null
  let heartbeatTimer: NodeJS.Timeout | null = null
  let isReconnecting = false
  let currentChannel: RealtimeChannel | null = null
  let isProcessingUpdate = false
  let lastUpdateTime = Date.now()
  const updateDebounceTime = 1000 // 1 segundo entre actualizaciones

  // Función para procesar actualizaciones de manera segura
  const processUpdate = async () => {
    // Evitar actualizaciones muy frecuentes
    const now = Date.now()
    if (now - lastUpdateTime < updateDebounceTime) {
      return
    }
    lastUpdateTime = now

    // Evitar procesamiento concurrente
    if (isProcessingUpdate) {
      return
    }

    try {
      isProcessingUpdate = true
      const tickets = await getTickets(eventId)
      callback(tickets)
    } catch (error) {
      console.error("Error al procesar actualización:", error)
    } finally {
      isProcessingUpdate = false
    }
  }

  // Función para crear un nuevo canal
  const createChannel = (reason = "inicial") => {
    try {
      const channelId = `tickets-changes-${eventId}-${currentVendorEmail}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
      console.log(`Creando canal de suscripción para tickets (${reason}): ${channelId}`)
      
      return supabase.channel(channelId, {
        config: {
          broadcast: { self: true },
          presence: { key: currentVendorEmail }
        },
      })
    } catch (error) {
      console.error("Error al crear canal:", error)
      return null
    }
  }

  // Función para manejar la reconexión
  const handleReconnect = async () => {
    if (isReconnecting) return
    isReconnecting = true

    try {
      // Incrementar contador de intentos
      reconnectAttempts++
      
      // Calcular delay exponencial
      const delay = Math.min(baseReconnectDelay * Math.pow(2, reconnectAttempts - 1), 30000)
      
      console.log(`Intento de reconexión ${reconnectAttempts}/${maxReconnectAttempts} en ${delay}ms`)
      
      // Esperar antes de intentar reconectar
      await new Promise(resolve => setTimeout(resolve, delay))
      
      // Limpiar el canal anterior
      if (currentChannel) {
        try {
          await currentChannel.unsubscribe()
          await supabase.removeChannel(currentChannel)
        } catch (e) {
          // Ignorar errores al limpiar
        }
      }
      
      // Crear y configurar nuevo canal
      const newChannel = createChannel("reconexión")
      if (!newChannel) {
        throw new Error("No se pudo crear nuevo canal")
      }
      
      currentChannel = setupChannel(newChannel)
      
      // Si la reconexión es exitosa, resetear contador
      if (currentChannel) {
        reconnectAttempts = 0
        isReconnecting = false
      }
    } catch (error) {
      console.error("Error en reconexión:", error)
      
      // Si alcanzamos el máximo de intentos, notificar y detener
      if (reconnectAttempts >= maxReconnectAttempts) {
        console.error("Se alcanzó el máximo de intentos de reconexión")
      }
      
      isReconnecting = false
    }
  }

  // Función para configurar el canal
  const setupChannel = (channel: RealtimeChannel | null) => {
    if (!channel) return null

    try {
      channel
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "tickets",
            filter: `event_id=eq.${eventId}&vendor_email=eq.${currentVendorEmail}`,
          },
          () => {
            processUpdate().catch(console.error)
          }
        )
        .subscribe(async (status: string) => {
          console.log(`Estado de suscripción a tickets: ${status}`)

          if (status === "SUBSCRIBED") {
            console.log("Suscripción activa para tickets")
            // Cargar datos iniciales
            await processUpdate().catch(console.error)

            // Iniciar heartbeat
            if (heartbeatTimer) clearInterval(heartbeatTimer)
            heartbeatTimer = setInterval(async () => {
              try {
                if (!channel) throw new Error("Canal no disponible")
                await channel.send({
                  type: "broadcast",
                  event: "ping",
                  payload: { timestamp: Date.now() }
                })
              } catch (error) {
                console.warn("Error en heartbeat:", error)
                handleReconnect()
              }
            }, 30000) // Heartbeat cada 30 segundos
          } else if (status === "CHANNEL_ERROR" || status === "CLOSED" || status === "TIMED_OUT") {
            console.log(`Canal ${status.toLowerCase()}, intentando reconexión...`)
            handleReconnect()
          }
        })

      return channel
    } catch (error) {
      console.error("Error al configurar canal:", error)
      return null
    }
  }

  // Crear y configurar el canal inicial
  const initialChannel = createChannel()
  currentChannel = setupChannel(initialChannel)

  // Función de limpieza
  return () => {
    console.log("Limpiando suscripción a tickets")
    if (reconnectTimer) clearTimeout(reconnectTimer)
    if (heartbeatTimer) clearInterval(heartbeatTimer)
    
    if (currentChannel) {
      try {
        currentChannel.unsubscribe()
        supabase.removeChannel(currentChannel)
      } catch (error) {
        console.warn("Error al remover canal:", error)
      }
    }
  }
}

// Eliminar o simplificar la función migrateTicketsFormat ya que no la necesitamos más
export async function migrateTicketsFormat(): Promise<boolean> {
  // Ya no necesitamos migrar tickets de localStorage a Supabase
  return true
}

