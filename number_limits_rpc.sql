-- Funciones RPC para manejo seguro de límites de números en NumixPro

-- Función para obtener todos los límites de números para un evento
CREATE OR REPLACE FUNCTION get_number_limits(
  p_event_id UUID
) RETURNS SETOF number_limits AS $$
BEGIN
  RETURN QUERY
  SELECT *
  FROM public.number_limits
  WHERE event_id = p_event_id
  ORDER BY number_range ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Función para obtener un límite específico por evento y rango
CREATE OR REPLACE FUNCTION get_number_limit(
  p_event_id UUID,
  p_number_range TEXT
) RETURNS SETOF number_limits AS $$
BEGIN
  RETURN QUERY
  SELECT *
  FROM public.number_limits
  WHERE event_id = p_event_id
  AND number_range = p_number_range;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Función para crear o actualizar un límite de número
CREATE OR REPLACE FUNCTION update_number_limit(
  p_event_id UUID,
  p_number_range TEXT,
  p_max_times INTEGER
) RETURNS SETOF number_limits AS $$
DECLARE
  existing_limit_id UUID;
  result_record number_limits;
BEGIN
  -- Validar parámetros
  IF p_max_times < 0 THEN
    RAISE EXCEPTION 'El número máximo debe ser mayor o igual a cero';
  END IF;
  
  -- Verificar si ya existe un límite para este número/rango
  SELECT id INTO existing_limit_id
  FROM public.number_limits
  WHERE event_id = p_event_id
  AND number_range = p_number_range;
  
  IF existing_limit_id IS NOT NULL THEN
    -- Actualizar el límite existente
    UPDATE public.number_limits
    SET max_times = p_max_times
    WHERE id = existing_limit_id
    RETURNING * INTO result_record;
  ELSE
    -- Crear un nuevo límite
    INSERT INTO public.number_limits (
      event_id,
      number_range,
      max_times,
      times_sold
    ) VALUES (
      p_event_id,
      p_number_range,
      p_max_times,
      0
    ) RETURNING * INTO result_record;
  END IF;
  
  RETURN NEXT result_record;
  RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Nota: Las funciones increment_number_sold_safely, decrement_number_sold_safely y check_number_availability
-- ya existen en rpc_functions.sql y no es necesario volver a crearlas.