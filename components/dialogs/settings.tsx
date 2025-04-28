"use client"

import { DialogForm, FormField } from "@/components/ui/dialog-form"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { Moon, Sun, Trash, RefreshCw, Database } from "lucide-react"
import { Separator } from "@/components/ui/separator"

interface SettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  settings: {
    superUserName: string
    superUserPassword: string
    isDarkMode: boolean
  }
  onSubmit: (data: {
    superUserName: string
    superUserPassword: string
  }) => void
  onDarkModeChange: (isDark: boolean) => void
  onClearCache: () => void
  onFixErrors: () => void
}

export function SettingsDialog({
  open,
  onOpenChange,
  settings,
  onSubmit,
  onDarkModeChange,
  onClearCache,
  onFixErrors,
}: SettingsDialogProps) {
  return (
    <DialogForm
      open={open}
      onOpenChange={onOpenChange}
      title="Configuración del Sistema"
      submitText="Guardar Cambios"
      onSubmit={(e) => {
        const formData = new FormData(e.currentTarget)
        onSubmit({
          superUserName: formData.get("superUserName") as string,
          superUserPassword: formData.get("superUserPassword") as string,
        })
      }}
    >
      <FormField label="Nombre de Administrador">
        <Input
          name="superUserName"
          defaultValue={settings.superUserName}
          required
          className="h-12 bg-white/10 border-0 text-white placeholder-gray-500"
        />
      </FormField>

      <FormField label="Contraseña de Administrador">
        <Input
          name="superUserPassword"
          type="password"
          defaultValue={settings.superUserPassword}
          required
          className="h-12 bg-white/10 border-0 text-white placeholder-gray-500"
        />
      </FormField>

      <div className="flex items-center justify-between bg-gradient-to-r from-[#FF6B6B]/10 to-[#4ECDC4]/10 p-4 rounded-xl">
        <label className="text-sm font-medium text-white">Modo Oscuro</label>
        <div className="flex items-center space-x-2">
          <Switch
            checked={settings.isDarkMode}
            onCheckedChange={onDarkModeChange}
            className="data-[state=checked]:bg-[#4ECDC4]"
          />
          {settings.isDarkMode ? (
            <Moon className="h-5 w-5 text-[#4ECDC4]" />
          ) : (
            <Sun className="h-5 w-5 text-[#FF6B6B]" />
          )}
        </div>
      </div>

      <Separator className="bg-white/10" />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Button
          type="button"
          variant="outline"
          onClick={onClearCache}
          className="h-12 bg-[#FF6B6B]/10 hover:bg-[#FF6B6B]/20 border-0 text-[#FF6B6B]"
        >
          <Trash className="mr-2 h-5 w-5" />
          Limpiar Caché
        </Button>

        <Button
          type="button"
          variant="outline"
          onClick={onFixErrors}
          className="h-12 bg-[#4ECDC4]/10 hover:bg-[#4ECDC4]/20 border-0 text-[#4ECDC4]"
        >
          <RefreshCw className="mr-2 h-5 w-5" />
          Solucionar Errores
        </Button>
      </div>


    </DialogForm>
  )
}

