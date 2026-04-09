import { useState, useCallback, createContext, useContext, type ReactNode } from "react";

interface JourneyStatus {
  tourCompleted: boolean;
  wizardCompleted: boolean;
  checklistProgress: Record<string, boolean>;
  dismissed: boolean;
}

const STORAGE_KEY = "friday-user-journey";

function getStoredStatus(): JourneyStatus {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch {}
  return { tourCompleted: false, wizardCompleted: false, checklistProgress: {}, dismissed: false };
}

function saveStatus(status: JourneyStatus) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(status));
}

const ALL_CHECKLIST_ITEMS = ["create_project", "add_task", "assign_member", "use_ai", "explore_dashboard", "meet_copilot"];

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

  const updateStatus = useCallback((updates: Partial<JourneyStatus>) => {
    setStatus(prev => {
      const next = { ...prev, ...updates };
      saveStatus(next);
      return next;
    });
  }, []);

  const trackChecklistEvent = useCallback((eventKey: string) => {
    setStatus(prev => {
      if (prev.checklistProgress[eventKey]) return prev;
      const next = {
        ...prev,
        checklistProgress: { ...prev.checklistProgress, [eventKey]: true },
      };
      saveStatus(next);
      return next;
    });
  }, []);

  const completeTour = useCallback(() => updateStatus({ tourCompleted: true }), [updateStatus]);
  const completeWizard = useCallback(() => updateStatus({ wizardCompleted: true }), [updateStatus]);
  const dismiss = useCallback(() => updateStatus({ dismissed: true }), [updateStatus]);

  const completedCount = ALL_CHECKLIST_ITEMS.filter(k => status.checklistProgress[k]).length;
  const isChecklistComplete = completedCount === ALL_CHECKLIST_ITEMS.length;

  const value: JourneyContextValue = {
    status,
    trackChecklistEvent,
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
      trackChecklistEvent: () => {},
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
