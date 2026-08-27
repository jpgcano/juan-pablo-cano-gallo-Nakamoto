# Decisiones técnicas

Registro de las decisiones tomadas durante la jornada, con su razón y su costo. Incluye lo que se recortó y por qué.

---

## Índice

- [D1. Defensa en profundidad: los tres niveles validan permisos](#d1)
- [D2. Tres proyectos independientes en un solo repositorio](#d2)
- [D3. El backend es un monolito modular, no microservicios](#d3)
- [D4. Una sola base de datos, con contratos entre módulos](#d4)
- [D5. pgvector dentro del mismo PostgreSQL](#d5)
- [D6. pnpm como único gestor de paquetes](#d6)
- [D7. Fastify sobre NestJS](#d7)
- [D8. Actor por transacción con `set_config(..., true)`](#d8)
- [D9. Embeddings por outbox, no en línea](#d9)
- [D10. Realtime por `pg_notify`, no por emisión desde el backend](#d10)
- [D11. Patrones de diseño aplicados](#d11)
- [D12. Sin contexto, no se llama al LLM](#d12)
- [D13. `client_msg_id` para idempotencia](#d13)
- [D14. El costo del copiloto se almacena, no se deriva](#d14)
- [D15. Las vistas de contrato exigen `security_invoker = true`](#d15)
- [D16. El proveedor falso de IA usa hashing de palabras, no ruido puro](#d16)
- [D17. El resaltado de búsqueda usa marcadores de texto, nunca HTML crudo](#d17)
- [Recortes de alcance](#recortes)

---

<a id="d1"></a>
## D1. Defensa en profundidad: los tres niveles validan permisos

**Decisión.** Frontend, backend y base de datos validan autorización, cada uno con una responsabilidad distinta. No se delega toda la seguridad a una sola capa.

| Nivel | Responsabilidad |
|---|---|
| Frontend | No solicitar ni renderizar lo que la sesión no debería ver. Es experiencia de usuario, no un control de seguridad — corre en una máquina que no controlamos. |
| Backend | Verificar el JWT, resolver el actor exclusivamente desde el token, aplicar autorización de ruta y validar la forma de la entrada antes de tocar la base de datos. |
| Base de datos | Row Level Security sobre canales, mensajes y sus derivadas, con un rol de aplicación sin `BYPASSRLS` y el actor fijado por transacción. |

**Alternativa descartada.** Confiar la autorización solo al backend, filtrando por membresía en cada consulta.

**Por qué la base de datos es la capa que más esfuerzo recibe.** El requisito no negociable del enunciado es que nadie acceda a contenido ajeno, y ese requisito debe sobrevivir a las tres superficies que lo tocan: la API, la búsqueda y el copiloto. Si la única autorización viviera en el backend, habría que acertar en las tres, hoy y en cada endpoint futuro. El fallo típico no es un filtro mal escrito sino un filtro **ausente**, y un filtro ausente no aparece en el diff de un code review. La base de datos es la única capa que un error de programación en las capas de arriba no puede sortear: con RLS, el estado por defecto ante ese error es *no devolver nada*, no *devolver de más*. Un endpoint nuevo nace protegido incluso si quien lo escribió olvidó pensar en permisos.

Esto no vuelve prescindibles al frontend ni al backend. El frontend evita exponer en la interfaz algo que de todos modos sería rechazado, para no confundir al usuario. El backend rechaza peticiones mal formadas o no autenticadas antes de gastar una consulta, y es quien decide **qué actor** se fija — la base de datos no puede inventar esa identidad, solo hacerla cumplir una vez declarada.

**Costo aceptado.** Las políticas de RLS son más difíciles de depurar que un `WHERE`, y hay que tener cuidado con la recursión entre políticas (resuelto con una función `SECURITY DEFINER` para la comprobación de membresía). Mantener autorización en tres lugares también implica mantenerla sincronizada conceptualmente: un permiso nuevo debe pensarse en los tres niveles, no solo en uno. A cambio, ningún nivel es un punto único de fallo.

---

<a id="d2"></a>
## D2. Tres proyectos independientes en un solo repositorio

**Decisión.** `database/`, `backend/` y `frontend/` con su propio `package.json`, `tsconfig.json`, `Dockerfile` y contenedor. Sin workspaces, sin paquetes compartidos, sin tipos comunes.

**Alternativa descartada.** Monorepo con `packages/contracts` compartiendo los esquemas Zod entre backend y frontend.

**Por qué.** Un paquete de tipos compartido es cómodo, pero convierte tres proyectos en uno solo con tres carpetas: dejan de poder extraerse, versionarse o desplegarse por separado, y el frontend empieza a depender de decisiones internas del backend. El contrato entre ambos es `docs/openapi.yaml` — un documento, no un módulo de TypeScript.

**Costo aceptado.** Hay duplicación de formas de datos entre backend y frontend. A la escala de esta prueba son unas pocas decenas de líneas, y el compilador de cada lado sigue detectando sus propios errores. Se acepta a cambio de independencia real.

---

<a id="d3"></a>
## D3. El backend es un monolito modular, no microservicios

**Decisión.** Un solo despliegue dividido internamente en `identity`, `messaging` y `copilot`, con fronteras verificadas por lint.

**Por qué.** Los microservicios resolverían un problema que aquí no existe (escalar equipos y despliegues por separado) a cambio de uno que sí importaría mucho: perder las transacciones. El envío de un mensaje necesita que la inserción, el `search_vector`, el registro del embedding y la notificación ocurran de forma atómica. Repartir eso entre servicios obligaría a sagas y compensaciones para ganar nada.

**Qué hace que la modularidad sea real y no decorativa.** Una regla de ESLint prohíbe importar el interior de otro módulo: solo se puede pasar por su `index.ts`. La regla falla la build. Sin eso, "modular" sería una forma de nombrar carpetas.

---

<a id="d4"></a>
## D4. Una sola base de datos, con contratos entre módulos

**Decisión.** Un esquema. Cada tabla pertenece a un módulo, y ningún módulo consulta las tablas de otro: el cruce ocurre por vistas y funciones publicadas (`rw_v_identity_profiles`, `rw_v_copilot_corpus`, `rw_fn_copilot_context`).

**Alternativa descartada.** Un esquema o una base física por módulo.

**Por qué.** La separación física habría impedido resolver la Consulta 3 —"recuperación de contexto para el copiloto con permisos en SQL"— dentro del motor: el copiloto habría tenido que traer mensajes por red y filtrarlos en TypeScript, que es justo el patrón que abre la fuga. Con una sola base, el filtro de permisos ocurre donde viven los datos.

**El hallazgo que justifica el diseño.** El módulo `copilot` no tiene forma de nombrar `rw_messages`: solo conoce un corpus ya recortado por RLS. **La frontera del módulo y la defensa contra la fuga de contexto resultan ser el mismo mecanismo.** Una decisión tomada por limpieza arquitectónica es también la que hace imposible el escenario que el enunciado castiga.

**Costo aceptado.** El aislamiento depende de la disciplina más el lint, no del motor. Si mañana se quisiera separar por schemas, el cambio es mecánico porque los consumidores ya no tocan tablas ajenas.

---

<a id="d5"></a>
## D5. pgvector dentro del mismo PostgreSQL

**Decisión.** Los embeddings viven en `rw_message_embeddings`, en la misma base.

**Alternativa descartada.** Qdrant o Chroma como servicio aparte.

**Por qué.** Un motor vectorial externo queda **fuera del alcance de RLS**. Habría que replicar allí la lógica de membresía y mantenerla sincronizada, y cualquier desincronización se manifiesta como el copiloto respondiendo con mensajes de un canal ajeno — exactamente el fallo que invalida el trabajo. Con pgvector, el embedding hereda las mismas políticas que el mensaje del que deriva.

Un motor dedicado ganaría rendimiento a millones de vectores. A la escala de una plataforma interna, esa ventaja no compensa duplicar el modelo de permisos.

---

<a id="d6"></a>
## D6. pnpm como único gestor de paquetes

**Decisión.** `pnpm` en scripts, Dockerfiles, Makefile y documentación. Nunca `npm` ni `yarn`.

**Por qué.** Seguridad de la cadena de dependencias. El store de pnpm verifica integridad por contenido, y su `node_modules` no plano impide el *phantom dependency*: con npm, un paquete puede importar una dependencia transitiva que nunca declaró, y esa importación sobrevive hasta que la transitiva cambia de versión y todo se rompe sin explicación. Con pnpm, importar lo no declarado falla de inmediato.

---

<a id="d7"></a>
## D7. Fastify sobre NestJS

**Decisión.** Fastify con capas escritas a mano.

**Por qué.** NestJS trae módulos e inyección de dependencias listos, lo que parecería acercar Clean Architecture gratis. En la práctica empuja a decorar entidades y casos de uso con anotaciones del framework, y eso acopla el dominio a Nest — justo lo que el enunciado prohíbe cuando pide que "el dominio no dependa del framework web".

Con Fastify, el composition root es un archivo que se lee de arriba abajo, y la dirección de las dependencias se demuestra señalando los imports en lugar de explicando un contenedor de DI.

---

<a id="d8"></a>
## D8. Actor por transacción con `set_config(..., true)`

**Decisión.** `SELECT set_config('app.current_user_id', $1, true)` justo después del `BEGIN`, en un único `UnitOfWork` por el que pasa todo acceso a datos.

**Por qué el tercer parámetro importa.** El `true` hace el valor *transaction-local*: muere con la transacción. Con `false` sería *session-local*, y como las conexiones vuelven al pool y se reutilizan, **el siguiente request heredaría la identidad del anterior**. Sería una fuga de datos silenciosa, intermitente y prácticamente imposible de reproducir en desarrollo. Un solo carácter separa el sistema correcto del peor bug posible en este dominio.

**Refuerzo.** `rw_current_user_id()` lanza excepción si el valor no está fijado, en lugar de devolver `NULL`. Un `NULL` haría que las políticas no coincidieran con nada y la consulta devolviera vacío en silencio; la excepción hace ruidoso el error de programación.

---

<a id="d9"></a>
## D9. Embeddings por outbox, no en línea

**Decisión.** Un trigger marca `is_stale = true` al insertar o editar un mensaje. Un proceso aparte calcula el vector y lo actualiza.

**Alternativa descartada.** Llamar a OpenAI dentro de la transacción de envío.

**Por qué.** Metería la latencia de un tercero dentro de una transacción de base de datos, manteniendo bloqueos abiertos durante cientos de milisegundos. Peor: una caída de la API de OpenAI impediría **enviar mensajes**. La mensajería no puede depender de la disponibilidad del copiloto.

**Costo aceptado.** Hay una ventana de segundos en la que un mensaje recién enviado existe pero aún no es recuperable semánticamente. Para una plataforma de mensajería interna es irrelevante; la búsqueda por texto (`search_vector`, que sí es síncrona) lo encuentra de inmediato.

---

<a id="d10"></a>
## D10. Realtime por `pg_notify`, no por emisión desde el backend

**Decisión.** Un trigger emite `pg_notify` tras el commit; una conexión dedicada escucha y retransmite por Socket.IO.

**Alternativa descartada.** Que el caso de uso emita el evento por WebSocket después de guardar.

**Por qué.** Si el backend emite por su cuenta, puede emitir un evento de una transacción que después hace rollback: los clientes verían un mensaje que no existe. Naciendo en la base de datos, el evento solo se dispara si el `COMMIT` ocurrió.

**Refuerzo.** Al unirse a una sala de canal se revalida la membresía contra la base. El WebSocket no puede convertirse en una puerta lateral que esquive RLS.

---

<a id="d11"></a>
## D11. Patrones de diseño aplicados

El enunciado pide evaluar si es necesario aplicar patrones y justificarlos. Se aplicaron cuatro, cada uno contra un problema concreto. No se aplicaron otros por no tener problema que resolver.

| Patrón | Problema real que resuelve |
|---|---|
| **Unit of Work** | Fijar el actor y garantizar atomicidad en un solo lugar. Sin él, cada repositorio tendría que acordarse de declarar el actor, y olvidarlo una vez es una fuga. |
| **Strategy** | El enunciado exige que el proveedor de IA sea intercambiable. Además permite que los tests corran sin red con `FakeAiProvider`. |
| **Repository + Adapter** | Traducir entre el dominio y las funciones SQL sin que el dominio conozca `pg`, que es lo que hace verificable la regla de dependencias. |
| **Facade** | El `index.ts` de cada módulo. Es lo que convierte la frontera entre módulos en algo verificable por lint. |

**Descartados conscientemente:** no hay CQRS (no hay asimetría de carga que lo justifique), ni Event Sourcing (`rw_message_revisions` cubre la auditoría que el negocio pide, sin el costo de reconstruir estado), ni Observer en el backend (`pg_notify` ya cumple ese papel desde donde corresponde).

---

<a id="d12"></a>
## D12. Sin contexto, no se llama al LLM

**Decisión.** Si la recuperación devuelve cero resultados o la similitud queda bajo el umbral, se responde con una negativa explícita **sin invocar al modelo**.

**Por qué.** Llamar al LLM sin contexto es pedirle que rellene el vacío, y rellenar el vacío es alucinar. La negativa honesta es más valiosa que una respuesta plausible e inventada, sobre todo en un sistema cuyo argumento de venta es que no filtra información.

Como efecto lateral, ahorra tokens en el caso que más se repite durante una demo.

**Trazabilidad.** Los tres desenlaces (`answered`, `no_context`, `out_of_scope`) se guardan en `rw_copilot_queries.outcome`, así que la tasa de negativas es medible en lugar de anecdótica.

---

<a id="d13"></a>
## D13. `client_msg_id` para idempotencia

**Decisión.** El cliente genera un UUID antes de enviar. Un índice único parcial sobre `(channel_id, client_msg_id)` impide el duplicado.

**Por qué.** El enunciado pide estados `pendiente`, `enviado` y `fallido`. El estado `fallido` implica un reintento, y un reintento sobre una red inestable duplica mensajes: el servidor pudo haber guardado la fila y haber perdido la respuesta. Sin idempotencia, el usuario ve su mensaje dos veces y culpa a la aplicación.

Es **parcial** porque los mensajes del corpus semilla no tienen `client_msg_id`, y la restricción solo debe aplicar a los envíos que sí lo traen. De paso, cumple el requisito explícito de incluir al menos un índice único parcial — con un caso de uso real detrás, no como ejercicio.

---

<a id="d14"></a>
## D14. El costo del copiloto se almacena, no se deriva

**Decisión.** `cost_usd` se guarda en `rw_copilot_queries` junto a `tokens_in` y `tokens_out`.

**Por qué no es una violación de 3FN.** Parecería derivable de los tokens, pero depende de la **tarifa vigente en el momento de la consulta**, que es un dato externo y cambiante. Recalcularlo hoy con la tarifa de hoy daría una cifra falsa para las consultas de ayer. Es un hecho histórico registrado, como el precio de una factura — que tampoco se recalcula.

---

<a id="d15"></a>
## D15. Las vistas de contrato exigen `security_invoker = true`

**Decisión.** `rw_v_user_conversations`, `rw_v_identity_profiles` y `rw_v_copilot_corpus` se crean con `WITH (security_invoker = true)`.

**Cómo se encontró.** No fue una lectura de la documentación de Postgres, fue una prueba fallida. Al probar `rw_v_copilot_corpus` contra la base real, fijando el actor en Ana y filtrando por el canal privado `junta-directiva` (del que ella no es miembro), la consulta devolvió **10 filas en vez de cero**. La vista de conversaciones, probada en el mismo momento, sí devolvía el resultado correcto — lo que hacía la discrepancia más intrigante que un error obvio.

**Por qué pasaba.** Por defecto, una vista de PostgreSQL se ejecuta con los privilegios de su **dueño**, no de quien la consulta — el mismo concepto que `SECURITY DEFINER` en una función, pero aplicado a las vistas sin que haga falta pedirlo. El dueño de las tablas (el rol que corre las migraciones) es propietario de `rw_messages`, y un propietario omite Row Level Security por definición. `rw_v_copilot_corpus` no tenía ningún filtro de membresía propio — dependía por completo de que la política RLS de `rw_messages` se aplicara "a través" de la vista, y esa suposición era falsa. `rw_v_user_conversations` daba el resultado correcto por una razón distinta y algo casual: tiene su propio `JOIN ... ON cm.user_id = rw_current_user_id()` explícito, así que funcionaba a pesar del problema, no gracias a haberlo evitado.

**La correccion.** `security_invoker = true` (disponible desde PostgreSQL 15) hace que la vista corra con los privilegios y el contexto RLS de quien la consulta, exactamente como cualquier otra consulta de `rw_app`. Se aplicó a las tres vistas de contrato, no solo a la que falló, precisamente porque `rw_v_user_conversations` funcionaba por una casualidad de su propio diseño y no por una garantía del motor — si alguien simplificara su `JOIN` en el futuro, el mismo bug reaparecería en silencio.

**Por qué queda documentado como decisión y no como nota al pie.** Es el ejemplo más concreto de lo que dice [D1](#d1) sobre defensa en profundidad: el bug real ocurrió precisamente en la capa que se suponía más confiable, y solo se detectó porque las pruebas corren contra PostgreSQL real (ver `database/tests/`), no contra mocks. Si las pruebas hubieran simulado la capa de datos, este bug habría llegado a producción — o peor, a la sustentación.

---

<a id="d16"></a>
## D16. El proveedor falso de IA usa hashing de palabras, no ruido puro

**Decisión.** `FakeAiProvider.embed()` (usado cuando `AI_PROVIDER=fake`, y por defecto en tests) no genera un vector aleatorio: proyecta cada palabra del texto a una dimensión y un signo por hash (*feature hashing*), y el vector final es la suma normalizada.

**Cómo se encontró.** La primera versión sí generaba ruido puro a partir de un hash del texto completo. Al probar el flujo de extremo a extremo con el worker de embeddings ya corriendo, el copiloto respondía `no_context` sin importar la pregunta — incluso para preguntas con vocabulario calcado de mensajes reales del corpus. La causa: la similitud de coseno entre vectores aleatorios de 1536 dimensiones se concentra alrededor de cero por pura estadística, así que nunca superaba el umbral. La ruta "responde con citas" era, en la práctica, indemostrable con el proveedor falso.

**La corrección.** Con *feature hashing*, dos textos que comparten palabras producen vectores con un parecido medible; textos sin relación, no. No es semántica real (no entiende sinónimos), pero es suficiente para que el ranking por similitud tenga sentido en la demo y en los tests, sin tocar la red ni depender de una API key.

**Por qué importa para la seguridad, no solo para la demo.** Esto permitió una prueba mucho más convincente que "no hay resultados": se le preguntó al copiloto por el ajuste salarial y el presupuesto de infraestructura discutidos en `junta-directiva` usando ese vocabulario exacto — con embeddings donde ese parecido léxico SÍ se refleja en similitud — y el canal siguió sin aparecer entre las citas. La exclusión es por membresía, no por casualidad de que el contenido no fuera parecido (ver `backend/tests/security.integration.test.ts`).

---

<a id="d17"></a>
## D17. El resaltado de búsqueda usa marcadores de texto, nunca HTML crudo

**Decisión.** `ts_headline` se configura con `StartSel={{HL}}, StopSel={{/HL}}` (texto plano) en vez de `StartSel=<mark>, StopSel=</mark>`. El frontend parte la respuesta por esos marcadores y renderiza cada segmento como texto de React (`components/HighlightedText.tsx`), envolviendo la parte coincidente en un `<mark>` real - nunca con `dangerouslySetInnerHTML`.

**Cómo se encontró.** Escribiendo la lista de resultados de búsqueda, la forma más directa de "insertar el resaltado que manda el servidor" era `dangerouslySetInnerHTML={{ __html: hit.highlightedBody }}` con `ts_headline` devolviendo `<mark>...</mark>`. Al revisar esa línea antes de darla por terminada: `ts_headline` no sabe nada de HTML, solo envuelve el término encontrado con el `StartSel`/`StopSel` que se le indique - el resto del texto es el cuerpo del mensaje **de otro colaborador**, sin escapar. Un mensaje que contuviera `<img src=x onerror=alert(1)>` se habría insertado tal cual en el DOM de quien buscara ese término: una XSS almacenada, disparada por el contenido de un tercero, no por quien la sufre.

**La corrección.** Cambiar los delimitadores a un marcador que no es HTML elimina la ambigüedad de raíz: ya no hay HTML que interpretar, solo texto con dos tokens a partir de los cuales React decide qué envolver en `<mark>`. El body del mensaje nunca pasa por un parser de HTML.

**Por qué queda como decisión y no como corrección silenciosa.** Es la segunda vez que un vector de fuga aparece exactamente en el punto donde el sistema muestra contenido escrito por otra persona (la primera fue [D15](#d15), en la capa de datos). Ambos casos comparten la misma lección: cualquier lugar que reenvía texto ajeno hacia una capa que lo "interpreta" (RLS que se omite, HTML que se renderiza) es donde hay que mirar dos veces antes de dar el código por terminado.

---

<a id="recortes"></a>
## Recortes de alcance

> Esta sección se completa al cierre de la jornada con lo que efectivamente se recortó.

**Orden de recorte definido de antemano**, para no improvisar bajo presión:

1. **Realtime Socket.IO → polling cada 3 s.** La infraestructura de `pg_notify` queda escrita y documentada; solo cambia el transporte hacia el navegador.
2. **Edición de mensajes → solo borrado lógico.** `rw_message_revisions` se conserva porque el borrado también escribe en ella.
3. **Swagger publicado → colección Postman exportada.** El contrato se entrega igual, en otro formato.
4. **i18n exhaustivo → solo las cadenas visibles de las tres zonas.** La infraestructura de i18next queda completa; lo que se recorta es cobertura de traducción, no capacidad.
5. **Worker de embeddings en su propio contenedor → intervalo dentro del proceso del servidor.** Ya usa su propio rol (`rw_worker`) y su propia conexión, con los mismos límites de columna que tendría en un proceso separado; lo único que cambiaría en un empaquetado más adelante es moverlo a su propio `Dockerfile`, no su diseño.

**Lo que no se recorta bajo ninguna circunstancia**, por ser criterio de aceptación o condición de invalidación:

- Hash de contraseñas con argon2id
- RLS activa y verificada
- Las cuatro consultas SQL requeridas
- Las pruebas automatizadas de seguridad contra PostgreSQL real
- `docker compose up` funcionando en una máquina limpia
- La negativa del copiloto ante falta de permisos
