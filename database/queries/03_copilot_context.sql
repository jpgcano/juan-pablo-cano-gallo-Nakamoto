-- Consulta 3: recuperacion de contexto para el copiloto con permisos en SQL.
--
-- $1 embedding de la pregunta   vector(1536)
-- $2 cantidad de mensajes       integer
--
-- Se expone como funcion (rw_fn_copilot_context, definida en
-- 900_contracts.sql) en vez de repetir este SELECT en cada lugar que lo
-- necesita: es el contrato publicado que messaging le da a copilot, y el
-- unico camino que el modulo copilot tiene hacia rw_messages.
--
-- No es SECURITY DEFINER: corre con los mismos privilegios de rw_app que
-- cualquier otra consulta, asi que las politicas RLS de rw_messages y
-- rw_message_embeddings se evaluan igual que siempre. El filtro de permisos
-- no es un paso aparte - es la misma politica que protege el resto de la
-- aplicacion, aplicada aqui tambien.
--
-- is_stale descarta los mensajes cuyo vector aun no se calculo (patron
-- outbox, ver DECISIONS.md D9): el copiloto nunca compara contra un
-- embedding desactualizado o ausente.

SELECT *
FROM rw_fn_copilot_context($1::vector, $2::integer);
