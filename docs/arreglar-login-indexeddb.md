# Arreglar el login (IndexedDB)

Si al entrar (incluso con la cuenta demo) aparece:

`Failed to execute 'transaction' on 'IDBDatabase': One of the specified object stores was not found.`

el navegador creó la base `ensaya-ia-db` **vacía**, sin las tablas de cuentas. Borrar la base y recargar **no basta** con el código que está ahora en GitHub: se vuelve a crear vacía.

Cuenta demo: `demo@ensaya-ia.local` / `ensayo123`  
Usa **Chrome o Edge**.

## Opción A — consola (sin tocar archivos)

1. Abre Ensaya IA en la página de **Iniciar sesión**.
2. Cierra otras pestañas del mismo sitio.
3. `F12` → pestaña **Application** (o Aplicación) → **IndexedDB**.
4. Clic derecho en `ensaya-ia-db` → **Delete database**. Si existe `cine-estrella-db`, bórrala también.
5. **Sin recargar**, ve a **Console** y pega esto. Enter:

```javascript
await new Promise((resolve) => {
  const req = indexedDB.open("ensaya-ia-db", 1);
  req.onupgradeneeded = () => {
    const db = req.result;
    if (!db.objectStoreNames.contains("users")) {
      const users = db.createObjectStore("users", { keyPath: "id" });
      users.createIndex("email", "email", { unique: true });
    }
    if (!db.objectStoreNames.contains("perfil_usuario")) {
      db.createObjectStore("perfil_usuario", { keyPath: "user_id" });
    }
  };
  req.onsuccess = () => {
    req.result.close();
    resolve();
  };
  req.onerror = () => resolve();
});
console.log("Tablas creadas. Recarga e inicia sesión.");
```

6. Recarga (`F5`) e inicia sesión (demo o tu cuenta).

Si el `Delete` queda bloqueado, cierra todas las pestañas de Ensaya IA, abre una sola y repite desde el paso 3.

## Opción B — si clonó el repo (arreglo en el código)

En `src/lib/user-database.ts` debe existir `const DB_VERSION = 2` y la función `ensureAccountStores`. Si el archivo aún tiene `DB_VERSION = 1` y un `indexedDB.open(DB_NAME)` **sin versión**, pide a Alan el archivo ya corregido, reemplázalo, y:

```bash
npm install
npm run dev
```

Abre http://localhost:8080 , recarga e inicia sesión. Con ese código las tablas se crean solas.
