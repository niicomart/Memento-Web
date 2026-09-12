# Memento Móvil (PWA) — Cómo publicar y usar

Esta carpeta (`web-movil/`) es una **versión independiente de Memento para celular**.
Es una PWA: se instala desde el navegador con "Agregar a pantalla de inicio"
(no hay tienda de aplicaciones) y funciona **100% sin conexión** después de instalarla.

Sus datos viven **solo en el almacenamiento del navegador del celular**
(IndexedDB). No hay servidores, ni cuentas, ni sincronización con la versión de
PC. Son dos copias separadas de la misma app; los datos cruzás a mano con los
archivos de copia de seguridad (`Exportar / Restaurar`).

---

## 1) Probarla antes de publicar (solo para pruebas)

Como la PWA necesita una dirección `http://localhost` (los navegadores no
permiten service workers desde un doble clic del archivo), hay que servir la
carpeta con un mini servidor temporal. **Esto es solo para probar**, no es parte
del funcionamiento final (que es GitHub Pages).

Con Node.js instalado, abrí una terminal en esta carpeta y ejecutá:

```
npx serve .
```

O con Python:

```
python -m http.server 8080
```

Después abrí `http://localhost:8080` en el navegador del celular (mismo Wi-Fi)
o del propio equipo. Probalo, instalalo y apagá el servidor cuando quieras; lo
importante es que ya sabés que funciona de verdad cuando lo publiques.

> Ojo: si probás en el celular y después editás los archivos, los cambios pueden
> quedar "viejos" por la caché del service worker. Para pruebas ágiles usá la
> pestaña *Application → Service Workers* con "Update on reload" activado, o
> borrá los datos del sitio.

---

## 2) Publicar en GitHub Pages

### Si todavía no tenés cuenta en GitHub

1. Entrá a https://github.com y elegí **Sign up**.
2. Completá tu usuario, email y contraseña, y verificá el email que te llega.
3. En el siguiente paso podés elegir planes gratuitos con las flechas de abajo
   (el **Free** alcanza perfectamente para esto).

### Crear el repositorio y subir la carpeta

1. En GitHub, tocá el botón **+** (arriba a la derecha) → **New repository**.
2. Nombre: por ejemplo `memento` (no hace falta que sea "memento", cualquier
   nombre sirve).
3. Dejalo en **Public** (el plan gratuito) y tocá **Create repository**.
4. En esa página vas a ver 3 comandos. En tu PC, abrí una terminal dentro de la
   carpeta **del proyecto** (la que contiene `web-movil/`) y ejecutalos:

   ```
   git init
   git add web-movil
   git commit -m "Versión móvil (PWA) de Memento"
   git branch -M main
   git remote add origin https://github.com/TU_USUARIO/TU_REPOSITORIO.git
   git push -u origin main
   ```

   Reemplazá `TU_USUARIO` y `TU_REPOSITORIO` por los tuyos. (Si nunca usaste
   git, GitHub te pide primero `git config --global user.name "..."` y
   `git config --global user.email "..."`).

   > Solo hace falta subir la carpeta `web-movil/`. El resto del proyecto de PC
   > no es necesario. Si preferís subir todo el proyecto, es lo mismo: la página
   > va a apuntar igual a `web-movil/`.

### Activar GitHub Pages apuntando a `web-movil/`

1. En el repositorio ya creado, andá a **Settings**.
2. En el menú de la izquierda (o arriba) buscá **Pages**.
3. En **Source** / **Branch**, elegí **main** (o `master`, según lo que te
   muestre) y en la carpeta elegí **`/docs`** o **`/`** según cómo hayas subido:

   - Si subiste solo la carpeta `web-movil/` al repositorio (contenido suelto),
     la página quedará en la raíz → fuente **`/ (root)`**.
   - La URL final será algo como `https://TU_USUARIO.github.io/TU_REPOSITORIO/`.

   > No importa si la URL queda con la subcarpeta (`/memento/`) o en la raíz:
   > los archivos usan **rutas relativas**, el `manifest.json` y el
   > `service-worker.js` están preparados para funcionar en cualquier subcarpeta.
   > No cambies eso.

4. Tocá **Save**. GitHub te va a mostrar la URL de tu página
   (`https://TU_USUARIO.github.io/memento/`). Puede tardar un par de minutos la
   primera vez.

### Checklist de publicación

- [ ] Entrás a la URL y ves la app cargada en el navegador del celular.
- [ ] En la consola no hay errores del service worker.
- [ ] Podés instalarla con "Agregar a pantalla de inicio" (más abajo).

---

## 3) Instalar la PWA en el celular

Solo hay que hacerlo **una vez por dispositivo**.

### Android (Chrome)

1. Abrí la URL de la app con **Chrome**.
2. Tocá el menú de los tres puntos (⋮) → **Agregar a la pantalla de inicio**
   (o **Instalar aplicación**).
3. Confirmá. Queda un ícono de Memento en la pantalla de inicio y se abre como
   una app.

### iPhone / iPad (Safari)

1. Abrí la URL de la app con **Safari** (buena señal: al instalarla en la
   pantalla de inicio no aparece la barra de navegación).
2. Tocá el botón **Compartir** (cuadrado con flecha arriba).
3. Desplazate y tocá **Agregar a pantalla de inicio** → **Agregar**.
4. Se abre como app normal, a pantalla completa.

### Prueba rápida de que funciona 100% offline

Una vez instalada, activá **modo avión** (o apagá el Wi-Fi) y abrí Memento desde
el ícono. Todo debe funcionar igual: datos, categorías, dashboard, modo
oscuro. Los datos ya están guardados en el propio teléfono.

---

## 4) Copias de seguridad (exportar / restaurar)

La versión de PC y la móvil usan **el mismo formato de JSON**. Podés mover tus
datos de una a otra simplemente exportando en una y restaurando en la otra,
cuando vos quieras. No es automático ni sincronizado: es un traslado manual.

### En la versión móvil (celular)

1. **Exportar una copia:** andá a **Ajustes → Exportar copia → Exportar ahora**.
   El celular descarga (o guarda) un archivo llamado
   `memento-backup-AAAA-MM-DDTHH-MM-SS.json`. Quedate con ese archivo.
2. **Restaurar una copia:** andá a **Ajustes → Restaurar → Elegir y restaurar**.
   Buscá el archivo `.json`, confirmá en el aviso y listo: los datos del archivo
   reemplazan los del teléfono.

### En la versión de PC

1. **Exportar:** dentro de la app de PC → **Ajustes → Exportar copia → Exportar
   ahora**. Se guarda en la carpeta `backups/` del proyecto.
2. **Restaurar:** **Ajustes → Restaurar → Elegir y restaurar**, elegí el `.json`.

### Trasladar datos PC → Móvil

1. En la PC exportá una copia (queda en `backups/memento-backup-...json`).
2. Pasá ese archivo al celular (email, cable, WhatsApp, Google Drive…).
3. En el celular: **Ajustes → Restaurar → Elegir y restaurar** → elegí ese
   archivo. Aparecen tus categorías y elementos exactamente igual.

### Trasladar datos Móvil → PC

1. En el celular: **Ajustes → Exportar copia** (se descarga el `.json`).
2. Pasá ese archivo a la PC.
3. En la PC: **Ajustes → Restaurar → Elegir y restaurar** → elegí el archivo.

> **Sugerencia fuerte (sobre todo en iPhone):** Safari puede borrar los datos
> guardados del navegador si una app no se abre durante mucho tiempo. Esta
> versión pide almacenamiento persistente al iniciar para reducirlo, y en el
> Dashboard aparece un avisito chico si pasaron más de **20 días** sin exportar
> una copia. Hacé caso y exportá: es tu red de seguridad.

---

## 5) ¿Y mi privacidad con GitHub Pages?

El sitio queda alojado por GitHub en un repositorio **público** (el plan
gratuito es público; para que sea privado hay que pagar). Eso significa que
**el código (la interfaz y la lógica de la app) queda visible para cualquiera**
en https://github.com.

Pero **no hay ningún dato personal en el código**: los archivos que se suben son
solo HTML, CSS y JavaScript. Tus categorías y elementos nunca viajan a ningún
servidor: quedan en el almacenamiento local del celular (IndexedDB). Ni GitHub,
ni la app de PC, ni nadie más pueden verlos. Lo único "mío" que queda expuesto
es la propia estructura del código de la app.

---

## Cosas a tener en cuenta

- **Cada versión es independiente.** Lo que cargás en el celular no se ve en la
  PC y viceversa, salvo que exportes/restaures manualmente un `.json`.
- **Actualizar la app publicada:** modificá/mejorá los archivos de `web-movil/`,
  volvé a `git add web-movil && git commit && git push`, y GitHub Page actualiza
  sola en unos minutos. El service worker detecta la nueva versión la próxima
  vez que la app se abre con conexión.
- **Si cambiás mucho los archivos,** subí también un número de versión nuevo en
  `service-worker.js` (la línea `const NOMBRE_CACHE = 'memento-movil-v1';`
  → `'memento-movil-v2'`, etc.) para que los celulares que ya la instalaron
  cambien a la versión nueva sin quedarse con la caché vieja.