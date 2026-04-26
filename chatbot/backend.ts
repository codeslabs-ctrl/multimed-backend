import { BACKEND_URL } from "./env.ts";

const BASE = BACKEND_URL;

/** Lista clínicas de atención (tabla clinica_atencion_pacientes) para que el usuario elija dónde agendar. */
export async function getClinicasAtencion(
  token: string
): Promise<{ success: boolean; data?: { id: number; nombre_clinica: string }[]; error?: { message: string } }> {
  const res = await fetch(`${BASE}/clinica-atencion`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await res.json();
  if (!res.ok) return { success: false, error: { message: json?.error?.message || res.statusText } };
  const raw = json?.data ?? json;
  const list = Array.isArray(raw) ? raw : [];
  const data = list
    .filter((c: { id?: number }) => typeof c?.id === "number")
    .map((c: { id: number; nombre_clinica?: string }) => ({ id: c.id, nombre_clinica: c.nombre_clinica || "" }));
  return { success: true, data };
}

/** Obtiene el usuario actual (rol, medico_id, userId) usando el endpoint existente del backend. */
export async function getCurrentUser(
  token: string
): Promise<{ success: boolean; data?: { rol?: string; medico_id?: number; userId?: number }; error?: { message: string } }> {
  const res = await fetch(`${BASE}/auth/debug-user`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await res.json();
  if (!res.ok) return { success: false, error: { message: json?.error?.message || res.statusText } };
  const data = json?.data ?? {};
  return { success: true, data: { rol: data.role, medico_id: data.medico_id, userId: data.userId } };
}

export async function createPatient(
  token: string,
  data: {
    nombres: string;
    apellidos: string;
    cedula?: string;
    edad: number;
    sexo: string;
    email: string;
    telefono: string;
    remitido_por?: string;
    activo?: boolean;
  }
): Promise<{ success: boolean; data?: { id: number }; error?: { message: string } }> {
  const res = await fetch(`${BASE}/patients`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ ...data, activo: data.activo ?? true }),
  });
  const json = await res.json();
  if (!res.ok) return { success: false, error: { message: json?.error?.message || res.statusText } };
  return { success: true, data: json?.data };
}

export async function createConsulta(
  token: string,
  data: {
    paciente_id: number;
    medico_id: number;
    motivo_consulta: string;
    fecha_pautada: string;
    hora_pautada: string;
    tipo_consulta?: string;
    especialidad_id?: number;
    clinica_atencion_id?: number | null;
  }
): Promise<{ success: boolean; data?: { id: number }; error?: { message: string }; status?: number }> {
  const url = `${BASE}/consultas`;
  const body = { ...data, clinica_atencion_id: data.clinica_atencion_id ?? null };
  if (typeof console !== "undefined" && console.info) {
    console.info("[chatbot] createConsulta POST", url, "body:", JSON.stringify({ ...body, clinica_atencion_id: body.clinica_atencion_id }));
  }
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  let json: { success?: boolean; data?: unknown; error?: { message?: string } } = {};
  try {
    json = await res.json();
  } catch {
    if (typeof console !== "undefined" && console.error) {
      console.error("[chatbot] createConsulta respuesta no JSON, status:", res.status);
    }
    return { success: false, status: res.status, error: { message: `Respuesta inválida del servidor (${res.status})` } };
  }
  const msg = json?.error?.message || res.statusText;
  if (typeof console !== "undefined" && console.info) {
    console.info("[chatbot] createConsulta response status:", res.status, "ok:", res.ok, "json.success:", json?.success, "data?.id:", (json?.data as { id?: number })?.id, "error:", json?.error?.message ?? msg);
  }
  if (!res.ok) {
    return { success: false, status: res.status, error: { message: msg || `Error ${res.status}` } };
  }
  if (json.success === false) {
    return { success: false, status: res.status, error: { message: msg || "El servidor indicó que falló la creación" } };
  }
  const responseData = json?.data as { id?: number } | undefined;
  if (!responseData || typeof responseData.id !== "number") {
    if (typeof console !== "undefined" && console.error) {
      console.error("[chatbot] createConsulta el servidor no devolvió data.id. Respuesta:", JSON.stringify(json).slice(0, 300));
    }
    return { success: false, status: res.status, error: { message: "El servidor no devolvió el ID de la consulta creada. No se puede confirmar." } };
  }
  return { success: true, data: responseData as { id: number } };
}

export async function getPatients(token: string): Promise<{ success: boolean; data?: { id: number; nombres: string; apellidos: string }[] }> {
  const res = await fetch(`${BASE}/patients?limit=500`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await res.json();
  if (!res.ok) return { success: false };
  const raw = json?.data;
  const list = Array.isArray(raw) ? raw : raw?.data;
  return { success: true, data: list ?? [] };
}

/** Pacientes activos del médico en sesión con última consulta (fecha/hora/estado de esa fila en consultas_pacientes). */
export async function getMyActivePatientsLastConsulta(
  token: string,
  limit = 200
): Promise<{
  success: boolean;
  data?: { pacientes: Record<string, unknown>[]; criterio_ultima_consulta?: string };
  error?: { message: string };
}> {
  const lim = Math.min(Math.max(limit, 1), 500);
  const res = await fetch(`${BASE}/patients/mi-activos-ultima-consulta?limit=${lim}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  let json: { success?: boolean; data?: { pacientes?: unknown; criterio_ultima_consulta?: string }; error?: { message?: string } } = {};
  try {
    json = await res.json();
  } catch {
    return { success: false, error: { message: "Respuesta inválida del servidor" } };
  }
  if (!res.ok) {
    return { success: false, error: { message: json?.error?.message || res.statusText } };
  }
  const inner = json?.data;
  const pacientes = Array.isArray(inner?.pacientes) ? (inner.pacientes as Record<string, unknown>[]) : [];
  return {
    success: true,
    data: {
      pacientes,
      criterio_ultima_consulta: typeof inner?.criterio_ultima_consulta === "string" ? inner.criterio_ultima_consulta : undefined,
    },
  };
}

/** Busca pacientes por nombre o cédula (chatbot tool use). */
export async function searchPatients(
  token: string,
  query: string
): Promise<{ success: boolean; data?: Record<string, unknown>[] }> {
  const name = String(query ?? "").trim();
  if (!name) return { success: true, data: [] };
  const res = await fetch(`${BASE}/patients/search?name=${encodeURIComponent(name)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await res.json();
  if (!res.ok) return { success: false };
  const list = json?.data ?? [];
  return { success: true, data: Array.isArray(list) ? list : [] };
}

/** Actualiza datos de un paciente (chatbot tool use). */
export async function updatePatient(
  token: string,
  pacienteId: number,
  datos: Record<string, unknown>
): Promise<{ success: boolean; data?: unknown; error?: { message: string } }> {
  const res = await fetch(`${BASE}/patients/${pacienteId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(datos),
  });
  const json = await res.json();
  if (!res.ok) return { success: false, error: { message: json?.error?.message || res.statusText } };
  return { success: true, data: json?.data };
}

/** Historial médico de un paciente (chatbot tool use). */
export async function getHistoricoByPaciente(
  token: string,
  pacienteId: number,
  limite = 10
): Promise<{ success: boolean; data?: Record<string, unknown>[] }> {
  const res = await fetch(`${BASE}/historico/by-paciente/${pacienteId}?limit=${Math.min(limite, 50)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await res.json();
  if (!res.ok) return { success: false };
  const list = json?.data ?? [];
  const arr = Array.isArray(list) ? list : [];
  return { success: true, data: arr.slice(0, limite) };
}

export async function getPatientById(
  token: string,
  id: number
): Promise<{ success: boolean; data?: Record<string, unknown> }> {
  const res = await fetch(`${BASE}/patients/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await res.json();
  if (!res.ok) return { success: false };
  return { success: true, data: json?.data ?? null };
}

export async function getConsultasHoy(token: string): Promise<{ success: boolean; data?: Record<string, unknown>[] }> {
  const res = await fetch(`${BASE}/consultas/hoy`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await res.json();
  if (!res.ok) return { success: false };
  const list = json?.data ?? [];
  return { success: true, data: Array.isArray(list) ? list : [] };
}

/** Consultas del día del médico logueado (filtra por token). */
export async function getConsultasDelDia(token: string): Promise<{ success: boolean; data?: Record<string, unknown>[] }> {
  const res = await fetch(`${BASE}/consultas/del-dia`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await res.json();
  if (!res.ok) return { success: false };
  const list = json?.data ?? [];
  return { success: true, data: Array.isArray(list) ? list : [] };
}

/** Consultas en un rango de fechas (el backend filtra por médico si el usuario es médico). */
export async function getConsultasRango(
  token: string,
  fecha_desde: string,
  fecha_hasta: string
): Promise<{ success: boolean; data?: Record<string, unknown>[] }> {
  const url = `${BASE}/consultas?fecha_desde=${encodeURIComponent(fecha_desde)}&fecha_hasta=${encodeURIComponent(fecha_hasta)}&limit=50`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const json = await res.json();
  if (!res.ok) return { success: false };
  const list = json?.data ?? [];
  return { success: true, data: Array.isArray(list) ? list : [] };
}

export async function getConsultasByPaciente(
  token: string,
  pacienteId: number
): Promise<{ success: boolean; data?: Record<string, unknown>[] }> {
  const res = await fetch(`${BASE}/consultas/by-paciente/${pacienteId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await res.json();
  if (!res.ok) return { success: false };
  const list = json?.data ?? [];
  return { success: true, data: Array.isArray(list) ? list : [] };
}

export async function getMedicos(token: string): Promise<{ success: boolean; data?: { id: number; nombres: string; apellidos: string }[] }> {
  const res = await fetch(`${BASE}/medicos`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await res.json();
  if (!res.ok) return { success: false };
  const list = json?.data ?? [];
  return { success: true, data: Array.isArray(list) ? list : [] };
}

export async function createInforme(
  token: string,
  data: {
    titulo: string;
    tipo_informe: string;
    contenido: string;
    paciente_id: number;
    medico_id: number;
    creado_por?: number;
    fecha_emision?: string;
    observaciones?: string;
  }
): Promise<{ success: boolean; data?: { id: number }; error?: { message: string } }> {
  const body = {
    ...data,
    creado_por: data.creado_por ?? data.medico_id,
    fecha_emision: data.fecha_emision ?? new Date().toISOString().slice(0, 10),
  };
  const res = await fetch(`${BASE}/informes-medicos`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) return { success: false, error: { message: json?.error?.message || res.statusText } };
  return { success: true, data: json?.data ?? json };
}

/** POST /pdf/receta-medico — solo rol médico en el API. Devuelve el PDF como bytes. */
export async function postRecetaMedicoPdf(
  token: string,
  body: {
    tipo?: "recipe" | "indicaciones";
    contenido: string;
    paciente_id?: number | null;
    fecha_emision?: string | null;
    pies_clinica_ids?: number[];
  }
): Promise<{ success: boolean; buffer?: Uint8Array; error?: { message: string } }> {
  const res = await fetch(`${BASE}/pdf/receta-medico`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      tipo: body.tipo ?? "recipe",
      contenido: body.contenido,
      paciente_id: body.paciente_id ?? undefined,
      fecha_emision: body.fecha_emision ?? undefined,
      pies_clinica_ids: body.pies_clinica_ids,
    }),
  });
  const ct = (res.headers.get("content-type") || "").toLowerCase();
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const j = (await res.json()) as { message?: string; error?: { message?: string } };
      msg = j?.message || j?.error?.message || msg;
    } catch {
      /* cuerpo no JSON */
    }
    return { success: false, error: { message: msg || `Error ${res.status}` } };
  }
  if (ct.includes("application/pdf")) {
    const buf = new Uint8Array(await res.arrayBuffer());
    return { success: true, buffer: buf };
  }
  return { success: false, error: { message: "El servidor no devolvió un PDF" } };
}
