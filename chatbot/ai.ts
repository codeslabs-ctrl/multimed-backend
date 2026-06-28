import {
  AI_PROVIDER,
  OPENAI_API_KEY,
  OPENAI_CHAT_MODEL,
  ANTHROPIC_API_KEY,
  ANTHROPIC_CHAT_MODEL,
  GEMINI_API_KEY,
  GEMINI_CHAT_MODEL,
} from "./env.ts";

const ACTION_REGEX = /__ACTION__(\w+)__([\s\S]*?)__(?=$|\n)/;

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** Opciones para chat con Tool Use: el orquestador ejecuta herramientas y devuelve resultados al modelo. */
export interface ChatOptions {
  executeTool?: (name: string, args: Record<string, unknown>) => Promise<unknown>;
}

/**
 * Herramientas (Tool Use / Function Calling) en formato OpenAI.
 *
 * Significado de cada propiedad en cada tool:
 * ─────────────────────────────────────────────────────────────────────────
 * type: "function"
 *   Tipo de ítem para la API. Indica que es una herramienta que el modelo puede "llamar".
 *
 * function.name
 *   Nombre único de la herramienta. El modelo lo usa para elegir qué llamar;
 *   el servidor lo usa en el switch (ej. case "buscar_paciente").
 *
 * function.description
 *   Texto que explica al modelo para qué sirve la herramienta.
 *   El modelo usa esto para decidir cuándo invocarla según el mensaje del usuario.
 *
 * function.parameters
 *   Esquema (JSON Schema) del objeto que el modelo debe enviar como argumentos.
 *
 * function.parameters.type
 *   Tipo del argumento. "object" = un objeto con varias propiedades.
 *
 * function.parameters.properties
 *   Definición de cada propiedad del objeto (nombre, type, description).
 *
 * function.parameters.required
 *   Array con los nombres de propiedades obligatorias.
 *   Solo pueden ir nombres que existan en "properties" (no "parameters" ni otros).
 *
 * En cada property (ej. query): type = tipo del valor (string, number, etc.);
 * description = ayuda al modelo a saber qué valor poner.
 * ─────────────────────────────────────────────────────────────────────────
 */
const CHAT_TOOLS = [
  { type: "function" as const, function: { name: "buscar_paciente", description: "Busca un paciente por nombre o cédula en el sistema", parameters: { type: "object", properties: { query: { type: "string", description: "Nombre completo o número de cédula del paciente" } }, required: ["query"] } } },
  { type: "function" as const, function: { name: "nuevo_paciente", description: "Ingresar los datos de un nuevo paciente en el sistema. Cédula debe ser: V12345678, E1234567, J12345678, P12345678 o G12345678.", parameters: { type: "object", properties: { nombres: { type: "string" }, apellidos: { type: "string" }, cedula: { type: "string", description: "Formato: V12345678, E1234567, J12345678, P12345678, G12345678" }, edad: { type: "number" }, sexo: { type: "string" }, email: { type: "string" }, telefono: { type: "string" } }, required: ["nombres", "apellidos", "cedula", "edad", "sexo", "email", "telefono"] } } },
  { type: "function" as const, function: { name: "actualizar_paciente", description: "Actualiza los datos personales o médicos de un paciente", parameters: { type: "object", properties: { paciente_id: { type: "number" }, datos: { type: "object", description: "Campos a fusionar con el paciente (objeto JSON flexible; p.ej. email, telefono, notas).", properties: {} } }, required: ["paciente_id", "datos"] } } },
  { type: "function" as const, function: { name: "agendar_consulta", description: "Agenda una cita médica. Sigue este flujo estrictamente: (1) Captura: Fecha (acepta relativas: mañana, el lunes, próximo viernes), Hora, Motivo, Tipo de consulta. Opcional: si hay varias clínicas, usa listar_clinicas y pasa clinica_atencion_id según elección del usuario. (2) Tipo de consulta OBLIGATORIO: Antes de agendar llama a buscar_consultas (tipo 'paciente') para ese paciente. Si ya tiene consultas → solo 'seguimiento' o 'control'. Si no tiene consultas → solo 'primera_vez'. (3) Confirmación: Presenta un resumen (paciente, fecha, hora, motivo, tipo, clínica si aplica) y pregunta si confirma. (4) Ejecución: Solo cuando el usuario diga sí/confirmo, invoca esta herramienta con el tipo correcto y clinica_atencion_id si aplica.", parameters: { type: "object", properties: { paciente_id: { type: "number" }, paciente_nombre: { type: "string" }, fecha: { type: "string", description: "Expresión de tiempo del usuario tal cual (ej: 'mañana', '2026-03-15', 'este viernes'). Pasar el texto sin transformar; el backend resuelve la conversión. No pedir confirmación si el usuario ya mencionó un tiempo." }, hora: { type: "string" }, motivo: { type: "string" }, tipo_consulta: { type: "string", enum: ["primera_vez", "seguimiento", "control"], description: "primera_vez SOLO si el paciente no tiene consultas agendadas; si ya tiene, usar seguimiento o control." }, clinica_atencion_id: { type: "number", description: "ID de la clínica de atención. Obtener con listar_clinicas si hay varias y el usuario elige." } }, required: ["fecha", "hora", "motivo", "tipo_consulta"] } } },
  { type: "function" as const, function: { name: "listar_clinicas", description: "Lista las clínicas de atención disponibles (tabla clinica_atencion_pacientes). Usar antes de agendar cuando el usuario no haya dicho en qué clínica o cuando quiera ver las opciones para elegir.", parameters: { type: "object", properties: { omitir: { type: "string", description: "No enviar; parámetro técnico. Llamar la herramienta sin argumentos o con objeto vacío." } } } } },
  { type: "function" as const, function: { name: "buscar_consultas", description: "Lista las consultas: 'hoy' = del día; 'proximos_dias' = próximos 2 días; 'paciente' = de un paciente (indica paciente_nombre o paciente_id). Puedes usar solo el nombre del paciente o la cédula, no hace falta el ID.", parameters: { type: "object", properties: { tipo: { type: "string", enum: ["hoy", "proximos_dias", "paciente"], description: "hoy, proximos_dias o paciente" }, paciente_id: { type: "number", description: "ID del paciente (opcional si envías paciente_nombre)" }, paciente_nombre: { type: "string", description: "Nombre completo o cédula del paciente para buscar sus consultas. Usar cuando el usuario diga el nombre (ej. Veronica Calderon) sin pedir el ID." } }, required: ["tipo"] } } },
  { type: "function" as const, function: { name: "listar_pacientes_activos", description: "Lista pacientes activos (flag activo) con al menos una consulta en consultas_pacientes con el médico de la sesión. Última consulta = fecha_pautada más reciente contigo (desempate: hora_pautada, fecha_creacion, id); el estado es estado_consulta de esa fila. Usar cuando pidan mis pacientes, pacientes activos, etc. Si el resultado incluye respuesta_chat, muéstrala al usuario sin cambios (lista con viñetas, fechas DD/MM/YYYY y hora 12 h AM/PM). No uses tablas markdown: la app no las renderiza bien.", parameters: { type: "object", properties: { limite: { type: "number", description: "Máximo de filas (1–500, por defecto 200)." } }, required: [] } } },
  { type: "function" as const, function: { name: "obtener_historial", description: "Obtiene el historial médico (controles) del paciente. Cada ítem en data incluye: fecha_consulta, motivo_consulta, diagnostico, plan, conclusiones, examenes_paraclinicos (exámenes de laboratorio/imagen u otros paraclínicos; puede venir con HTML), etc. Úsalo completo para el informe narrativo: no omitas examenes_paraclinicos si vienen con texto. Puedes indicar paciente_id o paciente_nombre. Si el resultado incluye historial_incompleto: true y mensaje_recordatorio, y el usuario quiere generar un informe: muestra solo el texto de mensaje_recordatorio y espera la respuesta. No pidas tipo ni contenido en el mismo mensaje. Si el usuario elige ir a la aplicación a completar la historia, usa open_section (path historia-medica). Si elige generar el informe con su contenido: entonces pide tipo y contenido, y añade esta línea: «El informe se generará con el texto que me indiques; no incluirá datos de la consulta reciente porque no están completos en la historia.»", parameters: { type: "object", properties: { paciente_id: { type: "number" }, paciente_nombre: { type: "string", description: "Nombre completo o cédula del paciente" }, limite: { type: "number", description: "Máximo de controles a devolver (por defecto 10, máx. 50)" } }, required: [] } } },
  { type: "function" as const, function: { name: "get_patient_data", description: "Obtiene los datos completos de un paciente (nombre, cédula, edad, sexo, email, teléfono). Necesario para redactar la introducción del informe narrativo.", parameters: { type: "object", properties: { paciente_id: { type: "number" }, paciente_nombre: { type: "string" } }, required: [] } } },
  { type: "function" as const, function: { name: "generar_informe", description: "Crea un informe médico. El contenido DEBE estar en prosa narrativa: párrafos con oraciones completas (ej. 'Paciente femenino de 30 años, identificada bajo la cédula X, quien acude a consulta el... En la consulta se establece el diagnóstico de... Se indica el plan de...'). Para generarlo debes haber llamado antes a get_patient_data y obtener_historial; con esos datos redactas el contenido, integrando en la narrativa los exámenes paraclínicos (campo examenes_paraclinicos de cada control del historial) cuando existan y no estén vacíos—en prosa o párrafo dedicado. NO incluyas el nombre del médico en el contenido. Si obtuviste un historial con historial_incompleto y mensaje_recordatorio: muestra solo ese recordatorio y espera. Si el usuario elige completar la historia, usa open_section. Si elige generar con su contenido, pide tipo y contenido y añade: «El informe se generará con el texto que me indiques; no incluirá datos de la consulta reciente porque no están completos en la historia.»", parameters: { type: "object", properties: { paciente_id: { type: "number" }, paciente_nombre: { type: "string", description: "Si no tienes paciente_id, indica el nombre del paciente" }, tipo_informe: { type: "string", description: "Ej: consulta, examen, general, control" }, contenido: { type: "string", description: "Texto del informe en prosa narrativa (HTML o texto), construido a partir de datos del paciente y del historial" }, observaciones: { type: "string" } }, required: ["tipo_informe", "contenido"] } } },
  { type: "function" as const, function: { name: "crear_recipe_medico", description: "Genera **dos PDF** (medicamentos + indicaciones). Requiere rol médico y consulta completada/finalizada con ese paciente. **Paciente:** SIEMPRE incluye \`paciente_nombre\` (nombre completo tal como lo dijo el médico) o \`paciente_id\` si lo tienes. **No digas que no existe el paciente** sin invocar antes \`buscar_paciente\` o esta herramienta: el sistema resuelve el nombre; si \`get_patient_data\` ya devolvió datos de alguien, usa el mismo nombre en \`paciente_nombre\`. **Pie de página:** «Pie de página — clínicas (máx. 2)»: con varias clínicas usa listar_clinicas y pies_clinica_ids; con una sola, el sistema asigna sola. Pide nombres_medicamentos y texto_indicaciones.", parameters: { type: "object", properties: { paciente_id: { type: "number" }, paciente_nombre: { type: "string" }, nombres_medicamentos: { type: "string", description: "Un medicamento por línea, solo nombre (p. ej. Acetaminofén\\nLoratadina). Es lo único que verá el PDF de medicamentos." }, texto_indicaciones: { type: "string", description: "Indicaciones completas para el paciente (segundo PDF)." }, texto_recipe: { type: "string", description: "Opcional: dosis y pauta en texto; no se incluye en el PDF de medicamentos." }, fecha_emision: { type: "string", description: "YYYY-MM-DD opcional" }, pies_clinica_ids: { type: "array", items: { type: "number" }, description: "1 o 2 IDs de clínica de atención para el pie del PDF. Obligatorio cuando el usuario ya eligió (o hay una sola clínica en el sistema, entonces puede omitirse). Máximo 2." } }, required: ["nombres_medicamentos", "texto_indicaciones"] } } },
  { type: "function" as const, function: { name: "open_section", description: "Abre en la aplicación la sección de antecedentes o historia médica del paciente. DEBES invocar esta herramienta en el mismo turno si el usuario pide ir a la app, ver/cargar historia, antecedentes o controles; solo entonces el cliente mostrará el botón «Abrir en la aplicación». PROHIBIDO decir que hay un botón debajo si no invocas open_section en esa respuesta.", parameters: { type: "object", properties: { paciente_id: { type: "number" }, paciente_nombre: { type: "string", description: "Nombre del paciente (ej. Sandra Romero) para antecedentes o historia" }, path: { type: "string", enum: ["antecedentes", "historia-medica", "historia-medica/nuevo"], description: "antecedentes = antecedentes médicos; historia-medica = controles; historia-medica/nuevo = nuevo control" } }, required: ["path"] } } },
];

const TOOL_USE_SYSTEM_PROMPT = `### ROL
Eres el Asistente Virtual de Gestión Médica (DemoMed). Profesional, directo y eficiente.

### REGLAS DE FECHAS
Acepta cualquier referencia temporal ("mañana", "el lunes", "el 20 de marzo") sin pedir 
formatos exactos. Pasa el texto tal cual al parámetro \`fecha\`.

### REGLAS DE HERRAMIENTAS
- Si preguntan por datos de un paciente, llama a \`get_patient_data\` antes de responder.
- Si piden listado de pacientes activos o «mis pacientes»: \`listar_pacientes_activos\`. Si la herramienta devuelve \`respuesta_chat\`, repítela tal cual (lista, AM/PM). No tablas markdown.
- Si piden historia médica, antecedentes, ir a la aplicación, «llévame», cargar controles o completar la historia: llama a \`open_section\` en ese mismo turno. No digas que aparece el botón «Abrir en la aplicación» si no llamas a \`open_section\`.
- **Informes narrativos:** con \`get_patient_data\` y \`obtener_historial\`; si el historial incluye \`examenes_paraclinicos\`, intégralos en el informe en prosa (no los omitas).
- Récipe PDF: pasa siempre **paciente_nombre** (o id) si el usuario nombró al paciente. No inventes que «no está en el sistema»; deja que la herramienta responda. **Pie — clínicas (máx. 2):** varias clínicas → \`listar_clinicas\` + **pies_clinica_ids**; una sola → no preguntar. Incluye nombres_medicamentos y texto_indicaciones. Consulta no completada → \`open_section\`. Éxito → **PDF medicamentos** e **indicaciones**.
- Tras ejecutar \`nuevo_paciente\` con éxito: confirma la creación y pregunta 
  «¿Deseas añadir antecedentes o agendar una consulta para [nombre]?». 
  Espera la respuesta; no invoques otras herramientas hasta que el usuario confirme.

### CONTEXTO
Hoy es sábado 14 de marzo de 2026.`;

const DIAS_SEMANA = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
/** Devuelve el prompt del sistema con la fecha actual en CONTEXTO (para fechas relativas tipo "mañana"). */
function getToolUseSystemPrompt(): string {
  const d = new Date();
  const dia = DIAS_SEMANA[d.getDay()];
  const fecha = `${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
  const hoyLinea = `Hoy es ${dia} ${fecha}.`;
  return TOOL_USE_SYSTEM_PROMPT.replace(/Hoy es [^.]+\.[\s]*$/, hoyLinea);
}

const SYSTEM_PROMPT = `Eres el asistente de DemoMed, un sistema de gestión clínica. Ayudas al médico a:

1) Crear un nuevo paciente (datos personales: nombres, apellidos, cédula, edad, sexo, email, teléfono). Cédula solo en formato: V12345678, E1234567, J12345678, P12345678, G12345678; si no cumple, pide corrección con esos ejemplos. OBLIGATORIO: Tras ejecutar create_patient y confirmar que se creó, DEBES preguntar siempre: «¿Deseas añadir antecedentes o agendar una consulta para [nombre del paciente]?». No termines solo con "Paciente creado correctamente"; incluye esa pregunta. No invoques open_section ni schedule_consultation hasta que el usuario responda (ej. "sí, antecedentes", "agendar", "no"); espera su respuesta.
2) Agendar una consulta (paciente, fecha, hora, motivo, tipo_consulta). REGLAS DE FECHAS: Si el usuario dice "mañana", "pasado mañana", "próximo lunes", "el viernes", etc., acéptalo y pasa esa expresión tal cual en fecha_pautada; el sistema la convierte. PROHIBIDO pedir "la fecha exacta" cuando ya dio una referencia temporal. TIPO DE CONSULTA: Antes de agendar, llama a get_consultations con tipo "paciente" para ese paciente. Si el paciente ya tiene consultas agendadas → tipo_consulta debe ser solo "seguimiento" o "control" (nunca "primera_vez"). Si no tiene consultas previas → tipo_consulta debe ser solo "primera_vez". Antes de escribir __ACTION__ schedule_consultation: muestra resumen (paciente, fecha, hora, motivo, tipo) y pregunta "¿Confirmas que agendo con estos datos?". Solo cuando confirme (sí, confirmo, ok) escribe la acción.
3) Generar un informe médico (paciente, médico, tipo y contenido breve). Si la historia puede no tener diagnóstico/plan completados, di: lo más adecuado para un informe completo es completar primero la historia en la aplicación (allí puede elegir antecedentes y controles); luego pregunta: «¿Quieres que te lleve a la aplicación para completar la historia, o prefieres generar igual el informe solo con el texto que me indiques (el informe contendrá ese contenido, sin diagnóstico/plan de la consulta reciente)?» Espera la respuesta. Si elige completar, usa open_section. Si elige generar con su contenido, entonces pide tipo y contenido y añade que el informe no incluirá datos de la consulta reciente porque no están completos.
4) Gestionar la historia médica del paciente: abrir la lista de controles, crear un nuevo control o editar un control existente. Cuando el médico pida "nuevo control", "añadir control", "historia de [paciente]" o "ver/editar controles", usa open_section para llevarle a la pantalla correspondiente.
5) Gestionar antecedentes del paciente: cuando pida "añadir antecedentes", "editar antecedentes" o "antecedentes de [paciente]", usa open_section para llevarle a la sección de antecedentes del paciente. Los antecedentes se gestionan mejor en la pantalla dedicada que en el chat.
6) Mostrar datos de un paciente: cuando pidan "datos de [nombre]", "información del paciente [nombre]", "dame los datos de [nombre]" o "¿quién es [nombre]?", DEBES escribir en esa misma respuesta la acción get_patient_data. No respondas solo con "estoy buscando" o "un momento": escribe siempre la línea __ACTION__get_patient_data__{"paciente_nombre":"Nombre"}__ para que el sistema devuelva los datos al usuario.
7) Mostrar consultas agendadas: cuando pidan "consultas de hoy", "consultas pendientes para hoy", "todas las consultas de hoy", "agenda del día" o "¿cuáles son mis consultas de hoy?", usa get_consultations con tipo "hoy" (muestra TODAS las del médico logueado, sin pedir paciente). NUNCA pidas el nombre del paciente para mostrar las consultas de hoy. Cuando pidan "mis consultas para los próximos dos días" o "consultas para los próximos 2 días", usa get_consultations con tipo "proximos_dias". Cuando pidan "consultas de [paciente]" o "citas de [paciente]" (con nombre concreto), usa get_consultations con tipo "paciente". IMPORTANTE: "agendar (una) consulta para [paciente]" es para CREAR una cita nueva (schedule_consultation), NO para listar.
8) Listado de pacientes activos del médico: cuando pidan "mis pacientes activos", "listado de pacientes", "pacientes con última consulta", etc., escribe __ACTION__list_active_patients__{"limite":200}__ (ajusta limite si piden un tope). La respuesta incluye por paciente la última consulta contigo según fecha_pautada más reciente y el estado_consulta de esa fila; muéstralo en tabla.
9) Récipe médico en PDF: pie de página con **1 o 2 clínicas de atención** (pies_clinica_ids). Si hay varias clínicas, lista opciones (IDs) y pregunta al médico antes de la acción. JSON ejemplo: __ACTION__create_medical_recipe__{"paciente_nombre":"...","nombres_medicamentos":"Acetaminofén\\nIbuprofeno","texto_indicaciones":"...","pies_clinica_ids":[2,5]}__. Requiere consulta completada/finalizada contigo; si falla, explica y ofrece open_section.

Reglas:
- Responde siempre en español, de forma breve y clara.
- Tras crear un paciente (create_patient): en la frase que confirma la creación, añade siempre la pregunta «¿Deseas añadir antecedentes o agendar una consulta para [nombre]?». No escribas __ACTION__ open_section ni __ACTION__ schedule_consultation hasta que el usuario responda (ej. "sí, antecedentes", "agendar consulta", "no"). No asumas la respuesta; espera al usuario.
- Para get_patient_data y get_consultations: SIEMPRE incluye la línea __ACTION__ en la misma respuesta cuando tengas el nombre o el tipo. El usuario verá el resultado solo si escribes la acción; si solo dices "estoy buscando", no pasará nada.
- Extrae datos del mensaje del usuario (nombres, cédula, paciente, etc.) cuando los mencione.
- Si falta algún dato obligatorio, pide solo ese dato (uno o dos a la vez).
- Para antecedentes e historia médica/controles: NO pidas los datos en el chat. Identifica al paciente (nombre o ID) y ejecuta open_section para que el médico use el formulario completo en la aplicación.
- Cuando tengas TODOS los datos necesarios para ejecutar una acción, escribe en una sola línea exactamente:
  __ACTION__nombre_accion__{"campo":"valor",...}__
  Sustituye por JSON válido (comillas dobles, sin comas finales). En la línea siguiente escribe una frase breve (el sistema sustituirá el resultado por los datos reales).

Acciones y sus datos (ejemplos de JSON válido):
- create_patient: {"nombres":"Juan","apellidos":"Pérez","cedula":"","edad":30,"sexo":"Masculino","email":"j@e.com","telefono":"","remitido_por":""}
- schedule_consultation: paciente_nombre, fecha_pautada (puede ser "mañana", "próximo lunes" o YYYY-MM-DD), hora_pautada, motivo_consulta, tipo_consulta. tipo_consulta: "primera_vez" SOLO si el paciente no tiene consultas (usa get_consultations tipo "paciente" antes); si ya tiene consultas usa "seguimiento" o "control". Ejemplo sin consultas previas: {"paciente_nombre":"Laura Branigan","fecha_pautada":"mañana","hora_pautada":"10:00","motivo_consulta":"Revisión general","tipo_consulta":"primera_vez"}
- generate_report: {"paciente_id":1,"medico_id":1,"titulo":"Informe","tipo_informe":"general","contenido":"...","observaciones":""}
- open_section: para antecedentes de un paciente por nombre: {"paciente_nombre":"Laura Branigan","path":"antecedentes"}
  Para historia médica: {"paciente_nombre":"Laura Branigan","path":"historia-medica"}
  Para nuevo control: {"paciente_nombre":"Nombre","path":"historia-medica/nuevo"}
  path puede ser: "antecedentes", "historia-medica", "historia-medica/nuevo" o "historia-medica/123" (editar control 123). Siempre incluye paciente_nombre si no tienes paciente_id numérico.
- get_patient_data: {"paciente_nombre":"Nombre Completo"} o {"paciente_id":123}. Para mostrar en el chat los datos del paciente (nombre, cédula, email, teléfono, etc.).
- get_consultations: para hoy (todas las del médico, sin paciente): {"tipo":"hoy"}. Para próximos 2 días: {"tipo":"proximos_dias"}. Para consultas de un paciente concreto: {"tipo":"paciente","paciente_nombre":"Nombre"} o {"tipo":"paciente","paciente_id":123}. Si piden "consultas pendientes para hoy" o "todas las de hoy", responde SIEMPRE con {"tipo":"hoy"}.
- list_active_patients: {"limite":200} opcional. Pacientes activos con al menos una consulta contigo; última consulta = fecha_pautada más reciente; incluye estado de esa consulta.
- create_medical_recipe: {"paciente_nombre":"Nombre","nombres_medicamentos":"Acetaminofén\\nLoratadina","texto_indicaciones":"..."} (nombres: una línea por medicamento, solo nombre). Requiere consulta completada/finalizada contigo.

No inventes IDs. Escribe siempre JSON válido entre las dos __ (sin texto literal como "JSON_CON_LOS_DATOS").
Solo escribe __ACTION__ cuando tengas los datos. Si falta algo, pide el dato sin escribir __ACTION__.`;

function parseContent(content: string): { reply: string; action?: string; actionData?: string } {
  const match = content.match(ACTION_REGEX);
  let reply = content.trim();
  let action: string | undefined;
  let actionData: string | undefined;
  if (match) {
    action = match[1];
    actionData = match[2].trim();
    reply = content.replace(ACTION_REGEX, "").trim();
  }
  return { reply, action, actionData };
}

/** Log cuerpo de error del proveedor (diagnóstico en PM2 / consola). No exponer al cliente. */
async function logAiHttpError(tag: string, res: Response, extra?: string): Promise<void> {
  let body = "";
  try {
    body = (await res.text()).slice(0, 4000);
  } catch {
    body = "(no se pudo leer el cuerpo)";
  }
  const hint = extra ? ` ${extra}` : "";
  if (typeof console !== "undefined" && console.error) {
    console.error(`[chatbot-ai] ${tag} HTTP ${res.status}${hint}: ${body}`);
  }
}

/** OpenAI Chat Completions */
async function chatOpenAI(messages: ChatMessage[]): Promise<{ reply: string; action?: string; actionData?: string }> {
  const body = {
    model: OPENAI_CHAT_MODEL,
    messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
    temperature: 0.4,
    max_tokens: 800,
  };
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    await logAiHttpError("openai-chat", res);
    return { reply: "No pude conectar con el asistente. Inténtalo de nuevo en un momento." };
  }
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content?.trim() ?? "";
  return parseContent(content);
}

/** Anthropic Claude Messages API */
async function chatClaude(messages: ChatMessage[]): Promise<{ reply: string; action?: string; actionData?: string }> {
  const system = messages.find((m) => m.role === "system")?.content ?? SYSTEM_PROMPT;
  const apiMessages = messages.filter((m) => m.role !== "system").map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));
  const body = {
    model: ANTHROPIC_CHAT_MODEL,
    max_tokens: 800,
    system: system,
    messages: apiMessages,
  };
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    await logAiHttpError("claude-chat", res);
    return { reply: "No pude conectar con el asistente. Inténtalo de nuevo en un momento." };
  }
  const data = await res.json();
  const part = data?.content?.find((p: { type: string }) => p.type === "text");
  const content = (part?.text ?? "").trim();
  return parseContent(content);
}

/** Google Gemini generateContent (Google AI) */
async function chatGemini(messages: ChatMessage[]): Promise<{ reply: string; action?: string; actionData?: string }> {
  const systemPart = messages.find((m) => m.role === "system")?.content ?? SYSTEM_PROMPT;
  const chatMessages = messages.filter((m) => m.role !== "system");
  const contents = chatMessages.map((m) => ({
    role: m.role === "user" ? "user" : "model",
    parts: [{ text: m.content }],
  }));
  const body = {
    systemInstruction: { parts: [{ text: systemPart }] },
    contents: contents,
    generationConfig: {
      temperature: 0.4,
      maxOutputTokens: 800,
    },
  };
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_CHAT_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    await logAiHttpError("gemini-chat", res);
    return { reply: "No pude conectar con el asistente. Inténtalo de nuevo en un momento." };
  }
  const data = await res.json();
  const textPart = data?.candidates?.[0]?.content?.parts?.[0];
  const content = (textPart?.text ?? "").trim();
  return parseContent(content);
}

/** Loop Tool Use para OpenAI. */
async function chatWithToolsOpenAI(messages: ChatMessage[], executeTool: (name: string, args: Record<string, unknown>) => Promise<unknown>): Promise<{ reply: string; navigateTo?: string }> {
  type OpenAIMsg = { role: string; content: string | null; tool_calls?: Array<{ id: string; type: string; function: { name: string; arguments: string } }> };
  type ToolMsg = { role: "tool"; tool_call_id: string; content: string };
  let apiMessages: OpenAIMsg[] = [{ role: "system", content: getToolUseSystemPrompt() }, ...messages.map((m) => ({ role: m.role, content: m.content }))];
  const maxRounds = 8;
  for (let round = 0; round < maxRounds; round++) {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: JSON.stringify({ model: OPENAI_CHAT_MODEL, messages: apiMessages, temperature: 0.4, max_tokens: 800, tools: CHAT_TOOLS }),
    });
    if (!res.ok) {
      await logAiHttpError("openai-tools", res, `round=${round}`);
      return { reply: "No pude conectar con el asistente. Inténtalo de nuevo." };
    }
    const data = await res.json();
    const choice = data?.choices?.[0];
    const finishReason = choice?.finish_reason ?? "";
    const msg = choice?.message ?? {};
    const toolCalls = msg.tool_calls;
    if (finishReason !== "tool_calls" || !Array.isArray(toolCalls) || toolCalls.length === 0) {
      return { reply: ((msg.content ?? "").trim()) || "No pude generar una respuesta." };
    }
    apiMessages.push({ role: "assistant", content: msg.content ?? null, tool_calls: toolCalls });
    for (const tc of toolCalls) {
      const name = tc.function?.name ?? "";
      let args: Record<string, unknown> = {};
      try { if (tc.function?.arguments) args = JSON.parse(tc.function.arguments); } catch { args = {}; }
      const result = await executeTool(name, args);
      const nav = result && typeof result === "object" && "navigateTo" in result ? String((result as { navigateTo?: string }).navigateTo ?? "") : "";
      const toolMessage = result && typeof result === "object" && "message" in result ? String((result as { message?: string }).message ?? "").trim() : "";
      const respuestaChat = result && typeof result === "object" ? String((result as { respuesta_chat?: string }).respuesta_chat ?? "").trim() : "";
      if (nav) return { reply: toolMessage || (msg.content ?? "").trim() || "Listo.", navigateTo: nav };
      if (respuestaChat) return { reply: respuestaChat };
      apiMessages.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(result) } as unknown as OpenAIMsg);
    }
  }
  return { reply: "Se alcanzó el límite de pasos. Inténtalo de nuevo." };
}

/** Loop Tool Use para Anthropic Claude. `null` = error HTTP al proveedor (el caller puede hacer fallback sin tools). */
async function chatWithToolsClaude(messages: ChatMessage[], executeTool: (name: string, args: Record<string, unknown>) => Promise<unknown>): Promise<{ reply: string; navigateTo?: string } | null> {
  const toolsClaude = CHAT_TOOLS.map((t) => ({ name: t.function.name, description: t.function.description, input_schema: t.function.parameters }));
  type ClaudeMsg = { role: "user" | "assistant"; content: string | Array<{ type: string; text?: string; id?: string; name?: string; input?: unknown }> };
  let apiMessages: ClaudeMsg[] = messages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
  const maxRounds = 8;
  /** max_tokens más alto: tool_use + varios bloques consumen más que solo texto. */
  const maxTokensTools = 4096;
  for (let round = 0; round < maxRounds; round++) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: ANTHROPIC_CHAT_MODEL,
        max_tokens: maxTokensTools,
        system: getToolUseSystemPrompt(),
        messages: apiMessages,
        tools: toolsClaude,
        tool_choice: { type: "auto" },
      }),
    });
    if (!res.ok) {
      await logAiHttpError("claude-tools", res, `round=${round} model=${ANTHROPIC_CHAT_MODEL}`);
      return null;
    }
    const data = await res.json();
    const content = data?.content ?? [];
    const toolUseBlocks = content.filter((p: { type: string }) => p.type === "tool_use");
    const textBlock = content.find((p: { type: string }) => p.type === "text");
    const text = (textBlock?.text ?? "").trim();
    if (!Array.isArray(toolUseBlocks) || toolUseBlocks.length === 0) return { reply: text || "No pude generar una respuesta." };
    apiMessages.push({ role: "assistant", content: content });
    const toolResults: Array<{ type: "tool_result"; tool_use_id: string; content: string }> = [];
    for (const block of toolUseBlocks) {
      const name = block.name ?? "";
      const result = await executeTool(name, (block.input ?? {}) as Record<string, unknown>);
      const nav = result && typeof result === "object" && "navigateTo" in result ? String((result as { navigateTo?: string }).navigateTo ?? "") : "";
      const toolMessage = result && typeof result === "object" && "message" in result ? String((result as { message?: string }).message ?? "").trim() : "";
      const respuestaChat = result && typeof result === "object" ? String((result as { respuesta_chat?: string }).respuesta_chat ?? "").trim() : "";
      toolResults.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(result) });
      if (nav) return { reply: toolMessage || text || "Listo.", navigateTo: nav };
      if (respuestaChat) return { reply: respuestaChat };
    }
    apiMessages.push({ role: "user", content: toolResults });
  }
  return { reply: "Se alcanzó el límite de pasos. Inténtalo de nuevo." };
}

/** Loop Tool Use para Google Gemini. `null` = error HTTP (p. ej. 403 región/billing); caller puede usar chat sin tools. */
async function chatWithToolsGemini(messages: ChatMessage[], executeTool: (name: string, args: Record<string, unknown>) => Promise<unknown>): Promise<{ reply: string; navigateTo?: string } | null> {
  const decls = CHAT_TOOLS.map((t) => ({ name: t.function.name, description: t.function.description, parameters: t.function.parameters }));
  const history = messages.map((m) => ({ role: m.role === "user" ? "user" : "model", parts: [{ text: m.content }] }));
  const maxRounds = 8;
  for (let round = 0; round < maxRounds; round++) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_CHAT_MODEL}:generateContent?key=${GEMINI_API_KEY}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [...history], systemInstruction: { parts: [{ text: getToolUseSystemPrompt() }] }, tools: [{ functionDeclarations: decls }], generationConfig: { temperature: 0.4, maxOutputTokens: 800 } }),
    });
    if (!res.ok) {
      await logAiHttpError("gemini-tools", res, `round=${round}`);
      return null;
    }
    const data = await res.json();
    const parts = data?.candidates?.[0]?.content?.parts ?? [];
    const fnCall = parts.find((p: { functionCall?: unknown }) => p.functionCall);
    const textPart = parts.find((p: { text?: string }) => p.text);
    const text = (textPart?.text ?? "").trim();
    if (!fnCall?.functionCall) return { reply: text || "No pude generar una respuesta." };
    const name = fnCall.functionCall.name ?? "";
    const args = (fnCall.functionCall.args ?? {}) as Record<string, unknown>;
    const result = await executeTool(name, args);
    const nav = result && typeof result === "object" && "navigateTo" in result ? String((result as { navigateTo?: string }).navigateTo ?? "") : "";
    const toolMessage = result && typeof result === "object" && "message" in result ? String((result as { message?: string }).message ?? "").trim() : "";
    const respuestaChat = result && typeof result === "object" ? String((result as { respuesta_chat?: string }).respuesta_chat ?? "").trim() : "";
    history.push({ role: "model", parts: [{ functionCall: { name: fnCall.functionCall.name, args: fnCall.functionCall.args } }] });
    history.push({ role: "user", parts: [{ functionResponse: { name: name, response: result } }] });
    if (nav) return { reply: toolMessage || text || "Listo.", navigateTo: nav };
    if (respuestaChat) return { reply: respuestaChat };
  }
  return { reply: "Se alcanzó el límite de pasos. Inténtalo de nuevo." };
}

export async function chat(
  messages: ChatMessage[],
  options?: ChatOptions
): Promise<{ reply: string; action?: string; actionData?: string; navigateTo?: string }> {
  const executeTool = options?.executeTool;
  if (executeTool) {
    if (AI_PROVIDER === "claude") {
      if (!ANTHROPIC_API_KEY) return { reply: "El asistente no está configurado. Contacta al administrador." };
      const toolReply = await chatWithToolsClaude(messages, executeTool);
      if (toolReply !== null) return toolReply;
      if (typeof console !== "undefined" && console.warn) {
        console.warn("[chatbot-ai] Claude tool-use rechazado por la API; usando chat sin tools (legacy). Revisa logs [chatbot-ai] claude-tools arriba.");
      }
      return chatClaude(messages);
    }
    if (AI_PROVIDER === "gemini") {
      if (!GEMINI_API_KEY) return { reply: "El asistente no está configurado. Contacta al administrador." };
      const gemTool = await chatWithToolsGemini(messages, executeTool);
      if (gemTool !== null) return gemTool;
      if (typeof console !== "undefined" && console.warn) {
        console.warn("[chatbot-ai] Gemini tool-use falló (p. ej. 403 región/IP o cuota); intentando chat sin tools. Si sigue fallando, usa AI_PROVIDER=claude o revisa la clave/proyecto Gemini.");
      }
      return chatGemini(messages);
    }
    if (!OPENAI_API_KEY) return { reply: "El asistente no está configurado. Contacta al administrador." };
    return chatWithToolsOpenAI(messages, executeTool);
  }
  if (AI_PROVIDER === "claude") {
    if (!ANTHROPIC_API_KEY) return { reply: "El asistente no está configurado. Contacta al administrador." };
    return chatClaude(messages);
  }
  if (AI_PROVIDER === "gemini") {
    if (!GEMINI_API_KEY) return { reply: "El asistente no está configurado. Contacta al administrador." };
    return chatGemini(messages);
  }
  if (!OPENAI_API_KEY) return { reply: "El asistente no está configurado. Contacta al administrador." };
  return chatOpenAI(messages);
}

/** Transcripción de audio con Gemini (audio understanding). */
async function speechToTextGemini(audioBase64: string, mimeType = "audio/webm"): Promise<string> {
  const body = {
    contents: [
      {
        parts: [
          { text: "Transcribe this audio to text. Use the same language as the speaker. Reply only with the transcription, no other text or commentary." },
          {
            inlineData: {
              mimeType: mimeType || "audio/webm",
              data: audioBase64,
            },
          },
        ],
      },
    ],
    generationConfig: {
      maxOutputTokens: 1024,
      temperature: 0,
    },
  };
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_CHAT_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) return "";
  const data = await res.json();
  const textPart = data?.candidates?.[0]?.content?.parts?.[0];
  return (textPart?.text ?? "").trim();
}

/** Convierte audio base64 a texto. Con Gemini usa su audio understanding; con OpenAI/Claude usa Whisper (requiere OPENAI_API_KEY). */
export async function speechToText(audioBase64: string, mimeType = "audio/webm"): Promise<string> {
  if (AI_PROVIDER === "gemini" && GEMINI_API_KEY) {
    return speechToTextGemini(audioBase64, mimeType);
  }
  if (!OPENAI_API_KEY) return "";
  const binary = Uint8Array.from(atob(audioBase64), (c) => c.charCodeAt(0));
  const form = new FormData();
  form.append("file", new Blob([binary], { type: mimeType }), "audio.webm");
  form.append("model", "whisper-1");
  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: form,
  });
  if (!res.ok) return "";
  const data = await res.json();
  return (data?.text ?? "").trim();
}
