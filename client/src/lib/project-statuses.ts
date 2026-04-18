import { PROJECT_STATUSES } from "@shared/schema";

export const DEFAULT_PROJECT_STATUS_LIST: readonly string[] = [
  ...PROJECT_STATUSES,
  "Billing",
  "Closed",
];
