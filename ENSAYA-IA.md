# Ensaya IA

Documento de trabajo del sistema **Ensaya IA**: aplicación web para ensayar teatro con inteligencia artificial.

El actor interpreta su personaje en voz alta. Ensaya IA transcribe lo dicho, avanza el libreto si hay coincidencia y lee en voz alta las líneas de los demás personajes.

## Qué es la IA (para justificación académica)

En Ensaya IA, “IA” no es el nombre comercial de un chatbot. Hay capas distintas:

1. **Reconocimiento de voz (sí es un modelo de IA).** Se usa la Web Speech API del navegador (`SpeechRecognition` / `webkitSpeechRecognition`, idioma `es-MX`). En Chrome y Edge ese estándar se apoya en el servicio comercial **Google Cloud Speech-to-Text**, un modelo de inteligencia artificial de Google que convierte voz a texto. No se entrenó un reconocedor propio: se reutiliza IA como servicio.
2. **Síntesis de voz.** `speechSynthesis` lee el texto del libreto. No inventa diálogo.
3. **Comparación de líneas.** Algoritmo de similitud (Levenshtein y normalización). No es un modelo de IA.
4. **Notas al finalizar (opcional).** Si hay clave de API, un LLM (**Gemini** de Google, intercambiable por Groq u OpenAI) redacta retroalimentación de director. Si no hay clave, se usan notas locales.

No se debe citar ChatGPT como motor del micrófono. ChatGPT es una aplicación de chat; Ensaya IA usa reconocimiento de voz de Google en el navegador y, si se configura, Gemini para las notas finales.

## Cómo correrlo

```bash
cd "C:\Users\alana\Desktop\Trabajo terminal\Ia_ensayos"
npm install
npm run dev
```

Chrome o Edge: http://localhost:8080

Cuenta demo: `demo@ensayaia.local` / `ensayo123`  
También: botón **Entrar con cuenta de demostración**.

Permite el micrófono. Configurar ensayo → Iniciar ensayo.

## Cuentas y datos

Inicio de sesión obligatorio (`VITE_REQUIRE_AUTH`). Cuentas en IndexedDB (tablas `users` y `perfil_usuario`). Libretos, grupos e historial en el navegador. Las grabaciones de modo grupo viven en IndexedDB (`ensaya-ia-grabaciones`) con libreto, escena, línea y personaje, y se reproducen en el ensayo cuando toca la línea de otro actor.

## Crecimiento

La capa `src/lib/ai/` admite `AI_PROVIDER=gemini|groq|openai|template`. La clave del LLM va en el servidor (`GEMINI_API_KEY`, sin prefijo `VITE_`).
