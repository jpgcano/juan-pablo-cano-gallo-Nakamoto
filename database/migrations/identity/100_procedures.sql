-- Procedimientos almacenados de identity (CREATE PROCEDURE + CALL, no
-- funciones): consulta de usuarios, y edicion/eliminacion de usuarios.
--
-- Alcance deliberado: ambos procedimientos de edicion solo permiten que un
-- actor modifique su PROPIO usuario. rw_users no tiene RLS (ver
-- identity/010_tables.sql: el login determina el actor, no puede exigirselo
-- de antemano), asi que esta restriccion vive aqui, explicita en el
-- procedimiento. No existe en este modelo un rol de administrador que
-- gestione usuarios ajenos - agregarlo exigiria un sistema de roles que el
-- enunciado no pide, y se documenta como corte de alcance en DECISIONS.md.

CREATE PROCEDURE rw_sp_search_users(
  IN    p_query           text,
  IN    p_limit            integer,
  IN    p_after_full_name text,
  IN    p_after_id        uuid,
  INOUT p_cursor           refcursor DEFAULT 'rw_search_users_cursor'
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_limit integer := coalesce(p_limit, 20);
BEGIN
  IF v_limit <= 0 OR v_limit > 100 THEN
    v_limit := 20;
  END IF;

  -- La concatenacion de aqui abajo arma un PATRON para ILIKE, no una
  -- sentencia SQL: p_query sigue viajando como parametro enlazado, nunca
  -- se interpola en el texto del comando. No es el "SQL por concatenacion"
  -- que el enunciado prohibe (que se refiere a construir y ejecutar SQL
  -- dinamico pegando texto de entrada).
  OPEN p_cursor FOR
    SELECT id, email, full_name, job_title, locale, is_active, created_at
    FROM rw_users
    WHERE is_active
      AND (
        p_query IS NULL OR p_query = ''
        OR full_name ILIKE '%' || p_query || '%'
        OR email ILIKE '%' || p_query || '%'
      )
      AND (
        p_after_full_name IS NULL
        OR (full_name, id) > (p_after_full_name, p_after_id)
      )
    ORDER BY full_name ASC, id ASC
    LIMIT v_limit;
END;
$$;

COMMENT ON PROCEDURE rw_sp_search_users(text, integer, text, uuid, refcursor) IS
  'Uso: BEGIN; CALL rw_sp_search_users(''ana'', 20, NULL, NULL, ''cur1''); '
  'FETCH ALL FROM "cur1"; COMMIT; El cursor solo vive dentro de la transaccion que lo abrio.';

CREATE PROCEDURE rw_sp_update_user(
  IN p_user_id  uuid,
  IN p_full_name text,
  IN p_job_title text,
  IN p_locale    text
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_actor uuid := rw_current_user_id();
BEGIN
  IF p_user_id <> v_actor THEN
    RAISE EXCEPTION 'rw_sp_update_user: solo se puede editar el propio perfil'
      USING ERRCODE = '42501';
  END IF;

  UPDATE rw_users
  SET full_name = coalesce(p_full_name, full_name),
      job_title = coalesce(p_job_title, job_title),
      locale    = coalesce(p_locale, locale)
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'rw_sp_update_user: usuario % no encontrado', p_user_id
      USING ERRCODE = 'P0002';
  END IF;
END;
$$;

CREATE PROCEDURE rw_sp_deactivate_user(IN p_user_id uuid)
LANGUAGE plpgsql
AS $$
DECLARE
  v_actor uuid := rw_current_user_id();
BEGIN
  IF p_user_id <> v_actor THEN
    RAISE EXCEPTION 'rw_sp_deactivate_user: solo se puede desactivar la propia cuenta'
      USING ERRCODE = '42501';
  END IF;

  UPDATE rw_users SET is_active = false WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'rw_sp_deactivate_user: usuario % no encontrado', p_user_id
      USING ERRCODE = 'P0002';
  END IF;

  -- Desactivar la cuenta tambien cierra sus sesiones vivas. Misma
  -- transaccion: si algo de esto fallara, ni el usuario queda desactivado
  -- a medias ni sus tokens quedan vigentes por error.
  UPDATE rw_refresh_tokens
  SET revoked_at = now()
  WHERE user_id = p_user_id AND revoked_at IS NULL;
END;
$$;

GRANT EXECUTE ON PROCEDURE rw_sp_search_users(text, integer, text, uuid, refcursor) TO rw_app;
GRANT EXECUTE ON PROCEDURE rw_sp_update_user(uuid, text, text, text) TO rw_app;
GRANT EXECUTE ON PROCEDURE rw_sp_deactivate_user(uuid) TO rw_app;
