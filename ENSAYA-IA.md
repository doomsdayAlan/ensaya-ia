# Ensaya IA

Documento de trabajo del sistema **Ensaya IA**: aplicación web para ensayar teatro con inteligencia artificial.

El actor interpreta su personaje en voz alta. Ensaya IA transcribe lo dicho, avanza el libreto si hay coincidencia y lee en voz alta las líneas de los demás personajes.

## Qué es la IA (para justificación académica)

En Ensaya IA, “IA” no es el nombre comercial de un chatbot. Hay capas distintas:

1. **Reconocimiento de voz (sí es un modelo de IA).** Se usa la **Web Speech API** del navegador (`SpeechRecognition` / `webkitSpeechRecognition`, idioma `es-MX`). El estándar lo implementa el propio navegador: en **Chrome** el audio se procesa con un servicio de reconocimiento de **Google**; en **Edge**, con un servicio de **Microsoft**. No se entrenó un reconocedor propio ni se llama directamente a Google Cloud Speech-to-Text desde la app: se reutiliza la IA embebida en el navegador.
2. **Síntesis de voz.** `speechSynthesis` lee el texto del libreto. No inventa diálogo.
3. **Comparación de líneas.** Algoritmo de similitud (Levenshtein y normalización). No es un modelo de IA.
4. **Notas al finalizar (opcional).** Si hay clave de API, un LLM (**Gemini** de Google, intercambiable por Groq u OpenAI) redacta retroalimentación de director. Si no hay clave, se usan notas locales. En `/finalizado` un **director virtual** (`DirectorAvatar`) muestra esas notas y puede leerlas con `speechSynthesis`. El componente admite `mode="welcome"` para extenderlo luego al inicio y otras pantallas.

No se debe citar ChatGPT como motor del micrófono. ChatGPT es una aplicación de chat; Ensaya IA usa el reconocimiento de voz del navegador (Google en Chrome, Microsoft en Edge) y, si se configura, Gemini para las notas finales.

## Cómo correrlo

```bash
npm install
npm run dev
```

Chrome o Edge: http://localhost:8080

Cuenta demo: `demo@ensaya-ia.local` / `ensayo123`  
También: botón **Entrar con cuenta de demostración**.

Permite el micrófono. Configurar ensayo → Iniciar ensayo.

## Cuentas y datos

Inicio de sesión obligatorio (`VITE_REQUIRE_AUTH`). Cuentas en IndexedDB (tablas `users` y `perfil_usuario`). Libretos, grupos e historial en el navegador (separados por usuario en sesion). Las grabaciones de modo grupo viven en IndexedDB (`ensaya-ia-grabaciones`) con grupo, libreto, escena, línea, personaje y usuario; una toma por miembro; se reproducen en el ensayo cuando toca la línea de otro actor.

El nombre del producto es **Ensaya IA**. Las claves de almacenamiento heredadas viven solo en `src/lib/legacy-migration.ts` (para migrar datos antiguos); no son el nombre del producto.

## Crecimiento

La capa `src/lib/ai/` admite `AI_PROVIDER=gemini|groq|openai|template`. La clave del LLM va en el servidor (`GEMINI_API_KEY`, sin prefijo `VITE_`).
