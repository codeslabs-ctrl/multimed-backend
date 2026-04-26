/** Carga variables desde .env si existe (primero en carpeta del script chatbot/, luego cwd) */
export function loadEnv(): void {
  let scriptDir = new URL(".", import.meta.url).pathname.replace(/\/$/, "");
  if (/^\/[A-Za-z]:/.test(scriptDir)) scriptDir = scriptDir.slice(1);
  const envPaths = [
    `${scriptDir}/.env`,
    `${Deno.cwd()}/.env`,
    `${Deno.cwd()}/chatbot/.env`,
  ];
  let content: string | null = null;
  for (const envPath of envPaths) {
    try {
      content = Deno.readTextFileSync(envPath);
      break;
    } catch {
      // siguiente ruta
    }
  }
  if (content) {
    try {
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith("#")) {
          const eq = trimmed.indexOf("=");
          if (eq > 0) {
            const key = trimmed.slice(0, eq).trim();
            const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
            if (!Deno.env.get(key)) Deno.env.set(key, value);
          }
        }
      }
    } catch {
      // ignorar
    }
  }
}

// Cargar .env en cuanto se importe este módulo (antes de leer las variables)
loadEnv();

export const PORT = parseInt(Deno.env.get("PORT") ?? "3999", 10);
export const BACKEND_URL = (Deno.env.get("BACKEND_URL") ?? "http://127.0.0.1:3001/api/v1").replace(/\/$/, "");

// Proveedor de IA: openai | claude | gemini
export const AI_PROVIDER = (Deno.env.get("AI_PROVIDER") ?? "openai").toLowerCase();

// OpenAI (chat + Whisper para audio)
export const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";
export const OPENAI_CHAT_MODEL = Deno.env.get("OPENAI_CHAT_MODEL") ?? "gpt-4o-mini";

// Anthropic Claude
export const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
export const ANTHROPIC_CHAT_MODEL = Deno.env.get("ANTHROPIC_CHAT_MODEL") ?? "claude-3-5-sonnet-20241022";

// Google Gemini
export const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
export const GEMINI_CHAT_MODEL = Deno.env.get("GEMINI_CHAT_MODEL") ?? "gemini-1.5-flash";

/** true = Tool Use (CHAT_TOOLS); false = flujo legacy __ACTION__ (SYSTEM_PROMPT). Default true. */
export const USE_TOOL_CALLING = (Deno.env.get("USE_TOOL_CALLING") ?? "true").toLowerCase() === "true";
