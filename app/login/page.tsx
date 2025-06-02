"use client"

<<<<<<< HEAD
import { useState, useEffect } from "react"
=======
import { useState } from "react"
>>>>>>> 624c5503d96cf6f2927785c1f1d25f0199826991
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
<<<<<<< HEAD
import { type CheckedState } from "@radix-ui/react-checkbox"

export default function LoginPage() {
  const [isClient, setIsClient] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)

  // Usar useEffect para manejar la hidratación
  useEffect(() => {
    setIsClient(true)
  }, [])

  const handleRememberMeChange = (checked: CheckedState) => {
    setRememberMe(checked === true)
  }

=======

export default function LoginPage() {
  const [rememberMe, setRememberMe] = useState(false)

>>>>>>> 624c5503d96cf6f2927785c1f1d25f0199826991
  return (
    <div className="flex items-center justify-center h-screen bg-gray-100">
      <Card className="w-[350px]">
        <CardHeader>
          <CardTitle>Iniciar Sesión</CardTitle>
          <CardDescription>Ingresa tus credenciales para acceder a tu cuenta.</CardDescription>
        </CardHeader>
        <CardContent>
          <form>
            <div className="grid gap-4">
              <div className="space-y-2">
                <Label htmlFor="email">Correo Electrónico</Label>
<<<<<<< HEAD
                <Input 
                  id="email" 
                  placeholder="mario@example.com" 
                  type="email" 
                  name="email"
                  suppressHydrationWarning
                />
=======
                <Input id="email" placeholder="mario@example.com" type="email" name="email" />
>>>>>>> 624c5503d96cf6f2927785c1f1d25f0199826991
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Contraseña</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  aria-label="Ingresa tu contraseña"
                  required
<<<<<<< HEAD
                  suppressHydrationWarning
                />
              </div>
              {isClient && (
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="remember-me"
                    aria-label="Recordarme en este dispositivo"
                    checked={rememberMe}
                    onCheckedChange={handleRememberMeChange}
                    suppressHydrationWarning
                  />
                  <label
                    htmlFor="remember-me"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    Recordarme en este dispositivo
                  </label>
                </div>
              )}
=======
                />
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="remember-me"
                  aria-label="Recordarme en este dispositivo"
                  checked={rememberMe}
                  onCheckedChange={setRememberMe}
                />
                <label
                  htmlFor="remember-me"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Recordarme en este dispositivo
                </label>
              </div>
>>>>>>> 624c5503d96cf6f2927785c1f1d25f0199826991
            </div>
          </form>
        </CardContent>
        <CardFooter>
          <Button className="w-full">Iniciar Sesión</Button>
        </CardFooter>
      </Card>
    </div>
  )
}

