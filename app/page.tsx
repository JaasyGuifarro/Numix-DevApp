"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { EyeOff, Eye, User } from "lucide-react"
import { SkipLink } from "@/components/ui/skip-link"
import { LiveRegion } from "@/components/ui/live-region"
import { AccessibleForm, AccessibleFormField } from "@/components/ui/accessible-form"
import { useAuth } from "@/lib/auth-context"
import { AsmJsPolyfill } from "@/components/asm-js-polyfill"
import { DynamicFavicon } from "@/components/dynamic-favicon"
import { ResourceOptimizer } from "@/components/resource-optimizer"

// PasswordEye component
const PasswordEye = ({ isVisible, onToggle }: { isVisible: boolean; onToggle: () => void }) => {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors duration-200"
      aria-label={isVisible ? "Ocultar contraseña" : "Mostrar contraseña"}
    >
      {isVisible ? <EyeOff size={24} /> : <Eye size={24} />}
    </button>
  )
}

export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [isAnimated, setIsAnimated] = useState(false)
  const [statusMessage, setStatusMessage] = useState("")
  const [rememberMe, setRememberMe] = useState(false)
  const router = useRouter()

  // Usar el hook de autenticación
  const { signIn, loading: isLoading, error } = useAuth()

  useEffect(() => {
    // Verificar si venimos de un cierre de sesión
    const fromLogout = sessionStorage.getItem("fromLogout")

    if (fromLogout === "true") {
      // Limpiar la bandera
      sessionStorage.removeItem("fromLogout")

      // Prevenir navegación hacia atrás
      window.history.pushState(null, "", "/")
      window.addEventListener("popstate", function preventBack() {
        window.history.pushState(null, "", "/")
        window.removeEventListener("popstate", preventBack)
      })
    }

    // Trigger animations after component mounts
    setTimeout(() => setIsAnimated(true), 100)

    // Anunciar que la página de inicio de sesión está lista
    setStatusMessage("Página de inicio de sesión cargada")
  }, [])

  // Actualizar la función onSubmit para usar el nuevo sistema de autenticación
  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setStatusMessage("Iniciando sesión, por favor espere...")

    try {
      const result = await signIn(email, password)

      if (result.success) {
        setStatusMessage("Inicio de sesión exitoso, redirigiendo...")

        // Si se seleccionó "Recordarme", guardar el email para futuros inicios de sesión
        if (rememberMe) {
          localStorage.setItem("remembered_email", email)
        } else {
          localStorage.removeItem("remembered_email")
        }

        router.push("/vendedor/dashboard")
      } else {
        setStatusMessage(`Error: ${result.error || "Error al iniciar sesión"}`)
      }
    } catch (err) {
      console.error("Error al iniciar sesión:", err)
      setStatusMessage("Error al iniciar sesión. Intente nuevamente.")
    }
  }

  // Cargar email recordado
  useEffect(() => {
    const rememberedEmail = localStorage.getItem("remembered_email")
    if (rememberedEmail) {
      setEmail(rememberedEmail)
      setRememberMe(true)
    }
  }, [])

  return (
    <>
      {/* Incluir el polyfill para asm.js */}
      <AsmJsPolyfill />
      {/* Añadir el componente DynamicFavicon justo después de AsmJsPolyfill */}
      <DynamicFavicon />
      {/* Dentro del componente LoginPage, justo después de AsmJsPolyfill y DynamicFavicon, añadir: */}
      <ResourceOptimizer />

      <SkipLink />
      <LiveRegion role="status">{statusMessage}</LiveRegion>

      <div className="min-h-screen text-white flex flex-col relative overflow-hidden">
        {/* Gradient background */}
        <div
          className="fixed inset-0 pointer-events-none bg-black"
          style={{
            background: `
              linear-gradient(135deg,
                rgb(40, 15, 15) 0%,
                rgb(0, 0, 0) 35%,
                rgb(0, 0, 0) 65%,
                rgb(15, 25, 25) 100%
              )
            `,
          }}
          aria-hidden="true"
        />

        {/* Content wrapper */}
        <div className="relative z-10 flex flex-col min-h-screen">
          {/* Super User Button */}
          <div
            className={`absolute top-4 right-4 md:right-4 left-4 md:left-auto transition-all duration-500 transform ${isAnimated ? "translate-y-0 opacity-100" : "-translate-y-10 opacity-0"}`}
          >
            <Button
              onClick={() => router.push("/super-usuario")}
              className="bg-gradient-to-r from-[#FF6B6B] to-[#4ECDC4] hover:bg-gradient-to-r hover:from-[#ff5b5b] hover:to-[#3dbcb4] transition-colors duration-200 md:w-auto w-12 h-12 md:h-auto p-0 md:p-2 rounded-full md:rounded-lg shadow-sm hover:shadow-md transform-none"
              variant="custom"
              aria-label="Ir a la página de Super Usuario"
            >
              <User className="h-5 w-5 md:mr-2 md:h-4 md:w-4" aria-hidden="true" />
              <span className="hidden md:inline">Super Usuario</span>
            </Button>
          </div>

          {/* Logo Section */}
          <div className="flex-none flex items-center justify-center h-[35vh] pt-10 md:pt-0 md:h-auto md:flex-grow md:pt-16 md:pb-8">
            <div
              className={`relative px-4 w-full max-w-[80vw] md:max-w-[60vw] text-center transition-all duration-1000 transform ${isAnimated ? "translate-y-0 opacity-100" : "translate-y-10 opacity-0"}`}
            >
              <h1
                className="text-[15vw] sm:text-[10vw] md:text-[8vw] font-bold leading-none tracking-tight mx-auto animate-pulse-slow"
                style={{
                  background: "linear-gradient(to right, #FF6B6B, #FF8585, #4ECDC4)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                  color: "transparent",
                  textShadow: "0 2px 4px rgba(0,0,0,0.1)",
                  display: "inline-block",
                  padding: "0.1em 0",
                  position: "relative",
                  width: "auto",
                  maxWidth: "100%",
                  fontFamily: "'Montserrat', sans-serif",
                }}
              >
                NUMIX
              </h1>
            </div>
          </div>

          {/* Login Form Section */}
          <main
            id="main-content"
            className={`flex-grow flex flex-col justify-center md:justify-center w-full max-w-md mx-auto px-6 pb-8 -mt-36 md:mt-0 transition-all duration-700 transform ${isAnimated ? "translate-y-0 opacity-100" : "translate-y-20 opacity-0"}`}
            tabIndex={-1}
          >
            <AccessibleForm onSubmit={onSubmit} className="space-y-5" ariaLabel="Formulario de inicio de sesión">
              {error && (
                <div
                  className="text-red-500 text-center bg-red-500/10 p-4 rounded-lg border border-red-500/20 animate-fade-in"
                  role="alert"
                  aria-live="assertive"
                >
                  {error}
                </div>
              )}

              <AccessibleFormField id="email-input" label="Correo Electrónico" required>
                <Input
                  type="email"
                  placeholder="ejemplo@gmail.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-14 bg-white/10 border-0 rounded-xl text-lg text-white placeholder-gray-500 transition-all duration-200 focus:bg-white/15 focus:ring-2 focus:ring-[#4ECDC4]/50"
                  required
                  autoComplete="email"
                  name="email"
                  id="email-input"
                />
              </AccessibleFormField>

              <AccessibleFormField id="password-input" label="Contraseña" required>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-14 bg-white/10 border-0 rounded-xl text-lg pr-12 text-white transition-all duration-200 focus:bg-white/15 focus:ring-2 focus:ring-[#4ECDC4]/50"
                    required
                    autoComplete="current-password"
                    name="password"
                    id="password-input"
                    aria-label="Contraseña"
                  />
                  <PasswordEye isVisible={showPassword} onToggle={() => setShowPassword(!showPassword)} />
                </div>
              </AccessibleFormField>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="remember-me"
                  checked={rememberMe}
                  onCheckedChange={(checked) => setRememberMe(checked === true)}
                  className="border-gray-400 data-[state=checked]:bg-[#4ECDC4] data-[state=checked]:border-[#4ECDC4]"
                  name="remember-me"
                  aria-label="Recordarme"
                />
                <label htmlFor="remember-me" className="text-gray-400 cursor-pointer select-none">
                  Recuérdame
                </label>
              </div>

              <Button
                type="submit"
                disabled={isLoading}
                className="w-full h-14 text-lg font-semibold rounded-xl bg-gradient-to-r from-[#FF6B6B] to-[#4ECDC4] hover:opacity-90 transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98] shadow-md hover:shadow-lg"
                aria-busy={isLoading}
              >
                {isLoading ? (
                  <span className="flex items-center justify-center">
                    <svg
                      className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                    Iniciando sesión...
                  </span>
                ) : (
                  "Iniciar sesión"
                )}
              </Button>
            </AccessibleForm>
          </main>
        </div>
      </div>
    </>
  )
}

