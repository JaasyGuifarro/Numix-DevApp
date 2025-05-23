-- Script SQL para la tabla number_limits y funciones relacionadas
-- Este script contiene todo lo necesario para reinstalar la tabla number_limits en Supabase

-- Habilitar la extensión uuid-ossp para generar UUIDs
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==========================================
-- TABLA NUMBER_LIMITS
-- ==========================================

-- Crear tabla para límites de números específicos
CREATE TABLE IF NOT EXISTS public.number_limits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  number_range TEXT NOT NULL,
  max_times INTEGER NOT NULL DEFAULT 100,
  times_sold INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- ==========================================
-- CONFIGURACIÓN DE SEGURIDAD (RLS)
-- ==========================================

-- Habilitar RLS en la tabla
ALTER TABLE public.number_limits ENABLE ROW LEVEL SECURITY;

-- ==========================================
-- POLÍTICAS PARA LÍMITES DE NÚMEROS
-- ==========================================

-- Verificar si la política ya existe antes de crearla
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'number_limits' 
        AND policyname = 'Permitir lectura de límites de números a todos'
    ) THEN
        CREATE POLICY "Permitir lectura de límites de números a todos" 
        ON public.number_limits FOR SELECT 
        USING (true);
    END IF;
END
$$;

-- Verificar si la política ya existe antes de crearla
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'number_limits' 
        AND policyname = 'Permitir gestión de límites de números al superusuario'
    ) THEN
        CREATE POLICY "Permitir gestión de límites de números al superusuario" 
        ON public.number_limits FOR ALL 
        USING (auth.role() = 'service_role');
    END IF;
END
$$;

-- ==========================================
-- ÍNDICES PARA OPTIMIZACIÓN
-- ==========================================

-- Crear índices para mejorar el rendimiento
CREATE INDEX IF NOT EXISTS number_limits_event_id_idx ON public.number_limits (event_id);
CREATE INDEX IF NOT EXISTS number_limits_number_range_idx ON public.number_limits (number_range);

-- ==========================================
-- CONFIGURACIÓN DE REALTIME
-- ==========================================

-- Verificar si la tabla number_limits ya está en la publicación supabase_realtime
DO $$
DECLARE
    table_exists BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
        AND schemaname = 'public' 
        AND tablename = 'number_limits'
    ) INTO table_exists;
    
    IF NOT table_exists THEN
        -- Agregar la tabla a la publicación solo si no está ya
        EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.number_limits';
    END IF;
END
$$;

-- Configurar REPLICA IDENTITY para la tabla number_limits
ALTER TABLE public.number_limits REPLICA IDENTITY FULL;

-- ==========================================
-- FUNCIONES RPC PARA MANEJO DE LÍMITES
-- ==========================================

-- Función para incrementar de forma segura el contador de veces vendidas de un número
CREATE OR REPLACE FUNCTION increment_number_sold_safely(
  p_limit_id UUID,
  p_increment INTEGER,
  p_max_times INTEGER
) RETURNS BOOLEAN AS $$
DECLARE
  current_times_sold INTEGER;
  updated_rows INTEGER;
BEGIN
  -- Obtener el valor actual de times_sold con FOR UPDATE para bloquear la fila
  SELECT times_sold INTO current_times_sold
  FROM public.number_limits
  WHERE id = p_limit_id
  FOR UPDATE;
  
  -- Si no se encuentra el registro, retornar falso
  IF current_times_sold IS NULL THEN
    RAISE WARNING 'No se encontró el límite con ID %', p_limit_id;
    RETURN FALSE;
  END IF;
  
  -- Verificar estrictamente si excedería el límite
  IF current_times_sold + p_increment > p_max_times THEN
    RAISE WARNING 'Incremento excedería el límite: % + % > %', 
      current_times_sold, p_increment, p_max_times;
    RETURN FALSE;
  END IF;
  
  -- Actualizar con una condición para garantizar que no se exceda el límite
  UPDATE public.number_limits
  SET times_sold = times_sold + p_increment
  WHERE id = p_limit_id
  AND times_sold + p_increment <= p_max_times;
  
  GET DIAGNOSTICS updated_rows = ROW_COUNT;
  
  -- Verificar si se actualizó correctamente
  IF updated_rows = 0 THEN
    RAISE WARNING 'No se pudo actualizar el contador. Posible condición de carrera detectada.';
    RETURN FALSE;
  END IF;
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Función para decrementar de forma segura el contador de veces vendidas de un número
CREATE OR REPLACE FUNCTION decrement_number_sold_safely(
  p_event_id UUID,
  p_number_range TEXT,
  p_decrement INTEGER
) RETURNS BOOLEAN AS $$
DECLARE
  limit_id UUID;
  current_times_sold INTEGER;
  updated_rows INTEGER;
BEGIN
  -- Obtener el ID del límite y el valor actual de times_sold con FOR UPDATE para bloquear la fila
  SELECT id, times_sold INTO limit_id, current_times_sold
  FROM public.number_limits
  WHERE event_id = p_event_id AND number_range = p_number_range
  FOR UPDATE;
  
  -- Si no se encuentra el límite, retornar falso
  IF limit_id IS NULL THEN
    RAISE WARNING 'No se encontró límite para el rango % en el evento %', 
      p_number_range, p_event_id;
    RETURN FALSE;
  END IF;
  
  -- Calcular el nuevo valor (nunca menor que 0)
  DECLARE
    new_times_sold INTEGER := GREATEST(0, current_times_sold - p_decrement);
  BEGIN
    -- Actualizar el contador
    UPDATE public.number_limits
    SET times_sold = new_times_sold
    WHERE id = limit_id;
    
    GET DIAGNOSTICS updated_rows = ROW_COUNT;
    
    -- Verificar si se actualizó correctamente
    IF updated_rows = 0 THEN
      RAISE WARNING 'No se pudo actualizar el contador para el rango %', p_number_range;
      RETURN FALSE;
    END IF;
    
    RETURN TRUE;
  END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Función para verificar la disponibilidad de un número
CREATE OR REPLACE FUNCTION check_number_availability(
  p_event_id UUID,
  p_number_range TEXT,
  p_requested_amount INTEGER
) RETURNS JSON AS $$
DECLARE
  limit_record RECORD;
  is_available BOOLEAN;
  remaining INTEGER;
  limit_id UUID;
BEGIN
  -- Validar parámetros
  IF p_requested_amount <= 0 THEN
    RAISE WARNING 'Cantidad solicitada inválida: %', p_requested_amount;
    RETURN json_build_object(
      'available', FALSE,
      'remaining', 0,
      'limit_id', NULL
    );
  END IF;
  
  -- Buscar si existe un límite para este número o rango
  SELECT nl.id, nl.max_times, nl.times_sold
  INTO limit_record
  FROM public.number_limits nl
  WHERE nl.event_id = p_event_id
  AND (
    nl.number_range = p_number_range
    OR (
      -- Verificar si el número está en un rango con formato 'XX-YY'
      nl.number_range LIKE '%--%'
      AND (
        CASE 
          WHEN p_number_range ~ '^[0-9]+$' THEN
            CAST(p_number_range AS INTEGER) BETWEEN 
              CAST(SPLIT_PART(nl.number_range, '-', 1) AS INTEGER) AND
              CAST(SPLIT_PART(nl.number_range, '-', 2) AS INTEGER)
          ELSE FALSE
        END
      )
    )
  )
  LIMIT 1;
  
  -- Si no hay límite, el número está disponible sin restricciones
  IF limit_record IS NULL THEN
    RETURN json_build_object(
      'available', TRUE,
      'remaining', NULL,
      'limit_id', NULL
    );
  END IF;
  
  -- Calcular disponibilidad
  remaining := GREATEST(0, limit_record.max_times - limit_record.times_sold);
  is_available := remaining >= p_requested_amount;
  
  -- Retornar resultado como JSON
  RETURN json_build_object(
    'available', is_available,
    'remaining', remaining,
    'limit_id', limit_record.id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;