-- Funciones transaccionales de messaging. Cada una valida el permiso
-- DENTRO de la base de datos y opera de forma atomica: o queda todo, o no
-- queda nada. El backend nunca arma estas operaciones a mano con varios
-- INSERT/UPDATE sueltos - siempre llama a una de estas funciones.

CREATE FUNCTION rw_fn_send_message(
  p_channel_id    uuid,
  p_body          text,
  p_client_msg_id uuid DEFAULT NULL,
  p_reply_to_id   uuid DEFAULT NULL
)
RETURNS rw_messages
LANGUAGE plpgsql
AS $$
DECLARE
  v_actor uuid := rw_current_user_id();
  v_row   rw_messages;
BEGIN
  IF NOT rw_is_channel_member(p_channel_id, v_actor) THEN
    RAISE EXCEPTION 'rw_fn_send_message: % no es miembro del canal %', v_actor, p_channel_id
      USING ERRCODE = '42501'; -- insufficient_privilege
  END IF;

  -- ON CONFLICT hace el reintento realmente idempotente: si el cliente ya
  -- envio este client_msg_id, no se inserta una segunda fila y se devuelve
  -- la que ya existia, en vez de fallar con un error que el frontend tendria
  -- que interpretar.
  INSERT INTO rw_messages (channel_id, sender_id, body, client_msg_id, reply_to_id)
  VALUES (p_channel_id, v_actor, p_body, p_client_msg_id, p_reply_to_id)
  ON CONFLICT (channel_id, client_msg_id) WHERE client_msg_id IS NOT NULL
  DO NOTHING
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    SELECT * INTO v_row
    FROM rw_messages
    WHERE channel_id = p_channel_id AND client_msg_id = p_client_msg_id;
  END IF;

  RETURN v_row;
END;
$$;

COMMENT ON FUNCTION rw_fn_send_message(uuid, text, uuid, uuid) IS
  'Valida membresia y envia. El INSERT tambien pasa por la politica RLS de '
  'rw_messages (defensa en profundidad): si esta validacion tuviera un bug, '
  'la politica sigue bloqueando el insert de un no miembro.';

CREATE FUNCTION rw_fn_edit_message(
  p_message_id  uuid,
  p_new_body    text
)
RETURNS rw_messages
LANGUAGE plpgsql
AS $$
DECLARE
  v_actor    uuid := rw_current_user_id();
  v_old_body text;
  v_row      rw_messages;
BEGIN
  SELECT body INTO v_old_body
  FROM rw_messages
  WHERE id = p_message_id
    AND sender_id = v_actor
    AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'rw_fn_edit_message: mensaje % no existe, no pertenece al actor o ya fue borrado', p_message_id
      USING ERRCODE = '42501';
  END IF;

  -- El estado original se conserva ANTES de sobrescribirlo, en la misma
  -- transaccion: si el UPDATE fallara por cualquier razon, la revision
  -- tambien se revierte y no queda un rastro parcial.
  INSERT INTO rw_message_revisions (message_id, edited_by, previous_body, reason)
  VALUES (p_message_id, v_actor, v_old_body, 'edit');

  UPDATE rw_messages
  SET body = p_new_body, edited_at = now()
  WHERE id = p_message_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

CREATE FUNCTION rw_fn_soft_delete_message(p_message_id uuid)
RETURNS rw_messages
LANGUAGE plpgsql
AS $$
DECLARE
  v_actor    uuid := rw_current_user_id();
  v_old_body text;
  v_row      rw_messages;
BEGIN
  SELECT body INTO v_old_body
  FROM rw_messages
  WHERE id = p_message_id
    AND sender_id = v_actor
    AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'rw_fn_soft_delete_message: mensaje % no existe, no pertenece al actor o ya fue borrado', p_message_id
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO rw_message_revisions (message_id, edited_by, previous_body, reason)
  VALUES (p_message_id, v_actor, v_old_body, 'delete');

  UPDATE rw_messages
  SET deleted_at = now()
  WHERE id = p_message_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

COMMENT ON FUNCTION rw_fn_soft_delete_message(uuid) IS
  'Nunca hace DELETE. rw_app tampoco tiene el privilegio (000_extensions_and_roles.sql): '
  'aunque esta funcion tuviera un bug, no podria borrar fisicamente ni con SQL manual.';

CREATE FUNCTION rw_fn_mark_channel_read(p_channel_id uuid)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_actor  uuid := rw_current_user_id();
  v_marked integer;
BEGIN
  IF NOT rw_is_channel_member(p_channel_id, v_actor) THEN
    RAISE EXCEPTION 'rw_fn_mark_channel_read: % no es miembro del canal %', v_actor, p_channel_id
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO rw_message_reads (message_id, user_id, read_at)
  SELECT m.id, v_actor, now()
  FROM rw_messages m
  WHERE m.channel_id = p_channel_id
  ON CONFLICT (message_id, user_id) DO UPDATE SET read_at = EXCLUDED.read_at;

  GET DIAGNOSTICS v_marked = ROW_COUNT;
  RETURN v_marked;
END;
$$;

GRANT EXECUTE ON FUNCTION rw_fn_send_message(uuid, text, uuid, uuid) TO rw_app;
GRANT EXECUTE ON FUNCTION rw_fn_edit_message(uuid, text) TO rw_app;
GRANT EXECUTE ON FUNCTION rw_fn_soft_delete_message(uuid) TO rw_app;
GRANT EXECUTE ON FUNCTION rw_fn_mark_channel_read(uuid) TO rw_app;
