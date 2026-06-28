# Chatbot DemoMed (Deno)

Microservicio de chat con IA para DemoMed. Permite al médico, por texto o voz:

- **Crear paciente**: datos personales; luego opción de antecedentes y/o agendar consulta.
- **Agendar consulta**: paciente, médico, fecha, hora, motivo.
- **Generar informe médico**: paciente, médico, tipo y contenido.

## Requisitos

- [Deno](https://deno.land/) instalado.
- Backend Node (DemoMed) corriendo y accesible.
- API key de al menos un proveedor de IA: **OpenAI**, **Anthropic (Claude)** o **Google (Gemini)**.

## Proveedores de IA

El chatbot puede usar uno de tres proveedores, configurado con `AI_PROVIDER` en `.env`:

| Proveedor | `AI_PROVIDER` | Variables requeridas | Modelo por defecto |
|-----------|----------------|----------------------|---------------------|
| OpenAI    | `openai`       | `OPENAI_API_KEY`     | `gpt-4o-mini`       |
| Anthropic Claude | `claude` | `ANTHROPIC_API_KEY`  | `claude-3-5-sonnet-20241022` |
| Google Gemini    | `gemini` | `GEMINI_API_KEY`     | `gemini-1.5-flash`  |

Opcionalmente define `OPENAI_CHAT_MODEL`, `ANTHROPIC_CHAT_MODEL` o `GEMINI_CHAT_MODEL` para cambiar el modelo.  
**Voz:** Con `gemini` la transcripción de voz usa el propio Gemini (audio understanding). Con `openai` o `claude` se usa OpenAI Whisper; si usas Claude y quieres voz, define también `OPENAI_API_KEY`.

## Configuración

1. Copiar `.env.example` a `.env` en esta carpeta.
2. Definir en `.env`:
   - `PORT`: puerto del chatbot (por defecto 3999).
   - `BACKEND_URL`: URL base del API Node, p. ej. `http://127.0.0.1:3001/api/v1`.
   - `AI_PROVIDER`: `openai`, `claude` o `gemini`.
   - La API key y, opcionalmente, el modelo del proveedor elegido (ver tabla anterior).

## Ejecución local

```bash
cd chatbot
deno run --allow-net --allow-env --allow-read server.ts
```

`--allow-read` es necesario para que el script pueda leer el archivo `.env` del disco sin pedir permiso cada vez. Con `.env` en la misma carpeta (o exportar variables antes).

## Producción (PM2)

- **Ruta del backend en el servidor:** en `start-chatbot.sh` viene definido por defecto `PROJECT_DIR=/opt/proyectos/demomed/codeslabs-demomed-backend` (igual que el script de deploy). El chatbot es **`$PROJECT_DIR/chatbot`**. Si tu clone está en otra ruta: `export PROJECT_DIR="/tu/ruta/codeslabs-demomed-backend"`. Alternativa: `export CHATBOT_DIR=.../chatbot`. La URL del API Node sigue en **`BACKEND_URL`** dentro de `chatbot/.env`.
- Proceso PM2 recomendado: **`demomed-chatbot`** (puerto en `.env`, p. ej. 3999).
- En la carpeta `chatbot/` del backend (un solo script `start-chatbot.sh`):
  ```bash
  chmod +x start-chatbot.sh
  ./start-chatbot.sh                 # levanta el chatbot
  ./start-chatbot.sh restart         # o stop | status | logs
  ```
- El script de deploy del backend (`deploy-demomed-codes-labs-backend-git.sh`) **no** levanta el chatbot; hay que desplegarlo aparte con el comando anterior.

### Si en producción ves: «No pude conectar con el asistente»

1. **Logs:** `pm2 logs demomed-chatbot` (o `./start-chatbot.sh logs`). Busca líneas **`[chatbot-ai]`** con `HTTP 400`, `401`, `404`, etc.; el cuerpo suele ser JSON de Anthropic/OpenAI con el motivo exacto (`invalid_request_error`, modelo, esquema de tools, etc.).
2. **Claude con tools:** Si un `curl` mínimo a `/v1/messages` **sin** `tools` funciona pero el chat **con** `USE_TOOL_CALLING=true` no, el fallo suele ser el **primer** request con `tools` (esquema o modelo). Prueba temporalmente **`USE_TOOL_CALLING=false`** en `chatbot/.env` y reinicia PM2: fuerza el flujo legacy (`__ACTION__`) sin tool calling nativo.
3. Tras cambiar `.env`: **`pm2 restart demomed-chatbot`** (o `./start-chatbot.sh restart`).

## API del chatbot

- **GET /health**  
  Comprueba que el servicio está vivo.

- **POST /message** (o **POST /api/chat/message**)  
  Body (JSON):
  - `message` (string): texto del usuario.
  - `conversationId` (string, opcional): id de conversación para mantener contexto.
  - `audioBase64` (string, opcional): audio en base64 (p. ej. WebM) para transcribir con Whisper y usar como mensaje.
  - `mimeType` (string, opcional): tipo del audio, p. ej. `audio/webm`.

  Header obligatorio: `Authorization: Bearer <JWT>` (mismo token del frontend contra el API Node).

  Respuesta (JSON):
  - `success`, `reply`, `conversationId`, `fromAudio` (si el mensaje vino de audio).

## Audio

- **Entrada**: el frontend puede enviar `audioBase64` (grabación del micrófono); el chatbot usa Whisper para transcribir y responde por texto.
- **Salida**: la respuesta es siempre texto; el frontend puede usar la API de síntesis de voz del navegador (o un TTS externo) para leer en voz alta.

## Integración en el frontend

1. Obtener el JWT del usuario logueado (mismo que para el API Node).
2. Llamar a `POST /api/chat/message` (o la URL que Apache proxy envía al chatbot) con:
   - `Authorization: Bearer <token>`
   - Body: `{ "message": "Quiero crear un paciente..." }` o `{ "audioBase64": "...", "conversationId": "..." }`.
3. Mostrar `reply` en la interfaz de chat y, si se desea, reproducir con TTS en el cliente.
