# Capturas de pantalla — Ensaya IA

Fuente: `http://localhost:8080` (ventana 1280×800, tema por defecto).
Cuenta: **Usuario Demo** (`demo@ensaya-ia.local`). Guion de ejemplo: *Romeo y Julieta*, escena del balcón.
No se muestran contraseñas ni claves. Producción en Railway seguía sirviendo un build anterior, por eso las fotos son de local.

## Índice

### 01-registro.png

- **Pantalla:** Crear cuenta (`/register`).
- **Pasos:** Abrir `/register`. Completar nombre «Usuario Demo», correo `usuario.demo@ensaya-ia.local`, contraseña enmascarada y términos. No se envió el formulario.
- **URL:** http://localhost:8080/register

### 02-inicio-sesion.png

- **Pantalla:** Iniciar sesión (`/login`).
- **Pasos:** Abrir `/login`. Correo `demo@ensaya-ia.local` y contraseña enmascarada. Se ocultó el texto de ayuda que repetía la contraseña de demostración.
- **URL:** http://localhost:8080/login

### 03-inicio.png

- **Pantalla:** Inicio autenticado.
- **Pasos:** Entrar con la cuenta de demostración y abrir `/`.
- **URL:** http://localhost:8080/

### 04-guiones-lista.png

- **Pantalla:** Gestión de libretos.
- **Pasos:** Desde Inicio → Libretos. Lista con «Escena corta de ejemplo» y el libreto demo *Romeo y Julieta*.
- **URL:** http://localhost:8080/libretos

### 05-guion-nuevo.png

- **Pantalla:** Formulario de metadatos del libreto (título, autor, género, descripción).
- **Pasos:** En `/libretos` seleccionar «Escena corta de ejemplo» → **Editar libreto**. El alta por archivo (Importar) abre el selector del sistema y no se pudo capturar con automatización.
- **URL:** http://localhost:8080/libretos

### 06-seleccion-personaje.png

- **Pantalla:** Configuración de ensayo, bloque de personajes.
- **Pasos:** Abrir `/configuracion-ensayo`, libreto *Romeo y Julieta*, escena del balcón, personaje Romeo (Tú).
- **URL:** http://localhost:8080/configuracion-ensayo

### 07-ensayo-voz.png

- **Pantalla:** Modo ensayo individual (voz / micrófono), listo para empezar.
- **Pasos:** En configuración, modo Individual → **Iniciar ensayo**.
- **URL:** http://localhost:8080/ensayo

### 08-ensayo-lectura.png

- **Pantalla:** Modo ensayo lectura (TTS, sin micrófono para avanzar).
- **Pasos:** `/configuracion-ensayo?mode=lectura` → **Iniciar ensayo** → iniciar lectura.
- **URL:** http://localhost:8080/ensayo

### 09-finalizado-notas.png

- **Pantalla:** Ensayo finalizado con resumen, desempeño y notas del director (Ensayín).
- **Pasos:** En modo lectura, **Finalizar ensayo**.
- **URL:** http://localhost:8080/finalizado

### 10-historial.png

- **Pantalla:** Historial de ensayos.
- **Pasos:** Menú → Ensayos.
- **URL:** http://localhost:8080/ensayos

### 11-grupos-lista.png

- **Pantalla:** Mis grupos (vacío) con **Unirme con código** y **Crear grupo**.
- **Pasos:** Menú → Grupos.
- **URL:** http://localhost:8080/grupos

### 12-grupo-crear-unirse.png

- **Pantalla:** Modal **Crear grupo** (nombre «Compania Demo»).
- **Pasos:** En `/grupos` → **Crear grupo**. El modal **Unirme con código** no se fotografió aparte; los dos botones se ven en `11-grupos-lista.png`.
- **URL:** http://localhost:8080/grupos

### 13-grabaciones-grupo.png

- **Pantalla:** Detalle del grupo, pestaña Grabaciones (aún sin tomas).
- **Pasos:** Crear «Compania Demo» → **Ver grupo** → **Grabaciones**.
- **URL:** http://localhost:8080/grupos/53c4a955-5cdb-4a68-8c56-1b8e1537a9db

### 14-perfil-voz.png

- **Pantalla:** Configuración / perfil de voz (nombre visible y voz del director).
- **Pasos:** Menú → Configuración.
- **URL:** http://localhost:8080/configuracion

### 15-error-sin-microfono.png

- **Pantalla:** Ensayo por voz con el error in-app «No se pudo escuchar el microfono».
- **Pasos:** En `/ensayo` (modo individual) pulsar el micrófono. El diálogo nativo del navegador para conceder el permiso no se puede otorgar por automatización; hay que repetirlo a mano si se necesita esa foto.
- **URL:** http://localhost:8080/ensayo

### 16-pagina-404.png

- **Pantalla:** Página no encontrada (texto en inglés, tal como está en la app).
- **Pasos:** Abrir una ruta que no existe.
- **URL:** http://localhost:8080/pagina-inexistente
