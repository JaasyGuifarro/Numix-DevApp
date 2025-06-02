import { supabase, supabaseAdmin } from "./supabase"
import type { Event } from "@/types"

// Convertir de formato Supabase a formato de la aplicación
const mapEventFromSupabase = (event: any): Event => ({
  id: event.id,
  name: event.name,
  startDate: event.start_date,
  endDate: event.end_date,
  startTime: event.start_time,
  endTime: event.end_time,
  active: event.active,
  repeatDaily: event.repeat_daily,
  status: event.status,
  minNumber: event.min_number !== null ? event.min_number : 0,
  maxNumber: event.max_number !== null ? event.max_number : 99,
  excludedNumbers: event.excluded_numbers || "",
  awardedNumbers: event.first_prize
    ? {
        firstPrize: event.first_prize,
        secondPrize: event.second_prize,
        thirdPrize: event.third_prize,
        awardedAt: event.awarded_at,
      }
    : undefined,
  // Estos campos se calculan en la aplicación, no se almacenan en Supabase
  endDateTime: `${event.end_date} ${event.end_time}`,
  totalSold: 0,
  sellerTimes: 0,
  tickets: [],
  prize: 0,
  profit: 0,
})

// Convertir de formato de la aplicación a formato Supabase
const mapEventToSupabase = (event: Event) => ({
  name: event.name,
  start_date: event.startDate,
  end_date: event.endDate,
  start_time: event.startTime,
  end_time: event.endTime,
  active: event.active,
  repeat_daily: event.repeatDaily,
  status: event.status,
  min_number: event.minNumber,
  max_number: event.maxNumber,
  excluded_numbers: event.excludedNumbers,
  first_prize: event.awardedNumbers?.firstPrize,
  second_prize: event.awardedNumbers?.secondPrize,
  third_prize: event.awardedNumbers?.thirdPrize,
  awarded_at: event.awardedNumbers?.awardedAt,
})

// Obtener todos los eventos
export async function getEvents(): Promise<Event[]> {
  try {
    // Verificar la conexión a Supabase antes de realizar la consulta
    const { checkSupabaseConnection } = await import('./check-supabase')
    const connectionStatus = await checkSupabaseConnection()
    
    if (!connectionStatus.connected) {
      console.error(`Error de conexión a Supabase: ${connectionStatus.error}`)
      // Intentar obtener de localStorage como fallback
      if (typeof window !== "undefined") {
        const localEvents = localStorage.getItem("events")
        if (localEvents) {
          console.log("Usando datos de eventos desde localStorage debido a error de conexión")
          return JSON.parse(localEvents)
        }
      }
      return []
    }
    
    
    // Realizar la consulta con reintentos
    let attempts = 0
    const maxAttempts = 3
    let lastError = null
    
    while (attempts < maxAttempts) {
      try {
        const { data, error } = await supabase
          .from("events")
          .select("*")
          .order("created_at", { ascending: false })
        
        if (error) {
          lastError = error
          console.error(`Error fetching events (intento ${attempts + 1}/${maxAttempts}):`, {
            message: error.message,
            details: error.details,
            code: error.code,
            hint: error.hint
          })
          attempts++
          if (attempts < maxAttempts) {
            // Esperar antes de reintentar (backoff exponencial)
            await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempts - 1)))
            continue
          }
          
          // Si llegamos aquí, se agotaron los reintentos
          // Intentar obtener de localStorage como fallback
          if (typeof window !== "undefined") {
            const localEvents = localStorage.getItem("events")
            if (localEvents) {
              console.log("Usando datos de eventos desde localStorage debido a error persistente")
              return JSON.parse(localEvents)
            }
          }
          return []
        }
        
        // Si llegamos aquí, la consulta fue exitosa
        const events = data.map(mapEventFromSupabase)
        
        // Actualizar localStorage para tener una copia local
        if (typeof window !== "undefined") {
          localStorage.setItem("events", JSON.stringify(events))
        }
        
        return events
      } catch (attemptError) {
        lastError = attemptError
        console.error(`Excepción al obtener eventos (intento ${attempts + 1}/${maxAttempts}):`, attemptError)
        attempts++
        if (attempts < maxAttempts) {
          // Esperar antes de reintentar
          await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempts - 1)))
        }
      }
    }
    
    // Si llegamos aquí, se agotaron los reintentos
    console.error("Error persistente al obtener eventos después de múltiples intentos:", lastError)
    
    // Intentar obtener de localStorage como último recurso
    if (typeof window !== "undefined") {
      const localEvents = localStorage.getItem("events")
      if (localEvents) {
        console.log("Usando datos de eventos desde localStorage como último recurso")
        return JSON.parse(localEvents)
      }
    }
    return []
  } catch (error) {
    console.error("Error general en getEvents:", error instanceof Error ? {
      message: error.message,
      stack: error.stack
    } : error)
    // Intentar obtener de localStorage como fallback
    if (typeof window !== "undefined") {
      const localEvents = localStorage.getItem("events")
      if (localEvents) {
        return JSON.parse(localEvents)
      }
    }
    return []
  }
}

// Crear un nuevo evento
export async function createEvent(
  event: Omit<Event, "id" | "endDateTime" | "totalSold" | "sellerTimes" | "tickets" | "prize" | "profit">,
): Promise<Event | null> {
  try {
    const supabaseEvent = {
      name: event.name,
      start_date: event.startDate,
      end_date: event.endDate,
      start_time: event.startTime,
      end_time: event.endTime,
      active: event.active ?? true,
      repeat_daily: event.repeatDaily ?? false,
      status: event.status ?? "active",
      min_number: event.minNumber ?? 0,
      max_number: event.maxNumber ?? 99,
      excluded_numbers: event.excludedNumbers ?? "",
    }

    // Usar supabaseAdmin en lugar de supabase
    const { data, error } = await supabaseAdmin.from("events").insert([supabaseEvent]).select().single()

    if (error) {
      console.error("Error creating event:", error)
      return null
    }

    const newEvent = mapEventFromSupabase(data)

    // Actualizar localStorage
    const localEvents = JSON.parse(localStorage.getItem("events") || "[]")
    localStorage.setItem("events", JSON.stringify([...localEvents, newEvent]))

    return newEvent
  } catch (error) {
    console.error("Error in createEvent:", error)
    return null
  }
}

// Actualizar un evento existente
export async function updateEvent(event: Event): Promise<Event | null> {
  try {
    const supabaseEvent = mapEventToSupabase(event)

    // Usar supabaseAdmin en lugar de supabase
    const { data, error } = await supabaseAdmin
      .from("events")
      .update({
        ...supabaseEvent,
        status: supabaseEvent.status as "active" | "closed_awarded" | "closed_not_awarded"
      })
      .eq("id", event.id)
      .select()
      .single()

    if (error) {
      console.error("Error updating event:", error)
      return null
    }

    const updatedEvent = mapEventFromSupabase(data)

    // Actualizar localStorage
    const localEvents = JSON.parse(localStorage.getItem("events") || "[]")
    const updatedLocalEvents = localEvents.map((e: Event) => (e.id === event.id ? updatedEvent : e))
    localStorage.setItem("events", JSON.stringify(updatedLocalEvents))

    return updatedEvent
  } catch (error) {
    console.error("Error in updateEvent:", error)
    return null
  }
}

// Eliminar un evento
export async function deleteEvent(id: string): Promise<boolean> {
  try {
    // Usar supabaseAdmin en lugar de supabase
    const { error } = await supabaseAdmin.from("events").delete().eq("id", id)

    if (error) {
      console.error("Error deleting event:", error)
      return false
    }

    // Actualizar localStorage
    const localEvents = JSON.parse(localStorage.getItem("events") || "[]")
    const filteredEvents = localEvents.filter((e: Event) => e.id !== id)
    localStorage.setItem("events", JSON.stringify(filteredEvents))

    return true
  } catch (error) {
    console.error("Error in deleteEvent:", error)
    return false
  }
}

// Premiar un evento
export async function awardEvent(
  id: string,
  numbers: { firstPrize: string; secondPrize: string; thirdPrize: string },
): Promise<Event | null> {
  try {
    const now = new Date().toISOString()

    // Usar supabaseAdmin en lugar de supabase
    const { data, error } = await supabaseAdmin
      .from("events")
      .update({
        status: "closed_awarded",
        first_prize: numbers.firstPrize,
        second_prize: numbers.secondPrize,
        third_prize: numbers.thirdPrize,
        awarded_at: now,
      })
      .eq("id", id)
      .select()
      .single()

    if (error) {
      console.error("Error awarding event:", error)
      return null
    }

    const updatedEvent = mapEventFromSupabase(data)

    // Actualizar localStorage
    const localEvents = JSON.parse(localStorage.getItem("events") || "[]")
    const updatedLocalEvents = localEvents.map((e: Event) => (e.id === id ? updatedEvent : e))
    localStorage.setItem("events", JSON.stringify(updatedLocalEvents))

    return updatedEvent
  } catch (error) {
    console.error("Error in awardEvent:", error)
    return null
  }
}

// Suscribirse a cambios en eventos (tiempo real)
export async function subscribeToEvents(callback: (events: Event[]) => void): Promise<() => void> {
  // Verificar si estamos en el navegador
  if (typeof window === "undefined") {
    console.log("No se puede suscribir a eventos en el servidor")
    return () => {} // Retornar función vacía en el servidor
  }

  try {
    // Limpiar canales existentes para evitar suscripciones múltiples
    try {
      const existingChannels = supabase.getChannels()
      for (const channel of existingChannels) {
        if (channel.topic.startsWith('realtime:events-changes-')) {
          console.log(`Eliminando canal existente: ${channel.topic}`)
          try {
            await supabase.removeChannel(channel)
          } catch (removeError) {
            console.warn(`Error al eliminar canal existente: ${removeError}`)
            // Continuar con la operación incluso si hay error al eliminar
          }
        }
      }
      
      // Esperar un momento después de eliminar canales para evitar conflictos
      await new Promise(resolve => setTimeout(resolve, 800))
    } catch (cleanupError) {
      console.warn("Error al limpiar canales existentes:", cleanupError)
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
      const channelId = `events-changes-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      console.log(`Creando canal de suscripción ${reason}: ${channelId}`);
      
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
          table: "events",
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
              console.log("Ya se está procesando un evento, encolando...");
              let waitCount = 0;
              const maxWaits = 15; // Aumentado para mayor tolerancia
              
              while (isProcessingEvent && waitCount < maxWaits) {
                await new Promise(resolve => setTimeout(resolve, 300));
                waitCount++;
                
                if (!isChannelActive) return;
              }
              
              if (isProcessingEvent) {
                console.log("Evento descartado después de esperar demasiado tiempo");
                return;
              }
            }
            
            try {
              isProcessingEvent = true;
              console.log("Cambio detectado en events:", payload);
              
              if (isChannelActive) {
                const events = await getEvents();
                try {
                  if (isChannelActive) {
                    callback(events);
                  }
                } catch (callbackError) {
                  console.error("Error en callback de eventos:", callbackError);
                }
              }
            } catch (error) {
              console.error("Error al procesar cambio en events:", error);
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
        console.log('Navegación detectada, marcando canal como en proceso de navegación');
        isNavigating = true;
      });
      
      // También detectar navegación dentro de Next.js
      const originalPushState = history.pushState;
      history.pushState = function() {
        isNavigating = true;
        console.log('Navegación interna detectada');
        setTimeout(() => { isNavigating = false; }, 1000); // Resetear después de 1 segundo
        return originalPushState.apply(this, arguments);
      };
      
      // Detectar cambios de ruta en Next.js
      if (typeof window.navigation !== 'undefined' && window.navigation.addEventListener) {
        window.navigation.addEventListener('navigate', () => {
          console.log('Navegación detectada a través de la API Navigation');
          isNavigating = true;
        });
      }
      
      // Detectar cambios de hash
      window.addEventListener('hashchange', () => {
        console.log('Cambio de hash detectado, posible navegación');
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
          console.warn(`Canal en estado inválido: ${channelState}, intentando reconectar...`);
          heartbeatMissed = maxHeartbeatMisses; // Forzar reconexión
        } else {
          let pingSuccess = false;
          
          try {
            await new Promise<void>((resolve, reject) => {
              const timeoutId = setTimeout(() => {
                reject(new Error('Ping timeout'));
              }, 5000); // 5 segundos de timeout para el ping
              
              try {
                // Enviar el ping como un evento broadcast simple
                // NOTA: La API de Supabase Realtime no soporta el método receive() en el resultado de send()
                // Por lo tanto, usamos un enfoque basado en timeout para considerar el ping exitoso
                channel.send({
                  type: 'broadcast',
                  event: 'ping',
                  payload: { timestamp: Date.now() }
                });
                
                // Si no hay error al enviar, consideramos el ping exitoso después de un breve retraso
                // para dar tiempo a que se procese la solicitud
                setTimeout(() => {
                  clearTimeout(timeoutId);
                  pingSuccess = true;
                  resolve();
                }, 500);
              } catch (sendError) {
                clearTimeout(timeoutId);
                console.warn(`Error al enviar ping: ${sendError}`);
                reject(new Error(`Error al enviar ping: ${sendError}`));
              }
            });
            
            // Si llegamos aquí, el ping fue exitoso
            heartbeatMissed = 0;
            console.log(`Ping enviado al canal exitosamente`);
          } catch (pingError) {
            console.warn(`Error al enviar ping: ${pingError}`);
            heartbeatMissed++;
          }
        }
        
        // Si se han perdido demasiados heartbeats, intentar reconectar
        if (heartbeatMissed >= maxHeartbeatMisses) {
          console.warn(`Se perdieron ${heartbeatMissed} heartbeats consecutivos, reconectando...`);
          
          // Intentar reconectar el canal
          try {
            // Eliminar el canal actual antes de crear uno nuevo
            try {
              await supabase.removeChannel(channel);
              console.log('Canal anterior eliminado para reconexión por heartbeat');
            } catch (removeError) {
              console.warn('Error al eliminar canal para reconexión por heartbeat:', removeError);
            }
            
            // Esperar un momento antes de crear un nuevo canal
            await new Promise(resolve => setTimeout(resolve, 800));
            
            // Crear un nuevo canal y configurarlo
            const newChannel = createRealtimeChannel("reconexión-heartbeat");
            setupChannelListeners(newChannel);
            
            // Suscribir el nuevo canal
            await newChannel.subscribe();
            console.log('Reconexión por heartbeat exitosa con nuevo canal');
            
            // Actualizar la referencia al canal
            channel = newChannel;
            heartbeatMissed = 0;
          } catch (reconnectError) {
            console.error('Error al reconectar por heartbeat:', reconnectError);
          }
        }
      } catch (pingError) {
        console.warn(`Error general en verificación de heartbeat: ${pingError}`);
        heartbeatMissed++;
      }
    }, 15000); // Cada 15 segundos (reducido para detectar problemas más rápido)

    // Suscribirse al canal y manejar los estados
    channel.subscribe(async (status, error) => {
      console.log(`Estado de suscripción: ${status}`);

      if (status === 'SUBSCRIBED') {
        // Resetear contador de intentos cuando se conecta exitosamente
        reconnectAttempts = 0;
        heartbeatMissed = 0;
        console.log('Suscripción establecida correctamente, actualizando datos...');
        
        // Obtener datos iniciales
        setTimeout(async () => {
          try {
            if (isChannelActive) {
              const events = await getEvents();
              callback(events);
            }
          } catch (asyncError) {
            console.error('Error al obtener datos iniciales:', asyncError);
          }
        }, 100);
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        // Verificar si el cierre es parte de una navegación o desmontaje normal
        const isNormalClosure = isNavigating || status === 'CLOSED' && !error;
        
        if (isNormalClosure) {
          console.log(`Canal cerrado normalmente (${status}) durante navegación o desmontaje, no se intentará reconectar`);
          isChannelActive = false;
          return;
        }
        
        console.warn(`Estado de suscripción problemático: ${status}`, error ? `Detalles: ${JSON.stringify(error)}` : 'Sin detalles adicionales');
        
        // Implementar backoff exponencial con jitter para evitar reconexiones simultáneas
        if (isChannelActive && reconnectAttempts < maxReconnectAttempts) {
          reconnectAttempts++;
          // Calcular tiempo de espera con backoff exponencial y jitter
          const baseDelay = Math.min(1000 * Math.pow(1.5, reconnectAttempts - 1), 20000); // Máximo 20 segundos
          const jitter = Math.floor(Math.random() * 1000); // Añadir hasta 1 segundo de jitter
          const backoffTime = baseDelay + jitter;
          
          console.log(`Intento de reconexión ${reconnectAttempts}/${maxReconnectAttempts} en ${backoffTime}ms...`);
          
          // Esperar antes de intentar reconectar
          await new Promise(resolve => setTimeout(resolve, backoffTime));
          
          if (isChannelActive) {
            try {
              // Eliminar el canal actual antes de crear uno nuevo
              try {
                await supabase.removeChannel(channel);
                console.log('Canal anterior eliminado para reconexión');
              } catch (removeError) {
                console.warn('Error al eliminar canal para reconexión:', removeError);
              }
              
              // Esperar un momento antes de crear un nuevo canal
              await new Promise(resolve => setTimeout(resolve, 800));
              
              // Crear un nuevo canal y configurarlo
              const newChannel = createRealtimeChannel("reconexión");
              setupChannelListeners(newChannel);
              
              // Suscribir el nuevo canal
              await newChannel.subscribe();
              console.log('Reconexión exitosa con nuevo canal');
              
              // Actualizar la referencia al canal
              channel = newChannel;
              heartbeatMissed = 0;
            } catch (reconnectError) {
              console.error('Error al reconectar con nuevo canal:', reconnectError);
              // Continuar con el sistema de reintentos automáticos
            }
          }
        } else if (reconnectAttempts >= maxReconnectAttempts) {
          console.log(`Se alcanzó el máximo de intentos de reconexión (${maxReconnectAttempts}). Deteniendo reintentos.`);
          isChannelActive = false;
          // Notificar al usuario que la conexión se ha perdido
          try {
            callback([]); // Enviar array vacío para indicar desconexión
            console.log('Notificado al cliente sobre la desconexión permanente');
          } catch (notifyError) {
            console.error('Error al notificar desconexión:', notifyError);
          }
        }
      } else if (error) {
        console.warn(`Error inesperado en la suscripción:`, error);
        
        // Intentar recuperarse de errores inesperados
        if (isChannelActive) {
          console.log('Intentando recuperarse de error inesperado...');
          setTimeout(async () => {
            if (isChannelActive) {
              try {
                // Eliminar el canal actual antes de crear uno nuevo
                try {
                  await supabase.removeChannel(channel);
                  console.log('Canal anterior eliminado para recuperación');
                } catch (removeError) {
                  console.warn('Error al eliminar canal para recuperación:', removeError);
                }
                
                // Esperar un momento antes de crear un nuevo canal
                await new Promise(resolve => setTimeout(resolve, 800));
                
                // Crear un nuevo canal y configurarlo
                const newChannel = createRealtimeChannel("recuperación");
                setupChannelListeners(newChannel);
                
                // Suscribir el nuevo canal
                await newChannel.subscribe();
                console.log('Recuperación exitosa con nuevo canal');
                
                // Actualizar la referencia al canal
                channel = newChannel;
                heartbeatMissed = 0;
              } catch (recoverError) {
                console.error('Error al recuperarse con nuevo canal:', recoverError);
              }
            }
          }, 2000); // Esperar 2 segundos antes de intentar recuperarse
        }
      }
    });

    // Devolver función para cancelar la suscripción
    return () => {
      console.log(`Cancelando suscripción al canal`);
      isChannelActive = false;
      // Limpiar el intervalo de ping cuando se cancela la suscripción
      clearInterval(pingInterval);
      
      // Verificar si el canal ya está cerrado o en proceso de cierre
      const currentState = channel?.state;
      if (currentState === 'closed' || currentState === 'closing' || isNavigating) {
        console.log(`Canal ya está en estado ${currentState}, omitiendo limpieza adicional`);
        return;
      }
      
      // Usar Promise.resolve para manejar tanto promesas como errores síncronos
      Promise.resolve().then(async () => {
        try {
          // Primero intentar desuscribirse
          if (channel && typeof channel.unsubscribe === 'function') {
            await channel.unsubscribe();
            console.log('Canal desuscrito correctamente');
          }
        } catch (unsubError) {
          // No hacer nada si falla la desuscripción, continuar con removeChannel
          console.warn("Error al desuscribir canal (ignorado):", unsubError);
        }
        
        // Luego intentar eliminar el canal, independientemente del resultado anterior
        try {
          if (channel) {
            await supabase.removeChannel(channel);
            console.log('Canal eliminado correctamente');
          }
        } catch (removeError) {
          // Capturar pero ignorar errores de removeChannel
          console.warn("Error al eliminar canal (ignorado):", removeError);
        }
      }).catch(finalError => {
        // Este catch nunca debería ejecutarse debido a que capturamos todos los errores internamente
        console.warn("Error final en limpieza de canal (ignorado):", finalError);
      });
    }
  } catch (error) {
    console.error("Error al crear suscripción a events:", error)
    // Retornar una función vacía en caso de error
    return () => {}


    return () => {
      console.log("Limpieza de suscripción fallida")
    }
  }
}

