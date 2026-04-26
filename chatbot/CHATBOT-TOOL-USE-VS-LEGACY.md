# Chatbot: Tool Use vs Legacy — Guía de arquitectura

Este documento resume la arquitectura del chatbot DemoMed: **Tool Use** (desde la API del proveedor de IA) y **Legacy** (acciones mediante texto `__ACTION__`), y cómo se relaciona con herramientas como N8N.

---

## 1. Qué es “Tool Use desde la API”

Cuando usas **Tool Use**:

1. **Tu servidor (chatbot)** llama a la API del proveedor, por ejemplo:
   - `POST https://api.openai.com/v1/chat/completions`
   - En el cuerpo envías: **messages** + **tools** (las definiciones de CHAT_TOOLS: nombre, descripción, parámetros).

2. Esa **API del proveedor** tiene un contrato especial: además de devolver texto, puede devolver **llamadas a funciones** en un formato estructurado, por ejemplo:

```json
{
  "choices": [{
    "message": {
      "content": "...",
      "tool_calls": [
        {
          "id": "call_xxx",
          "function": {
            "name": "open_section",
            "arguments": "{\"paciente_nombre\":\"Sandra Romero\",\"path\":\"antecedentes\"}"
          }
        }
      ]
    }
  }
}
```

3. **Tu código** lee ese JSON: extrae `name` y `arguments` y llama **runTool(token, name, args)**. No tienes que parsear texto libre; la intención (“abrir sección de antecedentes”) viene como **estructura de la API** (tool_calls).

**En resumen:** “Tool Use desde la API” significa que el modelo indica qué herramienta ejecutar **a través del mecanismo de tool/function calling** de la API del proveedor (OpenAI/Claude/Gemini), no escribiendo una línea de texto tipo `__ACTION__...`.

### Resumen: ¿Qué es “la API” en cada caso?

| Contexto | Qué es “la API” |
|----------|-----------------|
| **Tool Use** | API del proveedor de IA (OpenAI, etc.) y su mecanismo de **tool_calls / function calling**. El modelo “llama” herramientas usando ese formato estructurado que la API devuelve. |
| **Legacy** | No usa tool_calls. El modelo solo devuelve **texto**; tu servidor busca la línea `__ACTION__nombre__{...}__` y entonces llama a **runTool** con lo que parseó. |

En ambos casos **quien ejecuta la acción es siempre runTool** en tu servidor; la diferencia es si el “qué ejecutar” te llega como **estructura de la API del proveedor** (Tool Use) o como **texto que tú parseas** (Legacy).

---

## 2. Flujo con Tool Use

1. **Usuario** escribe: *"Quiero ver los antecedentes de Sandra Romero"*.

2. **Tu servidor** envía a la **IA** (API del proveedor): mensajes de la conversación + definición de **tools**.

3. **Primera intervención de la IA:** La IA decide llamar una herramienta y devuelve **tool_calls** (ej. `open_section` con `paciente_nombre`, `path`). No es la respuesta final al usuario.

4. **Tu servidor** ejecuta **runTool** con esos argumentos y obtiene el resultado (ej. `{ message: "Para ver o gestionar los antecedentes...", navigateTo: "/patients/123/antecedentes" }`).

5. **Tu servidor** envía de nuevo a la **IA**: los mismos mensajes + el mensaje del asistente con tool_calls + **el resultado de la herramienta** como mensaje de tipo `"tool"`.

6. **Segunda intervención de la IA:** La IA recibe la respuesta de tu servidor (el resultado de runTool) y entonces:
   - puede **generar el texto final** que verá el usuario (por ejemplo resumiendo o acompañando el mensaje de la tool), o
   - puede **pedir otra herramienta** (y se repite el ciclo).

7. **Lo que el usuario ve** como respuesta puede ser:
   - el mensaje que devolvió **runTool** (sobre todo cuando hay `navigateTo` y tu código devuelve antes), o
   - el **texto que generó la IA** en el paso 6 después de “ver” la respuesta del servidor.

### Dónde interviene la IA cuando el servidor “responde”

- **Antes:** la IA indica *qué* hacer (tool_calls).
- **Después:** tu servidor ejecuta runTool y **vuelve a llamar a la IA** pasándole ese resultado como mensaje `"tool"`. Ahí la IA **interviene de nuevo** para producir la respuesta final al usuario (o para pedir otra acción).

---

## 3. Flujo con Legacy

1. **Usuario** escribe: *"Quiero ver los antecedentes de Sandra Romero"*.

2. **Tu servidor** envía a la **IA** (API del proveedor):
   - mensajes de la conversación
   - **SYSTEM_PROMPT** (instrucciones + formato `__ACTION__nombre__{...}__`)
   - **sin** definición de tools (la API no sabe que existen herramientas).

3. **Una sola intervención de la IA:** La IA devuelve **solo texto**, por ejemplo:
   - *"Claro, te llevaré a la sección de antecedentes."*
   - Y, si hace caso al prompt, una línea:  
     `__ACTION__open_section__{"paciente_nombre":"Sandra Romero","path":"antecedentes"}__`

4. **Tu servidor** hace todo en tu código:
   - Parsea la respuesta buscando `__ACTION__nombre__{...}__`.
   - Si la encuentra → **legacyActionToTool** → **runTool** → obtienes el resultado del servidor (mensaje, `navigateTo`, etc.).
   - Sustituyes (o usas) ese resultado como respuesta al usuario.
   - Si **no** encuentra ninguna acción → el usuario solo ve el texto que generó la IA (sin ejecutar ninguna tool).

5. **La IA no vuelve a intervenir:** No se le envía el resultado de runTool. La IA no “ve” si la acción se ejecutó bien o mal ni puede reescribir la respuesta en función de eso.

---

## 4. Comparación rápida

| Aspecto | Use_Tool | Legacy |
|---------|----------|--------|
| **Llamadas a la IA** | Varias: modelo pide tool → ejecutas → envías resultado → modelo responde o pide otra tool. | Una: modelo devuelve texto y, si quiere, una línea `__ACTION__`. |
| **La IA después de runTool** | Sí: recibe el resultado y puede generar la respuesta final o pedir otra tool. | No: no recibe el resultado; tú usas el mensaje de runTool o el texto del modelo. |
| **Respuesta al usuario** | Texto generado por la IA tras ver el resultado de la tool, o el mensaje de la tool. | Texto del modelo o mensaje de runTool (si se parseó una acción); la IA no “ajusta” esa respuesta. |

**En resumen:** Con Legacy la IA interviene **una vez**; tú parseas su texto, ejecutas runTool si hay `__ACTION__`, y la respuesta al usuario la armas tú (con el resultado de runTool o con el texto del modelo), **sin volver a consultar a la IA**.

---

## 5. Ejecución: siempre runTool

Sin importar el método, las acciones se ejecutan siempre con las mismas **tools**, a través de **runTool**.

La diferencia está solo en **de dónde salen** el nombre de la herramienta y los argumentos:

| Método | Origen de (nombre, argumentos) | Ejecución |
|--------|--------------------------------|-----------|
| **Tool Use** | El modelo **invoca** una herramienta vía API; el servidor recibe `(name, args)` (ej. `open_section`, `{ paciente_nombre, path }`). | `runTool(token, name, args)` |
| **Legacy** | El modelo **escribe** `__ACTION__nombre__{...}__`; el servidor parsea y **legacyActionToTool** convierte a `(toolName, args)` en el mismo formato. | `runTool(token, toolName, args)` |

**legacyActionToTool** es el **adaptador**: traduce los nombres y el JSON del mundo Legacy al formato que usa **runTool** (nombres como `agendar_consulta`, `open_section`, `buscar_consultas`, etc.). Una sola implementación (runTool), dos formas de invocarla.

---

## 6. N8N: Tool / Function calling

### Cómo funciona en N8N

- **Un solo tipo de agente (Tools Agent):** N8N unificó los agentes en un “Tools Agent” que es el que usa **function calling**. Le conectas **tools** (nodos) y el modelo decide cuándo llamar cada uno y con qué parámetros.

- **Los “tools” son nodos de n8n:** Cada herramienta que el modelo puede usar es un **nodo** del flujo: HTTP Request, código custom, otro workflow, etc. Tú defines el nodo (qué hace) y una **descripción** para que el modelo entienda cuándo usarlo.

- **Ciclo modelo ↔ herramientas:** El agente recibe el mensaje del usuario, el modelo (Claude, GPT, etc.) puede devolver “llamo a la tool X con estos parámetros”. n8n ejecuta ese nodo, pasa el resultado de vuelta al modelo y el modelo puede seguir hablando o llamar otra tool. Se repite hasta que el modelo da la respuesta final.

- **Parámetros desde la IA:** Con **$fromAI()** o el rellenado automático de parámetros, el modelo **elige** los valores (por ejemplo, “paciente_nombre: Sandra Romero”) según el contexto; no hace falta que tú los fijes en el nodo.

En la práctica es el mismo esquema que en tu chatbot (modelo pide tool → servidor ejecuta → resultado vuelve al modelo), pero en n8n el “servidor” es el **motor del workflow** y las “tools” son **nodos** que tú enganchas al AI Agent.

### Ventajas de usar tools en el AI Agent de N8N

1. **Un solo flujo para “pensar” y “actuar”**  
   El mismo agente que responde en lenguaje natural puede buscar datos, llamar APIs, ejecutar otro workflow o escribir en una base de datos, sin tener que preprogramar cada rama del flujo a mano.

2. **Menos lógica manual tipo Legacy**  
   No tienes que parsear texto ni pedir al modelo que escriba `__ACTION__...`. El modelo usa el contrato de tools (nombre + parámetros) y n8n traduce eso a “ejecutar este nodo con estos inputs”. Menos frágil y más fácil de mantener.

3. **Reutilización y composición**  
   Una “tool” puede ser un **sub-workflow** (Call n8n Workflow). Así puedes tener herramientas como “agendar consulta”, “buscar paciente”, “abrir historia” como flujos separados y que el agente los combine según la conversación.

4. **Integración con el resto del ecosistema**  
   Las tools pueden ser HTTP Request (tu backend), bases de datos, Slack, email, etc. El agente orquesta esas integraciones en función de lo que pide el usuario.

5. **Parámetros elegidos por el modelo**  
   Al poder usar `$fromAI()` o parámetros rellenados por la IA, el agente adapta cada llamada al contexto (por ejemplo, “Sandra Romero” o “antecedentes” vs “historia-medica”) sin que tú definas todas las combinaciones en el flujo.

6. **Encadenamiento y corrección**  
   Si una tool devuelve “paciente no encontrado”, el modelo puede decidir llamar a otra (por ejemplo buscar por cédula) o responder al usuario. El flujo no es lineal: el agente puede dar varias “vueltas” (como en Use_Tool en tu chatbot).

7. **Visibilidad y depuración**  
   Cada llamada a una tool es una ejecución de nodo en n8n, así que ves en el historial qué tool se llamó, con qué datos y qué devolvió.

**En resumen:** Al pegar tools a tu nodo AI Agent en N8N estás usando el mismo tipo de “use_tool” que en tu chatbot (modelo indica la acción de forma estructurada, el sistema ejecuta y vuelve a pasar el resultado al modelo), con la ventaja de que las “funciones” son nodos visuales y flujos que ya conoces en n8n.
