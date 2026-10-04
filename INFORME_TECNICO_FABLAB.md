# FabLab I+D — explicación técnica y revisión del proyecto

**Revisión realizada:** 29 de septiembre de 2026  
**Rama revisada:** `feature/react-migration`  
**Commit observado:** `3cefc3e` (`Cambios finales en el diseño, hovers, lightning borders`)  
**Estado al revisar:** rama sincronizada con `origin/feature/react-migration`; árbol de trabajo limpio.

> Este documento describe el código y la configuración que se pudieron inspeccionar en el repositorio. No se conectó a Supabase, no se ejecutaron consultas ni cambios en datos reales, y no se verificó la configuración privada del proyecto de Supabase o de GitHub Pages.

## 1. La explicación para contarle a un amigo

FabLab I+D es una bitácora web para contar cómo evoluciona un proyecto: qué se investigó cada semana, qué decisiones tomó el equipo y qué evidencias o prototipos aparecieron. Quien visita la web puede leerla; el equipo puede iniciar sesión y actualizar el contenido sin editar el código cada vez.

Por dentro, la interfaz está construida con **React**: cada parte —la navegación, las publicaciones, el editor y las animaciones— se organiza en componentes que se pueden reutilizar. **Vite** ensambla esos componentes y prepara las tres páginas que se publican: Home, About y Final Project. Aunque comparten el mismo código, cada una tiene su propio archivo HTML de entrada.

Los datos viven en **Supabase**, que cumple dos papeles: guarda el contenido en una base de datos PostgreSQL y almacena fotos y videos en Storage. El navegador consulta Supabase directamente mediante su clave publicable. Eso es normal para una aplicación de este tipo: la protección importante no consiste en esconder esa clave, sino en las reglas **RLS** de la base de datos, que determinan qué puede leer o cambiar una persona.

Cuando el equipo publica un avance, la aplicación transforma el texto, las imágenes, los videos y las comparaciones en bloques ordenados. Guarda el contenido y referencias a los archivos; las fotos y videos se cargan a Storage, no se incrustan como archivos enormes dentro de cada publicación. También se puede arrastrar una publicación o un bloque para cambiar su orden.

El código se guarda en GitHub. El trabajo se hace en una rama como `feature/react-migration`; al integrar los cambios en `main`, una acción de GitHub compila el sitio y lo publica en GitHub Pages. Supabase y GitHub Pages son servicios distintos: uno almacena los datos y archivos, el otro sirve los archivos de la página.

En resumen: **React organiza la experiencia, Vite la construye, Supabase guarda el contenido y GitHub Pages la publica**. Las animaciones le dan personalidad visual, pero no son las que guardan ni controlan los datos.

## 2. Explicación para ti

### 2.1 Por qué pasaste de HTML estático a React

Un sitio de HTML, CSS y JavaScript estático es una buena forma de presentar contenido relativamente fijo. En cuanto quisiste que el equipo pudiera iniciar sesión, publicar avances, editar contenido, subir multimedia, reordenar elementos y cambiar textos desde la misma página, había que coordinar cada vez más estados y comportamientos relacionados.

La migración a React permitió:

- dividir la interfaz en componentes reutilizables en vez de duplicar lógica entre páginas;
- representar publicaciones como bloques tipados —texto, imagen, video y comparación— y renderizarlos de forma consistente;
- mantener sincronizados el editor, la sesión y la información que se ve en pantalla;
- mostrar controles administrativos solo a usuarios autenticados;
- añadir páginas editables, ordenamiento y estados de carga, guardado y error;
- incorporar efectos visuales de forma aislada y cargar algunos de manera diferida.

El proyecto sigue usando varias entradas HTML: no se convirtió en una aplicación de una sola ruta. Cada página carga el mismo punto de inicio de React y le comunica su identidad con `data-page`. Esto conserva direcciones sencillas (`index.html`, `about.html`, `final-project.html`) y funciona bien con el alojamiento estático de GitHub Pages.

### 2.2 Cómo se conectan las partes

#### Navegador y aplicación

1. El navegador solicita uno de los tres documentos HTML.
2. El documento monta `src/main.jsx` en `#root` y pasa su atributo `data-page` a `App`.
3. React carga el contenido apropiado y representa la cabecera compartida.
4. Home consulta semanas, publicaciones y los nombres del equipo. About y Final Project consultan su fila de contenido editable.
5. Cuando hay una sesión válida, aparecen las herramientas de administración.

`src/lib/paths.js` utiliza `import.meta.env.BASE_URL`. La configuración fija la base de GitHub Pages como `/fablab/`, por lo que enlaces e imágenes necesitan conservar ese prefijo. Un enlace raíz escrito como `/index.html` podría apuntar fuera del subdirectorio; los componentes actuales usan el helper de base para los enlaces conocidos.

#### GitHub y publicación

- El repositorio tiene una rama de trabajo `feature/react-migration` y una rama de despliegue `main`.
- La acción `.github/workflows/deploy.yml` se ejecuta al recibir un `push` a `main` o por ejecución manual (`workflow_dispatch`).
- La acción usa Node 22, instala exactamente el lockfile con `npm ci`, ejecuta `npm run build`, sube `dist` y despliega el artefacto en GitHub Pages.
- Un `push` a la rama feature no publica directamente el sitio. El flujo habitual es revisar los cambios, abrir/actualizar el Pull Request hacia `main`, integrarlo y comprobar el resultado de la acción.
- Vite genera HTML y paquetes JavaScript/CSS estáticos. GitHub Pages no ejecuta React ni código de servidor: entrega esos archivos al navegador.

La acción actual compila y despliega, pero no ejecuta pruebas automáticas ni un linter. La configuración de seguridad de permisos (`contents: read`, `pages: write`, `id-token: write`) es acotada al flujo de GitHub Pages.

#### Supabase y datos

`src/lib/supabase.js` crea el cliente de `@supabase/supabase-js` usando la URL y una **clave publicable**. Ese valor se envía al navegador al construir la web; no debe tratarse como contraseña. No se encontró una clave `service_role` en la configuración inspeccionada. Las operaciones privilegiadas deben permanecer fuera del cliente, y las reglas RLS deben ser la barrera de acceso.

Las tablas que aparecen en el SQL son:

| Tabla | Para qué se usa |
|---|---|
| `tabs` | Semanas y portada: identificador, título, posibilidad de borrado y orden. |
| `entries` | Publicaciones: semana (`tab_id`), título, bloques JSON, orden, autor y fecha. |
| `site_pages` | Contenido de About y Final Project como JSON editable, con fecha y usuario que guardó. |

El contenido de un avance se guarda en `entries.blocks` como JSONB. Los bloques multimedia guardan el nombre, tipo, texto alternativo, ruta y URL; el binario se aloja en el bucket público `project-media`. Las imágenes se comprimen en el navegador con límite de 8 MB y dimensión máxima de 1600 px; los videos tienen un límite de 50 MB en la interfaz. Esos límites de navegador mejoran la experiencia, pero no sustituyen validación del lado servidor.

El orden de una semana se almacena en `entries.sort_order`. `reorder_entries` valida que la lista recibida incluya cada publicación de esa semana una vez y actualiza las posiciones en una operación SQL. El índice `(tab_id, sort_order, created_at)` ayuda a recuperar cada semana ya ordenada.

Las políticas SQL permiten lectura pública de contenido y cambios a usuarios con rol `authenticated`. La app usa inicio de sesión con contraseña de Supabase (`signInWithPassword`); no contiene una pantalla de alta pública. Sin embargo, el SQL no contiene una lista de correos autorizados: el alcance efectivo depende de qué cuentas existan en Supabase y de las políticas RLS.

Los scripts SQL viven en el repositorio, pero el workflow de GitHub Pages no los aplica. Las migraciones se ejecutan por separado en Supabase; no puedo confirmar desde aquí que la base de datos real coincida exactamente con esos archivos.

### 2.3 Archivo por archivo

La lista siguiente cubre los **49 archivos versionados** encontrados fuera de `node_modules/`, `dist/` y `.git/`. Las carpetas de dependencias instaladas y los archivos generados por Vite no se enumeran uno por uno porque no son fuente mantenida por el proyecto.

#### Raíz, configuración y entradas de página

| Archivo | Responsabilidad |
|---|---|
| `.gitignore` | Excluye `node_modules`, `dist` y `.env` del repositorio, y permite la plantilla `.env.example`. |
| `package.json` | Manifiesto npm: React, Vite, Supabase, arrastre, GSAP, OGL e iconos; define `dev`, `build` y `preview`. No define `test` ni `lint`. |
| `package-lock.json` | Fija el árbol instalado para que `npm ci` reproduzca las dependencias en CI. |
| `vite.config.js` | Activa el plugin de React, configura `base: "/fablab/"` y las tres entradas HTML del build. |
| `index.html` | Documento de entrada de Home; declara `data-page="home"` y metadatos en español. |
| `about.html` | Documento de entrada de About; declara `data-page="about"`. |
| `final-project.html` | Documento de entrada de Final Project; declara `data-page="final-project"`. |
| `styles.css` | Estilos globales de layout, tipografía, formularios, publicaciones, páginas internas, responsive y ajustes visuales de componentes. |

#### Arranque y lógica de aplicación

| Archivo | Responsabilidad |
|---|---|
| `src/main.jsx` | Crea la raíz React, activa `StrictMode`, importa el CSS global y pasa `data-page` a `App`. |
| `src/App.jsx` | Orquesta autenticación, carga de Home, estado de semanas/publicaciones, creación/edición/borrado, uploads, ordenamiento, login/logout y render de páginas. Es el archivo central y también el más grande. |
| `src/lib/paths.js` | Lee la base configurada por Vite y construye URLs de recursos públicos con el prefijo correcto. |
| `src/lib/supabase.js` | Configura y exporta el cliente de Supabase con credenciales publicables del proyecto. |
| `src/lib/richText.js` | Sanitiza el HTML enriquecido mediante listas permitidas de etiquetas, atributos y estilos para reducir riesgo de XSS. |

#### Componentes de contenido y edición

| Archivo | Responsabilidad |
|---|---|
| `src/components/AnimatedHeading.jsx` | Mantiene el encabezado semántico y usa TechText para títulos no formateados; si el título tiene formato, muestra HTML sanitizado. |
| `src/components/BlockEditor.jsx` | Editor de bloques internos; permite cambiar orden, eliminar bloques, editar texto, medios y opciones de comparaciones. |
| `src/components/EditablePage.jsx` | Muestra y permite editar About/Final Project: textos, secciones, integrantes e imágenes. Persiste contenido y gestiona limpieza de medios antiguos. |
| `src/components/EntryList.jsx` | Renderiza publicaciones y sus bloques; ofrece edición, eliminación con confirmación Fuse y reordenamiento de tarjetas. |
| `src/components/RichTextEditor.jsx` | Editor visual para formato enriquecido y componente de visualización que sanitiza antes de insertar HTML. |
| `src/components/LabelInput.jsx` | Campo con etiqueta animada; incluye alternancia para mostrar/ocultar contraseña. |
| `src/components/SiteHeader.jsx` | Cabecera común, logos institucionales, PillNav, botón de autenticación y estado de sesión. |
| `src/components/DeleteFuseButton.jsx` | Adapta FuseButton al estilo de FabLab y define su ventana de cancelación y confirmación. |

#### Componentes de interfaz y animación

| Archivo | Responsabilidad |
|---|---|
| `src/components/BorderGlow.jsx` | Envoltorio que mide proximidad/ángulo del puntero para revelar el resplandor en tarjetas. |
| `src/components/BorderGlow.css` | Capas de borde y halo reactivo de BorderGlow. |
| `src/components/BorderGlow.LICENSE.md` | Nota de licencia y referencia de BorderGlow. |
| `src/components/FuseButton.jsx` | Control animado de confirmación con mecha, estado cancelar y callback al terminar. |
| `src/components/FuseButton.css` | Apariencia, capas y estados de FuseButton. |
| `src/components/FuseButton.LICENSE.md` | Nota de licencia de FuseButton; identifica el material fuente como compartido por el propietario del proyecto. |
| `src/components/MicroSlats.jsx` | Fondo de slats animado de la portada, renderizado con OGL/WebGL. |
| `src/components/MicroSlats.css` | Contenedor y dimensiones del fondo MicroSlats. |
| `src/components/MicroSlats.LICENSE.md` | Licencia, fuente y autorización adicional comunicada para publicar MicroSlats en GitHub Pages. |
| `src/components/PillNav.jsx` | Navegación superior de cápsulas, con enlaces multipágina y menú móvil. Usa GSAP cargado de forma diferida. |
| `src/components/PillNav.css` | Layout, estados hover/focus y menú móvil de PillNav. |
| `src/components/PillNav.LICENSE.md` | Nota de licencia y procedencia/adaptación de PillNav. |
| `src/components/SpecularButton.jsx` | Botón/enlace con borde de luz WebGL; permite enlace HTML real cuando recibe `href`. |
| `src/components/SpecularButton.css` | Estilo, estados y tamaños del botón especular. |
| `src/components/TechText.jsx` | Texto principal dibujado/animado en canvas. |
| `src/components/TechText.css` | Estilos y fallback de TechText. |
| `src/components/TechText.LICENSE.md` | Nota de licencia de TechText; todavía pide confirmar autorización de publicación específica. |

#### SQL y GitHub Actions

| Archivo | Responsabilidad |
|---|---|
| `supabase-schema.sql` | Esquema de instalación: tablas `tabs`, `entries`, `site_pages`, políticas RLS, bucket Storage, seed inicial e RPC de ordenamiento. |
| `supabase-site-pages.sql` | SQL específico e idempotente para crear `site_pages`, políticas y contenido inicial de About/Final Project. |
| `supabase-migrations/20260929_entry-order.sql` | Añade y rellena `sort_order`, crea el índice y la función autenticada `reorder_entries`. |
| `supabase-migrations/20260929_protect_portada.sql` | Endurece las políticas de `tabs` para que la fila `portada` no se pueda crear, modificar ni eliminar como semana. |
| `.github/workflows/deploy.yml` | Workflow de build y despliegue a GitHub Pages cuando cambia `main` o se inicia manualmente. |

#### Imágenes

| Archivo | Responsabilidad |
|---|---|
| `images/ingindustriallogo.jpg` | Imagen de identidad institucional conservada en el repositorio. |
| `images/logofablab.jpg` | Logo del proyecto, utilizado como recurso/ícono y fuente local. |
| `images/ucuencalogo.png` | Logo de la Universidad de Cuenca. |
| `public/images/ingindustriallogo.jpg` | Copia servida por Vite desde `public/images` para la cabecera publicada. |
| `public/images/logofablab.jpg` | Copia pública del logo usada por la aplicación y las páginas construidas. |
| `public/images/ucuencalogo.png` | Copia pública del logo institucional usado por la cabecera. |

Las imágenes existen tanto bajo `images/` como bajo `public/images/`. La copia bajo `public/` es la que Vite copia literalmente al sitio construido; la carpeta `images/` parece cumplir el papel de originales/recursos de trabajo. Conviene mantener ambas solo si las dos ubicaciones siguen teniendo un uso claro.

## 3. Resumen de eficiencia

### Lo que está bien resuelto

- El reordenamiento usa una función SQL en vez de enviar una actualización por publicación.
- Las imágenes de publicaciones se reducen en el navegador antes de subirlas.
- La página carga secciones con `lazy`/`Suspense` en distintos puntos y PillNav se empaqueta aparte.
- Los estilos de interfaz están centralizados y las páginas comparten componentes.
- GitHub Actions usa `npm ci`, así el despliegue utiliza el lockfile versionado.
- En el build revisado no hubo advertencia de chunks; el paquete principal quedó en aproximadamente **485.58 kB sin comprimir / 142.10 kB gzip**. PillNav, por ejemplo, se genera en un chunk independiente.

### Límites actuales

- Home descarga todas las semanas y publicaciones de una sola vez y luego agrupa publicaciones en el navegador. Es razonable para una bitácora pequeña, pero no tiene paginación y crecerá en coste con el contenido.
- Las cargas de medios de una publicación se ejecutan secuencialmente, lo que puede alargar el guardado si se adjuntan muchos archivos.
- `App.jsx` concentra muchas responsabilidades. Separar acceso a datos, estado de edición y operaciones de medios en módulos/hooks ayudaría a mantener el proyecto a medida que crezca.
- No hay suite automatizada de tests ni paso de lint/typecheck en CI. La build detecta ciertos errores de compilación, pero no valida por sí sola el comportamiento de guardar, borrar o reordenar.
- Los componentes WebGL/canvas y GSAP añaden descarga y trabajo gráfico. Se usan para decoración, por lo que vale la pena conservar fallback, movimiento reducido y medición visual en equipos modestos.

## 4. Seguridad, integridad y recuperación

Esto es una revisión estática del código, no una prueba de penetración ni una auditoría de la configuración activa de Supabase.

### Controles positivos observados

- El cliente expone una clave publicable, no una clave de servicio. La clave publicable puede vivir en frontend; los permisos dependen de RLS.
- Las tablas principales tienen RLS activada en el SQL revisado.
- Los textos enriquecidos se filtran con etiquetas y valores de estilo permitidos; los enlaces de páginas limitan protocolos a HTTP/HTTPS y los medios filtran protocolos renderizados.
- La migración de protección bloquea las operaciones de tabla sobre la semana especial `portada`.
- El borrado con Fuse exige esperar y permite cancelar antes de llamar al borrado; no reemplaza la seguridad de base de datos, pero reduce borrados accidentales en la interfaz.

### Riesgos y límites importantes

1. **Los cambios se conceden al rol general `authenticated`.** Las políticas revisadas no limitan las escrituras a una lista de miembros concreta. Si solo el equipo dispone de cuentas, el riesgo práctico es menor; si se crean otras cuentas autenticadas, esas cuentas también podrían editar.
2. **Cualquier usuario autenticado puede actualizar o borrar cualquier `entry`.** Las políticas de `entries` usan condiciones amplias (`true`) para update/delete, no verifican propiedad ni restringen la semana destino.
3. **La protección de `portada` protege `tabs`, no las filas de `entries`.** Las políticas de entrada no excluyen `tab_id = 'portada'`. La interfaz normal no ofrece allí esos controles, pero la base de datos no impone esa restricción sobre publicaciones.
4. **Storage es público y las políticas de escritura se limitan al bucket.** Cualquier usuario autenticado con acceso puede cargar, actualizar o borrar objetos de `project-media`; no se restringen por carpeta/propietario. Las URLs son públicas por diseño, así que medios privados no deberían guardarse allí.
5. **Borrar una semana son varias operaciones no transaccionales.** La app consulta rutas, elimina filas de publicaciones, intenta borrar medios y finalmente elimina la semana. Si una operación posterior falla, las anteriores no se revierten. El mensaje de error informa el fallo, pero no puede reconstruir lo ya eliminado.
6. **El borrado actual es permanente desde la aplicación.** No existe papelera/soft-delete. La aplicación ya permitió borrar accidentalmente Semana 2 durante pruebas, lo que confirma que la ventana de confirmación y la cancelación no sustituyen un mecanismo de recuperación.
7. **Los límites de tamaño/tipo están en el navegador.** Los controles de 8 MB/50 MB y MIME pueden evitar errores normales, pero alguien que invoque el API directamente puede omitirlos si Storage no impone límites equivalentes.
8. **Falta completar trazabilidad de licencias.** `TechText.LICENSE.md` todavía solicita confirmar permiso de publicación de TechText, mientras que se informó verbalmente que el autor permite publicar su código. Conviene confirmar que ese permiso cubre exactamente este componente y actualizar la nota. `SpecularButton` no tiene un archivo de licencia/fuente junto al componente en el estado revisado. No es posible inferir una autorización legal a partir de la compilación.

### Recomendaciones por prioridad

1. **Antes de depender de la bitácora como única copia:** habilitar/verificar backups de Supabase y practicar una restauración en un proyecto separado. Considerar papelera o borrado lógico para semanas y publicaciones.
2. **Definir quién es editor:** si la escritura debe ser solo del equipo, restringir RLS a identidades autorizadas (o a un rol/claim controlado) en `entries`, `tabs`, `site_pages` y Storage. Si todo usuario con cuenta se considera miembro, documentarlo claramente.
3. **Completar la protección de portada en `entries`:** si no se permite publicar ahí, exigir en políticas que el `tab_id` no sea `portada`, no solo ocultar los botones en React.
4. **Revisar Storage:** si los medios son públicos por decisión del proyecto, limitar escrituras/borrados por propietario y definir límites de tamaño/tipo desde Supabase. Si hay datos privados, moverlos a un bucket privado con URLs firmadas.
5. **Añadir pruebas automatizadas pequeñas:** sanitización HTML, orden de entradas, permisos esperados y que cancelar Fuse no llame el borrado. Probar borrados integrales solo con proyecto/datos de prueba.
6. **Registrar procedencia/licencia de cada componente:** especialmente TechText y SpecularButton, guardando enlace o texto de permiso aplicable antes de un despliegue público.

## 5. Mi opinión

La decisión de migrar fue acertada para las necesidades actuales. Ya no es solo una página de presentación: es una bitácora editable con cuentas, almacenamiento de medios, estructura por semanas, composición de bloques y páginas institucionales. React y Supabase reducen mucho el trabajo manual para mantenerla y permiten que el contenido siga creciendo sin editar a mano cada HTML.

La arquitectura es apropiada para un proyecto académico de equipo pequeño: **sitio estático en GitHub Pages, frontend React/Vite y Supabase como servicio de datos**. No hace falta añadir un servidor propio mientras las reglas de acceso estén bien acotadas y la escala sea modesta.

Mi reserva principal no es la cantidad de animaciones ni el uso de React; es la **recuperación y el alcance de permisos**. Un borrado con cuenta atrás protege de un clic equivocado, pero no de una cuenta comprometida ni de un borrado que ya terminó. Yo priorizaría respaldos restaurables y permisos RLS explícitos antes de seguir añadiendo más efectos visuales. Después, separaría gradualmente el `App.jsx` y pondría algunos flujos críticos bajo tests automáticos.

En general: es un proyecto con una base funcional y visualmente distintiva, construido con tecnologías adecuadas para lo que querías conseguir. Con recuperación ante borrados, permisos más explícitos y pruebas automatizadas, quedaría bastante más sólido sin perder el estilo que te gusta.

## 6. Verificación de esta revisión

- `npm run build`: correcto al revisar.
- `git diff --check`: correcto.
- No hay scripts `test` o `lint` en `package.json`.
- No se ejecutaron operaciones contra Supabase ni se modificaron datos reales.
- La rama revisada era `feature/react-migration`, en el commit `3cefc3e`, sincronizada con su rama remota y sin cambios locales.
