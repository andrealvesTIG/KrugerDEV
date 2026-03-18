export interface QuizQuestion {
  id: string;
  scenario: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

export interface Lesson {
  id: string;
  title: string;
  description: string;
  videoTitle: string;
  videoDescription: string;
  keyConcepts: string[];
  questions: QuizQuestion[];
}

export interface TrainingModule {
  id: string;
  name: string;
  subtitle: string;
  certPrefix: string;
  lessons: Lesson[];
}

const STORAGE_PREFIX = "friday-training-";

let _currentUserId: string | null = null;

export function setTrainingUserId(userId: string | null) {
  _currentUserId = userId;
}

function getUserPrefix(): string {
  return _currentUserId ? `u-${_currentUserId}-` : "";
}

export function getModuleStorageKey(moduleId: string) {
  const up = getUserPrefix();
  if (moduleId === "schedule-management" && !up) return "friday-schedule-mgmt-progress";
  return `${up}${STORAGE_PREFIX}${moduleId}-progress`;
}

let _cachedModules: TrainingModule[] | null = null;

async function loadFallbackModules(): Promise<TrainingModule[]> {
  if (_cachedModules) return _cachedModules;
  const { allModules: modules } = await import("./trainingModulesData");
  _cachedModules = modules;
  return modules;
}

export { loadFallbackModules };

export function getModuleProgress(moduleId: string, modulesSource?: TrainingModule[]): {
  completed: number;
  total: number;
  percentage: number;
  started: boolean;
} {
  const source = modulesSource || _cachedModules || [];
  const mod = source.find((m) => m.id === moduleId);
  if (!mod) return { completed: 0, total: 0, percentage: 0, started: false };

  const key = getModuleStorageKey(moduleId);
  let progress: Record<string, boolean> = {};
  try {
    const stored = localStorage.getItem(key);
    progress = stored ? JSON.parse(stored) : {};
  } catch {}

  const completed = mod.lessons.filter((l) => progress[l.id]).length;
  const started = localStorage.getItem(key + "-started") === "true";
  return {
    completed,
    total: mod.lessons.length,
    percentage: Math.round((completed / mod.lessons.length) * 100),
    started: completed > 0 || started,
  };
}

export function getStoredModuleProgress(moduleId: string): Record<string, boolean> {
  try {
    const stored = localStorage.getItem(getModuleStorageKey(moduleId));
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

export function setStoredModuleProgress(moduleId: string, progress: Record<string, boolean>) {
  localStorage.setItem(getModuleStorageKey(moduleId), JSON.stringify(progress));
}

export function markModuleStarted(moduleId: string) {
  localStorage.setItem(getModuleStorageKey(moduleId) + "-started", "true");
}

function getQuizAttemptsKey(lessonId: string): string {
  return `${getUserPrefix()}friday-training-quiz-attempts-${lessonId}`;
}
const PASSING_GRADE = 0.8;
const MAX_ATTEMPTS = 3;
const COOLDOWN_MS = 24 * 60 * 60 * 1000;

export { PASSING_GRADE, MAX_ATTEMPTS, COOLDOWN_MS };

export interface QuizAttemptData {
  attempts: number;
  lastAttemptTime: number;
  passed: boolean;
}

export function getQuizAttempts(lessonId: string): QuizAttemptData {
  try {
    const stored = localStorage.getItem(getQuizAttemptsKey(lessonId));
    if (stored) return JSON.parse(stored);
  } catch {}
  return { attempts: 0, lastAttemptTime: 0, passed: false };
}

export function recordQuizAttempt(lessonId: string, passed: boolean): QuizAttemptData {
  const current = getQuizAttempts(lessonId);
  const updated = {
    attempts: current.attempts + 1,
    lastAttemptTime: Date.now(),
    passed,
  };
  localStorage.setItem(getQuizAttemptsKey(lessonId), JSON.stringify(updated));
  return updated;
}

export function resetQuizAttempts(lessonId: string) {
  localStorage.removeItem(getQuizAttemptsKey(lessonId));
}

export function canAttemptQuiz(lessonId: string): { allowed: boolean; reason?: string; cooldownEnds?: number } {
  const data = getQuizAttempts(lessonId);
  if (data.passed) return { allowed: true };
  if (data.attempts < MAX_ATTEMPTS) return { allowed: true };
  const elapsed = Date.now() - data.lastAttemptTime;
  if (elapsed >= COOLDOWN_MS) {
    resetQuizAttempts(lessonId);
    return { allowed: true };
  }
  const cooldownEnds = data.lastAttemptTime + COOLDOWN_MS;
  return { allowed: false, reason: "cooldown", cooldownEnds };
}

export function getCompletedModules(modulesSource?: TrainingModule[]): string[] {
  const source = modulesSource || _cachedModules || [];
  return source.filter((mod) => {
    const progress = getModuleProgress(mod.id, modulesSource);
    return progress.percentage === 100;
  }).map((mod) => mod.id);
}

export function getTrainingBadges(modulesSource?: TrainingModule[]): Array<{
  moduleId: string;
  moduleName: string;
  certPrefix: string;
  earned: boolean;
}> {
  const source = modulesSource || _cachedModules || [];
  const completed = getCompletedModules(modulesSource);
  return source.map((mod) => ({
    moduleId: mod.id,
    moduleName: mod.name,
    certPrefix: mod.certPrefix,
    earned: completed.includes(mod.id),
  }));
}

export function getModuleById(id: string, modulesSource?: TrainingModule[]): TrainingModule | undefined {
  const source = modulesSource || _cachedModules || [];
  return source.find((m) => m.id === id);
}

export async function fetchModulesFromAPI(): Promise<TrainingModule[] | null> {
  try {
    const res = await fetch('/api/training/modules', { credentials: 'include' });
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) return null;
    return data as TrainingModule[];
  } catch {
    return null;
  }
}

export let allModules: TrainingModule[] = [];

export async function initializeTrainingModules(): Promise<TrainingModule[]> {
  const apiModules = await fetchModulesFromAPI();
  if (apiModules) {
    allModules = apiModules;
    _cachedModules = apiModules;
    return apiModules;
  }
  const fallback = await loadFallbackModules();
  allModules = fallback;
  return fallback;
}
