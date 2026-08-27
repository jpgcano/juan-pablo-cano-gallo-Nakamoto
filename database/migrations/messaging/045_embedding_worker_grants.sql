-- Privilegios de rw_worker, minimos y por columna. Ver 000_extensions_and_roles.sql
-- para la justificacion completa del rol.

-- Solo puede leer el texto que necesita para calcular el vector. No recibe
-- sender_id ni channel_id: no puede saber a quien pertenece un mensaje.
GRANT SELECT (id, body) ON rw_messages TO rw_worker;

-- Puede ver que hay pendiente y escribir el resultado del calculo.
-- No tiene INSERT: las filas de rw_message_embeddings nacen con el trigger
-- que corre como rw_app al insertar el mensaje (ver 080_triggers.sql).
GRANT SELECT, UPDATE (embedding, model, is_stale, updated_at) ON rw_message_embeddings TO rw_worker;
