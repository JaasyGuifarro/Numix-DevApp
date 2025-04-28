import { supabase, supabaseAdmin } from "./supabase"
import type { Vendor } from "@/types"
import { hashPassword, verifyPassword } from "./auth"

// Convertir de formato Supabase a formato de la aplicación
const mapVendorFromSupabase = (vendor: any): Vendor => ({
  id: vendor.id,
  name: vendor.name,
  email: vendor.email,
  password: vendor.password,
  active: vendor.active,
})

// Obtener todos los vendedores
export async function getVendors(): Promise<Vendor[]> {
  try {
    // Verificar la conexión a Supabase antes de realizar la consulta
    const { checkSupabaseConnection } = await import('./check-supabase')
    const connectionStatus = await checkSupabaseConnection()
    
    if (!connectionStatus.connected) {
      console.error(`Error de conexión a Supabase: ${connectionStatus.error}`)
      // Intentar obtener de localStorage como fallback
      if (typeof window !== "undefined") {
        const localVendors = localStorage.getItem("vendors")
        if (localVendors) {
          console.log("Usando datos de vendedores desde localStorage debido a error de conexión")
          return JSON.parse(localVendors)
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
          .from("vendors")
          .select("*")
          .order("created_at", { ascending: false })
        
        if (error) {
          lastError = error
          console.error(`Error fetching vendors (intento ${attempts + 1}/${maxAttempts}):`, {
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
            const localVendors = localStorage.getItem("vendors")
            if (localVendors) {
              console.log("Usando datos de vendedores desde localStorage debido a error persistente")
              return JSON.parse(localVendors)
            }
          }
          return []
        }
        
        // Si llegamos aquí, la consulta fue exitosa
        const vendors = data.map(mapVendorFromSupabase)
        
        // Actualizar localStorage para tener una copia local
        if (typeof window !== "undefined") {
          localStorage.setItem("vendors", JSON.stringify(vendors))
        }
        
        return vendors
      } catch (attemptError) {
        lastError = attemptError
        console.error(`Excepción al obtener vendedores (intento ${attempts + 1}/${maxAttempts}):`, attemptError)
        attempts++
        if (attempts < maxAttempts) {
          // Esperar antes de reintentar
          await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempts - 1)))
        }
      }
    }
    
    // Si llegamos aquí, se agotaron los reintentos
    console.error("Error persistente al obtener vendedores después de múltiples intentos:", lastError)
    
    // Intentar obtener de localStorage como último recurso
    if (typeof window !== "undefined") {
      const localVendors = localStorage.getItem("vendors")
      if (localVendors) {
        console.log("Usando datos de vendedores desde localStorage como último recurso")
        return JSON.parse(localVendors)
      }
    }
    return []
  } catch (error) {
    console.error("Error general en getVendors:", error instanceof Error ? {
      message: error.message,
      stack: error.stack
    } : error)
    // Intentar obtener de localStorage como fallback
    if (typeof window !== "undefined") {
      const localVendors = localStorage.getItem("vendors")
      if (localVendors) {
        return JSON.parse(localVendors)
      }
    }
    return []
  }
}

// Crear un nuevo vendedor
export async function createVendor(vendor: Omit<Vendor, "id">): Promise<Vendor | null> {
  try {
    // Hash de la contraseña antes de almacenarla
    const hashedPassword = await hashPassword(vendor.password)

    // Usar supabaseAdmin en lugar de supabase para evitar RLS
    const { data, error } = await supabaseAdmin
      .from("vendors")
      .insert([
        {
          name: vendor.name,
          email: vendor.email,
          password: hashedPassword, // Almacenar el hash, no la contraseña original
          active: vendor.active,
        },
      ])
      .select()
      .single()

    if (error) {
      console.error("Error creating vendor:", error)
      return null
    }

    const newVendor = mapVendorFromSupabase(data)

    // Actualizar localStorage
    const localVendors = JSON.parse(localStorage.getItem("vendors") || "[]")
    localStorage.setItem("vendors", JSON.stringify([...localVendors, newVendor]))

    return newVendor
  } catch (error) {
    console.error("Error in createVendor:", error)
    return null
  }
}

// Actualizar un vendedor existente
export async function updateVendor(vendor: Vendor): Promise<Vendor | null> {
  try {
    // Obtener el vendedor actual para verificar si la contraseña ha cambiado
    const { data: existingVendor, error: fetchError } = await supabaseAdmin
      .from("vendors")
      .select("password")
      .eq("id", vendor.id)
      .single()

    if (fetchError) {
      console.error("Error fetching existing vendor:", fetchError)
      return null
    }

    // Determinar si necesitamos hacer hash de la contraseña
    let passwordToUpdate = vendor.password

    // Si la contraseña ha cambiado, crear un nuevo hash
    if (existingVendor.password !== vendor.password) {
      passwordToUpdate = await hashPassword(vendor.password)
    }

    const { data, error } = await supabaseAdmin
      .from("vendors")
      .update({
        name: vendor.name,
        email: vendor.email,
        password: passwordToUpdate,
        active: vendor.active,
      })
      .eq("id", vendor.id)
      .select()
      .single()

    if (error) {
      console.error("Error updating vendor:", error)
      return null
    }

    const updatedVendor = mapVendorFromSupabase(data)

    // Actualizar localStorage
    const localVendors = JSON.parse(localStorage.getItem("vendors") || "[]")
    const updatedLocalVendors = localVendors.map((v: Vendor) => (v.id === vendor.id ? updatedVendor : v))
    localStorage.setItem("vendors", JSON.stringify(updatedLocalVendors))

    return updatedVendor
  } catch (error) {
    console.error("Error in updateVendor:", error)
    return null
  }
}

// Eliminar un vendedor
export async function deleteVendor(id: string): Promise<boolean> {
  try {
    const { error } = await supabaseAdmin.from("vendors").delete().eq("id", id)

    if (error) {
      console.error("Error deleting vendor:", error)
      return false
    }

    // Actualizar localStorage
    const localVendors = JSON.parse(localStorage.getItem("vendors") || "[]")
    const filteredVendors = localVendors.filter((v: Vendor) => v.id !== id)
    localStorage.setItem("vendors", JSON.stringify(filteredVendors))

    return true
  } catch (error) {
    console.error("Error in deleteVendor:", error)
    return false
  }
}

// Verificar credenciales de vendedor (para login)
export async function verifyVendorCredentials(email: string, password: string): Promise<Vendor | null> {
  try {
    // Modificamos esta consulta para obtener solo el vendedor por email, sin verificar contraseña
    const { data, error } = await supabase.from("vendors").select("*").eq("email", email).eq("active", true)

    // Si hay un error o no hay datos, retornamos null
    if (error || !data || data.length === 0) {
      console.log("No se encontró vendedor con ese email o está inactivo")
      return null
    }

    // Verificar la contraseña con bcrypt
    const isPasswordValid = await verifyPassword(password, data[0].password)

    if (!isPasswordValid) {
      console.log("Contraseña incorrecta")
      return null
    }

    // Si llegamos aquí, las credenciales son válidas
    return mapVendorFromSupabase(data[0])
  } catch (error) {
    console.error("Error in verifyVendorCredentials:", error)
    return null
  }
}

