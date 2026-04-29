import { useState, useCallback, useEffect, createContext, useContext, type ReactNode } from "react";

interface JourneyStatus {
  tourCompleted: boolean;
  wizardCompleted: boolean;
  checklistProgress: Record<string, boolean>;
  dismissed: boolean;
}

const STORAGE_KEY = "friday-user-journey";
const UPDATE_EVENT = "friday-journey-update";

function getStoredStatus(): JourneyStatus {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        tourCompleted: !!parsed.tourCompleted,
        wizardCompleted: !!parsed.wizardCompleted,
        checklistProgress: parsed.checklistProgress || {},
        dismissed: !!parsed.dismissed,
      };
    }
  } catch {}
  return { tourCompleted: false, wizardCompleted: false, checklistProgress: {}, dismissed: false };
}

function saveStatus(status: JourneyStatus) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(status));
  } catch {}
}

function notifyUpdate() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(UPDATE_EVENT));
  }
}

const ALL_CHECKLIST_ITEMS = ["create_project", "add_task", "assign_member", "explore_dashboard", "meet_copilot"];

/**
 * Standalone tracker that can be called from anywhere (mutation hooks, etc.).
 * Idempotently marks a checklist item complete and notifies any mounted Provider.
 */
export function trackChecklistEvent(eventKey: string) {
  if (!ALL_CHECKLIST_ITEMS.includes(eventKey)) return;
  const current = getStoredStatus();
  if (current.checklistProgress[eventKey]) return;
  saveStatus({
    ...current,
    checklistProgress: { ...current.checklistProgress, [eventKey]: true },
  });
  notifyUpdate();
}

interface JourneyContextValue {
  status: JourneyStatus;
  trackChecklistEvent: (eventKey: string) => void;
  completeTour: () => void;
  completeWizard: () => void;
  dismiss: () => void;
  completedCount: number;
  totalCount: number;
  isChecklistComplete: boolean;
  shouldShowTour: boolean;
  shouldShowWizard: boolean;
  shouldShowChecklist: boolean;
}

const JourneyContext = createContext<JourneyContextValue | null>(null);

export function UserJourneyProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<JourneyStatus>(() => getStoredStatus());

  // Listen for external updates from the standalone tracker.
  useEffect(() => {
    const refresh = () => setStatus(getStoredStatus());
    window.addEventListener(UPDATE_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(UPDATE_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const updateStatus = useCallback((updates: Partial<JourneyStatus>) => {
    setStatus(prev => {
      const next = { ...prev, ...updates };
      saveStatus(next);
      return next;
    });
  }, []);

  const trackChecklistEventCb = useCallback((eventKey: string) => {
    trackChecklistEvent(eventKey);
    setStatus(getStoredStatus());
  }, []);

  const completeTour = useCallback(() => updateStatus({ tourCompleted: true }), [updateStatus]);
  const completeWizard = useCallback(() => updateStatus({ wizardCompleted: true }), [updateStatus]);
  const dismiss = useCallback(() => updateStatus({ dismissed: true }), [updateStatus]);

  const completedCount = ALL_CHECKLIST_ITEMS.filter(k => status.checklistProgress[k]).length;
  const isChecklistComplete = completedCount === ALL_CHECKLIST_ITEMS.length;

  const value: JourneyContextValue = {
    status,
    trackChecklistEvent: trackChecklistEventCb,
    completeTour,
    completeWizard,
    dismiss,
    completedCount,
    totalCount: ALL_CHECKLIST_ITEMS.length,
    isChecklistComplete,
    shouldShowTour: !status.tourCompleted && !status.dismissed,
    shouldShowWizard: status.tourCompleted && !status.wizardCompleted && !status.dismissed,
    shouldShowChecklist: !status.dismissed && !isChecklistComplete,
  };

  return <JourneyContext.Provider value={value}>{children}</JourneyContext.Provider>;
}

export function useUserJourney(): JourneyContextValue {
  const ctx = useContext(JourneyContext);
  if (!ctx) {
    return {
      status: getStoredStatus(),
      trackChecklistEvent: trackChecklistEvent,
      completeTour: () => {},
      completeWizard: () => {},
      dismiss: () => {},
      completedCount: 0,
      totalCount: ALL_CHECKLIST_ITEMS.length,
      isChecklistComplete: false,
      shouldShowTour: false,
      shouldShowWizard: false,
      shouldShowChecklist: false,
    };
  }
  return ctx;
}
