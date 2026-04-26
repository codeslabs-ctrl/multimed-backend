/**
 * Métricas para comparar eficiencia de estrategias del chatbot:
 * - tool_calling: USE_TOOL_CALLING=true (modelo usa tool/function calling nativo)
 * - legacy: USE_TOOL_CALLING=false (modelo devuelve __ACTION__ + JSON, servidor traduce a tools)
 * - confirmacion: respuesta directa de confirmación de agendar (sin llamar al modelo)
 */

export type Strategy = "tool_calling" | "legacy" | "confirmacion";

export interface MetricEntry {
  strategy: Strategy;
  durationMs: number;
  success: boolean;
  toolInvoked: boolean;
  timestamp: number;
}

const MAX_ENTRIES = 500;
const store: MetricEntry[] = [];

export function record(entry: Omit<MetricEntry, "timestamp">): void {
  store.push({
    ...entry,
    timestamp: Date.now(),
  });
  if (store.length > MAX_ENTRIES) store.shift();
}

export function getRecent(limit = 50): MetricEntry[] {
  return store.slice(-limit).reverse();
}

export function getStats(): {
  byStrategy: Record<Strategy, { count: number; avgDurationMs: number; successCount: number; toolInvokedCount: number }>;
  total: number;
} {
  const byStrategy: Record<Strategy, { count: number; sumDuration: number; successCount: number; toolInvokedCount: number }> = {
    tool_calling: { count: 0, sumDuration: 0, successCount: 0, toolInvokedCount: 0 },
    legacy: { count: 0, sumDuration: 0, successCount: 0, toolInvokedCount: 0 },
    confirmacion: { count: 0, sumDuration: 0, successCount: 0, toolInvokedCount: 0 },
  };
  for (const e of store) {
    byStrategy[e.strategy].count += 1;
    byStrategy[e.strategy].sumDuration += e.durationMs;
    if (e.success) byStrategy[e.strategy].successCount += 1;
    if (e.toolInvoked) byStrategy[e.strategy].toolInvokedCount += 1;
  }
  const result: {
    byStrategy: Record<Strategy, { count: number; avgDurationMs: number; successCount: number; toolInvokedCount: number }>;
    total: number;
  } = {
    byStrategy: {} as Record<Strategy, { count: number; avgDurationMs: number; successCount: number; toolInvokedCount: number }>,
    total: store.length,
  };
  for (const s of ["tool_calling", "legacy", "confirmacion"] as Strategy[]) {
    const x = byStrategy[s];
    result.byStrategy[s] = {
      count: x.count,
      avgDurationMs: x.count ? Math.round(x.sumDuration / x.count) : 0,
      successCount: x.successCount,
      toolInvokedCount: x.toolInvokedCount,
    };
  }
  return result;
}
