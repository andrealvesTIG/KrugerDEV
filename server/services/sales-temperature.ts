export type SalesTemperature = 'cold' | 'warm' | 'hot';

export interface TemperatureInputs {
  daysActiveLast7: number;
  projectsCreated: number;
  tasksCreated: number;
  totalEvents: number;
}

export function computeSalesTemperature(i: TemperatureInputs): SalesTemperature {
  if (i.daysActiveLast7 >= 3 && i.projectsCreated >= 1 && i.tasksCreated >= 5) return 'hot';
  if (i.projectsCreated >= 1 || i.totalEvents >= 20) return 'warm';
  return 'cold';
}

export function temperatureLabel(t: SalesTemperature): string {
  switch (t) {
    case 'hot': return 'Hot';
    case 'warm': return 'Warm';
    default: return 'Cold';
  }
}
