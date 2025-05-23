"use client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"
import { Check, Trash2 } from "lucide-react"
import { PRICE_PER_TIME } from "@/lib/constants"
import { AccessibleFormField } from "@/components/ui/accessible-form"
import { useFocusTrap } from "@/hooks/useFocusTrap"

interface TicketRow {
  id: string
  times: string
  actions: string
  value: number
}

interface TicketDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  clientName: string
  onClientNameChange: (name: string) => void
  ticketRows: TicketRow[]
  onInputChange: (rowId: string, field: "times" | "actions", value: string) => void
  onAddRow: () => void
  onRemoveRow?: (rowId: string) => void
  onComplete: () => void
  onDelete?: () => void
  isReadOnly?: boolean
  title?: string
  selectedTicket?: any
  errorMessage?: string
  errorStatus?: "warning" | "error" | "info"
  numberInfo?: { number: string, remaining: number, requested: number }
}

// Exportar como función nombrada Y como exportación por defecto
export function TicketDialog({
  open,
  onOpenChange,
  clientName,
  onClientNameChange,
  ticketRows,
  onInputChange,
  onAddRow,
  onRemoveRow,
  onComplete,
  onDelete,
  isReadOnly = false,
  title = "Nuevo ticket",
  selectedTicket,
  errorMessage,
  errorStatus = "warning",
  numberInfo,
}: TicketDialogProps) {
  // Calculate totals
  const totalTimes = ticketRows.reduce((sum, row) => sum + (Number(row.times) || 0), 0)
  const totalPurchase = totalTimes * PRICE_PER_TIME

  // Modificar cómo se usa el hook useFocusTrap
  const focusTrapRef = useFocusTrap(open)

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="bg-black/95 text-white border-gray-800 max-w-md w-[95%] mx-auto fixed-size"
        ref={focusTrapRef}
        id="ticket-dialog-content"
        style={{
          maxHeight: '85vh',
          overflowY: 'auto',
          transform: 'translate(-50%, -50%)',
          position: 'fixed',
          top: '50%',
          left: '50%',
          zIndex: 50,
          /* Prevenir cambios de tamaño al enfocar campos */
          transition: 'none',
          /* Prevenir zoom en dispositivos móviles */
          touchAction: 'pan-x pan-y',
          /* Forzar tamaño fijo */
          fontSize: '16px',
          /* Prevenir ajuste automático de texto */
          textSizeAdjust: 'none',
          WebkitTextSizeAdjust: 'none'
        }}
      >
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-center">{title}</DialogTitle>
          <DialogDescription className="text-center text-sm text-gray-400">
            {isReadOnly
              ? "Detalles del ticket seleccionado"
              : selectedTicket
                ? "Modifica los datos del ticket"
                : "Ingresa los datos para crear un nuevo ticket"}
          </DialogDescription>
        </DialogHeader>

        {/* Mostrar mensaje de error si existe */}
        {errorMessage && (
          <div className={`p-3 rounded-md mb-4 ${errorStatus === "error" ? "bg-red-500/20 border border-red-500/30 text-red-200" : errorStatus === "warning" ? "bg-yellow-500/20 border border-yellow-500/30 text-yellow-200" : "bg-blue-500/20 border border-blue-500/30 text-blue-200"}`}>
            <div className="flex items-start">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm">{errorMessage}</p>
                {numberInfo && (
                  <div className="mt-2 text-xs">
                    <p>Número: <span className="font-semibold">{numberInfo.number}</span></p>
                    <p>Disponible: <span className="font-semibold">{numberInfo.remaining}</span></p>
                    <p>Solicitado: <span className="font-semibold">{numberInfo.requested}</span></p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Mostrar botón de eliminar solo si hay un ticket seleccionado y no es de solo lectura */}
        {selectedTicket && !isReadOnly && onDelete && (
          <div className="flex justify-end">
            <Button
              variant="destructive"
              onClick={() => {
                onOpenChange(false)
                onDelete()
              }}
              className="bg-red-500 hover:bg-red-600"
              aria-label="Eliminar ticket"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        )}

        <div className="space-y-4">
          <AccessibleFormField id="client-name" label="Nombre del cliente" required={!isReadOnly}>
            <Input
              value={clientName}
              onChange={(e) => onClientNameChange(e.target.value)}
              className="bg-white/10 border-0 text-white"
              placeholder="Nombre del cliente"
              required
              disabled={isReadOnly}
              aria-invalid={!clientName && !isReadOnly ? "true" : undefined}
              style={{ fontSize: 'inherit' }}
            />
          </AccessibleFormField>

          <div className="bg-gradient-to-r from-[#FF6B6B]/10 to-[#4ECDC4]/10 rounded-lg p-4">
            <div className="grid grid-cols-3 gap-2 mb-2 text-sm font-medium text-gray-400 text-center">
              <div id="column-times">Tiempos</div>
              <div id="column-actions">Acciones</div>
              <div id="column-value">Valor</div>
            </div>

            {ticketRows.map((row, index) => (
              <div key={row.id} className="grid grid-cols-3 gap-2 mb-2">
                <div className="flex items-center justify-center text-white">
                  {isReadOnly ? (
                    <span className="text-center">{row.times}</span>
                  ) : (
                    <Input
                      type="text"
                      inputMode="text"
                      min="0"
                      value={row.times}
                      onChange={(e) => {
                        // Validar que solo se ingresen números
                        if (e.target.value === "" || /^\d+$/.test(e.target.value)) {
                          onInputChange(row.id, "times", e.target.value)
                        }
                      }}
                      style={{ fontSize: 'inherit' }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          // Encontrar el campo de acciones correspondiente y enfocarlo
                          const actionsInput = e.currentTarget.closest(".grid-cols-3")?.querySelector("input[aria-labelledby=\"column-actions\"]") as HTMLInputElement
                          if (actionsInput) {
                            e.preventDefault()
                            actionsInput.focus()
                          }
                        }
                      }}
                      className="bg-white/10 border-0 text-white text-center"
                      aria-labelledby="column-times"
                      aria-label={`Tiempos para fila ${index + 1}`}
                    />
                  )}
                </div>
                <div className="flex items-center justify-center text-white">
                  {isReadOnly ? (
                    <span className="text-center">{row.actions}</span>
                  ) : (
                    <Input
                      type="text"
                      inputMode="text"
                      min="0"
                      max="99"
                      value={row.actions}
                      onChange={(e) => {
                        // Validar que solo se ingresen números
                        if (e.target.value === "" || /^\d+$/.test(e.target.value)) {
                          onInputChange(row.id, "actions", e.target.value)
                        }
                      }}
                      style={{ fontSize: 'inherit' }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault()
                          // Si es la última fila, añadir una nueva
                          if (index === ticketRows.length - 1) {
                            onAddRow()
                            // Programar un enfoque en el primer campo de la nueva fila
                            setTimeout(() => {
                              // Seleccionar el último input de tiempos (el de la nueva fila añadida)
                              const allTimesInputs = document.querySelectorAll(
                                `input[aria-labelledby="column-times"]`
                              )
                              const newRowTimesInput = allTimesInputs[allTimesInputs.length - 1] as HTMLInputElement
                              if (newRowTimesInput) {
                                newRowTimesInput.focus()
                              }
                            }, 0)
                          } else {
                            // Si no es la última fila, enfocar el campo de tiempos de la siguiente fila
                            const nextRowTimesInput = document.querySelector(
                              `.grid-cols-3:nth-child(${index + 2}) input[aria-labelledby="column-times"]`
                            ) as HTMLInputElement
                            if (nextRowTimesInput) {
                              nextRowTimesInput.focus()
                            }
                          }
                        }
                      }}
                      className="bg-white/10 border-0 text-white text-center"
                      aria-labelledby="column-actions"
                      aria-label={`Acciones para fila ${index + 1}`}
                    />
                  )}
                </div>
                <div className="flex items-center justify-center">
                  <div
                    className="flex-grow text-[#4ECDC4] font-bold text-center"
                    aria-labelledby="column-value"
                    aria-label={`Valor para fila ${index + 1}: $${row.value.toFixed(2)}`}
                  >
                    ${row.value.toFixed(2)}
                  </div>
                  {!isReadOnly && ticketRows.length > 1 && onRemoveRow && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => onRemoveRow(row.id)}
                      className="h-6 w-6 p-0 ml-1 text-gray-400 hover:text-red-500 hover:bg-transparent"
                      aria-label={`Eliminar fila ${index + 1}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
            {!isReadOnly && (
              <Button
                onClick={onAddRow}
                className="w-full mt-4 bg-gradient-to-r from-[#FF6B6B]/20 to-[#4ECDC4]/20 text-white hover:from-[#FF6B6B]/30 hover:to-[#4ECDC4]/30"
                aria-label="Añadir otra fila"
              >
                Añadir otra fila +
              </Button>
            )}
          </div>
        </div>

        {/* Summary Section */}
        <div className="mt-4 bg-gradient-to-r from-[#FF6B6B]/10 to-[#4ECDC4]/10 rounded-lg p-4">
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-[#4ECDC4]" aria-label={`Total tiempos: ${totalTimes}`}>
                {totalTimes}
              </div>
              <div className="text-sm text-gray-400">Total tiempos</div>
            </div>
            <div className="text-center">
              <div
                className="text-2xl font-bold text-[#4ECDC4]"
                aria-label={`Precio por tiempo: $${PRICE_PER_TIME.toFixed(2)}`}
              >
                ${PRICE_PER_TIME.toFixed(2)}
              </div>
              <div className="text-sm text-gray-400">Precio x tiempo</div>
            </div>
            <div className="text-center">
              <div
                className="text-2xl font-bold text-[#4ECDC4]"
                aria-label={`Compra total: $${totalPurchase.toFixed(2)}`}
              >
                ${totalPurchase.toFixed(2)}
              </div>
              <div className="text-sm text-gray-400">Compra total</div>
            </div>
          </div>

          <Separator className="my-4 bg-white/10" />

          <div className="grid grid-cols-1 gap-4">
            {isReadOnly ? (
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="h-12 bg-gradient-to-r from-[#FF6B6B]/20 to-[#4ECDC4]/20 hover:from-[#FF6B6B]/30 hover:to-[#4ECDC4]/30 border-0 text-white"
              >
                Cerrar
              </Button>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                <Button
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  className="h-12 bg-gradient-to-r from-[#FF6B6B]/20 to-[#4ECDC4]/20 hover:from-[#FF6B6B]/30 hover:to-[#4ECDC4]/30 border-0 text-white"
                >
                  Volver
                </Button>
                <Button
                  onClick={onComplete}
                  disabled={!clientName || totalTimes === 0}
                  className="h-12 bg-gradient-to-r from-[#FF6B6B] to-[#4ECDC4] hover:opacity-90 text-black font-medium"
                  aria-label={selectedTicket ? "Actualizar ticket" : "Completar ticket"}
                >
                  {selectedTicket ? "Actualizar" : "Completar"} <Check className="ml-2 h-5 w-5" aria-hidden="true" />
                </Button>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </DialogPrimitive.Root>
  )
}

// Exportar también como default para permitir ambos tipos de importación
export default TicketDialog
