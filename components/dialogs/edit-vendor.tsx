"use client"

import { DialogForm, FormField } from "@/components/ui/dialog-form"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import type { Vendor } from "@/types"

interface EditVendorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  vendor?: Vendor // Hacemos vendor opcional
  onSubmit: (data: Vendor) => void
}

export function EditVendorDialog({ open, onOpenChange, vendor, onSubmit }: EditVendorDialogProps) {
  // Verificamos si vendor existe antes de acceder a sus propiedades
  if (!vendor && open) {
    return null // No renderizamos nada si vendor es undefined pero el diálogo está abierto
  }

  return (
    <DialogForm
      open={open}
      onOpenChange={onOpenChange}
      title="Editar Vendedor"
      submitText="Actualizar Vendedor"
      onSubmit={(e) => {
        if (!vendor) return // Verificación adicional

        const formData = new FormData(e.currentTarget)
        onSubmit({
          ...vendor,
          name: formData.get("name") as string,
          email: formData.get("email") as string,
          password: formData.get("password") as string,
          active: formData.get("active") === "on",
        })
      }}
    >
      {vendor && ( // Solo renderizamos el formulario si vendor existe
        <>
          <FormField label="Nombre">
            <Input
              name="name"
              defaultValue={vendor.name}
              required
              className="h-12 bg-white/10 border-0 text-white placeholder-gray-500"
            />
          </FormField>

          <FormField label="Email">
            <Input
              name="email"
              type="email"
              defaultValue={vendor.email}
              required
              className="h-12 bg-white/10 border-0 text-white placeholder-gray-500"
            />
          </FormField>

          <FormField label="Contraseña">
            <Input
              name="password"
              type="text"
              defaultValue={vendor.password}
              required
              className="h-12 bg-white/10 border-0 text-white placeholder-gray-500"
            />
          </FormField>

          <div className="flex items-center space-x-2 pt-2">
            <Checkbox id="active" name="active" defaultChecked={vendor.active} className="border-gray-600" />
            <label htmlFor="active" className="text-sm text-gray-400 select-none cursor-pointer">
              Activo
            </label>
          </div>
        </>
      )}
    </DialogForm>
  )
}

