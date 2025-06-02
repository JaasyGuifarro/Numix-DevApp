"use client"

import Image from 'next/image'
import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'

type OptimizedImageProps = {
  src: string
  alt: string
  width?: number
  height?: number
  className?: string
  priority?: boolean
  fill?: boolean
  sizes?: string
  quality?: number
  onLoad?: () => void
  fallbackSrc?: string
}

/**
 * Componente de imagen optimizado que utiliza next/image con mejoras:
 * - Manejo de errores de carga
 * - Imagen de respaldo (fallback)
 * - Indicador de carga
 * - Soporte para imágenes responsivas
 */
export function OptimizedImage({
  src,
  alt,
  width,
  height,
  className,
  priority = false,
  fill = false,
  sizes = '(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw',
  quality = 85,
  onLoad,
  fallbackSrc = '/placeholder.svg',
  ...props
}: OptimizedImageProps & Omit<React.ComponentProps<typeof Image>, 'src' | 'alt' | 'width' | 'height' | 'fill' | 'sizes' | 'quality'>) {
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(false)
  const [imgSrc, setImgSrc] = useState(src)

  // Reiniciar estados cuando cambia la fuente de la imagen
  useEffect(() => {
    setImgSrc(src)
    setError(false)
    setIsLoading(true)
  }, [src])

  return (
    <div className={cn(
      'relative overflow-hidden',
      isLoading && 'animate-pulse bg-muted',
      className
    )}>
      <Image
        src={error ? fallbackSrc : imgSrc}
        alt={alt}
        width={fill ? undefined : (width || 100)}
        height={fill ? undefined : (height || 100)}
        className={cn(
          'object-cover transition-opacity duration-300',
          isLoading ? 'opacity-0' : 'opacity-100',
        )}
        priority={priority}
        fill={fill}
        sizes={sizes}
        quality={quality}
        onLoad={() => {
          setIsLoading(false)
          onLoad?.() // Llamar al callback onLoad si existe
        }}
        onError={() => {
          setError(true)
          setIsLoading(false)
        }}
        {...props}
      />
    </div>
  )
}