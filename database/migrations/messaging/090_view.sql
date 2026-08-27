-- La vista de conversaciones del usuario, exigida por el enunciado.
--
-- Filtra por rw_current_user_id() en el propio JOIN, no solo confia en que
-- RLS lo haga: es la misma logica de defensa en profundidad del resto del
-- esquema, aplicada dentro de un objeto que cualquier cliente SQL podria
-- consultar directamente.
--
-- security_invoker = true es OBLIGATORIO aqui, no cosmetico. Por defecto
-- PostgreSQL ejecuta una vista con los privilegios de su DUENO (el rol que
-- corre las migraciones, que por ser propietario de las tablas omite RLS
-- por completo) - es el mismo mecanismo de "vista como SECURITY DEFINER"
-- que se documenta para funciones, pero aplica a las vistas por defecto sin
-- que haga falta pedirlo. Sin esta clausula, la vista devolveria filas de
-- CUALQUIER canal sin importar la membresia del actor, sin importar que su
-- propio JOIN parezca filtrar correctamente. Se detecto probando contra
-- una base real: rw_v_copilot_corpus (900_contracts.sql) tenia exactamente
-- este bug antes de agregar la clausula.
CREATE VIEW rw_v_user_conversations
WITH (security_invoker = true)
AS
SELECT
  c.id                     AS channel_id,
  c.slug,
  c.name,
  c.type,
  c.is_archived,
  lm.id                    AS last_message_id,
  lm.body                  AS last_message_body,
  lm.sender_id             AS last_message_sender_id,
  lm.created_at            AS last_message_at,
  coalesce(unread.count, 0) AS unread_count
FROM rw_channels c
JOIN rw_channel_members cm
  ON cm.channel_id = c.id
 AND cm.user_id = rw_current_user_id()
 AND cm.left_at IS NULL
LEFT JOIN LATERAL (
  SELECT m.id, m.body, m.sender_id, m.created_at
  FROM rw_messages m
  WHERE m.channel_id = c.id
  ORDER BY m.created_at DESC, m.id DESC
  LIMIT 1
) lm ON true
LEFT JOIN LATERAL (
  SELECT count(*) AS count
  FROM rw_messages m
  WHERE m.channel_id = c.id
    AND m.deleted_at IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM rw_message_reads r
      WHERE r.message_id = m.id AND r.user_id = rw_current_user_id()
    )
) unread ON true;

COMMENT ON VIEW rw_v_user_conversations IS
  'Canales del actor con el ultimo mensaje y el conteo de no leidos. '
  'No acepta parametros: el actor sale de rw_current_user_id(), nunca de '
  'un argumento que el llamador pudiera manipular.';

GRANT SELECT ON rw_v_user_conversations TO rw_app;
