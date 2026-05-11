import type { IStorage } from "./storage/types";
import * as userFns from "./storage/userStorage";
import * as orgFns from "./storage/organizationStorage";
import * as portfolioFns from "./storage/portfolioStorage";
import * as programFns from "./storage/programStorage";
import * as projectFns from "./storage/projectStorage";
import * as taskFns from "./storage/taskStorage";
import * as resourceFns from "./storage/resourceStorage";
import * as financialFns from "./storage/financialStorage";
import * as timesheetFns from "./storage/timesheetStorage";
import * as intakeFns from "./storage/intakeStorage";
import * as projectFormLayoutFns from "./storage/projectFormLayoutStorage";
import * as executiveSummaryFns from "./storage/executiveSummaryStorage";
import * as miscFns from "./storage/miscStorage";
export * from "./storage/crossProjectReferenceStorage";

export type { IStorage, IUserStorage, IOrganizationStorage, IPortfolioStorage, IProgramStorage, IProjectStorage, ITaskStorage, IResourceStorage, IFinancialStorage, ITimesheetStorage, IIntakeStorage, IMiscStorage } from "./storage/types";
export type { TaskDateFilterOptions } from "./storage/types";

export const storage: IStorage = {
  ...userFns,
  ...orgFns,
  ...portfolioFns,
  ...programFns,
  ...projectFns,
  ...taskFns,
  ...resourceFns,
  ...financialFns,
  ...timesheetFns,
  ...intakeFns,
  ...projectFormLayoutFns,
  ...executiveSummaryFns,
  ...miscFns,
};
