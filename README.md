# Riwi — Plataforma de mensajería interna con copiloto de IA

Mensajería interna para Riwi Co. S.A.S. con canales, búsqueda, tiempo real y un copiloto que responde **únicamente** con información que el usuario autenticado tiene permitido ver.

> **Prueba técnica** — Assessment de Empleabilidad, Cohorte 6.
> Juan Pablo Cano Gallo · Clan Nakamoto

---

## Qué hace

- Mensajería por canales públicos, privados y directos, en tiempo real
- Edición y borrado de mensajes conservando siempre el estado original
- Búsqueda de texto completo con resaltado del término encontrado
- Copiloto con RAG que cita los mensajes en los que se apoya y **niega explícitamente** cuando no tiene permisos o contexto
- Interfaz responsiva en español e inglés

La garantía central: **ningún usuario puede leer, buscar ni consultar por copiloto contenido de un canal donde no es miembro.** Esa restricción se valida en los tres niveles — frontend, backend y base de datos —, con PostgreSQL como última línea, no bypasseable, mediante Row Level Security. El detalle está en [`ARCHITECTURE.md`](ARCHITECTURE.md).

---

## Requisitos

| Herramienta | Versión mínima | Para qué |
|---|---|---|
| Docker + Docker Compose | 24 / v2 | Levantar todo |
| pnpm | 9 | Desarrollo fuera de contenedores |
| Node.js | 20 | Desarrollo fuera de contenedores |

Una clave de API de OpenAI para el copiloto. Sin ella el sistema arranca igual y el copiloto responde con el proveedor de respaldo determinista.

> Este proyecto usa **pnpm** exclusivamente. No uses `npm` ni `yarn`: rompen la resolución estricta de dependencias que se usa aquí a propósito.

---

## Arranque en una máquina limpia

```bash
git clone https://github.com/jpgcano/juan-pablo-cano-gallo-Nakamoto.git
cd juan-pablo-cano-gallo-Nakamoto
cp .env.example .env
```

Edita `.env` y coloca tu `OPENAI_API_KEY`. Los demás valores por defecto sirven para desarrollo.

```bash
docker compose up --build
```

Con eso alcanza: el servicio `migrate` aplica el esquema y carga el corpus automáticamente antes de que `backend` arranque (es una dependencia declarada en `docker-compose.yml`, no un paso manual). `make migrate` y `make seed` quedan disponibles para volver a ejecutarlos sobre un stack ya levantado, por ejemplo después de agregar una migración nueva.

Listo:

| Servicio | URL |
|---|---|
| Aplicación | http://localhost:5173 |
| API | http://localhost:3000/api/v1 |
| Documentación de la API | http://localhost:3000/docs |
| PostgreSQL | `localhost:5432` · base `bd_juan_cano_nakamoto` |

### Usuarios de prueba

El corpus crea varios colaboradores. Todos usan la misma contraseña de desarrollo, definida en `.env`:

| Correo | Cargo | Sirve para |
|---|---|---|
| `ana.rios@riwi.io` | Líder de Producto | Usuario principal de la demo |
| `luis.parra@riwi.io` | Desarrollador Backend | Probar el tiempo real en una segunda ventana |
| `sara.mejia@riwi.io` | Analista de Datos | Miembro de un canal privado **al que Ana no pertenece** |

Ese último detalle es intencional: es lo que permite comprobar que el copiloto se niega correctamente.

---

## Comandos

Todo pasa por el `Makefile`, que solo agrupa comandos `pnpm` y `docker compose`.

| Comando | Qué hace |
|---|---|
| `make up` | Levanta base de datos, backend y frontend |
| `make down` | Baja los servicios |
| `make migrate` | Aplica las migraciones en orden |
| `make seed` | Carga el corpus completo desde `database/seed/seed.json` |
| `make reset` | Borra el volumen, migra y vuelve a sembrar |
| `make test` | Ejecuta las pruebas contra PostgreSQL real |
| `make lint` | Lint de los tres proyectos, incluida la regla de fronteras entre módulos |
| `make diagrams` | Regenera los PNG de los diagramas Mermaid |

Para trabajar fuera de contenedores, cada proyecto es independiente:

```bash
cd backend  && pnpm install && pnpm dev
cd frontend && pnpm install && pnpm dev
```

---

## Estructura del repositorio

Tres proyectos que **no comparten código**. Cada uno se puede extraer a su propio repositorio sin tocar una línea.

```
├── database/          esquema, RLS, funciones, procedimientos, corpus y pruebas de seguridad
├── backend/           API REST y WebSocket. Monolito modular: identity · messaging · copilot
├── frontend/          React + Vite, tres zonas, español e inglés
├── docs/              diagramas, normalización, contrato OpenAPI y guion de sustentación
├── docker-compose.yml
└── Makefile
```

El único punto de contacto entre backend y frontend es HTTP, y su contrato es [`docs/openapi.yaml`](docs/openapi.yaml).

---

## Documentación

| Documento | Contenido |
|---|---|
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | Módulos, capas, contratos, RLS y cómo viaja el actor hasta la política |
| [`DECISIONS.md`](DECISIONS.md) | Cada decisión técnica con su razón, su alternativa descartada y su costo |
| [`docs/normalization.md`](docs/normalization.md) | Análisis de negocio y normalización 1FN → 2FN → 3FN, con justificación de claves |
| [`docs/diagrams/`](docs/diagrams/) | Diez diagramas en MermaidJS, con sus PNG |
| [`docs/sustentacion.md`](docs/sustentacion.md) | Recorrido de los once requerimientos técnicos |

---

## Verificar que la seguridad funciona

Lo más rápido para comprobar que la restricción es real y no una promesa del backend:

```bash
docker compose exec db psql -U rw_app -d bd_juan_cano_nakamoto -c "SELECT count(*) FROM rw_messages;"
```

La conexión es válida y la tabla tiene cientos de filas, pero falla:

```
ERROR:  app.current_user_id no esta fijado para esta transaccion
```

No es una tabla vacía disfrazada de resultado válido — es una excepción explícita. `rw_current_user_id()` está escrita para fallar de forma ruidosa en vez de devolver `NULL` en silencio (si devolviera `NULL`, la política simplemente no encontraría coincidencias y la consulta parecería una tabla vacía legítima, indistinguible de "este usuario no tiene mensajes"). El modo seguro es el modo por defecto, y además es imposible de confundir con una respuesta real.

Las pruebas automatizadas cubren los dos escenarios que exige el enunciado, más un intento de inyección de instrucciones en el copiloto:

```bash
make test
```

---

## Variables de entorno

Copia `.env.example` a `.env`. Ninguna variable trae secretos reales.

| Variable | Para qué |
|---|---|
| `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` | Credenciales del contenedor de base de datos |
| `DATABASE_URL` | Cadena de conexión del backend, con el rol `rw_app` sin `BYPASSRLS` |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | Firma de tokens. Cámbialas en cualquier entorno real. |
| `OPENAI_API_KEY` | Copiloto. Si está vacía se usa el proveedor de respaldo determinista. |
| `AI_PROVIDER` | `openai` o `fake` |
| `SEED_DEFAULT_PASSWORD` | Contraseña de los usuarios del corpus |
