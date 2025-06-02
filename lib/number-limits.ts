import { supabase, supabaseAdmin } from "./supabase"
import { getSupabaseClient, SupabaseClientFixed } from "./fetch-utils"
import { LogLevel, log } from "./error-logger"
import { cachedQuery, invalidateCache } from "./cache-manager"
import { executeRPCWithFallback } from "./rpc-fallback-utils"
import { callRPCWithRetry } from "./rpc-retry"
import { validateWithSchema, numberSoldSchema } from "./validation-schemas"

interface NumberLimit {
  id: string
  event_id: string
  number_range: string
  max_times: number
  times_sold: number
  created_at: string
}

/**
 * Obtiene los límites de números para un evento específico
 * @param eventId - ID del evento
 * @param options - Opciones de caché
 * @returns Array de límites de números
 */
export async function getNumberLimits(
  eventId: string,
  options: { bypassCache?: boolean } = {}
): Promise<NumberLimit[]> {
  try {
    if (!eventId) {
      log(LogLevel.DEBUG, "ID de evento no proporcionado en getNumberLimits")
      return []
    }
    
    // Usar el sistema de caché para la consulta con manejo mejorado de errores
    try {
      return await cachedQuery<NumberLimit[]>(
        async () => {
          // Definir la función de fallback con mejor manejo de errores
          const fallbackImplementation = async () => {
            try {
              const client = getSupabaseClient() as SupabaseClientFixed
              const { data, error } = await client
                .from("number_limits")
                .select("*")
                .eq("event_id", eventId)
                .order("number_range", { ascending: true })

              if (error) {
                log(LogLevel.DEBUG, `Error al obtener límites de números: ${error.message || error}`)
                return []
              }

              return data || []
            } catch (fallbackError) {
              log(LogLevel.DEBUG, `Error en implementación fallback de getNumberLimits: ${fallbackError instanceof Error ? fallbackError.message : "Error desconocido"}`)
              // Devolver array vacío para evitar que la UI se rompa
              return []
            }
          }
          
          try {
            // Ejecutar RPC con fallback sin timeout para evitar condiciones de carrera
            const result = await executeRPCWithFallback<NumberLimit[], {p_event_id: string}>(
              'get_number_limits',
              { p_event_id: eventId },
              fallbackImplementation,
              'getNumberLimits'
            )
            // Asegurar que el resultado sea un array de NumberLimit
            return Array.isArray(result) ? result : []
          } catch (rpcError) {
            // Si falla la RPC con fallback, usar directamente la implementación de fallback
            log(LogLevel.DEBUG, `Usando implementación directa de fallback para getNumberLimits: ${rpcError instanceof Error ? rpcError.message : "Error desconocido"}`)
            return await fallbackImplementation()
          }
        },
        {
          key: `number_limits_${eventId}`,
          ttl: 30000, // 30 segundos de caché
          bypass: options.bypassCache || false
        }
      )
    } catch (cacheError) {
      log(LogLevel.DEBUG, `Error en caché de getNumberLimits: ${cacheError instanceof Error ? cacheError.message : "Error desconocido"}`)
      
      // Si falla el sistema de caché, intentar directamente con la implementación de fallback
      try {
        const client = getSupabaseClient() as SupabaseClientFixed
        const { data, error } = await client
          .from("number_limits")
          .select("*")
          .eq("event_id", eventId)
          .order("number_range", { ascending: true })

        if (error) {
          log(LogLevel.DEBUG, `Error al obtener límites de números (recuperación): ${error.message || error}`)
          return []
        }

        return data || []
      } catch (finalError) {
        // Último recurso: devolver array vacío para evitar que la UI se rompa
        log(LogLevel.DEBUG, `Error final en getNumberLimits: ${finalError instanceof Error ? finalError.message : "Error desconocido"}`)
        return []
      }
    }
  } catch (error) {
    // Usar LogLevel.DEBUG en lugar de console.error para reducir ruido en la consola
    log(LogLevel.DEBUG, `Error en getNumberLimits: ${error instanceof Error ? error.message : "Error desconocido"}`)
    return []
  }
}

/**
 * Crea o actualiza un límite de número para un evento
 * @param eventId - ID del evento
 * @param numberRange - Rango de números (formato: "X" o "X-Y")
 * @param maxTimes - Número máximo de veces que se puede vender
 * @returns El límite creado o actualizado, o null si hubo un error
 */
export async function updateNumberLimit(
  eventId: string,
  numberRange: string,
  maxTimes: number
): Promise<NumberLimit | null> {
  try {
    // Definir la función de fallback con mejor manejo de errores
    const fallbackImplementation = async () => {
      try {
        // Verificar si ya existe un límite para este número
        const client = getSupabaseClient() as SupabaseClientFixed
        const { data: existingLimit, error: fetchError } = await client
          .from("number_limits")
          .select("*")
          .eq("event_id", eventId)
          .eq("number_range", numberRange)
          .single()

        if (fetchError && fetchError.code !== "PGRST116") {
          // PGRST116 es el código para "no se encontraron resultados"
          log(LogLevel.DEBUG, `Error al verificar límite existente: ${fetchError.message || fetchError}`)
          return null
        }

        if (existingLimit) {
          // Actualizar el límite existente
          const adminClient = getSupabaseClient(true) as SupabaseClientFixed
          const { data, error } = await adminClient
            .from("number_limits")
            .update({ max_times: maxTimes })
            .eq("id", existingLimit.id)
            .select()
            .single()

          if (error) {
            log(LogLevel.DEBUG, `Error al actualizar límite: ${error.message || error}`)
            return null
          }

          return data
        } else {
          // Crear un nuevo límite
          try {
            const adminClient = getSupabaseClient(true) as SupabaseClientFixed
            const { data, error } = await adminClient
              .from("number_limits")
              .insert({
                event_id: eventId,
                number_range: numberRange,
                max_times: maxTimes,
                times_sold: 0,
              })
              .select()
              .single()

            if (error) {
              log(LogLevel.DEBUG, `Error al crear límite: ${error.message || error}`)
              return null
            }
            
            return data
          } catch (insertError) {
            log(LogLevel.DEBUG, `Excepción al crear límite: ${insertError instanceof Error ? insertError.message : 'Error desconocido'}`)
            return null
          }
        }
      } catch (fallbackError) {
        log(LogLevel.DEBUG, `Error en implementación fallback de updateNumberLimit: ${fallbackError instanceof Error ? fallbackError.message : "Error desconocido"}`)
        return null
      }
    }
    
    try {
      // Ejecutar RPC con fallback
      const result = await executeRPCWithFallback<NumberLimit | NumberLimit[], {p_event_id: string, p_number_range: string, p_max_times: number}>(
        'update_number_limit',
        { 
          p_event_id: eventId, 
          p_number_range: numberRange, 
          p_max_times: maxTimes 
        },
        fallbackImplementation,
        'updateNumberLimit'
      )
      
      // La función RPC devuelve un array con un solo elemento, así que tomamos el primero
      // Asegurar que el resultado sea del tipo NumberLimit
      if (Array.isArray(result)) {
        if (result.length > 0) {
          return result[0] as NumberLimit
        }
        // Si el array está vacío, devolver null en lugar de un array vacío
        return null
      }
      return result as NumberLimit
    } catch (rpcError) {
      // Si falla la RPC con fallback, usar directamente la implementación de fallback
      log(LogLevel.DEBUG, `Usando implementación directa de fallback para updateNumberLimit: ${rpcError instanceof Error ? rpcError.message : "Error desconocido"}`)
      return await fallbackImplementation()
    }
  } catch (error) {
    log(LogLevel.ERROR, `Error en updateNumberLimit: ${error instanceof Error ? error.message : "Error desconocido"}`)
    return null
  } finally {
    // Invalidar la caché relacionada con este evento
    try {
      invalidateCache(`number_limits_${eventId}`)
    } catch (cacheError) {
      log(LogLevel.ERROR, `Error al invalidar caché: ${cacheError instanceof Error ? cacheError.message : "Error desconocido"}`)
    }
  }
}

// Incrementar el contador de tiempos vendidos para un número
export async function incrementNumberSold(
  eventId: string,
  numberToIncrement: string,
  increment: number
): Promise<boolean> {
  try {
<<<<<<< HEAD
    // Optimización: Verificar directamente si hay un límite aplicable sin llamar a checkNumberAvailability
    // Esto evita una verificación redundante ya que checkNumberAvailability ya fue llamado previamente
    // en la función createTicket antes de llegar aquí
    
    // Obtener el límite aplicable para este número
    const client = getSupabaseClient() as SupabaseClientFixed
    const { data: limits, error: fetchError } = await client
      .from("number_limits")
      .select("*")
      .eq("event_id", eventId)
    
    if (fetchError) {
      log(LogLevel.DEBUG, `Error al verificar límites de números: ${fetchError.message || fetchError}`)
      return false
    }
    
    // Si no hay límites, el número está disponible
    if (!limits || limits.length === 0) {
      return true
    }
    
    // Buscar si el número está dentro de algún rango con límites
    let limitId: string | undefined = undefined
    let available = true
    
    for (const limit of limits) {
      if (isNumberInRange(numberToIncrement, limit.number_range)) {
        limitId = limit.id
        break
      }
    }
    
    // Si no hay límite aplicable, no hay problema
=======
    // Verificar primero si el número está disponible para vender
    const { available, remaining, limitId } = await checkNumberAvailability(eventId, numberToIncrement, increment)
    
    // Si no está disponible, rechazar inmediatamente
    if (!available) {
      return false
    }
    
    // Si no hay límite aplicable (limitId es undefined o inválido), no hay problema
>>>>>>> 624c5503d96cf6f2927785c1f1d25f0199826991
    if (!limitId) {
      log(LogLevel.DEBUG, `No hay límite aplicable para el número ${numberToIncrement}`)
      return true
    }
    
    // Definir la función de fallback con mejor manejo de errores
    const fallbackImplementation = async () => {
      return await incrementNumberSoldLegacy(eventId, numberToIncrement, increment, limitId)
    }
    
    try {
      // Obtener el límite actual para conocer el max_times
      const client = getSupabaseClient() as SupabaseClientFixed
      const { data: limitData, error: limitError } = await client
        .from("number_limits")
        .select("max_times")
        .eq("id", limitId)
        .single()
      
      if (limitError || !limitData) {
        log(LogLevel.DEBUG, `Error al obtener max_times para el límite: ${limitError?.message || "No se encontró el límite"}`)
        return await fallbackImplementation()
      }
      
      // Ejecutar RPC con fallback
      const result = await executeRPCWithFallback<boolean, {p_limit_id: string, p_increment: number, p_max_times: number}>(
        'increment_number_sold_safely',
        { 
          p_limit_id: limitId, 
          p_increment: increment, 
          p_max_times: limitData.max_times 
        },
        fallbackImplementation,
        'incrementNumberSold'
      )
      
      // Asegurar que el resultado sea de tipo boolean
      return result === true
    } catch (rpcError) {
      // Si falla la RPC con fallback, usar directamente la implementación de fallback
      log(LogLevel.DEBUG, `Usando implementación directa de fallback para incrementNumberSold: ${rpcError instanceof Error ? rpcError.message : "Error desconocido"}`)
      return await fallbackImplementation()
    }
  } catch (error) {
    log(LogLevel.ERROR, `Error en incrementNumberSold: ${error instanceof Error ? error.message : "Error desconocido"}`)
    return false
  } finally {
    // Invalidar la caché relacionada con este evento
    try {
      invalidateCache(`number_limits_${eventId}`)
    } catch (cacheError) {
      log(LogLevel.ERROR, `Error al invalidar caché: ${cacheError instanceof Error ? cacheError.message : "Error desconocido"}`)
    }
  }
}

/**
 * Método legacy para incrementar el contador (como respaldo cuando falla RPC)
 * @param eventId - ID del evento
 * @param numberToIncrement - Número a incrementar
 * @param increment - Cantidad a incrementar
 * @param limitId - ID del límite
 * @returns true si se incrementó correctamente, false en caso contrario
 */
async function incrementNumberSoldLegacy(
  eventId: string,
  numberToIncrement: string,
  increment: number,
  limitId: string
): Promise<boolean> {
  try {
    // Obtener el valor más actualizado del límite para evitar condiciones de carrera
    // Usar getSupabaseClient para asegurar los encabezados correctos
    const client = getSupabaseClient() as SupabaseClientFixed
    const { data: updatedLimit, error: refreshError } = await client
      .from("number_limits")
      .select("*")
      .eq("id", limitId)
      .single()
    
    if (refreshError) {
      log(LogLevel.ERROR, `Error al actualizar datos del límite: ${refreshError.message || refreshError}`)
      return false
    }
    
    // Verificación estricta: si no hay datos o se excedería el límite, rechazar
    if (!updatedLimit) {
      log(LogLevel.ERROR, `No se pudo obtener información actualizada del límite para ${numberToIncrement}`)
      return false
    }
    
    // Verificación estricta del límite
    if (updatedLimit.times_sold + increment > updatedLimit.max_times) {
      log(LogLevel.WARN, `Límite excedido para ${numberToIncrement}: ${updatedLimit.times_sold}/${updatedLimit.max_times}, intentando vender: ${increment}`)
      return false
    }
    
    // Incrementar el contador con una condición para evitar exceder el límite
    // Usar getSupabaseClient con useAdmin=true para asegurar los encabezados correctos
    const adminClient = getSupabaseClient(true) as SupabaseClientFixed
    const { data: updateResult, error: updateError } = await adminClient
      .from("number_limits")
      .update({ times_sold: updatedLimit.times_sold + increment })
      .eq("id", updatedLimit.id)
      .lt("times_sold", updatedLimit.max_times - increment + 1) // Asegura que no exceda el límite
      .select()
    
    if (updateError) {
      log(LogLevel.ERROR, `Error al incrementar contador: ${updateError.message || updateError}`)
      return false
    }
    
    // Verificación estricta: si no se actualizó ninguna fila, significa que se excedió el límite
    if (!updateResult || updateResult.length === 0) {
      log(LogLevel.WARN, `No se pudo incrementar el contador para ${numberToIncrement} porque excedería el límite`)
      return false
    }
    
    return true
  } catch (transactionError) {
    log(LogLevel.ERROR, `Error en la transacción para incrementar ${numberToIncrement}: ${transactionError instanceof Error ? transactionError.message : "Error desconocido"}`)
    return false
  }
}

/**
 * Verifica si un número está dentro de un rango especificado
 * @param number - El número a verificar (como string)
 * @param range - El rango a verificar (formato: "X" o "X-Y")
 * @returns true si el número está dentro del rango, false en caso contrario
 */
function isNumberInRange(number: string, range: string): boolean {
  // Validación de entrada
  if (!number || !range) {
    log(LogLevel.WARN, `Parámetros inválidos en isNumberInRange: number=${number}, range=${range}`)
    return false
  }
  
  // Convertir a número si es posible
  const num = parseInt(number, 10)
  if (isNaN(num)) {
    log(LogLevel.WARN, `Número inválido en la comparación de rangos: ${number}`)
    return false
  }
  
  // Si el rango es exactamente igual al número (como string), es una coincidencia directa
  if (range === number) {
    return true
  }
  
  // Verificar si el rango tiene el formato "XX-YY"
  if (range.includes("-")) {
    const parts = range.split("-")
    
    // Verificar que el formato sea correcto (solo dos partes)
    if (parts.length !== 2) {
      log(LogLevel.WARN, `Formato de rango inválido: ${range}. Debe ser "X-Y"`)
      return false
    }
    
    const [start, end] = parts.map(n => parseInt(n, 10))
    
    // Verificar que los valores sean números válidos
    if (isNaN(start) || isNaN(end)) {
      log(LogLevel.WARN, `Rango inválido en la comparación: ${range}`)
      return false
    }
    
    // Verificar que el rango sea lógico (inicio <= fin)
    if (start > end) {
      log(LogLevel.WARN, `Rango ilógico: ${range}. El inicio debe ser menor o igual que el fin`)
      return false
    }
    
    return num >= start && num <= end
  }
  
  // Si el rango es un número único, comparar como números
  const rangeNum = parseInt(range, 10)
  if (isNaN(rangeNum)) {
    log(LogLevel.WARN, `Rango inválido en la comparación: ${range}`)
    return false
  }
  
  return num === rangeNum
}

/**
 * Verifica si un número está disponible para vender según los límites configurados
 * @param eventId - ID del evento
 * @param numberToCheck - Número a verificar
 * @param timesToSell - Cantidad de veces que se quiere vender el número
 * @param signal - Señal de aborto opcional para cancelar la operación
 * @returns Objeto con información de disponibilidad, cantidad restante y ID del límite
 */
export async function checkNumberAvailability(
  eventId: string,
  numberToCheck: string,
  timesToSell: number,
  signal?: AbortSignal
): Promise<{ available: boolean; remaining: number; limitId?: string }> {
  try {
    // Verificar si la operación ya fue cancelada
    if (signal?.aborted) {
      log(LogLevel.INFO, "Operación checkNumberAvailability cancelada")
      return { available: false, remaining: 0 }
    }
    
    // Validar parámetros usando Zod
    const validatedData = validateWithSchema(
      numberSoldSchema,
      { eventId, number: numberToCheck, increment: timesToSell },
      'checkNumberAvailability'
    )
    
    if (!validatedData) {
      return { available: false, remaining: 0 } // La función validateWithSchema ya registra los errores
    }
    
    // Validación adicional para el número
    const parsedNumber = parseInt(numberToCheck, 10)
    if (isNaN(parsedNumber)) {
      log(LogLevel.DEBUG, `Error: Número inválido: "${numberToCheck}"`)
      return { available: false, remaining: 0 }
    }
    
    // Definir la función de fallback para usar cuando falla la RPC
    const fallbackImplementation = async () => {
      log(LogLevel.DEBUG, `Usando implementación fallback para checkNumberAvailability: ${eventId}, ${numberToCheck}`)
      
      // Obtener todos los límites para este evento
      const client = getSupabaseClient() as SupabaseClientFixed
      const { data: limits, error: fetchError } = await client
        .from("number_limits")
        .select("*")
        .eq("event_id", eventId)
      
      if (fetchError) {
        log(LogLevel.DEBUG, `Error al verificar límites de números: ${fetchError.message || fetchError}`)
        // Registrar información adicional para depuración
        log(LogLevel.DEBUG, `Detalles de la solicitud fallida: eventId=${eventId}, numberToCheck=${numberToCheck}`)
        return { available: false, remaining: 0, limitId: undefined }
      }
      
      // Si no hay límites, el número está disponible
      if (!limits || limits.length === 0) {
        return { available: true, remaining: Infinity, limitId: undefined }
      }
      
      // Buscar si el número está dentro de algún rango con límites
      for (const limit of limits) {
        if (isNumberInRange(numberToCheck, limit.number_range)) {
          // Obtener el valor más actualizado del límite para evitar condiciones de carrera
          const { data: updatedLimit, error: refreshError } = await client
            .from("number_limits")
            .select("*")
            .eq("id", limit.id)
            .single()
          
          if (refreshError) {
            log(LogLevel.DEBUG, `Error al actualizar datos del límite: ${refreshError.message || refreshError}`)
            return { available: false, remaining: 0, limitId: undefined }
          }
          
          if (!updatedLimit) {
            log(LogLevel.DEBUG, `No se pudo obtener información actualizada del límite para ${numberToCheck}`)
            return { available: false, remaining: 0, limitId: undefined }
          }
          
          // Verificación estricta: asegurar que los valores sean números válidos
          const timesSold = typeof updatedLimit.times_sold === 'number' ? updatedLimit.times_sold : 0
          const maxTimes = typeof updatedLimit.max_times === 'number' ? updatedLimit.max_times : 0
          
          // Calcular tiempos restantes
          const remaining = Math.max(0, maxTimes - timesSold)
          const available = remaining >= timesToSell
          
          // Si no está disponible, registrar un mensaje de advertencia claro
          if (!available) {
            log(LogLevel.WARN, `LÍMITE ALCANZADO: El número ${numberToCheck} en rango ${updatedLimit.number_range} no tiene suficientes tiempos disponibles. Solicitado: ${timesToSell}, Disponible: ${remaining}`)
          }
          
          // Verificación adicional: si el límite está cerca de alcanzarse, registrar una advertencia
          if (available && remaining <= 5) {
            log(LogLevel.WARN, `ADVERTENCIA: El número ${numberToCheck} está cerca de alcanzar su límite. Restante: ${remaining}, Solicitado: ${timesToSell}`)
          }
          
          return { available, remaining, limitId: updatedLimit.id }
        }
      }
      
      // Si no se encontró ningún límite aplicable, el número está disponible
      return { available: true, remaining: Infinity, limitId: undefined }
    }
    
    try {
      // Usar directamente la implementación de fallback para evitar errores de RPC
      // que estaban ocurriendo constantemente en la consola
      log(LogLevel.DEBUG, `Usando implementación directa para checkNumberAvailability: ${eventId}, ${numberToCheck}`)
      return await fallbackImplementation()
      
      // NOTA: Se ha eliminado la llamada a RPC porque estaba causando errores constantes
      // Si en el futuro se soluciona el problema con la función RPC, se puede restaurar el código
      // original que está en el historial de versiones.
    } catch (error) {
      // Mejorar el manejo de errores para reducir mensajes en la consola
      log(LogLevel.DEBUG, `Error en la implementación de fallback para checkNumberAvailability: ${error instanceof Error ? error.message : "Error desconocido"}`)
      return { available: false, remaining: 0, limitId: undefined }
    }
  } catch (error) {
    log(LogLevel.DEBUG, `Error en checkNumberAvailability: ${error instanceof Error ? error.message : "Error desconocido"}`)
    return { available: false, remaining: 0 }
  }
}

// Decrementar el contador de tiempos vendidos para un número
export async function decrementNumberSold(
  eventId: string,
  numberToDecrement: string,
  decrement: number
): Promise<boolean> {
  try {
    // Validar parámetros
    if (!eventId || !numberToDecrement || typeof decrement !== 'number' || decrement <= 0) {
      log(LogLevel.ERROR, `Parámetros inválidos en decrementNumberSold: eventId=${eventId}, numberToDecrement=${numberToDecrement}, decrement=${decrement}`)
      return false
    }

    // Verificar primero si el número tiene un límite aplicable
    const limit = await getNumberLimit(eventId, numberToDecrement)
    
    // Si no hay límite aplicable, no hay problema
    if (!limit) {
      log(LogLevel.DEBUG, `No hay límite aplicable para el número ${numberToDecrement}`)
      return true
    }
    
    // Usar directamente la implementación legacy sin intentar llamar a la RPC
    // ya que la función RPC 'decrement_number_sold' no existe o está fallando constantemente
    try {
      return await decrementNumberSoldLegacy(eventId, numberToDecrement, decrement, limit.id)
    } catch (implementationError) {
      log(LogLevel.ERROR, `Error en la implementación de decrementNumberSold: ${implementationError instanceof Error ? implementationError.message : "Error desconocido"}`)
      return false
    }
  } catch (error) {
    // Usar LogLevel.ERROR para errores críticos
    log(LogLevel.ERROR, `Error en decrementNumberSold: ${error instanceof Error ? error.message : "Error desconocido"}`)
    return false
  } finally {
    // Invalidar la caché relacionada con este evento
    try {
      invalidateCache(`number_limits_${eventId}`)
    } catch (cacheError) {
      log(LogLevel.ERROR, `Error al invalidar caché: ${cacheError instanceof Error ? cacheError.message : "Error desconocido"}`)
    }
  }
}

/**
 * Método legacy para decrementar el contador (como respaldo cuando falla RPC)
 * @param eventId - ID del evento
 * @param numberToDecrement - Número a decrementar
 * @param decrement - Cantidad a decrementar
 * @param limitId - ID del límite
 * @returns true si se decrementó correctamente, false en caso contrario
 */
async function decrementNumberSoldLegacy(
  eventId: string,
  numberToDecrement: string,
  decrement: number,
  limitId: string
): Promise<boolean> {
  try {
    // Obtener el valor más actualizado del límite
    // Usar getSupabaseClient para asegurar los encabezados correctos
    const client = getSupabaseClient() as SupabaseClientFixed
    const { data: updatedLimit, error: refreshError } = await client
      .from("number_limits")
      .select("*")
      .eq("id", limitId)
      .single()
    
    if (refreshError) {
      log(LogLevel.DEBUG, `Error al actualizar datos del límite: ${refreshError.message || refreshError}`)
      return false
    }
    
    if (!updatedLimit) {
      log(LogLevel.DEBUG, `Error: No se pudo obtener información actualizada del límite para ${numberToDecrement}`)
      return false
    }
    
    // Calcular el nuevo valor (nunca menor que 0)
    const newTimesSold = Math.max(0, updatedLimit.times_sold - decrement)
    
    // Actualizar el contador
    // Usar getSupabaseClient con useAdmin=true para asegurar los encabezados correctos
    const adminClient = getSupabaseClient(true)
    const { data: updateResult, error: updateError } = await adminClient
      .from("number_limits")
      .update({ times_sold: newTimesSold })
      .eq("id", updatedLimit.id)
      .select()
    
    if (updateError) {
      log(LogLevel.DEBUG, `Error al decrementar contador: ${updateError.message || updateError}`)
      return false
    }
    
    if (!updateResult || updateResult.length === 0) {
      log(LogLevel.WARN, `No se pudo decrementar el contador para ${numberToDecrement}`)
      return false
    }
    
    return true
  } catch (error) {
    log(LogLevel.DEBUG, `Error en la transacción para decrementar ${numberToDecrement}: ${error instanceof Error ? error.message : "Error desconocido"}`)
    return false
  }
}

/**
 * Obtiene el límite de un número específico para un evento
 * @param eventId - ID del evento
 * @param numberRange - Rango de números (formato: "X" o "X-Y")
 * @returns El límite del número o null si no existe
 */
export async function getNumberLimit(
  eventId: string,
  numberRange: string
): Promise<NumberLimit | null> {
  try {
    if (!eventId || !numberRange) {
      log(LogLevel.ERROR, "Error: Parámetros incompletos en getNumberLimit")
      return null
    }
    
    try {
      // Llamar a la función RPC para obtener el límite específico
      const data = await callRPCWithRetry<NumberLimit[]>('get_number_limit', {
        p_event_id: eventId,
        p_number_range: numberRange
      })
      
      // La función RPC devuelve un conjunto de registros, tomamos el primero
      if (data && data.length > 0) {
        return data[0]
      }
      
      return null
    } catch (rpcError) {
      log(LogLevel.ERROR, `Error al llamar get_number_limit RPC: ${rpcError instanceof Error ? rpcError.message : "Error desconocido"}`)
      
      // Fallback a la implementación anterior si falla la RPC
      // Usar supabaseAdmin para evitar problemas con RLS y encabezados
      const { data: limits, error: fetchError } = await supabaseAdmin
        .from("number_limits")
        .select("*")
        .eq("event_id", eventId)
        .eq("number_range", numberRange)

      if (fetchError) {
        log(LogLevel.ERROR, `Error obteniendo límites de números: ${fetchError.message || fetchError}`)
        // Registrar información adicional para depuración
        log(LogLevel.DEBUG, `Detalles de la solicitud fallida: eventId=${eventId}, numberRange=${numberRange}`)
        log(LogLevel.DEBUG, `Código de error: ${fetchError.code}, Detalles: ${fetchError.details}`)
        return null
      }

      if (!limits || limits.length === 0) {
        return null
      }

      return limits[0]
    }
  } catch (error) {
    log(LogLevel.ERROR, `Error en getNumberLimit: ${error instanceof Error ? error.message : "Error desconocido"}`)
    return null
  }
}

/**
 * Elimina un límite de número
 * @param limitId - ID del límite a eliminar
 * @returns true si se eliminó correctamente, false en caso contrario
 */
export async function deleteNumberLimit(limitId: string): Promise<boolean> {
  try {
    if (!limitId) {
      log(LogLevel.ERROR, "Error: ID de límite no proporcionado en deleteNumberLimit")
      return false
    }
    
    // Usar getSupabaseClient con useAdmin=true para asegurar los encabezados correctos
    const adminClient = getSupabaseClient(true)
    const { error } = await adminClient
      .from("number_limits")
      .delete()
      .eq("id", limitId)

    if (error) {
      log(LogLevel.ERROR, `Error al eliminar límite: ${error.message || error}`)
      return false
    }

    return true
  } catch (error) {
    log(LogLevel.ERROR, `Error en deleteNumberLimit: ${error instanceof Error ? error.message : "Error desconocido"}`)
    return false
  }
}

/**
 * Suscribe a cambios en los límites de números para un evento específico
 * @param eventId - ID del evento
 * @param callback - Función a llamar cuando hay cambios en los límites
 * @returns Función para cancelar la suscripción
 */
export function subscribeToNumberLimits(
  eventId: string,
  callback: (limits: NumberLimit[]) => void
): () => void {
  // Verificar si estamos en el navegador
  if (typeof window === "undefined") {
    log(LogLevel.DEBUG, "No se puede suscribir a límites de números en el servidor")
    return () => {} // Retornar función vacía en el servidor
  }
  
  try {
    if (!eventId) {
      log(LogLevel.ERROR, "Error: ID de evento no proporcionado en subscribeToNumberLimits")
      return () => {}
    }
    
    if (!callback || typeof callback !== 'function') {
      log(LogLevel.ERROR, "Error: Callback no proporcionado o inválido")
      return () => {}
    }
    
    // Limpiar canales existentes para evitar suscripciones múltiples
    try {
      const existingChannels = supabase.getChannels()
      for (const channel of existingChannels) {
        if (channel.topic.startsWith(`realtime:number-limits-changes-${eventId}`)) {
          log(LogLevel.INFO, `Eliminando canal existente: ${channel.topic}`)
          try {
            supabase.removeChannel(channel)
          } catch (removeError) {
            log(LogLevel.DEBUG, `Error al eliminar canal existente: ${removeError instanceof Error ? removeError.message : "Error desconocido"}`)
            // Continuar con la operación incluso si hay error al eliminar
          }
        }
      }
      
      // Esperar un momento después de eliminar canales para evitar conflictos
      setTimeout(() => {}, 800)
    } catch (cleanupError) {
      log(LogLevel.WARN, "Error al limpiar canales existentes:", cleanupError)
      // Continuar con la creación del nuevo canal
    }

    // Contador de reconexiones para implementar backoff exponencial
    let reconnectAttempts = 0;
    const maxReconnectAttempts = 30; // Aumentado para mayor tolerancia
    
    // Variables para control de estado
    let isChannelActive = true;
    let isProcessingEvent = false;
    let heartbeatMissed = 0;
    const maxHeartbeatMisses = 3;
    
    // Función auxiliar para crear un canal con la configuración adecuada
    const createRealtimeChannel = (reason = "inicial") => {
      const channelId = `number-limits-changes-${eventId}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      log(LogLevel.INFO, `Creando canal de suscripción ${reason}: ${channelId}`);
      
      return supabase.channel(channelId, {
        config: {
          broadcast: { self: true },
          presence: { key: "" },
          timeout: 1200000, // 20 minutos (aumentado)
          retryIntervalMs: 2000, // 2 segundos entre reintentos (reducido para respuesta más rápida)
          retryMaxCount: 30, // Aumentado para mayor tolerancia
          ackTimeoutMs: 60000 // 60 segundos para esperar confirmaciones (aumentado)
        },
      });
    };
    
    // Función auxiliar para configurar los listeners de un canal
    const setupChannelListeners = (channel) => {
      return channel.on(
        "postgres_changes",
        {
          event: "*", // Escuchar todos los eventos (INSERT, UPDATE, DELETE)
          schema: "public",
          table: "number_limits",
          filter: `event_id=eq.${eventId}`,
        },
        (payload) => {
          // Evitar procesamiento si el canal ya no está activo
          if (!isChannelActive) return;
          
          // Resetear contador de heartbeat cuando recibimos eventos
          heartbeatMissed = 0;
          
          // Usar setTimeout para desacoplar el procesamiento del evento
          setTimeout(async () => {
            // Sistema de cola simple para eventos concurrentes
            if (isProcessingEvent) {
              log(LogLevel.DEBUG, "Ya se está procesando un evento, encolando...");
              let waitCount = 0;
              const maxWaits = 15; // Aumentado para mayor tolerancia
              
              while (isProcessingEvent && waitCount < maxWaits) {
                await new Promise(resolve => setTimeout(resolve, 300));
                waitCount++;
                
                if (!isChannelActive) return;
              }
              
              if (isProcessingEvent) {
                log(LogLevel.DEBUG, "Evento descartado después de esperar demasiado tiempo");
                return;
              }
            }
            
            try {
              isProcessingEvent = true;
              log(LogLevel.DEBUG, `Cambio detectado en límites de números: ${JSON.stringify(payload.new || {})}`);
              
              if (isChannelActive) {
                // Obtener los límites actualizados con bypass de caché para asegurar datos frescos
                const updatedLimits = await getNumberLimits(eventId, { bypassCache: true });
                try {
                  if (isChannelActive) {
                    callback(updatedLimits);
                  }
                } catch (callbackError) {
                  log(LogLevel.ERROR, `Error en callback de límites: ${callbackError instanceof Error ? callbackError.message : "Error desconocido"}`);
                }
              }
            } catch (processError) {
              log(LogLevel.ERROR, `Error al procesar cambio en límites: ${processError instanceof Error ? processError.message : "Error desconocido"}`);
            } finally {
              isProcessingEvent = false;
            }
          }, 0);
        },
      );
    };
    
    // Crear el canal inicial
    let channel = createRealtimeChannel();
    
    // Configurar los listeners
    setupChannelListeners(channel);
    
    // Variable para controlar si estamos en proceso de navegación
    let isNavigating = false;
    
    // Detectar eventos de navegación para manejar mejor el cierre de canales
    if (typeof window !== 'undefined') {
      // Detectar cuando el usuario está navegando a otra página
      window.addEventListener('beforeunload', () => {
        log(LogLevel.DEBUG, 'Navegación detectada, marcando canal como en proceso de navegación');
        isNavigating = true;
      });
      
      // También detectar navegación dentro de Next.js
      const originalPushState = history.pushState;
      history.pushState = function() {
        isNavigating = true;
        log(LogLevel.DEBUG, 'Navegación interna detectada');
        setTimeout(() => { isNavigating = false; }, 1000); // Resetear después de 1 segundo
        return originalPushState.apply(this, arguments);
      };
      
      // Detectar cambios de ruta en Next.js
      if (typeof window.navigation !== 'undefined' && window.navigation.addEventListener) {
        window.navigation.addEventListener('navigate', () => {
          log(LogLevel.DEBUG, 'Navegación detectada a través de la API Navigation');
          isNavigating = true;
        });
      }
      
      // Detectar cambios de hash
      window.addEventListener('hashchange', () => {
        log(LogLevel.DEBUG, 'Cambio de hash detectado, posible navegación');
        isNavigating = true;
      });
    }
    
    // Configurar un ping periódico para mantener la conexión activa y verificar estado
    const pingInterval = setInterval(async () => {
      if (!isChannelActive) {
        clearInterval(pingInterval);
        return;
      }
      
      try {
        // Verificar estado del canal antes de enviar ping
        const channelState = channel.state;
        if (channelState !== 'joined' && channelState !== 'joining') {
          log(LogLevel.WARN, `Canal en estado inválido: ${channelState}, intentando reconectar...`);
          heartbeatMissed = maxHeartbeatMisses; // Forzar reconexión
        } else {
          let pingSuccess = false;
          
          try {
            await new Promise<void>((resolve, reject) => {
              const timeoutId = setTimeout(() => {
                reject(new Error('Ping timeout'));
              }, 5000); // 5 segundos de timeout para el ping
              
<<<<<<< HEAD
              // NOTA: La API de Supabase Realtime no soporta el método receive() en el resultado de send()
              // Por lo tanto, usamos un enfoque basado en timeout para considerar el ping exitoso
=======
>>>>>>> 624c5503d96cf6f2927785c1f1d25f0199826991
              channel.send({
                type: 'broadcast',
                event: 'ping',
                payload: { timestamp: Date.now() }
<<<<<<< HEAD
              });
              
              // Si no hay error al enviar, consideramos el ping exitoso después de un breve retraso
              // para dar tiempo a que se procese la solicitud
              setTimeout(() => {
                clearTimeout(timeoutId);
                pingSuccess = true;
                resolve();
              }, 500);
=======
              }).receive('ok', () => {
                clearTimeout(timeoutId);
                pingSuccess = true;
                resolve();
              }).receive('error', (err) => {
                clearTimeout(timeoutId);
                log(LogLevel.WARN, `Error en ping: ${err}`);
                reject(new Error(`Error en ping: ${err}`));
              }).receive('timeout', () => {
                clearTimeout(timeoutId);
                log(LogLevel.WARN, 'Timeout en ping');
                reject(new Error('Timeout en ping'));
              });
>>>>>>> 624c5503d96cf6f2927785c1f1d25f0199826991
            });
            
            // Si llegamos aquí, el ping fue exitoso
            heartbeatMissed = 0;
            log(LogLevel.DEBUG, `Ping enviado al canal exitosamente`);
          } catch (pingError) {
            log(LogLevel.WARN, `Error al enviar ping: ${pingError}`);
            heartbeatMissed++;
          }
        }
        
        // Si se han perdido demasiados heartbeats, intentar reconectar
        if (heartbeatMissed >= maxHeartbeatMisses) {
          log(LogLevel.WARN, `Se perdieron ${heartbeatMissed} heartbeats consecutivos, reconectando...`);
          
          // Intentar reconectar el canal
          try {
            // Eliminar el canal actual antes de crear uno nuevo
            try {
              await supabase.removeChannel(channel);
              log(LogLevel.INFO, 'Canal anterior eliminado para reconexión por heartbeat');
            } catch (removeError) {
              log(LogLevel.WARN, 'Error al eliminar canal para reconexión por heartbeat:', removeError);
            }
            
            // Esperar un momento antes de crear un nuevo canal
            await new Promise(resolve => setTimeout(resolve, 800));
            
            // Crear un nuevo canal y configurarlo
            const newChannel = createRealtimeChannel("reconexión-heartbeat");
            setupChannelListeners(newChannel);
            
            // Suscribir el nuevo canal
            await newChannel.subscribe();
            log(LogLevel.INFO, 'Reconexión por heartbeat exitosa con nuevo canal');
            
            // Actualizar la referencia al canal
            channel = newChannel;
            heartbeatMissed = 0;
          } catch (reconnectError) {
            log(LogLevel.ERROR, 'Error al reconectar por heartbeat:', reconnectError);
          }
        }
      } catch (pingError) {
        log(LogLevel.WARN, `Error general en verificación de heartbeat: ${pingError}`);
        heartbeatMissed++;
      }
    }, 15000); // Cada 15 segundos (reducido para detectar problemas más rápido)

    // Suscribirse al canal y manejar los estados
    channel.subscribe(async (status, error) => {
      log(LogLevel.INFO, `Estado de suscripción: ${status}`);
      
      if (status === 'SUBSCRIBED') {
        // Resetear contador de intentos cuando se conecta exitosamente
        reconnectAttempts = 0;
        heartbeatMissed = 0;
        log(LogLevel.INFO, 'Suscripción establecida correctamente, actualizando datos...');
        
        // Obtener datos iniciales
        setTimeout(async () => {
          try {
            if (isChannelActive) {
              const limits = await getNumberLimits(eventId, { bypassCache: true });
              callback(limits);
            }
          } catch (asyncError) {
            log(LogLevel.ERROR, 'Error al obtener datos iniciales:', asyncError);
          }
        }, 100);
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        // Verificar si el cierre es parte de una navegación o desmontaje normal
        const isNormalClosure = isNavigating || (status === 'CLOSED' && !error);
        
        if (isNormalClosure) {
          log(LogLevel.INFO, `Canal cerrado normalmente (${status}) durante navegación o desmontaje, no se intentará reconectar`);
          isChannelActive = false;
        } else {
          log(LogLevel.WARN, `Estado de suscripción problemático: ${status}`, error ? `Detalles: ${JSON.stringify(error)}` : 'Sin detalles adicionales');
          // Si no es un cierre normal, intentar reconectar con backoff exponencial
          reconnectAttempts++;
          
          if (reconnectAttempts <= maxReconnectAttempts) {
            // Calcular tiempo de espera con backoff exponencial
            const backoffTime = Math.min(1000 * Math.pow(1.5, reconnectAttempts - 1), 30000);
            log(LogLevel.WARN, `Reconectando canal (intento ${reconnectAttempts}/${maxReconnectAttempts}) después de ${backoffTime}ms...`);
            
            setTimeout(async () => {
              if (!isChannelActive) return; // No reconectar si el canal ya no está activo
              
              try {
                // Eliminar el canal actual antes de crear uno nuevo
                try {
                  await supabase.removeChannel(channel);
                  log(LogLevel.INFO, 'Canal anterior eliminado para reconexión');
                } catch (removeError) {
                  log(LogLevel.WARN, 'Error al eliminar canal para reconexión:', removeError);
                }
                
                // Esperar un momento antes de crear un nuevo canal
                await new Promise(resolve => setTimeout(resolve, 800));
                
                // Crear un nuevo canal y configurarlo
                const newChannel = createRealtimeChannel(`reconexión-${reconnectAttempts}`);
                setupChannelListeners(newChannel);
                
                // Suscribir el nuevo canal
                await newChannel.subscribe();
                log(LogLevel.INFO, `Reconexión ${reconnectAttempts} exitosa con nuevo canal`);
                
                // Actualizar la referencia al canal
                channel = newChannel;
              } catch (reconnectError) {
                log(LogLevel.ERROR, `Error en reconexión ${reconnectAttempts}:`, reconnectError);
              }
            }, backoffTime);
          } else {
            log(LogLevel.ERROR, `Se alcanzó el número máximo de intentos de reconexión (${maxReconnectAttempts}), abandonando...`);
            isChannelActive = false;
          }
        }
      }
    });

    // Devolver una función para cancelar la suscripción
    return () => {
      log(LogLevel.INFO, `Cancelando suscripción a límites de números`);
      isChannelActive = false;
      clearInterval(pingInterval);
      
      try {
        supabase.removeChannel(channel);
      } catch (cleanupError) {
        log(LogLevel.DEBUG, `Error al limpiar canal: ${cleanupError instanceof Error ? cleanupError.message : "Error desconocido"}`);
        // Continuar incluso si hay error al limpiar
      }
    };
  } catch (error) {
    log(LogLevel.ERROR, `Error en subscribeToNumberLimits: ${error instanceof Error ? error.message : "Error desconocido"}`);
    return () => {};
  }
}