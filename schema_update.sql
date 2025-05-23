-- Crear tabla para límites de números específicos
CREATE TABLE IF NOT EXISTS public.number_limits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  number_range TEXT NOT NULL,
  max_times INTEGER NOT NULL DEFAULT 100,
  times_sold INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Habilitar RLS en la tabla
ALTER TABLE public.number_limits ENABLE ROW LEVEL SECURITY;

-- Crear políticas para límites de números
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

-- Crear índices para mejorar el rendimiento
CREATE INDEX IF NOT EXISTS number_limits_event_id_idx ON public.number_limits (event_id);
CREATE INDEX IF NOT EXISTS number_limits_number_range_idx ON public.number_limits (number_range);

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