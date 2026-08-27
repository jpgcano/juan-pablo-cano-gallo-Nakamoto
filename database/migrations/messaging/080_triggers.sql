-- Triggers de messaging.

-- 1) El trigger que exige el enunciado: mantiene el vector de busqueda
--    consistente con el cuerpo del mensaje, en INSERT y en cada UPDATE que
--    cambie el texto.
CREATE FUNCTION rw_fn_messages_search_vector()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.search_vector := to_tsvector('spanish', coalesce(NEW.body, ''));
  RETURN NEW;
END;
$$;

CREATE TRIGGER rw_trg_messages_search_vector
  BEFORE INSERT OR UPDATE OF body ON rw_messages
  FOR EACH ROW
  EXECUTE FUNCTION rw_fn_messages_search_vector();

CREATE INDEX rw_messages_search_vector_idx ON rw_messages USING GIN (search_vector);

-- Defensivo: si esta migracion llegara a correr sobre filas ya existentes
-- (no es el caso en una instalacion limpia, donde el seed corre despues de
-- migrar), deja el vector consistente sin depender de que se re-dispare el
-- trigger.
UPDATE rw_messages SET search_vector = to_tsvector('spanish', coalesce(body, '')) WHERE search_vector IS NULL;

-- 2) Outbox de embeddings (ver DECISIONS.md D9). El vector semantico se
--    calcula fuera de esta transaccion: aqui solo se deja constancia de que
--    hay trabajo pendiente. rw_worker hace el resto.
CREATE FUNCTION rw_fn_message_embedding_outbox()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO rw_message_embeddings (message_id) VALUES (NEW.id);
  ELSIF TG_OP = 'UPDATE' THEN
    UPDATE rw_message_embeddings
    SET is_stale = true, updated_at = now()
    WHERE message_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER rw_trg_messages_embedding_outbox
  AFTER INSERT OR UPDATE OF body ON rw_messages
  FOR EACH ROW
  EXECUTE FUNCTION rw_fn_message_embedding_outbox();

-- 3) Tiempo real. NOTIFY solo se entrega a los listeners tras el COMMIT de
--    la transaccion (comportamiento nativo de PostgreSQL): si rw_fn_send_message
--    hace ROLLBACK por falta de permiso, la notificacion nunca sale.
--    El payload lleva solo identificadores, nunca el cuerpo del mensaje: el
--    listener resuelve el contenido consultando la base, que vuelve a pasar
--    por RLS antes de llegarle a cada cliente conectado.
CREATE FUNCTION rw_fn_notify_new_message()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM pg_notify(
    'rw_message_events',
    json_build_object(
      'type', 'message_created',
      'channel_id', NEW.channel_id,
      'message_id', NEW.id,
      'created_at', NEW.created_at
    )::text
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER rw_trg_messages_notify
  AFTER INSERT ON rw_messages
  FOR EACH ROW
  EXECUTE FUNCTION rw_fn_notify_new_message();
