import type { RadarFilters } from "@/components/radar/FiltersPanel";

export interface SimulationScenario {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  portfolioName: string;
  projectName: string;
  timeProjectionMonths: number;
  generateNewItems: boolean;
  filters: RadarFilters;
  summary: {
    totalSignals: number;
    closedCount: number;
    escalatedCount: number;
    newCount: number;
    highCount: number;
    mediumCount: number;
    lowCount: number;
    costExposure: number;
  };
}

function storageKey(orgId: number): string {
  return `pmo_radar_scenarios_org_${orgId}`;
}

function generateId(): string {
  return `scn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function loadScenarios(orgId: number): SimulationScenario[] {
  try {
    const raw = localStorage.getItem(storageKey(orgId));
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function saveScenario(orgId: number, scenario: Omit<SimulationScenario, "id" | "createdAt" | "updatedAt">): SimulationScenario {
  const scenarios = loadScenarios(orgId);
  const now = new Date().toISOString();
  const newScenario: SimulationScenario = {
    ...scenario,
    id: generateId(),
    createdAt: now,
    updatedAt: now,
  };
  scenarios.unshift(newScenario);
  localStorage.setItem(storageKey(orgId), JSON.stringify(scenarios));
  return newScenario;
}

export function updateScenario(orgId: number, id: string, updates: Partial<Omit<SimulationScenario, "id" | "createdAt">>): SimulationScenario | null {
  const scenarios = loadScenarios(orgId);
  const idx = scenarios.findIndex(s => s.id === id);
  if (idx === -1) return null;
  scenarios[idx] = {
    ...scenarios[idx],
    ...updates,
    updatedAt: new Date().toISOString(),
  };
  localStorage.setItem(storageKey(orgId), JSON.stringify(scenarios));
  return scenarios[idx];
}

export function deleteScenario(orgId: number, id: string): boolean {
  const scenarios = loadScenarios(orgId);
  const filtered = scenarios.filter(s => s.id !== id);
  if (filtered.length === scenarios.length) return false;
  localStorage.setItem(storageKey(orgId), JSON.stringify(filtered));
  return true;
}
