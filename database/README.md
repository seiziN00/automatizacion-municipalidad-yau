# Base de datos de la Municipalidad Provincial de Yau

[schema.sql](schema.sql) crea `municipalidad_yau` en MySQL 8.0.16 o superior. Ejecútalo una vez sobre una base vacía con una cuenta de instalación que pueda crear tablas, vistas y triggers. Desde PowerShell, si tienes el cliente `mysql` en el PATH y estás en la raíz del repositorio:

```powershell
mysql -u root -p --default-character-set=utf8mb4 -e "SOURCE database/schema.sql"
```

El script carga catálogos iniciales. Antes de registrar un expediente, configura el área, el tipo de trámite, su versión, las etapas, la etapa inicial y los saltos permitidos. Cuando el flujo esté listo, publica la versión asignando `publicada_en`. Las conexiones de la aplicación deben usar UTC para los campos de fecha y hora.

## Por qué existe cada grupo de tablas

| Grupo | Diseño |
| --- | --- |
| `usuarios`, `roles`, `usuario_roles`, `areas`, `usuario_areas` | Una cuenta puede tener varios roles y el personal puede pertenecer a varias áreas. Las tablas puente representan esas relaciones. Se conserva el hash de la contraseña. |
| `tipos_tramite`, `versiones_tramite`, `etapas`, `etapas_iniciales`, `transiciones`, `estados` | Cada trámite usa un flujo versionado. La etapa identifica el paso interno y el área responsable. El estado es la etiqueta que ve el ciudadano. Así, dos pasos internos pueden mostrar el mismo estado público. Los cambios de flujo se publican como nuevas versiones. |
| `expedientes`, `canales_ingreso`, `movimientos_expediente` | `titular_id` identifica al dueño del expediente. `registrado_por_id` permite que un operador lo cree en ventanilla para ese titular. Cada movimiento registra quién hizo el cambio y cuándo. `vence_en` guarda el vencimiento vigente calculado para ese caso. Las notas internas y observaciones públicas tienen campos distintos. |
| `tipos_documento`, `documentos_expediente`, `extracciones_documento` | Un expediente puede adjuntar varios PDFs en almacenamiento privado. La clave localiza el archivo y el SHA-256 permite comprobar su integridad. Un mismo documento puede tener varias extracciones con método y versión del motor para reprocesarlo. |
| `prioridades`, `versiones_modelo`, `predicciones_prioridad`, `decisiones_prioridad` | Cada predicción conserva versión, prioridad y confianza opcional. La decisión del personal tiene revisor, motivo y referencia opcional a una predicción. Se puede comparar la sugerencia con la evaluación humana. |
| `alertas_estado`, `canales_alerta`, `entregas_alerta` | La alerta se asocia al movimiento que la originó y su destinatario se obtiene del titular. La lectura del aviso y la entrega por portal o correo son operaciones distintas. La cola permite reintentos por canal. |
| `v_expedientes_situacion`, `v_permanencias_etapa` | La primera vista obtiene la situación actual desde el último movimiento. La segunda obtiene los intervalos de permanencia a partir de pares de movimientos consecutivos y marca los intervalos abiertos con salida nula. Eso permite medir tiempos por área y etapa. |

El modelo separa catálogos, relaciones e historiales. Por ejemplo, el área actual se obtiene de la etapa vigente y los días restantes se calculan desde `vence_en` con el calendario aplicable. El CSV de entrenamiento se genera como una exportación analítica. Sus columnas derivadas pueden prepararse al exportar.

## Integración con React, Express y Python

1. **React + Vite.** El portal ciudadano envía el PDF y los datos del trámite a la API. El panel del personal consulta el expediente y muestra el tipo de documento sugerido y la prioridad sugerida.
2. **Express.** La API autentica al usuario, valida el acceso al expediente, guarda el archivo en almacenamiento privado y registra su referencia en MySQL. Delega el análisis a un servicio interno de Python y escribe los resultados.
3. **Python.** PyMuPDF extrae el texto de las páginas. Si el documento escaneado carece de texto extraíble, se recurre a OCR. Un clasificador NLP puede sugerir el tipo de documento a partir del texto. El modelo de prioridad evalúa el expediente con sus propios datos, como el tipo de trámite y el plazo restante cuando su cálculo esté validado.

El esquema inicial permite guardar el texto extraído, el tipo de documento registrado y las predicciones de prioridad. Si se necesita conservar el historial de sugerencias del clasificador documental, agrega una tabla `predicciones_tipo_documento` con referencias a la extracción, la versión del modelo y el tipo de documento sugerido, además de la confianza y la fecha. Así se puede comparar cada sugerencia con el tipo confirmado.

## Contrato para el backend

- **Alta de expedientes.** Inserta el expediente y el primer movimiento, correspondiente a la etapa inicial, en una transacción. Resuelve el titular desde la sesión o desde una operación autorizada de ventanilla.
- **Cambios de etapa.** Bloquea el expediente con `SELECT ... FOR UPDATE` antes de leer su situación. Comprueba los permisos y que el salto esté permitido en `transiciones`. En la misma transacción inserta el movimiento y, si cambió el estado público, la alerta y las entregas correspondientes. Conserva la versión del flujo y el titular del expediente. Trata los movimientos, predicciones y decisiones como historial de solo inserción.
- **Vencimiento.** Calcula el plazo con las reglas vigentes que confirme el equipo, incluido el calendario y las suspensiones si corresponden. Mantén las etapas y la configuración de las versiones publicadas para preservar la interpretación del historial.
- **Notificaciones.** Después del commit, un trabajador toma entregas pendientes. Puede reservar cada una con un token y una fecha de expiración en `disponible_en`, y usar el mismo par de identificadores como clave de idempotencia para cada intento. Conserva la alerta en el portal aunque el ciudadano esté desconectado. El canal en tiempo real puede avisar por Socket.IO.
- **Acceso.** Filtra expedientes y alertas por el titular autenticado. Para el personal, valida rol y área. Controla también la descarga de PDFs y el acceso al OCR. El portal debe consumir respuestas de la API con campos públicos explícitos. Las vistas SQL sirven para consulta interna y métricas.

El alcance es la gestión documental y la priorización de trámites. La selección de CVs puede incorporarse después como módulo de convocatorias con su propio esquema.
