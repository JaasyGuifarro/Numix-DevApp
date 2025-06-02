import { createClient } from "@supabase/supabase-js"
import type { Database } from "@/types/supabase"
import { logError, logInfo, LogLevel, log } from "./error-logger"
import type { RealtimeChannel } from "@supabase/supabase-js"

// Crear el cliente de Supabase usando variables de entorno con fallbacks
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://ngzyyhebrphetphtlesu.supabase.co"
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5nenl5aGVicnBoZXRwaHRsZXN1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDA5MzgyNTEsImV4cCI6MjA1NjUxNDI1MX0.7c0yuKwzYoWqGMjKfZOWyT4D2LA4zw5LYRu54KLbclU"
const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5nenl5aGVicnBoZXRwaHRsZXN1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0MDkzODI1MSwiZXhwIjoyMDU2NTE0MjUxfQ.8Tfv0yIt0GIQT7zO4vs_ZYsovK5x23UXUBZA7cu58Os"

// Advertencia en desarrollo si las variables no están definidas
if (process.env.NODE_ENV === "development") {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    console.warn("NEXT_PUBLIC_SUPABASE_URL no está definida. Usando valor por defecto.")
  }
  if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    console.warn("NEXT_PUBLIC_SUPABASE_ANON_KEY no está definida. Usando valor por defecto.")
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.warn("SUPABASE_SERVICE_ROLE_KEY no está definida. Usando valor por defecto.")
  }
}

// Lista de servidores alternativos para fallback
const FALLBACK_SERVERS = [
  { url: supabaseUrl, key: supabaseAnonKey }, // Servidor principal
  // Servidores de respaldo (usar solo si es necesario configurar)
  // { url: "https://[respaldo-1].supabase.co", key: "[clave-respaldo-1]" },
  // { url: "https://[respaldo-2].supabase.co", key: "[clave-respaldo-2]" },
]

// Índice del servidor actual
let currentServerIndex = 0

// Función para crear cliente con configuración robusta
function createRobustClient(url: string, key: string) {
  return createClient<Database>(url, key, {
    realtime: {
      params: {
        eventsPerSecond: 5, // Reducido para disminuir la carga
      },
      // Configuración mejorada para conexiones realtime
      heartbeatIntervalMs: 25000, // Aumentado para reducir tráfico
      reconnectAfterMs: (attempts: number) => {
        // Backoff exponencial con jitter para reconexiones
        const baseDelay = Math.min(1000 * Math.pow(1.8, attempts), 30000); // Máximo 30 segundos
        const jitter = Math.random() * 2000; // Añadir hasta 2 segundos de jitter
        return baseDelay + jitter;
      },
    },
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
    db: {
      schema: 'public'
    },
    global: {
      headers: {
        'Accept': 'application/json, */*',
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
        'Accept-Profile': 'public',
        'Content-Profile': 'public'
      }
    }
  })
}

// Cliente para operaciones del lado del cliente (con clave anónima)
export let supabase = createRobustClient(supabaseUrl, supabaseAnonKey)
// Configuración optimizada para mejorar la estabilidad de las conexiones realtime

// Cliente para operaciones del lado del servidor (con clave de servicio)
// Solo usar en Server Components o Server Actions
export const supabaseAdmin = createClient<Database>(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
  },
  db: {
    schema: 'public'
  },
  global: {
    headers: {
      'Accept': 'application/json, */*',
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
      'Accept-Profile': 'public',
      'Content-Profile': 'public'
    }
  }
})

// Variables para el sistema de reconexión
let connectionAttempts = 0;
let isReconnecting = false;
const MAX_RECONNECT_ATTEMPTS = 10;
let reconnectTimeout: NodeJS.Timeout | null = null;
let activeChannels = new Set<string>();

/**
 * Verifica la conexión a Realtime y devuelve un booleano
 */
export async function checkRealtimeConnection() {
  try {
    const channelId = `test-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const channel = supabase
      .channel(channelId)
      .on("system", { event: "connected" }, () => {})
      .on("system", { event: "error" }, (payload) => {
        logError(new Error(`Error en evento Realtime: ${JSON.stringify(payload)}`), "checkRealtimeConnection");
      });

    activeChannels.add(channelId);
    
    try {
      await channel.subscribe();
      
      // Limpiar el canal de prueba después de verificar
      setTimeout(() => {
        try {
          channel.unsubscribe();
          activeChannels.delete(channelId);
        } catch (e) {
          // Ignorar errores al limpiar
        }
      }, 1000);
      
      // Si llegamos aquí, la conexión fue exitosa
      connectionAttempts = 0;
      return true;
    } catch (subscribeError) {
      logError(new Error(`Error en suscripción Realtime: ${subscribeError}`), "checkRealtimeConnection");
      return false;
    }
  } catch (error) {
    logError(error instanceof Error ? error : new Error(String(error)), "checkRealtimeConnection");
    return false;
  }
}

/**
 * Limpia todos los canales activos
 */
function cleanupActiveChannels() {
  for (const channelId of activeChannels) {
    try {
      supabase.channel(channelId).unsubscribe();
    } catch (e) {
      // Ignorar errores al limpiar canales
    }
  }
  activeChannels.clear();
}

/**
 * Intenta cambiar al siguiente servidor disponible
 */
export async function switchToNextServer() {
  if (isReconnecting) return false;
  isReconnecting = true;
  
  try {
    // Limpiar canales existentes antes de cambiar de servidor
    cleanupActiveChannels();
    
    // Incrementar el índice del servidor actual
    currentServerIndex = (currentServerIndex + 1) % FALLBACK_SERVERS.length;
    
    // Si volvimos al servidor principal, incrementar el contador de intentos
    if (currentServerIndex === 0) {
      connectionAttempts++;
      
      // Si superamos el máximo de intentos, no seguir intentando
      if (connectionAttempts >= MAX_RECONNECT_ATTEMPTS) {
        log(LogLevel.ERROR, `Se alcanzó el máximo de intentos de reconexión (${MAX_RECONNECT_ATTEMPTS})`);
        isReconnecting = false;
        return false;
      }
    }
    
    const { url, key } = FALLBACK_SERVERS[currentServerIndex];
    logInfo(`Cambiando al servidor ${currentServerIndex} (intento ${connectionAttempts})`);
    
    // Crear un nuevo cliente con el servidor actual
    const newClient = createRobustClient(url, key);
    
    // Verificar que el nuevo cliente funciona antes de reemplazar el actual
    const testChannel = newClient
      .channel(`test-${Date.now()}`)
      .on("system", { event: "connected" }, () => {});
    
    try {
      await testChannel.subscribe();
      
      // Si la prueba es exitosa, reemplazar el cliente actual
      supabase = newClient;
      logInfo(`Conexión establecida con el servidor ${currentServerIndex}`);
      isReconnecting = false;
      
      // Limpiar el canal de prueba
      try {
        testChannel.unsubscribe();
      } catch (e) {
        // Ignorar errores al limpiar
      }
      
      return true;
    } catch (subscribeError) {
      // Si no se pudo conectar, intentar con el siguiente servidor después de un retraso
      const delay = Math.min(2000 * Math.pow(1.5, connectionAttempts), 15000);
      
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
      
      reconnectTimeout = setTimeout(() => {
        isReconnecting = false;
        switchToNextServer();
      }, delay);
      
      return false;
    }
  } catch (error) {
    logError(error instanceof Error ? error : new Error(String(error)), "switchToNextServer");
    isReconnecting = false;
    return false;
  }
}

/**
 * Inicializa el sistema de monitoreo de conexión
 */
export function initConnectionMonitoring() {
  if (typeof window === 'undefined') return;
  
  // Monitorear errores de WebSocket
  const originalConsoleError = console.error;
  console.error = function(...args) {
    const errorString = args.join(' ');
    
    // Detectar errores específicos de WebSocket y conexión
    if (
      (errorString.includes('WebSocket connection') || 
       errorString.includes('Error en canal de tickets')) && 
      (errorString.includes('ERR_ADDRESS_UNREACHABLE') || 
       errorString.includes('failed') || 
       errorString.includes('error') ||
       errorString.includes('undefined'))
    ) {
      log(LogLevel.WARN, "Detectado error de conexión", { error: errorString });
      
      // Intentar reconectar automáticamente
      if (!isReconnecting) {
        switchToNextServer();
      }
    }
    
    // Llamar a la función original
    originalConsoleError.apply(console, args);
  };
  
  // Monitorear eventos de conexión
  window.addEventListener('online', () => {
    logInfo("Conexión de red restaurada");
    if (connectionAttempts > 0) {
      // Intentar volver al servidor principal
      currentServerIndex = -1; // Para que switchToNextServer() vaya al índice 0
      connectionAttempts = 0;
      switchToNextServer();
    }
  });
  
  window.addEventListener('offline', () => {
    logInfo("Conexión de red perdida");
  });
  
  // Verificar la conexión periódicamente
  const checkInterval = setInterval(async () => {
    if (!navigator.onLine || isReconnecting) return;
    
    const isConnected = await checkRealtimeConnection();
    if (!isConnected && connectionAttempts < MAX_RECONNECT_ATTEMPTS) {
      switchToNextServer();
    }
  }, 30000); // Verificar cada 30 segundos
  
  // Limpiar el intervalo cuando la ventana se cierre
  window.addEventListener('beforeunload', () => {
    clearInterval(checkInterval);
    cleanupActiveChannels();
  });
}

// Inicializar el monitoreo de conexión
if (typeof window !== 'undefined') {
  // Ejecutar en el siguiente ciclo para asegurar que todo esté cargado
  setTimeout(initConnectionMonitoring, 0);
}

