-- Helpers de seguridad para las politicas RLS de messaging y copilot.
-- Esta es la ultima linea de defensa (ver ARCHITECTURE.md seccion 1): la que
-- un error de programacion en el backend no puede sortear.

-- Lee el actor fijado por UnitOfWork.runAs() al inicio de la transaccion.
-- Lanza excepcion en vez de devolver NULL: si devolviera NULL, las
-- politicas simplemente no encontrarian coincidencias y la consulta
-- devolveria vacio EN SILENCIO. Fallar de forma ruidosa hace imposible
-- confundir "sin resultados" con "sin actor declarado".
CREATE FUNCTION rw_current_user_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  raw text;
BEGIN
  raw := current_setting('app.current_user_id', true);

  IF raw IS NULL OR raw = '' THEN
    RAISE EXCEPTION 'app.current_user_id no esta fijado para esta transaccion'
      USING ERRCODE = '28000'; -- invalid_authorization_specification
  END IF;

  RETURN raw::uuid;
END;
$$;

COMMENT ON FUNCTION rw_current_user_id() IS
  'Actor de la transaccion actual. set_config(..., true) en UnitOfWork.runAs '
  'lo hace transaction-local: no puede filtrarse a otro request del pool.';

-- SECURITY DEFINER es lo que rompe la recursion: rw_channel_members tiene su
-- propia politica RLS que, para decidir si el actor puede ver una fila de
-- membresia, necesitaria preguntar "es el actor miembro de ese canal" -
-- es decir, volver a consultar rw_channel_members. Esta funcion corre con
-- los privilegios de quien la crea (el propietario de las tablas, que por
-- ser propietario omite RLS), asi que su consulta interna no vuelve a
-- disparar la politica que la esta llamando.
CREATE FUNCTION rw_is_channel_member(p_channel_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM rw_channel_members
    WHERE channel_id = p_channel_id
      AND user_id = p_user_id
      AND left_at IS NULL
  );
$$;

COMMENT ON FUNCTION rw_is_channel_member(uuid, uuid) IS
  'SECURITY DEFINER a proposito: evita la recursion entre esta consulta y '
  'la politica RLS de rw_channel_members. No confundir con un bypass '
  'general - solo expone una pregunta de si/no, nunca las filas en si.';

REVOKE ALL ON FUNCTION rw_is_channel_member(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rw_current_user_id() TO rw_app;
GRANT EXECUTE ON FUNCTION rw_is_channel_member(uuid, uuid) TO rw_app;
