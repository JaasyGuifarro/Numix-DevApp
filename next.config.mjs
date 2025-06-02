let userConfig = undefined
try {
  userConfig = await import('./v0-user-next.config')
} catch (e) {
  // ignore error
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    domains: ['ngzyyhebrphetphtlesu.supabase.co'], // Dominios permitidos para imágenes
    formats: ['image/avif', 'image/webp'],
    // Solo desactivar optimización en desarrollo
    unoptimized: process.env.NODE_ENV === 'development',
  },
  experimental: {
    webpackBuildWorker: true,
    parallelServerBuildTraces: true,
    parallelServerCompiles: true,
  },
<<<<<<< HEAD
  // Configuración para manejar diferencias de hidratación
  reactStrictMode: true,
  compiler: {
    // Suprimir los warnings de hidratación
    reactRemoveProperties: process.env.NODE_ENV === 'production' ? { properties: ['^__gchrome_uniqueid$'] } : false,
  },
=======
>>>>>>> 624c5503d96cf6f2927785c1f1d25f0199826991
}

mergeConfig(nextConfig, userConfig)

function mergeConfig(nextConfig, userConfig) {
  if (!userConfig) {
    return
  }

  for (const key in userConfig) {
    if (
      typeof nextConfig[key] === 'object' &&
      !Array.isArray(nextConfig[key])
    ) {
      nextConfig[key] = {
        ...nextConfig[key],
        ...userConfig[key],
      }
    } else {
      nextConfig[key] = userConfig[key]
    }
  }
}

export default nextConfig
