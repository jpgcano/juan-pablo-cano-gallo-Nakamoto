# Hoja de ruta de calidad y seguridad

## Estado actual

La primera y segunda capa de guardianes ya están implementadas: valida citas contra el contexto autorizado, normaliza intentos ofuscados, bloquea prompt injection, lenguaje abusivo y secretos con forma de token, limita respuestas vacías o excesivas y registra `guardian_reason` en PostgreSQL. Hay 10 pruebas unitarias, 15 pruebas HTTP, 3 pruebas WebSocket y 10 pruebas de base de datos ejecutadas contra PostgreSQL real; quedan moderación semántica y ampliar cobertura de los flujos generales.

## Prioridad 1 — Guardianes de IA

- [x] Verificar que la respuesta solo use el contexto recuperado para el actor autenticado.
- [x] Validar que cada cita exista, corresponda al contexto y no exponga canales no autorizados.
- [x] Rechazar prompt injection, instrucciones contenidas en mensajes y solicitudes fuera de alcance.
- [x] Detectar insultos, contenido abusivo o inseguro en preguntas y respuestas.
- [x] Aplicar *fail closed*: ante respuesta inválida, ambigua o sin evidencia, negar y registrar el motivo.
- [x] Mantener auditoría de decisiones del guardián sin almacenar secretos ni datos innecesarios.

## Prioridad 2 — Seguridad

- [x] Probar RLS, membresías, búsqueda y copiloto con usuarios autorizados y no autorizados (PostgreSQL real).
- [x] Probar autenticación WebSocket y unión a canales con y sin membresía.
- [x] Probar JWT, rotación de refresh tokens, XSS y contenido no confiable.
- [x] Probar inyección SQL y ejecutar las pruebas contra PostgreSQL real, nunca solo con mocks.

## Prioridad 3 — Funcionamiento

- [ ] Verificar login, logout, refresh, canales, mensajes, edición, borrado lógico y reintentos idempotentes.
- [ ] Verificar búsqueda, resaltado, paginación, realtime y los tres desenlaces del copiloto.
- [ ] Confirmar `docker compose up --build` en una máquina limpia.

## Prioridad 4 — Experiencia de usuario

- [ ] Mejorar estados de carga, error, reintento, vacío y respuestas largas.
- [ ] Persistir el historial del copiloto y enlazar cada cita con su mensaje exacto.
- [ ] Revisar responsive, accesibilidad básica y navegación por teclado.

## Cierre

Validación ejecutada para entrega a pruebas: `backend` (17 tests, lint, typecheck y build), `database` (10 tests y lint) y `frontend` (lint, typecheck y build), todo correcto. Antes del commit final queda actualizar `README.md` con el flujo Compose.

## Prioridad mínima — Documentación visual

- [ ] Actualizar diagramas y flujos Mermaid/PNG para reflejar los guardianes de IA, la validación de citas y el servicio temporal de migración de Compose.
- [ ] Revisar que los recorridos de RLS, RAG, realtime y despliegue coincidan con la implementación actual.
