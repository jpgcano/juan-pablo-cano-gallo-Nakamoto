# Análisis de negocio y normalización hasta 3FN

Base de datos: `bd_juan_cano_nakamoto` · PostgreSQL 16 · todas las tablas y columnas en inglés con prefijo `rw_`.

---

## 1. Análisis del negocio

Riwi Co. S.A.S. necesita comunicación interna organizada, segura y consistente. Del enunciado se extraen las entidades y las reglas implícitas antes de dibujar una sola tabla.

### Entidades identificadas

| Entidad | Qué representa en el negocio |
|---|---|
| Usuario | Un colaborador de Riwi. Tiene un cargo, porque el copiloto debe conocer quién le pregunta. |
| Canal | El espacio de conversación. Puede ser abierto a toda la compañía, privado, o directo entre dos personas. |
| Membresía | La relación que autoriza a un usuario a participar en un canal. **Es la entidad que sostiene todo el modelo de seguridad.** |
| Mensaje | El contenido enviado a un canal por un usuario. |
| Revisión de mensaje | El estado anterior de un mensaje que fue editado o borrado. |
| Acuse de lectura | El hecho de que un usuario concreto leyó un mensaje concreto. |
| Embedding | La representación vectorial de un mensaje, para búsqueda semántica. |
| Consulta al copiloto | Una pregunta, su respuesta, su desenlace y su consumo. |
| Cita | El mensaje concreto que respalda una respuesta del copiloto. |
| Token de refresco | Una sesión viva y su cadena de rotación. |

### Reglas de negocio implícitas

Estas reglas no están enunciadas como tales en el documento, pero se deducen de él. Cada una se convierte más adelante en una restricción concreta de la base de datos, no en una validación del backend.

| # | Regla deducida | Dónde se implementa |
|---|---|---|
| R1 | Nadie puede leer, buscar ni consultar por copiloto contenido de un canal donde no es miembro. | Políticas RLS sobre `rw_channels`, `rw_messages` y derivadas |
| R2 | Un usuario no puede estar dos veces en el mismo canal. | `UNIQUE (channel_id, user_id)` |
| R3 | Un mensaje no puede existir sin canal ni sin remitente. | `NOT NULL` + FK |
| R4 | Un mensaje jamás se elimina físicamente. | `deleted_at` + prohibición de `DELETE` |
| R5 | Editar o borrar un mensaje debe conservar el estado original, incluso si la operación falla a medias. | `rw_message_revisions` escrita dentro de la misma transacción |
| R6 | Un mensaje solo puede responder a otro mensaje del mismo canal. | `CHECK` vía función + FK auto-referenciada |
| R7 | Reenviar un mensaje tras un fallo de red no debe duplicarlo. | Índice único parcial sobre `(channel_id, client_msg_id)` |
| R8 | Un usuario no puede acusar dos veces la lectura del mismo mensaje. | PK compuesta `(message_id, user_id)` |
| R9 | Un mensaje tiene como máximo un embedding vigente. | PK = `message_id` en `rw_message_embeddings` |
| R10 | No se puede borrar a un usuario que dejó rastro histórico (mensajes, canales creados). | FK `ON DELETE RESTRICT` + baja lógica `is_active` |
| R11 | El consumo del copiloto debe poder atribuirse a un usuario. | FK `user_id` en `rw_copilot_queries` |
| R12 | Una respuesta del copiloto solo puede citar mensajes que el actor podía ver. | La cita se escribe en la misma transacción que ya pasó por RLS |

---

## 2. Punto de partida sin normalizar (0FN)

Si se modelara ingenuamente "una fila por mensaje mostrado en pantalla", saldría algo así:

```
rw_flat_messages(
  message_id, body, sent_at,
  sender_email, sender_full_name, sender_job_title,
  channel_name, channel_type, channel_members,   -- "ana@riwi.io, luis@riwi.io, sara@riwi.io"
  read_by,                                        -- "ana@riwi.io, luis@riwi.io"
  previous_bodies                                 -- "v1: hola | v2: hola a todos"
)
```

Esta tabla es el contraejemplo del que parte todo el proceso. Tiene tres problemas visibles: campos con listas dentro, datos del autor repetidos en cada mensaje que envía, y datos del canal repetidos en cada mensaje que contiene.

---

## 3. Primera Forma Normal (1FN)

> **Criterio:** todos los atributos son atómicos, no hay grupos repetidos ni listas dentro de una celda, y cada fila es identificable de forma única.

### Violaciones encontradas

- `channel_members` guarda varios correos en un solo campo de texto.
- `read_by` guarda varios correos en un solo campo de texto.
- `previous_bodies` acumula varias versiones concatenadas en una celda.

Cada una hace imposible consultar con SQL sin partir cadenas, y cualquier filtro degeneraría en `LIKE '%...%'` — justo lo que el enunciado prohíbe al vetar el SQL por concatenación.

### Cómo se resuelve

Cada lista se convierte en su propia tabla, con una fila por elemento:

| Lista original | Tabla resultante |
|---|---|
| `channel_members` | `rw_channel_members` (una fila por usuario y canal) |
| `read_by` | `rw_message_reads` (una fila por usuario y mensaje) |
| `previous_bodies` | `rw_message_revisions` (una fila por versión anterior) |

Además se fija una clave primaria explícita en cada tabla, se declaran los tipos concretos (`uuid`, `timestamptz`, `text`) y se prohíben los nulos donde el negocio no admite ausencia.

**Resultado:** el esquema ya está en 1FN. Todo lo que antes exigía partir cadenas ahora es un `JOIN`.

---

## 4. Segunda Forma Normal (2FN)

> **Criterio:** estando en 1FN, todo atributo que no sea clave depende de la clave primaria **completa**, no de una parte de ella. Solo puede violarse cuando la clave es compuesta.

### Dónde había riesgo

Dos tablas tienen clave compuesta natural, y son las que hay que revisar:

**`rw_message_reads(message_id, user_id)`**

Si se hubiera arrastrado el diseño plano, esta tabla habría llevado también `sender_full_name` o `channel_name`. Ambos dependerían solo de `message_id`, es decir, de **parte** de la clave — una dependencia parcial.

- ✅ Se conserva únicamente `read_at`, que sí depende de las dos columnas juntas: es la fecha en que *ese* usuario leyó *ese* mensaje.

**`rw_copilot_citations(query_id, message_id)`**

- `rank` y `similarity` describen la posición y la afinidad de *ese mensaje* dentro de *esa consulta*. Dependen de la clave completa. ✅
- El texto del mensaje citado **no** se copia aquí: dependería solo de `message_id`. Se resuelve por `JOIN`.

**`rw_channel_members`**

Se usa `id` sustituto como PK y `UNIQUE (channel_id, user_id)` como clave candidata. `role`, `joined_at` y `left_at` describen la pareja completa, nunca al usuario ni al canal por separado.

**Resultado:** no queda ninguna dependencia parcial. El esquema está en 2FN.

---

## 5. Tercera Forma Normal (3FN)

> **Criterio:** estando en 2FN, ningún atributo no clave depende de otro atributo no clave. Es decir, no hay dependencias transitivas.

### Dependencias transitivas eliminadas

**En `rw_messages`:**

La tabla plana llevaba `sender_email`, `sender_full_name` y `sender_job_title`. Estos atributos dependen de `sender_id`, que a su vez depende de `id`:

```
id  →  sender_id  →  sender_full_name, sender_job_title
```

Es una transitiva de manual. Se eliminan del mensaje y quedan solo en `rw_users`.

Esta decisión tiene un efecto directo sobre el requisito del copiloto: como `job_title` vive en un único lugar, cuando un colaborador cambia de cargo el copiloto empieza a describirlo correctamente de inmediato, sin reprocesar un solo mensaje. Si el cargo estuviera copiado en cada mensaje, habría tantas versiones del cargo como mensajes enviados.

Lo mismo aplica a `channel_name` y `channel_type`, que dependen de `channel_id` y no del mensaje.

**En `rw_copilot_queries`:**

Se conservan `tokens_in`, `tokens_out` y `cost_usd`. Podría parecer que el costo es derivable de los tokens y, por tanto, una transitiva. **No lo es**, y la excepción se justifica: el costo depende de la tarifa vigente *en el momento de la consulta*, que es un dato externo y cambiante. Recalcularlo después con la tarifa de hoy daría una cifra falsa. Es un hecho histórico registrado, no un valor derivado — igual que el precio de una factura.

**En `rw_message_embeddings`:**

`model` se guarda junto al vector. No es redundancia: identifica con qué motor se calculó ese embedding concreto, y permite reindexar por lotes al cambiar de modelo sin perder trazabilidad.

**Resultado:** el esquema está en 3FN.

---

## 6. Desnormalizaciones deliberadas

Dos columnas parecen romper la normalización. Se declaran aquí de forma explícita para que no se lean como un descuido.

| Columna | Por qué parece violación | Por qué se acepta |
|---|---|---|
| `rw_messages.search_vector` | Es un valor derivado de `body`, almacenado en la misma fila. | Es un **índice materializado**, no un hecho del negocio. Un trigger lo mantiene sincronizado en cada `INSERT` y `UPDATE`, así que no puede desviarse del origen. Calcularlo en cada búsqueda haría inviable el rendimiento. |
| `rw_message_embeddings.embedding` | También deriva de `body`. | Se aísla en su propia tabla, con `is_stale` como marca de reproceso. Vive separado precisamente porque se calcula de forma asíncrona y no debe bloquear el envío de un mensaje. |

En ambos casos la regla se mantiene: **la fuente de verdad es `body`**, y lo derivado nunca se edita a mano.

---

## 7. Justificación del tipo de clave elegido

El enunciado pide justificar el tipo de clave por entidad. La decisión no es uniforme por comodidad, sino por lo que cada tabla necesita.

### Claves sustitutas `uuid` (con `gen_random_uuid()`)

Usadas en `rw_users`, `rw_channels`, `rw_channel_members`, `rw_messages`, `rw_message_revisions`, `rw_refresh_tokens` y `rw_copilot_queries`.

- **No revelan volumen.** Un entero secuencial expuesto en una URL le dice a cualquiera cuántos mensajes tiene la plataforma y permite recorrerlos probando identificadores contiguos. En un sistema cuyo requisito no negociable es que nadie vea lo que no le corresponde, un identificador adivinable es una superficie de ataque gratuita.
- **El cliente puede generarlos.** El frontend crea `client_msg_id` antes de que el servidor sepa que el mensaje existe — imposible con una secuencia.
- **Son estables ante una fusión de datos**, mientras que dos secuencias colisionan.

El costo asumido es el tamaño (16 bytes frente a 8) y una localidad de índice peor que la de un entero secuencial. A la escala de esta plataforma es irrelevante, y se compensa con los índices compuestos de paginación.

### Claves naturales compuestas

**`rw_message_reads(message_id, user_id)`** y **`rw_copilot_citations(query_id, message_id)`**.

Aquí la clave natural **es** el hecho que se quiere registrar: "este usuario leyó este mensaje", "esta consulta citó este mensaje". Añadir un `id` sustituto no aportaría nada y, peor aún, permitiría insertar el mismo hecho dos veces. La clave compuesta hace que R8 sea imposible de violar por construcción, sin necesidad de una restricción adicional.

### Clave foránea como clave primaria

**`rw_message_embeddings.message_id`** es a la vez PK y FK.

Esto expresa una relación uno-a-uno en el propio esquema: un mensaje tiene como máximo un embedding vigente (R9). No hace falta un `UNIQUE` extra ni confiar en que el código no inserte dos.

### Claves candidatas declaradas como `UNIQUE`

- `rw_users.email` — identificador natural del usuario en el negocio, pero volátil (una persona puede cambiar de correo). Por eso es clave candidata y no primaria: si fuera PK, cambiar un correo obligaría a propagar el cambio por toda la base.
- `rw_refresh_tokens.token_hash` — se indexa el hash, nunca el token. Si la base se filtrara, los tokens robados no serían utilizables.

### El índice único parcial

```sql
CREATE UNIQUE INDEX rw_messages_client_msg_uq
    ON rw_messages (channel_id, client_msg_id)
    WHERE client_msg_id IS NOT NULL;
```

Cumple el requisito explícito del enunciado y resuelve R7 de paso. Es **parcial** por una razón concreta: los mensajes cargados por el corpus semilla no tienen `client_msg_id`, y sin la cláusula `WHERE` todos ellos colisionarían entre sí en el valor `NULL` bajo la semántica de unicidad que se busca aquí. La restricción aplica solo a los envíos que sí traen identificador de cliente, que son exactamente los que necesitan idempotencia.

---

## 8. Justificación de cada `ON DELETE`

El enunciado pide que cada `ON DELETE` sea explícito **y justificado**. Ninguna de estas cláusulas es un valor por defecto.

| Relación | Acción | Por qué |
|---|---|---|
| `rw_refresh_tokens.user_id` → `rw_users` | `CASCADE` | Una sesión no significa nada sin su dueño. Si el usuario desaparece, sus sesiones deben morir con él — dejarlas sería un riesgo de seguridad. |
| `rw_channels.created_by` → `rw_users` | `RESTRICT` | Un canal con conversaciones vivas no puede quedar huérfano. Fuerza la baja lógica (`is_active = false`) en lugar del borrado, que es lo que el negocio realmente quiere. |
| `rw_channel_members.channel_id` → `rw_channels` | `CASCADE` | La membresía no existe sin el canal. |
| `rw_channel_members.user_id` → `rw_users` | `CASCADE` | La membresía no existe sin el usuario. |
| `rw_messages.channel_id` → `rw_channels` | `CASCADE` | Los mensajes pertenecen al canal. Nótese que esto **no** contradice R4: el borrado físico prohibido es el del mensaje individual; eliminar un canal entero es una operación administrativa distinta que la aplicación no expone. |
| `rw_messages.sender_id` → `rw_users` | `RESTRICT` | Protege la autoría. Un mensaje sin remitente sería un registro histórico corrupto, y el copiloto citaría contenido sin poder atribuirlo. |
| `rw_messages.reply_to_id` → `rw_messages` | `SET NULL` | Si el mensaje padre desapareciera, la respuesta sigue teniendo sentido por sí misma; simplemente deja de estar enhebrada. Perder el hilo es aceptable, perder la respuesta no. |
| `rw_message_revisions.message_id` → `rw_messages` | `CASCADE` | El historial acompaña a su mensaje. |
| `rw_message_revisions.edited_by` → `rw_users` | `RESTRICT` | Una revisión sin autor no sirve como evidencia de auditoría. |
| `rw_message_reads.*` | `CASCADE` | El acuse de lectura no tiene vida propia. |
| `rw_message_embeddings.message_id` → `rw_messages` | `CASCADE` | El vector es un derivado; sin origen, es basura ocupando espacio. |
| `rw_copilot_queries.user_id` → `rw_users` | `CASCADE` | El historial de consultas es dato personal del usuario y debe irse con él. |
| `rw_copilot_citations.*` | `CASCADE` | La cita no significa nada sin su consulta ni sin su mensaje. |

---

## 9. Resumen del esquema normalizado

| Tabla | Módulo dueño | PK | Forma normal |
|---|---|---|---|
| `rw_users` | identity | `id` (uuid) | 3FN |
| `rw_refresh_tokens` | identity | `id` (uuid) | 3FN |
| `rw_channels` | messaging | `id` (uuid) | 3FN |
| `rw_channel_members` | messaging | `id` (uuid), UK `(channel_id, user_id)` | 3FN |
| `rw_messages` | messaging | `id` (uuid) | 3FN |
| `rw_message_revisions` | messaging | `id` (uuid) | 3FN |
| `rw_message_reads` | messaging | `(message_id, user_id)` | 3FN |
| `rw_message_embeddings` | messaging | `message_id` (PK = FK) | 3FN |
| `rw_copilot_queries` | copilot | `id` (uuid) | 3FN |
| `rw_copilot_citations` | copilot | `(query_id, message_id)` | 3FN |

El modelo entidad-relación completo, con cardinalidades, está en [`diagrams/erd.mmd`](diagrams/erd.mmd) y su versión exportada en `diagrams/erd.png`.
