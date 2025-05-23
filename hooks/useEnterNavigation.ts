/**
 * Hook personalizado para manejar la navegación entre campos de formulario al presionar Enter
 * Permite que al presionar la tecla Enter en un campo, el foco se mueva automáticamente al siguiente campo
 */

import { useCallback, useEffect } from 'react';

type EnterNavigationOptions = {
  /**
   * Si es true, previene el comportamiento predeterminado del evento Enter
   * (útil para evitar envío de formularios)
   */
  preventDefault?: boolean;
  
  /**
   * Callback opcional que se ejecuta después de mover el foco
   */
  onNavigate?: (currentElement: HTMLElement, nextElement: HTMLElement | null) => void;
  
  /**
   * ID del contenedor donde se encuentran los elementos focusables
   */
  containerId?: string;
};

// Función auxiliar para obtener elementos focusables
const getFocusableElements = (container: HTMLElement | null) => {
  if (!container) return [];
  
  // Selector para elementos focusables
  const focusableSelector = [
    'button:not([disabled])',
    '[href]',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(',');
  
  // Obtener todos los elementos focusables dentro del contenedor
  return Array.from(
    container.querySelectorAll(focusableSelector)
  ).filter((el) => {
    // Verificar que el elemento es visible
    const style = window.getComputedStyle(el as HTMLElement);
    return (
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      (el as HTMLElement).offsetWidth > 0 &&
      (el as HTMLElement).offsetHeight > 0
    );
  }) as HTMLElement[];
};

// Función auxiliar para mover al siguiente elemento
const moveToNextElement = (currentElement: HTMLElement, focusableElements: HTMLElement[]) => {
  // Encontrar el índice del elemento actual
  const currentIndex = focusableElements.findIndex(
    (el) => el === currentElement
  );
  
  // Si se encontró el elemento actual y hay un siguiente elemento
  if (currentIndex >= 0 && currentIndex < focusableElements.length - 1) {
    // Enfocar el siguiente elemento
    const nextElement = focusableElements[currentIndex + 1];
    nextElement.focus();
    
    // Si el siguiente elemento es un input, seleccionar todo su contenido
    if (nextElement.tagName.toLowerCase() === 'input') {
      (nextElement as HTMLInputElement).select();
      // Asegurarse de que el scroll se ajuste para mostrar el elemento
      nextElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    
    return nextElement;
  }
  
  return null;
};

/**
 * Hook para manejar la navegación entre campos de formulario al presionar Enter
 */
export function useEnterNavigation(options: EnterNavigationOptions = {}) {
  const { preventDefault = true, onNavigate, containerId = 'ticket-dialog-content' } = options;
  
  /**
   * Maneja el evento keydown y mueve el foco al siguiente elemento cuando se presiona Enter
   */
  const handleEnterKeyNavigation = useCallback(
    (e: React.KeyboardEvent<HTMLElement>) => {
      // Solo procesar si la tecla es Enter
      if (e.key !== 'Enter') return;
      
      // Prevenir comportamiento predeterminado si está configurado
      if (preventDefault) {
        e.preventDefault();
      }
      
      // Obtener el elemento actual y el contenedor
      const currentElement = e.currentTarget;
      const container = currentElement.closest('form') || document.getElementById(containerId);
      
      if (!container) return;
      
      // Obtener elementos focusables y mover al siguiente
      const focusableElements = getFocusableElements(container as HTMLElement);
      const nextElement = moveToNextElement(currentElement, focusableElements);
      
      // Ejecutar callback si existe y se encontró un siguiente elemento
      if (onNavigate && nextElement) {
        onNavigate(currentElement as HTMLElement, nextElement);
      }
    },
    [preventDefault, onNavigate, containerId]
  );
  
  // Efecto para agregar un manejador de eventos global para la tecla Enter
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Solo procesar si la tecla es Enter y no estamos en un textarea o si ya hay un proceso en curso
      if (e.key === 'Enter' && document.activeElement && 
          (document.activeElement as HTMLElement).tagName.toLowerCase() !== 'textarea') {
        // Verificar si el elemento activo está dentro del contenedor especificado
        const container = document.getElementById(containerId);
        if (container && container.contains(document.activeElement as Node)) {
          // Prevenir comportamiento predeterminado si está configurado
          if (preventDefault) {
            e.preventDefault();
          }
          
          // Verificar si el elemento es un botón de tipo submit o si tiene un manejador de clic
          const currentElement = document.activeElement as HTMLElement;
          const isSubmitButton = 
            (currentElement.tagName.toLowerCase() === 'button' && 
             (currentElement as HTMLButtonElement).type === 'submit') ||
            currentElement.getAttribute('role') === 'button';
          
          // Si es un botón de envío, no navegamos automáticamente para evitar duplicaciones
          if (isSubmitButton) {
            // Solo prevenir el comportamiento predeterminado, pero no navegar
            return;
          }
          
          // Obtener elementos focusables y mover al siguiente
          const focusableElements = getFocusableElements(container);
          moveToNextElement(currentElement, focusableElements);
        }
      }
    };
    
    // Agregar el manejador de eventos global
    document.addEventListener('keydown', handleGlobalKeyDown);
    
    // Limpiar el manejador de eventos al desmontar
    return () => {
      document.removeEventListener('keydown', handleGlobalKeyDown);
    };
  }, [containerId, preventDefault]);

  
  return { handleEnterKeyNavigation };
}