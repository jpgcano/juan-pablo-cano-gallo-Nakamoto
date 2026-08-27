-- Contratos publicados entre modulos: el unico cruce permitido entre las
-- tablas de un modulo y el codigo de otro. Cada uno de estos objetos es lo
-- que un modulo distinto de su dueno tiene permitido consultar; el resto
-- de las tablas es privado a su modulo por convencion de codigo (ningun
-- caso de uso de un modulo escribe SQL contra las tablas de otro).
--
-- Todos corren con los privilegios de rw_app, el mismo rol que ejecuta el
-- resto de la aplicacion (el enunciado pide "un rol de aplicacion", en
-- singular): estos contratos no son un atajo para saltarse permisos, solo
-- para no acoplar un modulo a la estructura interna de otro.
--
-- Las dos vistas usan WITH (security_invoker = true). Es obligatorio, no
-- cosmetico: por defecto PostgreSQL ejecuta una vista con los privilegios
-- de su DUENO (quien corre las migraciones, propietario de las tablas, que
-- por serlo omite RLS por completo) - una vista es, sin pedirlo, "como
-- SECURITY DEFINER" para las funciones. Se detecto probando contra una
-- base real: sin esta clausula, rw_v_copilot_corpus devolvia mensajes de
-- CUALQUIER canal sin importar la membresia del actor. Con la clausula, la
-- vista corre con los privilegios y el contexto RLS del rol que la
-- consulta, exactamente como cualquier otra consulta de rw_app.

-- Publicado por identity, consumido por messaging y copilot.
CREATE VIEW rw_v_identity_profiles
WITH (security_invoker = true)
AS
SELECT id, full_name, job_title, locale, is_active
FROM rw_users;

COMMENT ON VIEW rw_v_identity_profiles IS
  'Perfil publico de un usuario. password_hash nunca sale de identity: '
  'ni esta vista ni ningun otro contrato lo expone.';

GRANT SELECT ON rw_v_identity_profiles TO rw_app;

-- Publicado por messaging, consumido por copilot. Es la unica forma en que
-- el modulo copilot llega a un mensaje: no tiene (ni deberia escribir)
-- ninguna consulta directa contra rw_messages.
CREATE VIEW rw_v_copilot_corpus
WITH (security_invoker = true)
AS
SELECT
  m.id         AS message_id,
  m.channel_id AS channel_id,
  m.sender_id  AS sender_id,
  m.body       AS body,
  m.created_at AS created_at
FROM rw_messages m
WHERE m.deleted_at IS NULL;

COMMENT ON VIEW rw_v_copilot_corpus IS
  'Mensajes vivos. La politica RLS de rw_messages (rw_messages_select) '
  'aplica sobre esta vista porque tiene security_invoker = true: solo '
  'aparecen los mensajes de canales donde rw_current_user_id() es miembro.';

GRANT SELECT ON rw_v_copilot_corpus TO rw_app;

-- La Consulta 3 del enunciado: recuperacion de contexto para el copiloto
-- con permisos resueltos en SQL. Publicada por messaging (toca sus dos
-- tablas: mensajes y embeddings), consumida por copilot.
CREATE FUNCTION rw_fn_copilot_context(
  p_query_embedding vector(1536),
  p_limit           integer DEFAULT 8
)
RETURNS TABLE (
  message_id  uuid,
  channel_id  uuid,
  body        text,
  similarity  real
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    m.id,
    m.channel_id,
    m.body,
    (1 - (me.embedding <=> p_query_embedding))::real AS similarity
  FROM rw_message_embeddings me
  JOIN rw_messages m ON m.id = me.message_id
  WHERE NOT me.is_stale
    AND me.embedding IS NOT NULL
    AND m.deleted_at IS NULL
  ORDER BY me.embedding <=> p_query_embedding
  LIMIT p_limit;
$$;

COMMENT ON FUNCTION rw_fn_copilot_context(vector, integer) IS
  'A diferencia de una vista, una funcion SIN SECURITY DEFINER ya corre por '
  'defecto con los privilegios de quien la invoca (aqui, rw_app): no hace '
  'falta pedirlo. Las politicas RLS de rw_messages y rw_message_embeddings '
  'se evaluan igual que en cualquier otra consulta. El copiloto no tiene '
  'ningun camino para recibir un mensaje que el actor no podria leer '
  'directamente por su cuenta.';

GRANT EXECUTE ON FUNCTION rw_fn_copilot_context(vector, integer) TO rw_app;
