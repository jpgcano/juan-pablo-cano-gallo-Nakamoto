-- Consulta 2: busqueda de mensajes con resaltado del termino encontrado.
--
-- $1 termino de busqueda   text
-- $2 cantidad de resultados integer
--
-- search_vector lo mantiene el trigger rw_trg_messages_search_vector
-- (messaging/080_triggers.sql), nunca se calcula aqui: por eso la consulta
-- puede usar el indice GIN rw_messages_search_vector_idx en vez de escanear
-- el texto completo en cada busqueda.
--
-- websearch_to_tsquery interpreta el texto del usuario como lo hace un
-- buscador (soporta frases entre comillas, "-" para excluir, etc.) sin que
-- el llamador tenga que armar la sintaxis de tsquery a mano. El termino
-- viaja como parametro enlazado ($1): no hay concatenacion de SQL en
-- ninguna parte de esta consulta.
--
-- RLS filtra por canal exactamente igual que en la Consulta 1: un mensaje
-- de un canal ajeno nunca entra al ts_rank porque nunca pasa la politica
-- rw_messages_select.
--
-- StartSel/StopSel son marcadores de TEXTO PLANO ({{HL}} / {{/HL}}), no
-- <mark>/</mark>: ts_headline no escapa HTML, y el resto del cuerpo es
-- contenido de otro usuario. Insertar el resultado como HTML crudo en el
-- cliente (dangerouslySetInnerHTML) convertiria un mensaje con <script>
-- en una XSS almacenada. El consumidor debe partir el string por estos
-- marcadores y renderizar cada segmento como texto, envolviendo con su
-- propio elemento de resaltado.

SELECT
  id,
  channel_id,
  sender_id,
  created_at,
  ts_headline(
    'spanish',
    body,
    websearch_to_tsquery('spanish', $1::text),
    'StartSel={{HL}}, StopSel={{/HL}}, MaxFragments=2, MaxWords=15, MinWords=5'
  ) AS highlighted_body,
  ts_rank(search_vector, websearch_to_tsquery('spanish', $1::text)) AS rank
FROM rw_messages
WHERE deleted_at IS NULL
  AND search_vector @@ websearch_to_tsquery('spanish', $1::text)
ORDER BY rank DESC, created_at DESC
LIMIT $2::integer;
