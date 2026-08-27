-- Consulta 4: consumo acumulado del copiloto por usuario.
--
-- $1 inicio del rango   timestamptz
-- $2 fin del rango      timestamptz
--
-- Agrupa por dia dentro del rango para alimentar el mismo dashboard de
-- costos que Sara menciona en el corpus semilla (#producto). user_id no es
-- un parametro: se toma de rw_current_user_id(), asi que esta consulta
-- siempre responde "mi propio consumo". La politica RLS de
-- rw_copilot_queries ya restringe a las filas del actor por su cuenta; el
-- WHERE explicito es la misma defensa en profundidad del resto del esquema,
-- no una necesidad estricta para que el resultado sea correcto.

SELECT
  date_trunc('day', created_at)                       AS day,
  count(*)                                             AS total_queries,
  count(*) FILTER (WHERE outcome = 'answered')         AS answered,
  count(*) FILTER (WHERE outcome = 'no_context')       AS no_context,
  count(*) FILTER (WHERE outcome = 'out_of_scope')     AS out_of_scope,
  coalesce(sum(tokens_in), 0)                          AS tokens_in_total,
  coalesce(sum(tokens_out), 0)                         AS tokens_out_total,
  coalesce(sum(cost_usd), 0)::numeric(12,6)            AS cost_usd_total
FROM rw_copilot_queries
WHERE user_id = rw_current_user_id()
  AND created_at >= $1::timestamptz
  AND created_at <  $2::timestamptz
GROUP BY date_trunc('day', created_at)
ORDER BY day DESC;
