-- Consulta 1: historial de mensajes de un canal con paginacion por keyset.
--
-- $1 channel_id   uuid
-- $2 cursor_created_at  timestamptz | NULL  -- NULL en la primera pagina
-- $3 cursor_id          uuid        | NULL  -- NULL en la primera pagina
-- $4 page_size          integer
--
-- Nada de OFFSET (prohibido por el enunciado, y ademas degrada con tablas
-- grandes porque Postgres tiene que recorrer y descartar las filas
-- saltadas). La comparacion de fila (created_at, id) < (cursor, cursor_id)
-- usa el indice rw_messages_channel_keyset_idx de punta a punta: cada
-- pagina cuesta lo mismo sin importar que tan lejos este del inicio.
--
-- No hay filtro de permisos explicito aqui: la politica RLS rw_messages_select
-- ya limita el resultado a canales donde rw_current_user_id() es miembro.
-- Si el channel_id pertenece a un canal ajeno, esta consulta devuelve cero
-- filas sin necesidad de un chequeo adicional.

SELECT
  id,
  sender_id,
  reply_to_id,
  body,
  client_msg_id,
  created_at,
  edited_at,
  deleted_at
FROM rw_messages
WHERE channel_id = $1::uuid
  AND (
    $2::timestamptz IS NULL
    OR (created_at, id) < ($2::timestamptz, $3::uuid)
  )
ORDER BY created_at DESC, id DESC
LIMIT $4::integer;
