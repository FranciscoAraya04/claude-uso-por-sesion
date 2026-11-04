export type BrakeTest = { pct: number; resetsAt: string }

export type SessionShare = { id: string; title: string; pct: number; cap?: number; paused?: boolean; bypass?: boolean }
export type HistoryBlock = { resetsAt: string; pct: number; weekly: number | null; top: { title: string; pct: number }[] }

export type Snapshot = {
  fiveHour: number
  resetsAt: string | null
  weekly: number | null
  weeklyResetsAt: string | null
  current: number
  sessions: SessionShare[]
}

declare module 'claude-code' {
  interface PluginState {
    'uso-por-sesion': { snapshot: Snapshot | null; isOpen: boolean; isMin: boolean; nowMs: number; test: BrakeTest | null; resumeAt: number; isBraked: boolean; stoppedBy: string; warnedFor: string; selected: string; histRange: string; histSession: string; cfgTab: string; armed: string; status: string }
  }
}
