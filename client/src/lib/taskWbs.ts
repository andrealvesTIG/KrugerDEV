import type { Task } from "@shared/schema";

export function computeWbsValues(tasks: Task[]): Map<number, string> {
  const wbsMap = new Map<number, string>();
  if (!tasks || tasks.length === 0) return wbsMap;
  
  const levelCounters: number[] = [0, 0, 0, 0, 0, 0];
  let lastLevel = 0;
  
  for (const task of tasks) {
    const level = (task.outlineLevel || 1) - 1;
    
    if (level <= lastLevel) {
      for (let i = level + 1; i < levelCounters.length; i++) {
        levelCounters[i] = 0;
      }
    }
    
    levelCounters[level]++;
    
    for (let i = 0; i < level; i++) {
      if (levelCounters[i] === 0) {
        levelCounters[i] = 1;
      }
    }
    
    const wbsParts: number[] = [];
    for (let i = 0; i <= level; i++) {
      wbsParts.push(levelCounters[i]);
    }
    
    wbsMap.set(task.id, wbsParts.join('.'));
    lastLevel = level;
  }
  
  return wbsMap;
}
