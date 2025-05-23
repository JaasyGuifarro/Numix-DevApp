-- Script SQL completo para Supabase - NUMIX Pro
-- Este script crea todas las tablas necesarias para la aplicación NUMIX Pro
-- y configura las políticas de seguridad (RLS) y publicaciones para Realtime

-- Habilitar la extensión uuid-ossp para generar UUIDs
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==========================================
-- TABLAS PRINCIPALES
-- ==========================================

-- Crear tabla de vendedores
CREATE TABLE IF NOT EXISTS public.vendors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Crear tabla de eventos
CREATE TABLE IF NOT EXISTS public.events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  repeat_daily BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'active',
  first_prize TEXT,
  second_prize TEXT,
  third_prize TEXT,
  awarded_at TIMESTAMP WITH TIME ZONE,
  min_number INTEGER DEFAULT 0,
  max_number INTEGER DEFAULT 99,
  excluded_numbers TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Crear tabla de tickets
CREATE TABLE IF NOT EXISTS public.tickets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  client_name TEXT NOT NULL,
  amount NUMERIC(10, 2) NOT NULL,
  numbers TEXT,
  vendor_email TEXT NOT NULL,
  rows JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Crear tabla para filas de tickets (aunque en la implementación actual se usa JSONB)
CREATE TABLE IF NOT EXISTS public.ticket_rows (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  times TEXT NOT NULL,
  actions TEXT NOT NULL,
  value NUMERIC(10, 2) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

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

-- Habilitar RLS en todas las tablas
ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.number_limits ENABLE ROW LEVEL SECURITY;

-- ==========================================
-- POLÍTICAS PARA VENDEDORES
-- ==========================================

-- Verificar si la política ya existe antes de crearla
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'vendors' 
        AND policyname = 'Permitir lectura de vendedores a todos'
    ) THEN
        CREATE POLICY "Permitir lectura de vendedores a todos" 
        ON public.vendors FOR SELECT 
        USING (true);
    END IF;
END
$$;

-- Verificar si la política ya existe antes de crearla
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'vendors' 
        AND policyname = 'Permitir gestión de vendedores al superusuario'
    ) THEN
        CREATE POLICY "Permitir gestión de vendedores al superusuario" 
        ON public.vendors FOR ALL 
        USING (auth.role() = 'service_role');
    END IF;
END
$$;

-- ==========================================
-- POLÍTICAS PARA EVENTOS
-- ==========================================

-- Verificar si la política ya existe antes de crearla
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'events' 
        AND policyname = 'Permitir lectura de eventos a todos'
    ) THEN
        CREATE POLICY "Permitir lectura de eventos a todos" 
        ON public.events FOR SELECT 
        USING (true);
    END IF;
END
$$;

-- Verificar si la política ya existe antes de crearla
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'events' 
        AND policyname = 'Permitir gestión de eventos al superusuario'
    ) THEN
        CREATE POLICY "Permitir gestión de eventos al superusuario" 
        ON public.events FOR ALL 
        USING (auth.role() = 'service_role');
    END IF;
END
$$;

-- ==========================================
-- POLÍTICAS PARA TICKETS
-- ==========================================

-- Verificar si la política ya existe antes de crearla
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'tickets' 
        AND policyname = 'Permitir lectura de tickets a todos'
    ) THEN
        CREATE POLICY "Permitir lectura de tickets a todos" 
        ON public.tickets FOR SELECT 
        USING (true);
    END IF;
END
$$;

-- Verificar si la política ya existe antes de crearla
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'tickets' 
        AND policyname = 'Permitir gestión de tickets a todos'
    ) THEN
        CREATE POLICY "Permitir gestión de tickets a todos" 
        ON public.tickets FOR ALL 
        USING (true);
    END IF;
END
$$;

-- ==========================================
-- POLÍTICAS PARA FILAS DE TICKETS
-- ==========================================

-- Verificar si la política ya existe antes de crearla
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'ticket_rows' 
        AND policyname = 'Permitir lectura de filas de tickets a todos'
    ) THEN
        CREATE POLICY "Permitir lectura de filas de tickets a todos" 
        ON public.ticket_rows FOR SELECT 
        USING (true);
    END IF;
END
$$;

-- Verificar si la política ya existe antes de crearla
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'ticket_rows' 
        AND policyname = 'Permitir gestión de filas de tickets a todos'
    ) THEN
        CREATE POLICY "Permitir gestión de filas de tickets a todos" 
        ON public.ticket_rows FOR ALL 
        USING (true);
    END IF;
END
$$;

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

-- Índices para vendors
CREATE INDEX IF NOT EXISTS vendors_email_idx ON public.vendors (email);
CREATE INDEX IF NOT EXISTS vendors_active_idx ON public.vendors (active);

-- Índices para events
CREATE INDEX IF NOT EXISTS events_status_idx ON public.events (status);
CREATE INDEX IF NOT EXISTS events_active_idx ON public.events (active);
CREATE INDEX IF NOT EXISTS events_end_date_idx ON public.events (end_date);

-- Índices para tickets
CREATE INDEX IF NOT EXISTS tickets_event_id_idx ON public.tickets (event_id);
CREATE INDEX IF NOT EXISTS tickets_vendor_email_idx ON public.tickets (vendor_email);
CREATE INDEX IF NOT EXISTS tickets_client_name_idx ON public.tickets (client_name);

-- Índices para ticket_rows
CREATE INDEX IF NOT EXISTS ticket_rows_ticket_id_idx ON public.ticket_rows (ticket_id);

-- Índices para number_limits
CREATE INDEX IF NOT EXISTS number_limits_event_id_idx ON public.number_limits (event_id);
CREATE INDEX IF NOT EXISTS number_limits_number_range_idx ON public.number_limits (number_range);

-- ==========================================
-- TRIGGERS Y FUNCIONES
-- ==========================================

-- Función para actualizar el timestamp de actualización
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Verificar si el trigger ya existe antes de crearlo
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger 
        WHERE tgname = 'update_tickets_updated_at'
        AND tgrelid = 'public.tickets'::regclass
    ) THEN
        CREATE TRIGGER update_tickets_updated_at
        BEFORE UPDATE ON public.tickets
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    END IF;
EXCEPTION
    WHEN undefined_table THEN
        -- Si la tabla no existe, no hacemos nada
        NULL;
END
$$;

-- ==========================================
-- CONFIGURACIÓN DE REALTIME
-- ==========================================

-- Verificar si las tablas ya están en la publicación supabase_realtime
DO $$
DECLARE
    table_exists BOOLEAN;
BEGIN
    -- Verificar events
    SELECT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
        AND schemaname = 'public' 
        AND tablename = 'events'
    ) INTO table_exists;
    
    IF NOT table_exists THEN
        EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.events';
    END IF;

    -- Verificar tickets
    SELECT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
        AND schemaname = 'public' 
        AND tablename = 'tickets'
    ) INTO table_exists;
    
    IF NOT table_exists THEN
        EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.tickets';
    END IF;

    -- Verificar number_limits
    SELECT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
        AND schemaname = 'public' 
        AND tablename = 'number_limits'
    ) INTO table_exists;
    
    IF NOT table_exists THEN
        EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.number_limits';
    END IF;

    -- Verificar vendors
    SELECT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
        AND schemaname = 'public' 
        AND tablename = 'vendors'
    ) INTO table_exists;
    
    IF NOT table_exists THEN
        EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.vendors';
    END IF;
END
$$;

-- Configurar REPLICA IDENTITY para todas las tablas
ALTER TABLE public.events REPLICA IDENTITY FULL;
ALTER TABLE public.tickets REPLICA IDENTITY FULL;
ALTER TABLE public.number_limits REPLICA IDENTITY FULL;
ALTER TABLE public.vendors REPLICA IDENTITY FULL;