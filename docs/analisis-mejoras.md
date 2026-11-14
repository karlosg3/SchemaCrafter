# Análisis Integral y Hoja de Ruta de Mejoras — SchemaCrafter

Documento de auditoría técnica, rendimiento, UX, funcionalidades y actualización visual del proyecto completo (**Web Nuxt 4 + Shared Domain + Desktop Tauri v2**).

> **Alcance:** Solo documentación de hallazgos y propuestas sobre el estado actual de la rama `tauri`. No se ha modificado código fuente de la aplicación.

---

## 1. Resumen de Arquitectura Actual

El proyecto tiene una base sólida y limpia dividida en tres capas:

| Capa | Responsabilidad | Puntos fuertes actuales |
| --- | --- | --- |
| **`shared/`** | Tipos (`Workspace` v2 / `DatabaseProject`), proyección, grafo puro (`buildGraph`), 5 generadores y 4 parsers, migraciones, `.schemacrafter` | Lógica desacoplada de Vue/DOM y cubierta con 118 tests unitarios/snapshot en Vitest; `reconcileWorkspace()` repara inconsistencias tras cargas o merges. |
| **`app/`** | Interfaz Nuxt 4 (`ssr: false`), `@nuxt/ui`, Pinia (`workspace`, `ui`, `desktopDocument`), Vue Flow, CodeMirror 6 | Uso directo de CodeMirror 6 con dedupe de `@lezer/highlight`; `useCodeSync` implementa un *Apply gate* explícito en lugar de sobrescribir el canvas mientras se escribe; modales promificados con `useOverlay()`. |
| **`src-tauri/`** | Host Tauri v2 (Linux `.deb`), `dialog` + `fs` plugins, asociación `.schemacrafter`, lectura de argumentos al iniciar | La web (`localStorage`) y escritorio (archivos `.schemacrafter` / `.json`) comparten el mismo frontend sin afectar al deploy estático de Netlify (`dist/`). |

Sin embargo, el análisis del código fuente completo revela **bugs latentes**, **cuellos de botella de rendimiento y bundle**, **funcionalidades incompletas o desconectadas** y **oportunidades claras de modernización visual** en modales, *asides* y bloques del canvas.

---

## 2. Bugs Latentes y Brechas Técnicas Detectadas

Puntos concretos encontrados directamente en el código actual que conviene corregir antes o al inicio de cualquier rediseño:

1. **Inconsistencia en el nombre del producto**
   - `app/components/layout/AppNavbar.vue` muestra `"SchemaCraft"` en el header, mientras `nuxt.config.ts`, `src-tauri/tauri.conf.json` y `app/stores/desktopDocument.ts` usan `"SchemaCrafter"`.
2. **Scroll dentro de tablas altas hace zoom al canvas (`BlockNode.vue`)**
   - La lista de columnas en `app/components/canvas/BlockNode.vue` (`overflow-y-auto scrollbar-thin`) no tiene la clase `nowheel` de `@vue-flow/core` (a diferencia de los botones, que sí llevan `nodrag`). Al intentar desplazarse por las columnas de una tabla grande con la rueda del ratón, Vue Flow intercepta el evento y hace zoom en todo el lienzo.
3. **Relaciones autorreferenciales bloqueadas en `ColumnModal` (`useEntityDialogs.ts` vs `workspace.ts`)**
   - `workspace.canRelate()` permite foreign keys sobre otra columna de la misma tabla (ej. `employees.manager_id -> employees.id`), pero `useEntityDialogs.ts` (`editColumn`) filtra `.filter(t => t.id !== tableId)`, imposibilitando crearlas desde el formulario.
4. **Validación divergente entre canvas y `ColumnModal.vue`**
   - `ColumnModal.vue` (`targetColumnItems`) filtra columnas destino solo por coincidencia de `type`, sin exigir `isPrimaryKey || isUnique` como sí exige `workspace.canRelate()`. Esto permite crear desde el modal una FK hacia una columna no única que el canvas rechazaría al arrastrar.
5. **Duplicación silenciosa de nombres al editar columna (`useEntityDialogs.ts`)**
   - `addColumn()` usa `uniqueName()`, pero `upsertColumn()` al editar una columna existente aplica `slugify(draft.name)` sin comprobar si otra columna en la misma tabla ya tiene ese nombre, generando columnas duplicadas en el SQL/ORM generado.
6. **`slugify()` transforma entradas sin advertencia previa (`shared/utils/ids.ts`)**
   - Cualquier carácter no alfanumérico o mayúscula en tablas/esquemas/columnas se convierte en `_` o `'untitled'` al pulsar Guardar sin mostrar previsualización ni validación inline en el input.
7. **Pérdida silenciosa de cambios en código ORM/SQL sin aplicar**
   - En `app/composables/useCodeSync.ts`, cambiar el selector de ORM (`target`) o cambiar de base de datos (`ui.activeDbId`) resetea `isDirty = false` y sobrescribe `draft` sin pedir confirmación.
   - En `app/stores/desktopDocument.ts`, `isDirty` solo compara `workspaceStore.revision !== savedRevision`. Si el usuario edita texto en `RightSidebar` sin pulsar *Apply to canvas*, **Ctrl+S no guarda ese borrador** y **cerrar la ventana no avisa**.
8. **Validación parcial de archivos externos (`shared/utils/migrations.ts`)**
   - `isValidWorkspace()` valida `databases`, `schemas` y `tables`, pero no valida la estructura interna de `enums`, `columns`, `engine` ni `gradient`. Un `.schemacrafter` o `.json` editado manualmente podría pasar validación y fallar durante el render o la generación de código.
9. **Limitaciones y deuda en generadores y parsers (`shared/generators/*`, `shared/parsers/*`)**
   - `sqlParser.ts`, `prismaParser.ts` y `mikroormParser.ts` aún generan IDs con `Date.now()` (riesgo de colisión dentro del mismo milisegundo, pese a existir `createId()` en `shared/utils/ids.ts`).
   - `mapSqlTypeToDataType()` en `shared/utils/naming.ts` evalúa `INT` antes que `BIGINT` (clasificando `BIGINT` como `INT`).
   - `sqlParser.ts` divide columnas por `body.split(',\n')`, ignorando `FOREIGN KEY` / `CREATE INDEX` y rompiéndose si la sintaxis tiene saltos de línea distintos.
   - `drizzleParser.ts` ignora `pgEnum`, `.references()` e índices.
   - `sql.ts` y `mikroorm.ts` no emiten `ON UPDATE` aunque `ForeignKeyReference.onUpdate` y `ColumnModal.vue` sí lo soportan y editan.
10. **Tauri Linux: sin instancia única ni CSP (`src-tauri/src/lib.rs`, `src-tauri/tauri.conf.json`)**
    - `RunEvent::Opened` está compilado solo bajo `#[cfg(any(target_os = "macos", target_os = "ios"))]`. En Linux (`.deb`), hacer doble clic en un segundo `.schemacrafter` lanza otro proceso independiente en lugar de enfocar la ventana existente o abrir el archivo en ella (`tauri-plugin-single-instance`).
    - `"csp": null` en `src-tauri/tauri.conf.json` deja desactivada la política CSP en el WebView de escritorio.
11. **Código/dependencias preparadas pero sin cablear en UI**
    - `workspace.autoLayout(schemaId)` existe en `app/stores/workspace.ts`, sin botón ni atajo que la invoque.
    - `@vue-flow/minimap` está instalado en `package.json`, pero no se usa en ningún componente.
    - `Table.indexes` existe en `shared/types/schema.ts` y los generadores lo soportan parcialmente, pero no hay UI para crear o editar índices compuestos.
    - `DatabaseEntity.comment`, `SchemaEntity.comment`, `TableEntity.comment` y `Column.comment` se guardan/editan, pero no se muestran en el canvas ni se exportan como `COMMENT ON` en SQL.

---

## 3. Áreas de Mejora en Rendimiento y Optimización

### 3.1 Reducción de Bundle y Carga Diferida (Startup / Web Netlify)
- **Separación de chunks (Bundle de entrada > 1.2 MB):** En producción (`pnpm generate`), Vite emite un chunk principal `> 1.24 MB` (`> 500 kB` warning) que agrupa Vue Flow, CodeMirror y los paquetes `@tauri-apps/*`.
- **Aislar importaciones de Tauri vía carga dinámica:** `app/app.vue` y `app/components/layout/AppNavbar.vue` importan estáticamente `desktopDocument` y `desktopFiles.ts` (`@tauri-apps/api`, `@tauri-apps/plugin-dialog`, `@tauri-apps/plugin-fs`). Cargar ese adaptador con `import('~/utils/desktopFiles')` solo cuando `isDesktopApp()` es verdadero evita enviar código IPC de escritorio al cliente web de Netlify.
- **Montaje perezoso de `CodeEditor.vue`:** `RightSidebar.vue` instancia CodeMirror en el arranque aunque el panel derecho esté cerrado (`!ui.state.rightOpen`) o en pantallas estrechas. Usar `<LazyCodeEditor v-if="ui.state.rightOpen" />` o `defineAsyncComponent` acelera el montaje inicial del canvas.
- **Limpiar dependencias no utilizadas o activarlas:** Decidir entre integrar `@vue-flow/minimap` (lazy) o eliminarlo de `package.json`.

### 3.2 Rendimiento del Canvas (`SchemaCanvas.vue`, `BlockNode.vue`, `shared/utils/graph.ts`)
- **Evitar reconstrucción completa del grafo en cada mutación menor:** `SchemaCanvas.vue` recalcula `buildGraph(...)` completo y crea nuevos objetos `nodes` y `edges` ante cualquier cambio del workspace (incluido mover una sola tabla o editar el nombre de una columna). Memorizar bloques por entidad o mantener un índice `Map<string, GraphNode>` evitaría además la búsqueda lineal `nodeById()` (`nodes.find(...)`) usada en drag-stop, resize-end y clicks de fila.
- **Animación SVG continua en todas las aristas FK:** `SchemaCanvas.vue` marca `animated: e.data.kind === 'fk'` en todas las relaciones del esquema. En diagramas con 20–50+ relaciones, decenas de trazos SVG animados continuamente (`stroke-dashoffset`) consumen GPU/compositor sin necesidad. Conviene animar solo la arista en hover, seleccionada o conectada al nodo activo.
- **Handles DOM por columna en modo solo lectura:** `BlockNode.vue` monta dos `<Handle>` por cada fila incluso cuando `editable` es `false`. Ocultarlos estructuralmente cuando `editable === false` (o en modo lectura) reduce el coste de DOM y tracking interno de Vue Flow en tablas grandes.

### 3.3 Rendimiento de CodeMirror y Sincronización (`CodeEditor.vue`, `useCodeSync.ts`)
- **Evitar copiar y dividir todo el texto en cada pulsación:** `CodeEditor.vue` llama `update.state.doc.toString()` en cada `docChanged`, y `useCodeSync.ts` ejecuta `draft.value.split('\n').length` para el contador de líneas. Leer `update.state.doc.lines` desde CodeMirror elimina la asignación del array de líneas, y sincronizar el draft con debounce corto (p. ej. 150 ms) evita pasar strings grandes por reactividad Vue en cada tecla.
- **Evitar doble parseo al aplicar cambios:** `useCodeSync.ts` ya parsea `debouncedDraft` en `parsed` para mostrar el diff previo, pero `apply()` vuelve a llamar `parseCodeToProject(draft.value, ...)` incluso cuando no hubo nuevas teclas desde el último debounce. Reutilizar el resultado cuando `draft.value === debouncedDraft.value` evita duplicar trabajo.
- **Web Worker para parsing/generación en esquemas grandes:** Mover los parsers/generadores (`shared/parsers/*`, `shared/generators/*`) a un Web Worker (comunicado por `postMessage`) mantendría el hilo principal a 60 FPS en proyectos con decenas de tablas.

### 3.4 Persistencia, Fuentes y WebView Desktop
- **Debounce en `ui.ts`:** A diferencia de `workspace.ts` (`AUTOSAVE_DEBOUNCE_MS = 500`), `app/stores/ui.ts` escribe en `localStorage` síncronamente en cada cambio de `state` con un `watch(..., { deep: true })`. Conviene aplicar un debounce ligero o guardar solo las propiedades cambiadas.
- **Tipografía offline empaquetada:** `main.css` declara `'Inter'` y `'JetBrains Mono'`, pero no están empaquetadas vía `@nuxt/fonts` ni archivos locales en `public/`. En instalaciones limpias de Linux (`.deb`) o sesiones offline, el navegador y el WebView caen a fuentes genéricas del sistema. Empaquetar ambas fuentes mejora legibilidad y consistencia visual sin peticiones externas.

---

## 4. Nuevas Funcionalidades Propuestas

### 4.1 Modelado de Datos y Productividad
1. **Historial Undo / Redo (`Ctrl+Z` / `Ctrl+Shift+Z` / `Ctrl+Y`) en Workspace:**
   - Snapshot stack o historial de comandos en `useWorkspaceStore` (separado del historial interno de CodeMirror) con límite configurable (ej. 50 estados) para revertir eliminaciones de tablas/columnas, cambios de posición o aplicaciones de código.
2. **Auto-Layout Inteligente + Snap-to-Grid + Alineación:**
   - Exponer `workspace.autoLayout(schemaId)` en `CanvasControls.vue` y mejorarlo de grilla fija (`380x340`) a un layout dirigido por relaciones (tipo Dagre / ELKjs) para minimizar cruces de líneas.
   - Añadir toggle de **Snap to Grid** (ej. pasos de 16px/20px) y herramientas de selección múltiple (alinear arriba/izquierda, distribuir).
3. **Editor de Índices Compuestos (`Table.indexes`) y Comentarios Visibles:**
   - Pestaña o sección dentro del modal de tabla/columna para gestionar índices multi-columna (`BTREE`, `HASH`, `GIN`, `GIST`, `UNIQUE`), aprovechando que el tipo `IndexDefinition` y los generadores ya existen.
   - Mostrar comentarios de tabla/columna mediante tooltips o indicadores discretos en el bloque, y emitirlos como `COMMENT ON TABLE/COLUMN` en PostgreSQL/MySQL o `///` doc comments en Prisma.
4. **Interacción directa sobre Relaciones (`RelationEdge.vue`):**
   - Permitir hacer clic sobre una línea de relación para inspeccionar/editar `onDelete`, `onUpdate`, tipo de cardinalidad (`1:1` cuando FK es `unique`, `N:1` en caso contrario) o eliminar la FK con un botón/tecla `Delete`.
5. **Buscador Global / Command Palette (`Ctrl+K` / `Cmd+K`):**
   - Buscar simultáneamente entre bases de datos, esquemas, tablas, columnas y enums, y ejecutar acciones rápidas (*New Table*, *Import SQL*, *Auto Layout*, *Switch ORM*, *Save Project*).
   - Seleccionar un resultado debe hacer drill automático y **centrar la cámara (`fitView` sobre el nodo)** en el canvas.
6. **Duplicar Entidades y Tipos de Datos Paramétricos:**
   - Opción *Duplicate Table / Clone Column* (útil para tablas de auditoría o columnas repetidas `created_at` / `updated_at`).
   - Parámetros de tipo opcionales (longitud en `VARCHAR(n)`, precisión/escala en `DECIMAL(p, s)`).

### 4.2 Importación, Exportación y Generación
1. **Exportación de Diagrama Visual (PNG / SVG) y Documentación (Mermaid ER / Markdown):**
   - Permitir exportar el esquema visible como imagen PNG/SVG (para READMEs o presentaciones) y generar un bloque `mermaid erDiagram` o diccionario de datos en Markdown.
2. **Exportación Multi-Archivo (ZIP en Web / Carpeta en Tauri):**
   - En lugar de un único archivo monolítico para Prisma/Drizzle/TypeORM/MikroORM, permitir exportar un archivo por entidad/tabla (`models/User.ts`, `schema/users.ts`) en ZIP en navegador o escribir directamente en el repositorio local desde Tauri FS.
3. **Generador de Diff / Migración SQL (`ALTER TABLE`):**
   - Comparar dos versiones del esquema (o contra un SQL pegado) y generar un borrador de migración incremental (`ADD COLUMN`, `DROP COLUMN`, `CREATE TABLE`) además del DDL completo.
4. **Interoperabilidad `.schemacrafter` completa en Web:**
   - Permitir que la versión Web también importe/exporte archivos `.schemacrafter` completos (multi-BD) además del JSON de un proyecto único, unificando el formato entre escritorio y web.

### 4.3 Específicas de Tauri Desktop (Linux `.deb` y evolución)
1. **Pantalla de Bienvenida / Hub de Inicio (Desktop Empty State):**
   - Al abrir sin archivo (`hydrateDesktopEmpty()`), mostrar acciones directas: *New Blank Workspace*, *Create from Template (E-Commerce / SaaS)* aprovechando `shared/utils/templates.ts`, *Open `.schemacrafter` / `.json`*, y lista de **Archivos Recientes**.
2. **Recent Files y Auto-guardado de recuperación (*Crash Recovery*):**
   - Persistir rutas recientes (usando Tauri store / JSON en `appDataDir`) y un respaldo temporal automático para recuperar cambios si la app se cierra inesperadamente.
3. **Single-Instance + Drag & Drop de archivos en Linux:**
   - Añadir `tauri-plugin-single-instance` en `src-tauri/` para redirigir aperturas de archivos desde el gestor de archivos Linux a la ventana ya abierta.
   - Soportar arrastrar y soltar un `.schemacrafter` o `.json` directamente sobre la ventana.
4. **Endurecimiento de Seguridad (`tauri.conf.json` / `capabilities/default.json`):**
   - Definir una política CSP explícita en `tauri.conf.json` en lugar de `null` y revisar permisos de `fs` mínimos necesarios.

---

## 5. Mejoras de UI / UX (Usabilidad y Flujos)

1. **Onboarding y Estado Vacío Accionable (`SchemaCanvas.vue`):**
   - Reemplazar el texto pasivo `"Nothing here yet"` con una tarjeta interactiva centrada (botones para *Add Database / Table*, *Import SQL*, *Load Template*, o *Open Project* en desktop).
   - Alinear `ui.ts` inicial (`railTab: 'databases'` vs `viewLevel: 'tables'`) cuando no haya ninguna base de datos en Desktop, evitando mostrar un canvas de nivel *Tables* vacío mientras el panel izquierdo muestra *Databases*.
2. **Sincronización bidireccional Sidebar ↔ Canvas (`TablesPanel.vue` / `SchemasPanel.vue`):**
   - Al pulsar una tabla en `TablesPanel.vue`, además de navegar al esquema, seleccionar el nodo en Vue Flow y centrar suavemente la vista (`setCenter` / `fitView({ nodes: [id] })`), resaltándolo brevemente.
3. **Desacoplar el explorador del Rail para cambios rápidos de contexto (`LeftSidebar.vue`):**
   - Actualmente cambiar de esquema y volver a ver sus tablas obliga a alternar tabs en la barra de iconos vertical. Colocar un **selector compacto de contexto (`Database ▾ / Schema ▾`)** encima de la lista permitiría navegar entre esquemas sin abandonar la vista de *Tables*.
4. **Mejor experiencia en `CodeEditor.vue` y `RightSidebar.vue`:**
   - Incorporar búsqueda en editor (`@codemirror/search`, `Ctrl+F`), autocierre de corchetes/comillas (`@codemirror/autocomplete` `closeBrackets`), plegado de bloques (`foldGutter`), y botón de formateo rápido.
   - Conectar `:readonly="!ui.state.editable"` (que `CodeEditor.vue` ya implementa pero `RightSidebar.vue` nunca pasa) o indicar claramente si el canvas está bloqueado.
   - Reemplazar o hacer opcional `canvas-confetti` en el botón *Copy* (`RightSidebar.vue` L54-55): un feedback visual sutil (`Copy` → `Copied ✓` por 1.5s + toast) resulta mucho más limpio para uso repetido.
   - Cuando exista un error de parseo, enlazar/resaltar los problemas sin descartar borradores involuntariamente y añadir atajo `Ctrl+Enter` para *Apply to canvas*.
5. **Descubribilidad de Relaciones y Acciones en Móvil/Trackpad (`BlockNode.vue`, `SidebarRow.vue`):**
   - Los botones de editar/borrar en bloques y filas del sidebar están ocultos con `invisible group-hover:visible`, y los `<Handle>` de cada columna tienen `opacity: 0` hasta hacer hover sobre el bloque. En dispositivos táctiles o para usuarios nuevos, resulta difícil descubrir que se pueden arrastrar relaciones desde cada fila o editar elementos. Mostrar micro-indicadores de conector en hover de fila (con área interactiva mayor que `9px × 9px`) y un menú `⋯` visible o acceso por doble clic en fila mejora la descubribilidad.
6. **Controles de Canvas y Resizing (`CanvasControls.vue`, `BlockNode.vue`):**
   - Añadir botones flotantes para **Auto Layout**, **Toggle MiniMap**, **Add Table / Enum**, atajos (`Delete` para borrar nodo seleccionado con confirmación, `Space + Drag` para paneo, `Ctrl+0` para Fit View).
   - Al redimensionar manualmente un bloque (`entity.size`), añadir un botón/doble clic en el borde para **restablecer tamaño automático** (`size = undefined`) cuando se añadan nuevas columnas y queden ocultas tras el scroll.
   - Mejorar `ImportSqlModal.vue` usando `CodeEditor` con resaltado SQL y un botón **"Insert sample SQL"** clickable (hoy el SQL de ejemplo vive solo como `placeholder` no copiable).

---

## 6. Propuesta de Actualización Visual de UI (Rediseño Estético)

El diseño actual (`app/assets/css/main.css` + `app/app.config.ts`) traslada literalmente el prototipo HTML original: esquinas completamente rectas (`--ui-radius: 0rem`), bordes sólidos de `2px` en casi todos los contenedores y formularios planos sin jerarquía visual entre secciones.

La propuesta es evolucionar hacia una estética **"Precision Dark CAD / Studio"** manteniendo la claridad técnica y alta densidad de información, con opacidad controlada, radios sutiles y mejor separación entre planos:

### 6.1 Design System y Tokens (`main.css` y `app.config.ts`)
- **Sistema de radios jerárquico en lugar de `0rem` universal:**
  - Controles pequeños (inputs, botones, selectores, items de lista): `6px` (`0.375rem`).
  - Paneles flotantes, modales y nodos de tablas: `8px–10px` (`0.5rem–0.625rem`).
  - Badges, pills de estado y puntos indicadores: `9999px` (pill/full).
- **Jerarquía de bordes y profundidad:**
  - Sustituir bordes gruesos de `2px` en Chrome y sidebars por hairlines de `1px` (`rgb(255 255 255 / 0.08)`), reservando el grosor `2px` o un `ring-2 ring-accent-500/70` únicamente para estados **seleccionados / foco activo**.
  - Aplicar `backdrop-blur-md` y fondo translúcido (`bg-surface-block/85`) a las islas flotantes de `CanvasControls.vue` para que el lienzo de puntos respire por debajo.
- **Paleta y contraste semántico:**
  - Mantener el acento índigo/violeta (`--color-accent-*`) y colores semánticos para tipos de columna (numéricos, texto, fechas, JSON, enum) con badges suaves de bajo contraste (`bg-sky-500/10 text-sky-300`, `bg-amber-500/10 text-amber-300`, etc.) para facilitar el escaneo visual de tablas grandes.
  - Preparar variables CSS para soportar **Dark Mode (default) y Light Mode opcional** desde ajustes.

### 6.2 Rediseño de Modales (`app/components/modals/*`)
1. **`ColumnModal.vue` (de formulario largo a Inspector estructurado):**
   - **Cabecera contextual:** mostrar badge de la tabla propietaria (`users.email`) y una línea de **vista previa en vivo** de la definición SQL/Prisma equivalente mientras se edita.
   - **Sección 1 — Identidad y Tipo:** Input de nombre + selector de tipo agrupado por categorías (Números, Texto, Fechas, Estructurados, Enums) con ícono por categoría y campo de `Default value` con sugerencias rápidas (`NOW()`, `gen_random_uuid()`, `true`) según el tipo elegido.
   - **Sección 2 — Restricciones como *Toggle Pills* visuales:** Sustituir la rejilla de 5 `<USwitch>` repetitivos por tarjetas/pills interactivas compactas (`PK`, `NOT NULL`, `UNIQUE`, `INDEX`, `AUTO_INC`) con tooltip descriptivo y estado activo coloreado.
   - **Sección 3 — Tarjeta de Foreign Key:** Contenedor estilizado con borde sutil que muestre visualmente la relación `tabla_origen.col  →  tabla_destino.col`, permitiendo seleccionar también columnas de la misma tabla (self-FK) y mostrando pills/selects compactos para `ON DELETE` y `ON UPDATE`.
2. **`EntityModal.vue`:**
   - Selector de motor (**PostgreSQL / MySQL / SQLite**) como tarjetas con icono/badge en vez de un `<USelect>` plano.
   - Selector de gradiente con swatches circulares/redondeados, anillo de foco animado, check interior y opción de etiqueta descriptiva.
3. **`EnumModal.vue`:**
   - Lista de valores más limpia con indicador de índice, botones de reordenamiento (`↑ / ↓`), botón rápido **"Paste comma-separated values"** y validación inline contra valores duplicados.
4. **`ImportSqlModal.vue`:**
   - Usar `CodeEditor` (SQL highlighted) en lugar de `<UTextarea>` plano.
   - Cabecera de toolbar sobre el editor con botón **"Load sample"** y contador de líneas.
   - Resumen inferior con **chips individuales por tabla** (`+ users (new)`, `~ posts (update)`) con indicador de si preservará relaciones existentes.
5. **`ConfirmModal.vue`:**
   - Añadir icono semántico en cabecera (alerta/papelera en tono `error` o `warning`), resaltar en badge monoespaciado el nombre de la entidad afectada y mantener jerarquía clara Cancel / Destructive.
6. **Alternativa no bloqueante (Slideover / Drawer de Inspector):**
   - Para editar tablas y columnas con frecuencia, considerar abrir la edición en un **Slideover** acoplado o modal compacto que no oculte todo el diagrama de relaciones detrás.

### 6.3 Rediseño de Asides / Sidebars (`LeftSidebar`, `RightSidebar`, `SidebarRow`, `PanelShell`)
1. **`LeftSidebar.vue` & `SidebarRow.vue`:**
   - **Rail izquierdo más expresivo:** Iconos con indicador de pestaña activa lateral (barra vertical de acento de 2px en lugar de caja sólida agresiva) y acceso inferior rápido a **Templates / Shortcuts / Settings** en lugar de solo el número suelto `workspace.databases.length`.
   - **Context Bar superior:** Selector compacto `Database ▾ / Schema ▾` arriba del buscador para ver o cambiar el contexto actual sin perder la pestaña activa.
   - **Filas (`SidebarRow.vue`) más limpias:** Sustituir el cuadrado de color `size-2` por una pastilla o barra de acento suave con icono del tipo de entidad, nombre + micro-badge (ej. `PG`, `8 cols`, `4 vals`), y agrupar Editar/Eliminar en un menú contextual o trigger `⋯` que no robe ancho al texto cuando la sidebar está en su tamaño mínimo (`200px`).
   - **Botón de creación (`PanelShell.vue`):** Cambiar la caja punteada inferior por un botón `+` en la cabecera del listado (siempre accesible sin hacer scroll o sin ocupar todo el pie) más un botón secundario en empty state.
2. **`RightSidebar.vue` & `CodeEditor.vue`:**
   - **Header con selector de ORM en pestañas/pills:** En anchos `>= 420px`, mostrar pills rápidos (`Prisma`, `Drizzle`, `SQL`, `TypeORM`, `Mikro`) con fallback automático a `<USelect>` cuando el usuario estrecha el panel a `320px`.
   - **Barra de *Apply Gate* mejorada:** Mostrar banner visual diferenciado en ámbar/acento cuando haya cambios sin aplicar, con desglose expandible de tablas agregadas/eliminadas y atajo `Ctrl+Enter`.
   - **Status bar inferior:** Mantener punto de estado (`Synced` / `Editing` / `Invalid`), añadir acceso rápido a **Find (`Ctrl+F`)**, **Wrap toggle**, **Copy** (con estado `Copied`) y **Download**.

### 6.4 Rediseño de Canvas, Bloques y Navbar (`BlockNode`, `StubNode`, `RelationEdge`, `CanvasControls`, `AppNavbar`)
1. **`BlockNode.vue`:**
   - Cabecera con banda superior de acento (`3px` arriba o fondo tintado al 10% con el gradiente de la entidad) en vez de barra vertical dura de `8px` a la izquierda, más icono representativo (BD / Schema / Table / Enum) y badge con conteo de campos o comentario.
   - Filas con mejor alineación tabular: icono de llave para `PK`, pequeño indicador `FK` o `UQ` junto al nombre, pill de tipo de dato tintada suavemente por categoría, y handles redondeados sutiles visibles al enfocar la fila para hacer obvio el enlace por arrastre.
   - Indicador visual cuando una tabla tiene altura fija (`entity.size`) y columnas ocultas abajo (*"3 more fields · scroll or double-click to fit"*).
2. **`RelationEdge.vue` & `StubNode.vue`:**
   - Al seleccionar o pasar el ratón sobre una tabla o arista, **resaltar sus relaciones conectadas** y atenuar temporalmente (`opacity: 0.25`) las aristas no relacionadas para leer diagramas densos sin ruido.
   - En `StubNode.vue`, estilizar como pill enlazable con icono de esquema externo (`schema.table ↗`).
3. **`AppNavbar.vue`:**
   - Corregir marca a **SchemaCrafter** con logotipo más definido.
   - En modo **Desktop (Tauri)**, mostrar un indicador de documento más claro (chip con icono de archivo `.schemacrafter`, ruta completa en tooltip, estado `Modified` / `Saved` legible y menú **File** con atajos visibles `Ctrl+N`, `Ctrl+O`, `Ctrl+S`, `Ctrl+Shift+S`).
   - En **Web y Desktop**, añadir botón rápido de ayuda/atajos (`?`) y selector de tema o estado de modo solo lectura si `editable === false`.

---

## 7. Priorización Sugerida (Roadmap)

| Fase | Enfoque | Elementos principales |
| --- | --- | --- |
| **Fase 1 — Estabilidad y Bugs rápidos** | Correcciones puntuales sin riesgo | Corregir `"SchemaCrafter"` en `AppNavbar.vue`; añadir `nowheel` en `BlockNode.vue`; permitir self-FKs y filtrar PK/Unique en `ColumnModal.vue`; prevenir duplicados en `upsertColumn`; rastrear `useCodeSync.isDirty` en `desktopDocument.ts`; confirmar antes de cambiar target/BD con cambios sin aplicar. |
| **Fase 2 — Actualización Visual y UX** | Design system, modales y asides | Refinar tokens en `main.css` y `app.config.ts` (radios sutiles, bordes 1px, empaquetado de Inter/JetBrains Mono); rediseñar `ColumnModal`, `EntityModal`, `ImportSqlModal` (con CodeMirror), `LeftSidebar`, `RightSidebar` y `BlockNode`; añadir Welcome / Empty state accionable y sincronización Sidebar → Canvas. |
| **Fase 3 — Rendimiento y Desktop sólido** | Velocidad, bundle y Tauri Linux | Lazy-load de `CodeEditor` y dynamic imports de `@tauri-apps/*`; debounce en `ui.ts`; optimizar `SchemaCanvas` (quitar animaciones continuas masivas y búsquedas lineales); añadir `tauri-plugin-single-instance`, drag-and-drop y CSP en Tauri. |
| **Fase 4 — Nuevas Funcionalidades** | Valor añadido y productividad | Undo/Redo en `workspaceStore`; botón e algoritmo mejorado de Auto-Layout + MiniMap; Command Palette (`Ctrl+K`); editor de índices compuestos; Recent Files; exportación PNG/SVG/Mermaid/ZIP y diffs SQL. |
