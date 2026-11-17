export type BrakeTest = { pct: number; resetsAt: string }

export type SessionShare = { id: string; title: string; pct: number; cap?: number; paused?: boolean; bypass?: boolean; stop?: 'pausa' | 'tope' | 'freno' | 'limite' | 'semanal'; until?: string; wstop?: boolean; wpct?: number; wcap?: number }
// Prompt programado: sale en su sesión a la hora `at` (ms), o, si es un seguimiento (`after`),
// cuando Claude termina de responder el prompt `after`.
export type Scheduled = { id: string; sid: string; text: string; type: 'next' | 'week' | 'time'; time?: string; at: number; after: string | null }
export type SchedUi = { mode: 'new' | 'edit' | 'follow'; sid: string; id?: string }
export type SchedDraft = { text: string; type: 'next' | 'week' | 'time'; time: string }
export type HistoryBlock = { resetsAt: string; pct: number; weekly: number | null; top: { title: string; pct: number }[] }

export type Snapshot = {
  fiveHour: number
  resetsAt: string | null
  weekly: number | null
  weeklyResetsAt: string | null
  current: number
  sessions: SessionShare[]
  // Uso semanal por sesión (para la vista semanal y el tope semanal).
  week?: SessionShare[]
  // Costo estimado de la semana en curso, en USD a precios de API.
  weekUsd?: number
}

declare module 'claude-code' {
  interface PluginState {
    'uso-por-sesion': { snapshot: Snapshot | null; isOpen: boolean; isMin: boolean; nowMs: number; test: BrakeTest | null; resumeAt: number; isBraked: boolean; stoppedBy: string; warnedFor: string; warnedWeek: string; capView: string; selected: string; histRange: string; histSession: string; histGroup: string; histWeek: number; weekCosts2: Record<string, number>; cfgTab: string; armed: string; status: string; schedUi: SchedUi | null; schedDraft: SchedDraft; schedErr: string; schedActive: string; schedRev: number }
  }
}
