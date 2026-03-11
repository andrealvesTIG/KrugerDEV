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

export function getModuleStorageKey(moduleId: string) {
  if (moduleId === "schedule-management") return "friday-schedule-mgmt-progress";
  return `${STORAGE_PREFIX}${moduleId}-progress`;
}

export function getModuleProgress(moduleId: string): {
  completed: number;
  total: number;
  percentage: number;
  started: boolean;
} {
  const mod = allModules.find((m) => m.id === moduleId);
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

const scheduleManagement: TrainingModule = {
  id: "schedule-management",
  name: "Schedule Management",
  subtitle: "Master the fundamentals of project schedule management",
  certPrefix: "SM",
  lessons: [
    {
      id: "intro",
      title: "Introduction to Schedule Management",
      description: "What it is, why it matters",
      videoTitle: "Introduction to Schedule Management",
      videoDescription: "This lesson covers the fundamentals of schedule management in project environments. You will learn why schedule management is a critical knowledge area, how it fits within overall project management, and the key processes involved in planning, developing, and controlling a project schedule.",
      keyConcepts: [
        "Schedule management is the process of planning, developing, managing, executing, and controlling the project schedule.",
        "A well-managed schedule ensures timely delivery, resource optimization, and stakeholder confidence.",
        "Key inputs include the project scope statement, WBS, activity list, and organizational process assets.",
        "The schedule management plan defines the methodology, tools, and reporting frequency for schedule activities.",
      ],
      questions: [
        { id: "intro-q1", scenario: "Your organization has just kicked off a large infrastructure project. The project sponsor asks you to explain why a formal schedule management plan is needed when the team already has a list of tasks. What is the best response?", options: ["A task list is sufficient; a schedule management plan only adds bureaucracy.", "A schedule management plan defines the methodology, tools, level of accuracy, and reporting cadence for developing and controlling the schedule \u2014 it turns a task list into an actionable roadmap.", "The schedule management plan is only required for agile projects.", "Schedule management plans are only needed when the project has more than 100 tasks."], correctIndex: 1, explanation: "A schedule management plan goes beyond a simple task list by establishing the framework for how schedules will be developed, monitored, and controlled throughout the project lifecycle." },
        { id: "intro-q2", scenario: "During a portfolio review, a program manager notices that one project consistently delivers late while others are on track. Which aspect of schedule management should be examined first?", options: ["The project's budget allocation.", "Whether the project has a documented schedule management plan with defined processes for estimating, sequencing, and controlling activities.", "The number of team members assigned to the project.", "The project's risk register."], correctIndex: 1, explanation: "Before examining specific schedule elements, you should verify that foundational schedule management processes are in place. Without a structured approach, schedule issues are systemic rather than isolated." },
        { id: "intro-q3", scenario: "A new PMO analyst asks you what the primary outputs of the schedule management planning process are. Which answer is most complete?", options: ["A Gantt chart and a list of milestones.", "The schedule management plan, which documents the scheduling methodology, tool selection, level of accuracy, units of measure, control thresholds, and performance measurement rules.", "A resource histogram and a staffing plan.", "A risk register and an issue log."], correctIndex: 1, explanation: "The schedule management plan is the primary output. It establishes how every subsequent scheduling process will operate, including methodology, precision, thresholds, and measurement approaches." },
      ],
    },
    {
      id: "wbs",
      title: "Creating a Work Breakdown Structure (WBS)",
      description: "Decomposing work into manageable tasks",
      videoTitle: "Building an Effective WBS",
      videoDescription: "Learn how to decompose project scope into a structured hierarchy of deliverables and work packages. This lesson walks through the WBS creation process, decomposition techniques, and best practices for ensuring complete scope coverage.",
      keyConcepts: [
        "The WBS is a hierarchical decomposition of the total scope of work to accomplish project objectives and create deliverables.",
        "Work packages are the lowest level of the WBS and form the basis for schedule activities, cost estimates, and resource assignments.",
        "The 100% Rule states that the WBS must include 100% of the work defined by the project scope \u2014 nothing more, nothing less.",
        "Decomposition should continue until work packages are small enough to be reliably estimated and assigned (typically 8\u201380 hours of effort).",
      ],
      questions: [
        { id: "wbs-q1", scenario: "You are managing a software development project. Your team has created a WBS but one branch only decomposes to the \u2018Testing\u2019 level without identifying specific types of testing. A team lead says further decomposition is unnecessary. What should you do?", options: ["Accept the team lead's assessment since they are the technical expert.", "Decompose \u2018Testing\u2019 further into work packages (e.g., unit testing, integration testing, UAT) to ensure reliable estimation, clear ownership, and schedule traceability.", "Add a single task called \u2018All Testing Activities\u2019 under the Testing branch.", "Remove testing from the WBS since it is a supporting activity, not a deliverable."], correctIndex: 1, explanation: "Work packages must be decomposed to a level where they can be reliably estimated and assigned. \u2018Testing\u2019 is too broad \u2014 breaking it into specific testing types enables accurate scheduling and accountability." },
        { id: "wbs-q2", scenario: "During a WBS review, a stakeholder suggests adding \u2018Ongoing Maintenance\u2019 as a work package even though it is not part of the approved project scope. How should you respond?", options: ["Add it to keep the stakeholder happy and avoid conflict.", "Explain that the WBS must adhere to the 100% Rule \u2014 it includes all work within the project scope and excludes work outside of it. Ongoing maintenance would require a scope change request.", "Add it but mark it as \u2018out of scope\u2019 in the WBS dictionary.", "Create a separate WBS for maintenance and merge them later."], correctIndex: 1, explanation: "The 100% Rule ensures the WBS captures exactly the project scope. Adding out-of-scope work violates this principle and can lead to scope creep, inaccurate estimates, and resource conflicts." },
        { id: "wbs-q3", scenario: "Your project has 200 tasks in the WBS. A junior PM asks how to verify the WBS is complete. What is the most reliable validation approach?", options: ["Count the tasks and compare against similar past projects.", "Conduct a WBS review with subject matter experts to verify that every deliverable traces to a scope requirement, every work package can be estimated and assigned, and the 100% Rule is satisfied at each level.", "Run the WBS through scheduling software to check for errors.", "Ask the project sponsor to approve it."], correctIndex: 1, explanation: "WBS validation requires expert review to confirm traceability to scope, estimability of work packages, and adherence to the 100% Rule. Automated tools cannot verify completeness of scope coverage." },
      ],
    },
    {
      id: "dependencies",
      title: "Task Dependencies & the Critical Path",
      description: "Understanding FS/SS/FF/SF relationships and CPM",
      videoTitle: "Task Dependencies and Critical Path Method",
      videoDescription: "This lesson explains the four types of task dependencies (Finish-to-Start, Start-to-Start, Finish-to-Finish, Start-to-Finish), how to sequence activities, and how the Critical Path Method (CPM) identifies the longest path through the project network.",
      keyConcepts: [
        "Finish-to-Start (FS): The successor cannot start until the predecessor finishes. This is the most common dependency type.",
        "Start-to-Start (SS): The successor cannot start until the predecessor starts. Finish-to-Finish (FF): The successor cannot finish until the predecessor finishes.",
        "The Critical Path is the longest sequence of dependent activities that determines the minimum project duration.",
        "Total Float is the amount of time an activity can be delayed without delaying the project end date. Critical path activities have zero float.",
      ],
      questions: [
        { id: "dep-q1", scenario: "You are scheduling a construction project. The foundation must be poured before framing can begin, but site preparation and permit acquisition can happen in parallel. A team member suggests using Start-to-Start dependencies between all activities. What is the correct approach?", options: ["Use SS for all relationships since it allows maximum parallelism.", "Use Finish-to-Start (FS) between foundation and framing (sequential dependency), and allow site preparation and permits to run in parallel since they have no dependency relationship with each other.", "Use Finish-to-Finish (FF) for everything to ensure all tasks end together.", "Use Start-to-Finish (SF) between foundation and framing."], correctIndex: 1, explanation: "Dependencies should reflect the actual logical relationships between activities. Foundation must finish before framing starts (FS), while independent activities should run in parallel without artificial constraints." },
        { id: "dep-q2", scenario: "After running CPM analysis, you discover the critical path has 15 tasks with zero total float and the project end date is 3 weeks past the deadline. What is the most effective first step?", options: ["Add more resources to every task in the project.", "Analyze the critical path activities for opportunities to fast-track (overlap sequential tasks) or crash (add resources to compress durations on critical path tasks where cost-effective).", "Remove tasks from the schedule to reduce the total duration.", "Change all FS dependencies to SS dependencies."], correctIndex: 1, explanation: "When the critical path exceeds the deadline, focus compression techniques (fast-tracking and crashing) specifically on critical path activities, as these are the only tasks that directly affect the project end date." },
        { id: "dep-q3", scenario: "A project has activities A(5d) \u2192 B(3d) \u2192 C(4d) on one path and A(5d) \u2192 D(8d) \u2192 E(2d) on another. Both paths converge at F(3d). What is the critical path and total project duration?", options: ["A-B-C-F, 15 days.", "A-D-E-F, 18 days. This is the longest path through the network and determines the minimum project duration.", "Both paths are critical at 15 days each.", "The critical path cannot be determined without knowing resource assignments."], correctIndex: 1, explanation: "Path A-D-E-F = 5+8+2+3 = 18 days. Path A-B-C-F = 5+3+4+3 = 15 days. The critical path is the longest path (18 days), which determines the minimum project duration. Path A-B-C-F has 3 days of total float." },
      ],
    },
    {
      id: "baselines",
      title: "Schedule Baselines & Variance",
      description: "Setting baselines and tracking schedule performance",
      videoTitle: "Schedule Baselines and Performance Tracking",
      videoDescription: "Learn how to establish a schedule baseline, measure schedule performance using earned value metrics (SPI, SV), and interpret variance to make informed decisions about project health and corrective actions.",
      keyConcepts: [
        "A schedule baseline is the approved version of the project schedule used as a reference point for measuring performance.",
        "Schedule Variance (SV) = Earned Value (EV) - Planned Value (PV). A negative SV indicates the project is behind schedule.",
        "Schedule Performance Index (SPI) = EV / PV. An SPI < 1.0 means the project is progressing slower than planned.",
        "Variance analysis should be performed regularly and triggers corrective action when thresholds defined in the schedule management plan are exceeded.",
      ],
      questions: [
        { id: "base-q1", scenario: "At month 3 of a 12-month project, the Planned Value (PV) is $300,000 and the Earned Value (EV) is $240,000. The project manager reports the project is \u2018on track\u2019 because spending is under budget. Is this assessment correct?", options: ["Yes, being under budget means the project is performing well.", "No. SV = EV - PV = $240K - $300K = -$60K and SPI = 0.80, indicating the project is 20% behind schedule. Being under budget may simply mean less work has been completed than planned.", "The assessment is correct because EV is positive.", "More data is needed; SPI alone cannot determine schedule health."], correctIndex: 1, explanation: "An SPI of 0.80 means only 80% of planned work has been completed. Low spending often correlates with schedule delays rather than cost savings \u2014 less work done means less money spent, but the project is behind." },
        { id: "base-q2", scenario: "Your project sponsor wants to re-baseline the schedule after a 2-week delay caused by a vendor. Under what circumstances is re-baselining appropriate?", options: ["Re-baseline immediately to eliminate the negative variance from reports.", "Re-baselining should only occur when an approved change request fundamentally alters the project scope, timeline, or budget. A 2-week delay alone does not justify re-baselining \u2014 instead, develop a recovery plan and track variance against the original baseline.", "Re-baseline at every status meeting to keep metrics current.", "Never re-baseline; the original baseline must always be preserved."], correctIndex: 1, explanation: "Re-baselining to hide variances defeats the purpose of performance measurement. Baselines should only change through formal change control when the project fundamentals shift. Delays should be managed through corrective actions." },
        { id: "base-q3", scenario: "During a portfolio review, three projects report the following SPIs: Project A = 1.05, Project B = 0.72, Project C = 0.95. The variance threshold in the schedule management plan is 0.90. Which projects require corrective action?", options: ["All three projects need corrective action.", "Only Project B (SPI = 0.72) requires corrective action because it falls below the 0.90 threshold. Project C (0.95) is within tolerance. Project A (1.05) is ahead of schedule.", "Only Project A needs attention because it is ahead of schedule, which could indicate scope issues.", "None \u2014 SPI is only relevant at project completion."], correctIndex: 1, explanation: "With a threshold of 0.90, Project B's SPI of 0.72 is significantly below the control limit and requires immediate corrective action. Project C is within acceptable variance, and Project A is performing well." },
      ],
    },
    {
      id: "control",
      title: "Schedule Control & Recovery",
      description: "Techniques for getting back on track when schedules slip",
      videoTitle: "Schedule Control and Recovery Techniques",
      videoDescription: "This lesson covers proactive schedule monitoring, common recovery techniques including crashing, fast-tracking, and scope negotiation, and how to implement effective schedule control processes to keep projects on track.",
      keyConcepts: [
        "Schedule control involves monitoring the status of activities, managing changes to the schedule baseline, and implementing corrective actions.",
        "Crashing adds resources to critical path activities to compress the schedule, often at increased cost.",
        "Fast-tracking overlaps sequential activities that would normally be done in sequence, increasing risk but reducing duration.",
        "When crashing and fast-tracking are insufficient, scope negotiation with stakeholders may be necessary to meet deadlines.",
      ],
      questions: [
        { id: "ctrl-q1", scenario: "Your project is 3 weeks behind schedule with 8 weeks remaining. The critical path runs through a software development phase. You have budget available. The project sponsor demands the original end date be maintained. What approach should you evaluate first?", options: ["Tell the team to work overtime until the project catches up.", "Evaluate crashing the critical path activities by adding skilled developers to compress task durations, then assess fast-tracking opportunities where sequential development and testing activities can safely overlap \u2014 while analyzing the cost and risk trade-offs of each option.", "Cut scope unilaterally to meet the deadline.", "Change the project methodology from waterfall to agile."], correctIndex: 1, explanation: "A structured recovery approach starts with crashing (adding resources) and fast-tracking (overlapping activities) on the critical path, while carefully evaluating cost increases and risk implications of each compression technique." },
        { id: "ctrl-q2", scenario: "You are fast-tracking a project by overlapping the design and development phases. Halfway through, you discover that design changes are causing rework in development. What should you do?", options: ["Continue fast-tracking because reversing the decision will delay the project further.", "Reassess the fast-tracking decision: evaluate whether the rework cost and schedule impact exceed the time saved by overlapping. If so, re-sequence the activities and implement a change freeze on design deliverables before they enter development.", "Eliminate the design phase entirely and let developers design as they build.", "Add more developers to absorb the rework."], correctIndex: 1, explanation: "Fast-tracking introduces risk of rework. When rework negates the time savings, the approach must be reassessed. A change freeze on design outputs before development begins can reduce rework while maintaining some overlap." },
        { id: "ctrl-q3", scenario: "During a schedule review, you identify that a non-critical path activity has consumed all its float and any further delay will make it critical. What proactive measure should you take?", options: ["Ignore it \u2014 it is not on the critical path yet.", "Implement near-critical path monitoring: flag the activity for close tracking, assign a risk response, and consider allocating buffer or additional resources to prevent it from becoming critical and potentially extending the project end date.", "Move the activity off the project schedule to avoid complications.", "Reassign the float to a different activity."], correctIndex: 1, explanation: "Near-critical activities that have consumed their float are at high risk of becoming critical. Proactive monitoring and intervention prevent schedule surprises and protect the project end date." },
      ],
    },
  ],
};

const portfolioManagement: TrainingModule = {
  id: "portfolio-management",
  name: "Portfolio Management",
  subtitle: "Learn to organize and manage strategic project portfolios for maximum business value",
  certPrefix: "PM",
  lessons: [
    {
      id: "pm-intro",
      title: "Foundations of Portfolio Management",
      description: "What portfolio management is and why it drives strategic value",
      videoTitle: "Introduction to Portfolio Management",
      videoDescription: "This lesson introduces portfolio management as a strategic discipline. Learn how portfolios differ from programs and projects, and why aligning investments with organizational strategy is the cornerstone of effective portfolio management.",
      keyConcepts: [
        "A portfolio is a collection of projects, programs, and operations managed as a group to achieve strategic objectives.",
        "Portfolio management aligns project investments with organizational strategy, ensuring resources flow to the highest-value work.",
        "Unlike project management (delivering scope), portfolio management focuses on doing the right projects, not just doing projects right.",
        "Key processes include identification, categorization, evaluation, selection, prioritization, balancing, and authorization of components.",
      ],
      questions: [
        { id: "pm-intro-q1", scenario: "The CIO asks you to explain the difference between managing a portfolio and managing a program. Several executives believe they are the same thing. What is the best explanation?", options: ["They are essentially the same \u2014 both manage multiple projects.", "A program manages related projects to achieve benefits not available from managing them individually, while a portfolio manages a collection of projects, programs, and operations to achieve strategic objectives \u2014 portfolio components may not be related to each other.", "A portfolio is simply a larger program.", "Programs are strategic; portfolios are operational."], correctIndex: 1, explanation: "Programs group related initiatives for synergy; portfolios group all investments (related or not) to optimize strategic value, resource allocation, and risk across the organization." },
        { id: "pm-intro-q2", scenario: "Your organization has 45 active projects but no formal portfolio management process. Projects are approved ad-hoc by different VPs. What is the most critical first step to establish portfolio management?", options: ["Create a project tracking spreadsheet.", "Define a portfolio governance framework that establishes criteria for project selection, prioritization, and authorization \u2014 ensuring all investments are evaluated against the strategic plan before approval.", "Hire a portfolio manager.", "Cancel half the projects to reduce complexity."], correctIndex: 1, explanation: "Without governance criteria tied to strategy, project selection is political rather than strategic. The governance framework is the foundation that enables objective evaluation and prioritization." },
        { id: "pm-intro-q3", scenario: "During a portfolio review, you discover that 60% of the budget is allocated to \u2018keep the lights on\u2019 operational projects while strategic growth initiatives are underfunded. What portfolio management principle should guide your recommendation?", options: ["Operational projects should always take priority.", "Portfolio balancing \u2014 the portfolio should reflect the organization's strategic mix targets. Recommend re-evaluating the balance between run-the-business and change-the-business investments to align with strategic goals.", "All projects should receive equal funding.", "Cut operational projects immediately to fund growth."], correctIndex: 1, explanation: "Portfolio balancing ensures the investment mix aligns with strategic intent. Most organizations target a deliberate split between sustaining operations and funding growth \u2014 a 60/40 imbalance signals misalignment." },
      ],
    },
    {
      id: "pm-selection",
      title: "Project Selection & Prioritization",
      description: "Techniques for evaluating and ranking portfolio components",
      videoTitle: "Selecting and Prioritizing Projects",
      videoDescription: "Learn structured methods for evaluating project proposals, scoring them against strategic criteria, and building a prioritized portfolio pipeline that maximizes value within resource constraints.",
      keyConcepts: [
        "Scoring models assign weighted scores to projects based on strategic alignment, financial return, risk, and resource requirements.",
        "Pairwise comparison and the Analytical Hierarchy Process (AHP) provide rigorous frameworks for comparing dissimilar projects.",
        "Financial metrics like NPV, IRR, and payback period quantify economic value but must be balanced with qualitative strategic factors.",
        "Prioritization must consider dependencies between projects \u2014 some lower-priority projects may be prerequisites for higher-priority ones.",
      ],
      questions: [
        { id: "pm-sel-q1", scenario: "Your portfolio review board uses only ROI to rank projects. A critical cybersecurity upgrade ranks low because it has no direct revenue. How should you address this?", options: ["Accept the ranking \u2014 ROI is the gold standard.", "Propose a multi-criteria scoring model that includes strategic alignment, risk reduction, regulatory compliance, and financial return \u2014 so projects like cybersecurity are evaluated on their true organizational value, not just revenue generation.", "Remove cybersecurity from the portfolio.", "Override the ranking without changing the methodology."], correctIndex: 1, explanation: "Single-metric prioritization creates blind spots. A balanced scoring model captures multiple dimensions of value, ensuring that risk-reduction and compliance projects are properly weighted alongside revenue-generating ones." },
        { id: "pm-sel-q2", scenario: "You have 20 project proposals competing for funding. After scoring, the top 12 fit within the budget. However, project #13 is a prerequisite for projects #3 and #5. What should you do?", options: ["Fund only the top 12 as ranked.", "Include project #13 in the portfolio because it is a dependency for two higher-priority projects. Without it, projects #3 and #5 cannot deliver their expected value. Adjust the portfolio by deferring the lowest-value project that fits.", "Cancel projects #3 and #5 instead.", "Fund all 20 projects by spreading the budget thinner."], correctIndex: 1, explanation: "Dependency analysis is essential in portfolio selection. A prerequisite project must be included even if its standalone score is lower, because the dependent projects' value is contingent on it." },
        { id: "pm-sel-q3", scenario: "A VP is pushing hard to include a pet project that scored below the funding cutoff. The VP argues it will 'definitely' have high ROI despite no supporting business case. What is the appropriate response?", options: ["Include it to maintain the relationship with the VP.", "Apply the established governance process: all projects must meet the minimum scoring threshold with a documented business case. Offer to help the VP develop a proper business case for re-evaluation in the next portfolio cycle.", "Create a special exception category for VP-sponsored projects.", "Reject it publicly to set an example."], correctIndex: 1, explanation: "Portfolio governance must be applied consistently. Bypassing the process for political reasons undermines the credibility of the entire portfolio management framework and leads to suboptimal resource allocation." },
      ],
    },
    {
      id: "pm-balancing",
      title: "Portfolio Balancing & Optimization",
      description: "Achieving the right mix of investments across dimensions",
      videoTitle: "Balancing Your Portfolio",
      videoDescription: "Explore how to balance your portfolio across multiple dimensions \u2014 risk vs. return, short-term vs. long-term, innovation vs. maintenance \u2014 and use visual tools like bubble charts and efficient frontiers to optimize the investment mix.",
      keyConcepts: [
        "Portfolio balancing evaluates the mix of components across dimensions such as risk/return, strategic category, timeline, and resource type.",
        "Bubble charts plot projects on two axes (e.g., risk vs. value) with bubble size representing cost, making imbalances visually obvious.",
        "The efficient frontier concept from finance identifies the portfolio mix that maximizes return for a given level of risk.",
        "Rebalancing should occur at regular intervals and whenever significant strategic or environmental changes occur.",
      ],
      questions: [
        { id: "pm-bal-q1", scenario: "Your portfolio bubble chart shows all projects clustered in the high-risk, high-return quadrant. The CFO is concerned. What does this pattern indicate and what should you recommend?", options: ["This is ideal \u2014 high returns justify high risk.", "The portfolio is over-concentrated in high-risk investments, creating excessive organizational exposure. Recommend rebalancing by adding lower-risk projects that provide stable returns and reducing some speculative investments to achieve a healthier risk-return distribution.", "Move all projects to low-risk.", "The bubble chart is not a reliable tool."], correctIndex: 1, explanation: "Concentration in any single quadrant signals imbalance. A well-managed portfolio distributes risk, ensuring that if high-risk bets fail, lower-risk components still deliver value and protect organizational stability." },
        { id: "pm-bal-q2", scenario: "After a strategic pivot, your organization shifts focus from geographic expansion to digital transformation. 70% of active portfolio projects support the old strategy. What portfolio action is needed?", options: ["Continue all projects \u2014 stopping them wastes sunk costs.", "Conduct a strategic realignment review: evaluate each project against the new strategy, accelerate or add digital transformation initiatives, and phase out or deprioritize projects that no longer align \u2014 even if they are mid-execution.", "Wait until current projects finish before aligning to the new strategy.", "Only apply the new strategy to future projects."], correctIndex: 1, explanation: "Sunk cost should not drive portfolio decisions. When strategy changes, the portfolio must realign promptly. Continuing misaligned projects diverts resources from strategic priorities and delays the pivot." },
        { id: "pm-bal-q3", scenario: "Your portfolio has strong financial balance but every project is scheduled to deliver in Q4, creating a resource bottleneck and a risk of simultaneous failures. What dimension of balance is missing?", options: ["Risk balance.", "Timeline balance \u2014 the portfolio needs a staggered delivery schedule to spread resource demand, reduce concentration risk, and ensure the organization can absorb deliverables incrementally rather than all at once.", "Budget balance.", "Strategic alignment."], correctIndex: 1, explanation: "Timeline balance ensures deliverables are distributed across periods, preventing resource overload, reducing the blast radius of delays, and enabling the organization to realize benefits incrementally." },
      ],
    },
    {
      id: "pm-governance",
      title: "Portfolio Governance & Decision-Making",
      description: "Establishing decision rights, gates, and oversight structures",
      videoTitle: "Portfolio Governance Frameworks",
      videoDescription: "Learn how to establish effective governance structures including portfolio review boards, stage gates, decision rights, and escalation paths that enable transparent, timely, and strategically sound portfolio decisions.",
      keyConcepts: [
        "Portfolio governance defines who makes decisions, how decisions are made, and what criteria guide those decisions.",
        "A Portfolio Review Board (PRB) typically meets quarterly to review portfolio health, approve new components, and make go/no-go decisions.",
        "Stage gates at key portfolio milestones provide structured checkpoints where components are evaluated for continued investment.",
        "Escalation paths ensure that issues beyond a decision-maker's authority are raised promptly to the appropriate governance level.",
      ],
      questions: [
        { id: "pm-gov-q1", scenario: "A project manager wants to increase their project budget by 40% mid-year. They have approval from their VP but not from the Portfolio Review Board. The VP says the PRB is too slow. What should you do?", options: ["Allow the VP approval \u2014 they outrank the PRB.", "Enforce the governance process: budget changes above the defined threshold must go through the PRB, regardless of sponsor level. A 40% increase may impact other portfolio components and must be evaluated in the context of the overall portfolio.", "Create an expedited PRB review rather than bypassing governance entirely.", "Let the project proceed and inform the PRB after the fact."], correctIndex: 2, explanation: "While governance must be followed, rigidity that causes unacceptable delays undermines its purpose. An expedited review maintains governance integrity while accommodating urgency \u2014 the best of both approaches." },
        { id: "pm-gov-q2", scenario: "Your organization has a PRB but it only meets annually. Projects wait months for approval, causing market opportunities to be missed. How should you improve the governance cadence?", options: ["Eliminate the PRB to remove delays.", "Implement a tiered governance model: quarterly PRB meetings for full portfolio reviews, monthly steering committee reviews for in-flight project issues, and delegated authority for smaller decisions below a defined threshold \u2014 enabling faster response while maintaining strategic oversight.", "Move to weekly PRB meetings.", "Let project sponsors make all decisions independently."], correctIndex: 1, explanation: "A tiered governance model provides the right level of oversight at the right frequency. Strategic portfolio decisions need quarterly review, while operational decisions can be delegated with appropriate thresholds." },
        { id: "pm-gov-q3", scenario: "Three portfolio components are competing for the same specialist resource pool next quarter. Each project sponsor insists their project is the highest priority. How should the conflict be resolved?", options: ["Give resources to whichever sponsor complains the loudest.", "Escalate to the PRB with a data-driven recommendation: present each project's strategic priority score, timeline impact of resource delays, and options for resolution (phasing, external resources, or scope adjustment) \u2014 letting the governance body make the trade-off decision.", "Split the resources equally among all three.", "Let the resource team decide."], correctIndex: 1, explanation: "Resource conflicts between portfolio components must be resolved at the governance level using objective criteria. The PRB has the authority and strategic context to make cross-portfolio trade-off decisions." },
      ],
    },
    {
      id: "pm-value",
      title: "Portfolio Value Measurement",
      description: "Tracking and communicating portfolio-level value delivery",
      videoTitle: "Measuring Portfolio Value",
      videoDescription: "Learn how to define, track, and communicate the value your portfolio delivers to the organization through KPIs, benefits realization tracking, and portfolio-level performance dashboards.",
      keyConcepts: [
        "Portfolio value is measured through a combination of financial metrics (ROI, NPV), strategic metrics (alignment scores), and operational metrics (on-time delivery, resource utilization).",
        "Benefits realization tracking ensures that projects deliver their promised business outcomes, not just their technical deliverables.",
        "Portfolio dashboards should present a balanced view of health, value delivery, risk exposure, and resource utilization to decision-makers.",
        "Value leakage occurs when benefits are not realized post-project \u2014 tracking must extend beyond project completion.",
      ],
      questions: [
        { id: "pm-val-q1", scenario: "Your portfolio of 30 projects shows 85% on-time and on-budget delivery. The CEO asks why revenue targets are still being missed. What is likely happening?", options: ["The CEO's expectations are unrealistic.", "The portfolio is measuring output (project delivery) rather than outcomes (business value). Projects may be completing successfully but not delivering the expected business benefits \u2014 indicating a gap in benefits realization tracking.", "85% is not high enough; aim for 100%.", "Revenue targets are unrelated to the portfolio."], correctIndex: 1, explanation: "Delivering projects on time and on budget is necessary but insufficient. Without benefits realization tracking, organizations cannot confirm that completed projects actually generate the expected business value." },
        { id: "pm-val-q2", scenario: "A completed CRM implementation project delivered all technical requirements on time. Six months later, sales productivity has not improved as the business case projected. What should the portfolio office do?", options: ["Close the project file \u2014 delivery was successful.", "Initiate a benefits realization review: assess why projected benefits have not materialized (adoption issues, training gaps, process changes not implemented), assign accountability for corrective actions, and update the benefits tracking register.", "Blame the sales team for not using the system.", "Start a new project to replace the CRM."], correctIndex: 1, explanation: "Benefits realization extends beyond project delivery. The portfolio office must track whether promised outcomes materialize and intervene when they do not \u2014 this feedback loop improves future business case accuracy." },
        { id: "pm-val-q3", scenario: "You are designing a portfolio dashboard for the executive team. A colleague suggests showing only financial metrics. Why is this insufficient?", options: ["Financial metrics are the only thing executives care about.", "A balanced portfolio dashboard should include financial performance, strategic alignment scores, risk exposure heat maps, resource utilization, and benefits realization status \u2014 giving executives a holistic view of portfolio health rather than a one-dimensional financial snapshot.", "Only include a Red/Amber/Green status for each project.", "Show all 200+ project metrics for completeness."], correctIndex: 1, explanation: "Executives need a multi-dimensional view. Financial metrics alone miss risk buildup, strategic drift, resource bottlenecks, and whether benefits are actually being realized \u2014 all of which affect long-term portfolio success." },
      ],
    },
  ],
};

const projectPortfolioManagement: TrainingModule = {
  id: "project-portfolio-management",
  name: "Project Portfolio Management",
  subtitle: "Master the discipline of managing multiple projects as a unified portfolio",
  certPrefix: "PPM",
  lessons: [
    {
      id: "ppm-lifecycle",
      title: "The PPM Lifecycle",
      description: "End-to-end lifecycle from intake to closure",
      videoTitle: "Understanding the PPM Lifecycle",
      videoDescription: "Walk through the complete project portfolio management lifecycle from project intake and evaluation through execution oversight and portfolio-level closure reviews.",
      keyConcepts: [
        "The PPM lifecycle includes intake, evaluation, selection, authorization, execution monitoring, and closure/benefits review.",
        "A structured intake process captures project requests in a standardized format with enough information for fair evaluation.",
        "Gate reviews at lifecycle transitions ensure only viable projects progress and resources are not wasted on failing initiatives.",
        "Post-implementation reviews close the feedback loop, capturing lessons learned and verifying benefits realization.",
      ],
      questions: [
        { id: "ppm-lc-q1", scenario: "Project requests arrive to the PMO in various formats \u2014 emails, hallway conversations, and formal business cases. Evaluation is inconsistent and some good ideas are lost. What should you implement?", options: ["Require all requests via email for a paper trail.", "Implement a standardized project intake process with a defined request template, submission portal, and evaluation criteria \u2014 ensuring every idea receives consistent, objective assessment and nothing falls through the cracks.", "Only accept requests from senior leaders.", "Evaluate projects on a first-come, first-served basis."], correctIndex: 1, explanation: "A standardized intake process creates a level playing field for all ideas, ensures decision-makers have comparable information, and prevents good proposals from being lost due to informal submission channels." },
        { id: "ppm-lc-q2", scenario: "A project passes the initial gate review but fails to secure a qualified project manager for 3 months. The business sponsor wants to start anyway with an unqualified lead. What should happen?", options: ["Start immediately \u2014 any delay costs money.", "The gate review criteria should include resource readiness. If key roles cannot be filled, the project should remain in the authorized-but-not-started queue until conditions are met, rather than starting with inadequate staffing that increases failure risk.", "Assign an administrator to manage the project.", "Cancel the project entirely."], correctIndex: 1, explanation: "Starting projects without key resources is a leading cause of failure. Gate criteria should include resource readiness, and the governance process should hold projects until prerequisites are satisfied." },
        { id: "ppm-lc-q3", scenario: "Your organization completes projects but never conducts post-implementation reviews. You notice the same mistakes repeating across projects. What is the business case for adding closure reviews?", options: ["They are administrative overhead with no value.", "Post-implementation reviews capture lessons learned, verify benefits realization, release resources formally, and create organizational learning \u2014 without them, the organization repeats mistakes, overestimates benefits in future business cases, and loses institutional knowledge.", "Only do reviews for failed projects.", "Reviews should be optional for project managers."], correctIndex: 1, explanation: "Closure reviews are where organizational learning happens. They verify that promised benefits materialized, document what worked and what did not, and feed improvements into future project and portfolio practices." },
      ],
    },
    {
      id: "ppm-pipeline",
      title: "Pipeline Management",
      description: "Managing the flow of projects from idea to execution",
      videoTitle: "Building a Healthy Project Pipeline",
      videoDescription: "Learn how to manage the pipeline of project ideas, proposals, and approved initiatives to ensure a steady flow of strategically aligned work enters execution.",
      keyConcepts: [
        "The project pipeline represents all initiatives from early idea stage through approved and executing, providing forward visibility.",
        "Pipeline health metrics include the number of proposals at each stage, conversion rates between stages, and time-in-stage averages.",
        "Pipeline capacity planning matches the flow of incoming projects against the organization's ability to absorb and execute them.",
        "A clogged pipeline (too many projects in evaluation) or a dry pipeline (too few ideas) both indicate systemic issues.",
      ],
      questions: [
        { id: "ppm-pipe-q1", scenario: "Your project pipeline shows 50 proposals in the evaluation stage, but only 5 have been approved in the last quarter. The average evaluation time is 4 months. What is the most likely root cause?", options: ["There are too many proposals being submitted.", "The evaluation process is a bottleneck \u2014 either the criteria are unclear, the review board meets too infrequently, or there is insufficient analytical support to process evaluations. Streamline the evaluation process, increase review frequency, or add evaluation resources.", "Only 5 approvals is the right number.", "Stop accepting new proposals until the backlog clears."], correctIndex: 1, explanation: "A 10:1 ratio of in-evaluation to approved projects signals an evaluation bottleneck. The fix is process improvement (clearer criteria, faster reviews), not restricting the intake of potentially valuable ideas." },
        { id: "ppm-pipe-q2", scenario: "All 12 approved projects are scheduled to start in Q1, but the organization can only staff 6 simultaneously. There is no pipeline staging. What governance failure does this represent?", options: ["The organization needs to hire more people.", "Pipeline-to-capacity mismatch \u2014 the approval process authorized more projects than the organization can absorb. The governance process should include capacity analysis before authorization, staging approved projects across quarters to match resource availability.", "Start all 12 and hope for the best.", "Cancel the 6 lowest-priority projects permanently."], correctIndex: 1, explanation: "Approving more projects than can be staffed creates resource conflicts, delays, and quality issues. Capacity-aware authorization stages projects to start when resources are genuinely available." },
        { id: "ppm-pipe-q3", scenario: "Your organization has not received a new project proposal in 3 months. Active projects are nearing completion with nothing in the pipeline behind them. What should you investigate?", options: ["Enjoy the break \u2014 fewer projects means less work.", "A dry pipeline indicates potential issues: the intake process may be too burdensome, business units may lack awareness of the process, innovation culture may be weak, or strategic direction may be unclear. Investigate the root cause and make the intake process more accessible.", "The organization has run out of ideas.", "Wait until someone submits a proposal."], correctIndex: 1, explanation: "An empty pipeline is a leading indicator of future value drought. It often signals that the intake process is too heavy, the organization does not promote ideation, or strategic direction is ambiguous." },
      ],
    },
    {
      id: "ppm-reporting",
      title: "Portfolio Reporting & Communication",
      description: "Communicating portfolio status to stakeholders effectively",
      videoTitle: "Effective Portfolio Reporting",
      videoDescription: "Master the art of portfolio-level reporting: aggregating project data into executive-ready dashboards, crafting narrative summaries, and tailoring communication to different stakeholder audiences.",
      keyConcepts: [
        "Portfolio reports aggregate individual project data into portfolio-level views showing overall health, trends, and exceptions.",
        "Exception-based reporting highlights items needing attention rather than overwhelming executives with details about healthy projects.",
        "Different audiences need different views: executives want strategic summaries; PMO staff need operational details; sponsors need project-specific depth.",
        "Trend analysis over time is more valuable than point-in-time snapshots \u2014 it reveals whether the portfolio is improving or deteriorating.",
      ],
      questions: [
        { id: "ppm-rpt-q1", scenario: "Your monthly portfolio report is 85 pages and covers every project in detail. Executives have stopped reading it. How should you redesign it?", options: ["Make it 100 pages with more detail.", "Create a tiered reporting structure: a 2-page executive summary with portfolio-level KPIs and exceptions, a 10-page management summary with trend analysis, and detailed project appendices available on request \u2014 giving each audience the right depth.", "Stop reporting entirely since nobody reads it.", "Send the full report weekly to increase familiarity."], correctIndex: 1, explanation: "Report length should match audience needs. Executives need concise, strategic views. Detailed data should be available on demand, not forced on every reader. Tiered reporting respects everyone's time while maintaining transparency." },
        { id: "ppm-rpt-q2", scenario: "Your portfolio dashboard shows all projects as Green. The CEO is skeptical because two major deliveries were late last month. What is likely wrong with the reporting?", options: ["The CEO is being unreasonable.", "The health status criteria are likely too lenient, status updates may be stale, or project managers may be reluctant to report non-green status. Review and tighten health thresholds, implement objective metric-based status calculations, and create a safe culture for transparent reporting.", "Two late projects out of many is acceptable.", "Add more colors to the status system."], correctIndex: 1, explanation: "A dashboard showing all-green when deliveries are late has lost credibility. Status criteria must be objective and metric-driven, and the culture must support honest reporting over political optimism." },
        { id: "ppm-rpt-q3", scenario: "You are presenting the quarterly portfolio review to the board. A director asks about a specific project's testing results. What is the best way to handle this in a portfolio-level meeting?", options: ["Spend 20 minutes diving into the testing details.", "Acknowledge the question, note that testing details are tracked at the project level, and offer to provide a detailed briefing after the meeting \u2014 keeping the portfolio review focused on strategic-level decisions rather than individual project operations.", "Tell the director the question is inappropriate.", "Cancel the portfolio review and switch to a project review."], correctIndex: 1, explanation: "Portfolio reviews must stay at the strategic level to be effective. Diving into project details derails the agenda. Acknowledge the question, commit to follow-up, and maintain the portfolio-level focus." },
      ],
    },
    {
      id: "ppm-risk",
      title: "Portfolio-Level Risk Management",
      description: "Managing risk across the entire portfolio, not just individual projects",
      videoTitle: "Portfolio Risk Management",
      videoDescription: "Learn how risks aggregate across a portfolio, how to identify systemic and concentration risks, and how to build portfolio-level risk responses that individual projects cannot address alone.",
      keyConcepts: [
        "Portfolio risk includes aggregated project risks plus systemic risks that affect multiple projects simultaneously (economic shifts, regulatory changes, technology disruptions).",
        "Concentration risk arises when the portfolio is over-dependent on a single technology, vendor, market, or resource pool.",
        "Risk interdependency means a risk event in one project can cascade across the portfolio \u2014 portfolio-level monitoring is essential.",
        "Portfolio risk reserves should be maintained separately from project-level contingencies to handle cross-cutting risk events.",
      ],
      questions: [
        { id: "ppm-risk-q1", scenario: "Three projects in your portfolio depend on the same cloud vendor. That vendor announces a 30% price increase effective next quarter. Individual project managers have not flagged this as a risk. What type of portfolio risk does this represent?", options: ["It is not a portfolio risk \u2014 each project should handle it independently.", "Vendor concentration risk \u2014 a portfolio-level risk that individual projects may underestimate because they see only their own exposure. The portfolio office should assess total exposure, negotiate enterprise-level pricing, and evaluate vendor diversification strategies.", "A budget risk handled by finance.", "An operational risk outside portfolio management scope."], correctIndex: 1, explanation: "Concentration risks are often invisible at the project level but critical at the portfolio level. When multiple projects share a dependency, the portfolio office must manage the aggregate exposure that no single project can address." },
        { id: "ppm-risk-q2", scenario: "Your portfolio risk register is simply a merge of all individual project risk registers. The PMO director says this is insufficient. Why?", options: ["It is sufficient \u2014 project risks are portfolio risks.", "A merged risk register misses systemic risks (market changes, regulatory shifts, organizational changes), inter-project risk dependencies, and concentration risks. Portfolio risk management must add these higher-order risks that emerge from the portfolio as a whole, not just from individual projects.", "Remove project risks from the portfolio register entirely.", "Only include the top 10 project risks."], correctIndex: 1, explanation: "Portfolio risk management operates at a higher level than project risk management. It must identify risks that no single project would see \u2014 systemic risks, cascading risks, and concentration risks that emerge from the portfolio composition." },
        { id: "ppm-risk-q3", scenario: "A major regulatory change will affect 8 of your 25 portfolio projects. Each project manager plans to respond independently. What portfolio-level action should you take?", options: ["Let each project handle it \u2014 they know their scope best.", "Coordinate a portfolio-level response: centralize the regulatory analysis, develop a shared compliance approach, allocate portfolio-level resources for the response, and adjust timelines across affected projects in a coordinated manner \u2014 avoiding duplicate effort and inconsistent interpretations.", "Only respond when the regulation takes effect.", "Remove the affected projects from the portfolio."], correctIndex: 1, explanation: "Cross-cutting risks demand coordinated portfolio-level responses. Independent responses lead to duplicate effort, inconsistent interpretations, and missed dependencies between affected projects." },
      ],
    },
    {
      id: "ppm-stakeholders",
      title: "Stakeholder Management at the Portfolio Level",
      description: "Engaging executives, sponsors, and business units in portfolio success",
      videoTitle: "Portfolio Stakeholder Engagement",
      videoDescription: "Master techniques for engaging diverse portfolio stakeholders \u2014 from C-suite executives to business unit leaders \u2014 ensuring alignment, managing expectations, and building the organizational support that portfolio success requires.",
      keyConcepts: [
        "Portfolio stakeholders include executives, business unit leaders, project sponsors, resource managers, and the PMO \u2014 each with different interests and influence.",
        "Stakeholder alignment ensures that portfolio decisions reflect organizational consensus, not just the preferences of the most vocal leaders.",
        "Managing competing stakeholder priorities is the portfolio manager's core challenge \u2014 transparent criteria and data-driven decisions reduce political friction.",
        "Regular engagement cadences (executive briefings, sponsor forums, business unit reviews) maintain alignment and surface concerns early.",
      ],
      questions: [
        { id: "ppm-sh-q1", scenario: "Two business unit VPs are in conflict: each believes their projects should be the top priority. The debate has stalled the portfolio review board. How should you facilitate resolution?", options: ["Let them argue until one concedes.", "Present objective data: show each project's strategic alignment score, resource requirements, financial projections, and risk profile side-by-side. Let the governance criteria \u2014 not personal influence \u2014 drive the priority decision, and remind both VPs that the PRB's role is to optimize for organizational value.", "Alternate priority between them each quarter.", "Escalate to the CEO to make the decision."], correctIndex: 1, explanation: "Data-driven, criteria-based decision-making depersonalizes priority conflicts. When stakeholders see objective evidence, discussions shift from political to analytical, enabling better portfolio outcomes." },
        { id: "ppm-sh-q2", scenario: "A new CEO joins the organization and wants to review the entire portfolio within their first month. The portfolio has 40 active projects. How should you prepare?", options: ["Provide a 40-project detailed briefing over 3 days.", "Prepare a strategic portfolio summary: a one-page portfolio health overview, projects grouped by strategic theme with aggregate status, the top 5 projects by investment size, the top 5 risks, and key decisions pending \u2014 giving the CEO strategic context without operational overload.", "Tell the CEO to wait until the next quarterly review.", "Only show the projects that are going well."], correctIndex: 1, explanation: "New executives need strategic orientation, not operational detail. A well-structured portfolio summary gives them the context to make early decisions and signals that the PMO operates at a strategic level." },
        { id: "ppm-sh-q3", scenario: "Business unit leaders complain they have no visibility into how portfolio decisions affect their teams. They feel decisions are made behind closed doors. What should you implement?", options: ["Portfolio decisions should remain confidential.", "Implement portfolio transparency mechanisms: publish decision criteria, share prioritization results and rationale, invite business unit representatives to observe portfolio reviews, and provide feedback on why specific proposals were approved or deferred \u2014 building trust through openness.", "Send them the 85-page monthly report.", "Create a separate portfolio for each business unit."], correctIndex: 1, explanation: "Transparency builds trust and organizational buy-in. When stakeholders understand how decisions are made and see the rationale, they are more likely to support outcomes even when their preferred projects are not selected." },
      ],
    },
  ],
};

const optimization: TrainingModule = {
  id: "optimization",
  name: "Optimization",
  subtitle: "Discover techniques for optimizing resources, budgets, and project prioritization",
  certPrefix: "OPT",
  lessons: [
    {
      id: "opt-intro",
      title: "Principles of Portfolio Optimization",
      description: "Core concepts and why optimization matters",
      videoTitle: "Introduction to Portfolio Optimization",
      videoDescription: "Understand the fundamental principles behind portfolio optimization: maximizing value delivery while operating within organizational constraints on budget, resources, risk, and time.",
      keyConcepts: [
        "Optimization seeks the best possible outcome given constraints \u2014 it is not about doing more, but about doing the right things in the right order.",
        "Common constraints include budget limits, resource availability, risk tolerance, strategic mandates, and regulatory requirements.",
        "Trade-off analysis is central to optimization: every decision to fund one initiative means another is deferred or cancelled.",
        "Optimization is continuous \u2014 as conditions change, the optimal portfolio composition changes too.",
      ],
      questions: [
        { id: "opt-intro-q1", scenario: "Your organization has $10M to invest across projects. A VP wants to spread it equally across 20 proposals ($500K each). The PMO believes concentrating on 8 high-value projects is better. What optimization principle should guide the decision?", options: ["Equal distribution is always fairest.", "Value maximization under constraints \u2014 analyze which subset of proposals generates the highest total value within the $10M budget. Spreading resources too thinly often means no project gets enough to succeed, while concentrating on fewer high-value projects maximizes overall return.", "Fund all 20 and request more budget.", "Let each VP decide their own allocation."], correctIndex: 1, explanation: "Optimization means maximizing total portfolio value within constraints. Spreading resources equally regardless of project value leads to suboptimal outcomes \u2014 constrained optimization ensures the highest-impact projects receive adequate investment." },
        { id: "opt-intro-q2", scenario: "The portfolio is optimized for Q1, but a major competitor launches a disruptive product in February. The CFO says the portfolio was just optimized and should not change. Is the CFO correct?", options: ["Yes \u2014 optimization results should be locked for the quarter.", "No \u2014 optimization is based on assumptions that have now changed. A significant market event requires re-evaluation of the portfolio to determine whether current investments still represent the best allocation, or whether resources should shift to competitive response initiatives.", "Only change the portfolio annually.", "Add a competitive response project without changing anything else."], correctIndex: 1, explanation: "Optimization is valid only as long as its underlying assumptions hold. When significant external changes occur, the optimal portfolio composition likely changes too. Rigid adherence to outdated optimization is suboptimal." },
        { id: "opt-intro-q3", scenario: "A data analyst proposes using a mathematical optimization model to select the portfolio. The PMO director is skeptical about replacing human judgment with algorithms. What is the right perspective?", options: ["Algorithms should make all decisions.", "Optimization models are powerful decision-support tools that can process complex constraints and scenarios far faster than humans, but they should inform rather than replace leadership judgment. Models handle quantifiable factors well; leaders add strategic intuition, stakeholder context, and values that models cannot capture.", "Human judgment is always superior to models.", "Only use models for financial analysis."], correctIndex: 1, explanation: "The best approach combines quantitative optimization with human judgment. Models handle complexity and identify non-obvious solutions; leaders bring strategic context, stakeholder awareness, and organizational knowledge." },
      ],
    },
    {
      id: "opt-resource",
      title: "Resource Optimization",
      description: "Getting the most value from limited resource pools",
      videoTitle: "Optimizing Resource Allocation",
      videoDescription: "Learn techniques for optimizing resource allocation across the portfolio, including capacity leveling, skill-based assignment, and resolving resource contention between competing projects.",
      keyConcepts: [
        "Resource optimization matches available capacity to demand, ensuring people are assigned to the highest-value work their skills support.",
        "Resource leveling smooths demand peaks to fit within capacity, potentially extending timelines but avoiding over-allocation.",
        "Resource smoothing adjusts assignments within float to reduce peaks without changing the critical path or project end dates.",
        "Skill-based optimization assigns resources based on competency match, not just availability, improving quality and reducing rework.",
      ],
      questions: [
        { id: "opt-res-q1", scenario: "Your resource plan shows a senior architect is allocated at 150% capacity for 6 weeks across 3 projects. All three project managers claim they cannot release any of the architect's time. How should you resolve this?", options: ["Let the architect work overtime.", "Facilitate a portfolio-level prioritization discussion: identify which project has the highest strategic priority for the architect's contribution, negotiate phased involvement across projects (sequential rather than simultaneous), and explore whether a senior developer could handle some tasks with the architect providing guidance.", "Assign a junior resource to all three.", "Hire a contract architect immediately."], correctIndex: 1, explanation: "Over-allocation degrades quality across all projects. Portfolio-level resolution ensures the highest-value project gets priority access while creative alternatives (phasing, delegation with guidance) maintain progress on others." },
        { id: "opt-res-q2", scenario: "A resource optimization analysis reveals that 30% of your developers are assigned to low-priority maintenance projects while strategic initiatives are understaffed. What action should you take?", options: ["Maintenance work must continue regardless of priority.", "Rebalance assignments by transitioning some developers from low-priority maintenance to strategic initiatives, backfilling maintenance with less specialized staff or automation, and ensuring strategic projects have the talent density they need to succeed.", "Hire 30% more developers.", "Cancel all maintenance projects."], correctIndex: 1, explanation: "Resource optimization requires matching talent to value. Using specialized developers for low-priority work while strategic projects languish is a common misallocation that portfolio-level optimization should correct." },
        { id: "opt-res-q3", scenario: "Two projects need the same data scientist. Project A starts next week with a hard regulatory deadline; Project B starts next month and has flexibility. Both PMs want full-time allocation. What is the optimal assignment?", options: ["Split the resource 50/50 from the start.", "Assign the data scientist full-time to Project A first (due to the hard deadline and immediate start), then transition to Project B when A's critical data science work is complete \u2014 sequencing based on urgency and constraint rigidity.", "Let the data scientist choose.", "Assign to neither and hire a contractor."], correctIndex: 1, explanation: "When resource contention exists, optimization considers constraint rigidity. A hard regulatory deadline is an immovable constraint, while Project B's flexibility makes it the logical candidate for delayed allocation." },
      ],
    },
    {
      id: "opt-budget",
      title: "Budget Optimization",
      description: "Maximizing portfolio value within financial constraints",
      videoTitle: "Optimizing Portfolio Budgets",
      videoDescription: "Explore techniques for optimizing budget allocation across the portfolio, including value-per-dollar analysis, portfolio-level contingency management, and dynamic budget reallocation as conditions change.",
      keyConcepts: [
        "Value-per-dollar analysis ranks projects by the ratio of expected value to cost, identifying the most efficient investments.",
        "Portfolio-level contingency reserves are more efficient than project-level reserves because risk events rarely hit all projects simultaneously.",
        "Dynamic reallocation moves budget from underperforming or cancelled projects to higher-value opportunities mid-cycle.",
        "Sunk cost discipline \u2014 past spending should not influence future investment decisions; only remaining value matters.",
      ],
      questions: [
        { id: "opt-bud-q1", scenario: "Project Alpha has consumed 80% of its budget but only delivered 40% of its scope. The project team requests additional funding to complete it. The portfolio has limited remaining budget. What analysis should inform the decision?", options: ["Fund it \u2014 80% of the budget is already spent.", "Evaluate the remaining value: what is the cost to complete versus the value of the remaining scope? Compare this ratio against other portfolio opportunities for the same funds. Sunk cost (the 80% already spent) should not drive the decision \u2014 only the forward-looking value-to-cost ratio matters.", "Cancel immediately \u2014 it is clearly failing.", "Give it 50% of what it requests."], correctIndex: 1, explanation: "Sunk cost bias is a major optimization trap. The 80% already spent is irrelevant to the forward decision. What matters is whether the remaining investment generates more value than alternative uses of those funds." },
        { id: "opt-bud-q2", scenario: "Your portfolio has $2M in project-level contingency reserves across 15 projects. Historically, only 40% of project contingencies are used. How could portfolio-level reserve management improve efficiency?", options: ["Keep all contingency at the project level for project manager autonomy.", "Consolidate a portion of project contingencies into a portfolio-level reserve. Since risks rarely hit all projects simultaneously, a shared pool requires less total capital while maintaining adequate coverage \u2014 freeing the excess to fund additional value-generating work.", "Eliminate all contingency to maximize project budgets.", "Increase contingency to 100% utilization."], correctIndex: 1, explanation: "Portfolio-level risk pooling exploits the statistical principle that not all risks materialize simultaneously. A shared reserve of, say, $1.2M could provide adequate coverage while freeing $800K for productive investment." },
        { id: "opt-bud-q3", scenario: "Mid-year, a project is cancelled, freeing $500K. Three project managers immediately request the funds. How should the released budget be allocated?", options: ["Give it to the first project manager who asked.", "Run the released funds through the portfolio prioritization process: evaluate each request against strategic criteria, assess which use generates the highest incremental value, and allocate based on the same governance criteria used for initial funding decisions.", "Split it equally among the three requestors.", "Return it to the corporate budget."], correctIndex: 1, explanation: "Released funds represent an optimization opportunity. They should flow through the same governance and prioritization process as initial allocations, ensuring they go to the highest-value use rather than the loudest requestor." },
      ],
    },
    {
      id: "opt-capacity",
      title: "Capacity Planning & Demand Management",
      description: "Matching organizational capacity to portfolio demand",
      videoTitle: "Capacity Planning for Portfolios",
      videoDescription: "Learn how to forecast portfolio demand, assess organizational capacity, and manage the gap between what the organization wants to do and what it can realistically deliver.",
      keyConcepts: [
        "Capacity planning translates the portfolio pipeline into resource demand forecasts, revealing future bottlenecks before they become crises.",
        "Demand management shapes the incoming project flow to match capacity, including deferral, phasing, and scope right-sizing.",
        "Capacity is not just headcount \u2014 it includes skills, tools, infrastructure, organizational change absorption, and management attention.",
        "The capacity-demand gap should inform portfolio decisions: authorizing more projects than the organization can absorb guarantees failure.",
      ],
      questions: [
        { id: "opt-cap-q1", scenario: "Your capacity plan shows adequate headcount for next quarter, but 80% of the demand requires a specialized skill that only 3 people in the organization possess. What does this reveal?", options: ["Headcount is sufficient, so there is no problem.", "The capacity plan is based on generic headcount rather than skill-specific capacity. Three specialists cannot fulfill 80% of demand regardless of total headcount. The plan must model capacity at the skill level and identify options: cross-training, external specialists, or demand reduction.", "Hire 10 more people in the specialty.", "Delay all projects requiring the specialty."], correctIndex: 1, explanation: "Skill-specific capacity analysis reveals bottlenecks invisible in aggregate headcount plans. When demand concentrates on a scarce skill, the response must address that specific constraint rather than general staffing." },
        { id: "opt-cap-q2", scenario: "The business wants to launch 15 new initiatives next quarter, but your capacity analysis shows the organization can handle 8. Leadership says \u2018we need to find a way.\u2019 What should you recommend?", options: ["Accept all 15 and hope teams can stretch.", "Present the data transparently: show the capacity analysis, the consequences of overloading (delays, quality issues, burnout), and propose a phased approach \u2014 starting 8 next quarter, staging the remaining 7 across subsequent quarters, with clear criteria for sequencing.", "Hire contractors for all 15.", "Tell leadership the analysis is wrong."], correctIndex: 1, explanation: "Overloading beyond capacity guarantees all 15 initiatives suffer. A phased approach delivers 8 well rather than 15 poorly, and staging the rest ensures quality execution when capacity becomes available." },
        { id: "opt-cap-q3", scenario: "Your organization successfully delivers projects but business units complain about \u2018change fatigue\u2019 \u2014 too many process changes hitting them simultaneously. What capacity dimension has been overlooked?", options: ["Change fatigue is not a real concern.", "Organizational change absorption capacity \u2014 the organization's ability to adopt, internalize, and benefit from changes. Even if the PMO can deliver projects, the receiving business units can only absorb a limited number of changes simultaneously. Portfolio planning must include change impact assessment.", "Deliver changes faster so fatigue passes sooner.", "Only deliver changes once per year."], correctIndex: 1, explanation: "Change absorption capacity is a real organizational constraint. Delivering projects faster than the business can absorb them leads to adoption failures, benefit shortfalls, and stakeholder resistance." },
      ],
    },
    {
      id: "opt-continuous",
      title: "Continuous Improvement in Portfolio Optimization",
      description: "Building feedback loops and maturing optimization practices",
      videoTitle: "Maturing Your Optimization Practices",
      videoDescription: "Learn how to build continuous improvement into portfolio optimization through feedback loops, retrospective analysis, benchmarking, and progressive maturity of optimization techniques.",
      keyConcepts: [
        "Continuous improvement applies optimization lessons from each portfolio cycle to improve the next cycle's decisions.",
        "Retrospective analysis compares actual project outcomes to the projections used for selection, improving estimation accuracy over time.",
        "Benchmarking against industry peers reveals whether your portfolio performance is competitive or lagging.",
        "Maturity progression moves from ad-hoc prioritization to scoring models to constrained optimization to predictive analytics.",
      ],
      questions: [
        { id: "opt-ci-q1", scenario: "Over the past 3 years, your portfolio business cases consistently overestimate ROI by 35%. Projects are selected based on these inflated projections. What improvement should you implement?", options: ["Accept the overestimates as optimism bias.", "Implement a systematic estimation improvement process: track actual outcomes against projections, publish accuracy metrics, apply reference class forecasting (adjusting estimates based on historical accuracy), and hold business case authors accountable for post-delivery variance.", "Stop using ROI in business cases.", "Add a 35% discount to all business cases."], correctIndex: 1, explanation: "Systematic estimation bias undermines portfolio optimization because the wrong projects get selected. Tracking actuals vs. estimates and feeding that data back into the estimation process progressively improves accuracy." },
        { id: "opt-ci-q2", scenario: "Your portfolio optimization process has used the same scoring criteria for 5 years. The organization has undergone a major digital transformation. What should you evaluate?", options: ["Consistency is more important than currency.", "Review and update the scoring criteria to reflect the current strategic context. Digital transformation likely changes which capabilities, outcomes, and risk factors matter most. Criteria that were relevant 5 years ago may now overweight legacy priorities and underweight digital innovation.", "Add digital transformation as one more criterion.", "Start over with completely new criteria."], correctIndex: 1, explanation: "Optimization criteria must evolve with strategy. Using outdated criteria means the optimization process systematically favors old-strategy projects over new-strategy ones, undermining the transformation." },
        { id: "opt-ci-q3", scenario: "Your PMO has implemented basic portfolio scoring but wants to advance to more sophisticated optimization. What is the recommended maturity progression?", options: ["Jump directly to AI-powered optimization.", "Progress through maturity levels: (1) basic scoring and ranking, (2) multi-criteria weighted scoring with sensitivity analysis, (3) constrained optimization modeling that maximizes value subject to resource, budget, and risk constraints, (4) scenario-based optimization with Monte Carlo simulation, (5) predictive optimization using machine learning on historical portfolio data.", "Stay at basic scoring \u2014 more complexity adds no value.", "Only use financial optimization models."], correctIndex: 1, explanation: "Optimization maturity should progress incrementally. Each level builds on the previous one, and jumping ahead without foundational capabilities leads to sophisticated models built on unreliable data." },
      ],
    },
  ],
};

const resourceManagement: TrainingModule = {
  id: "resource-management",
  name: "Resource Management",
  subtitle: "Plan, allocate, and manage resources effectively across your portfolio",
  certPrefix: "RM",
  lessons: [
    {
      id: "rm-planning",
      title: "Resource Planning Fundamentals",
      description: "Building effective resource plans for projects and portfolios",
      videoTitle: "Resource Planning Essentials",
      videoDescription: "Learn the fundamentals of resource planning: identifying resource requirements, assessing availability, creating resource plans, and establishing the foundation for effective allocation across projects.",
      keyConcepts: [
        "Resource planning identifies what resources are needed, when they are needed, and for how long, creating a demand profile for each project.",
        "A resource pool inventory catalogs available resources by skill, capacity, location, and cost rate, providing the supply side of the equation.",
        "Gap analysis compares demand against supply to identify shortfalls that must be addressed through hiring, contracting, training, or scope adjustment.",
        "Resource plans should be living documents, updated as project scope, timeline, and organizational capacity change.",
      ],
      questions: [
        { id: "rm-plan-q1", scenario: "A project manager submits a resource plan requesting \u20184 developers\u2019 without specifying skill requirements, experience levels, or timing. Why is this plan inadequate?", options: ["It is sufficient \u2014 the resource team can figure out the details.", "Resource plans must specify skills (Java vs. Python vs. full-stack), experience levels (junior vs. senior), timing (full-time weeks 1-12, part-time weeks 13-20), and any special requirements. Without this detail, resource matching will be inaccurate, leading to mismatched assignments and project risk.", "Skill details are the project manager's responsibility to manage after assignment.", "Just assign the 4 most available developers."], correctIndex: 1, explanation: "Vague resource requests lead to skill mismatches, under-qualified assignments, and project risk. Detailed specifications enable accurate matching and reveal potential supply gaps early enough to address them." },
        { id: "rm-plan-q2", scenario: "Your resource pool has 50 developers, but resource plans across all projects total 65 developer-equivalents for next quarter. What should the portfolio office do?", options: ["Approve all requests \u2014 people will find a way.", "Flag the 15-developer shortfall to portfolio governance, presenting options: defer lower-priority projects to reduce demand to 50, engage contractors for the gap, negotiate reduced scope on some projects, or phase work differently. The decision should be made by the governance body based on strategic priorities.", "Tell all projects to reduce their plans by 23%.", "Hire 15 developers immediately."], correctIndex: 1, explanation: "A demand-supply gap must be surfaced and resolved through governance decisions. Spreading the shortfall equally ignores priorities. Strategic deferral, targeted contracting, or scope adjustment provides better outcomes." },
        { id: "rm-plan-q3", scenario: "A project completed early and freed a senior data engineer 6 weeks ahead of schedule. No other project has this role in their current resource plan. How should the portfolio office handle this?", options: ["Let the resource sit idle until their next assignment.", "Proactively scan the portfolio pipeline and in-flight projects for opportunities to deploy the freed resource: upcoming projects that need data engineering, at-risk projects that could benefit from additional expertise, or strategic research and innovation work that builds organizational capability.", "Assign them to administrative tasks.", "Immediately start their vacation time."], correctIndex: 1, explanation: "Freed specialized resources are a portfolio opportunity. Proactive redeployment maximizes value \u2014 idle high-value resources represent waste, and the portfolio office should maintain awareness of deployment opportunities." },
      ],
    },
    {
      id: "rm-allocation",
      title: "Resource Allocation Strategies",
      description: "Methods for assigning resources across competing demands",
      videoTitle: "Strategic Resource Allocation",
      videoDescription: "Explore allocation strategies including priority-based allocation, capacity-aware assignment, and matrix management techniques that balance project needs with resource development goals.",
      keyConcepts: [
        "Priority-based allocation assigns resources to the highest-priority projects first, ensuring strategic initiatives are adequately staffed.",
        "Capacity-aware allocation considers both utilization targets and sustainable workload, avoiding the trap of 100% allocation that leaves no room for unplanned work.",
        "Matrix management requires clear agreements between functional managers (who own resources) and project managers (who use them).",
        "Target utilization of 75-85% for knowledge workers allows for meetings, unplanned work, and professional development while maintaining productive output.",
      ],
      questions: [
        { id: "rm-alloc-q1", scenario: "A functional manager is allocating their team at 100% across projects, leaving no buffer for unplanned work, meetings, or professional development. Projects are constantly disrupted by urgent issues. What should you recommend?", options: ["100% utilization is optimal \u2014 any less is waste.", "Reduce planned allocation to 80%, reserving 20% for unplanned work, meetings, administrative tasks, and professional development. This creates a sustainable work model where planned project commitments are reliable because they account for reality rather than assuming 100% productive time.", "Increase allocation to 110% to account for meetings.", "Track actual utilization and adjust quarterly."], correctIndex: 1, explanation: "100% allocation in planning is a fiction that guarantees schedule overruns. Sustainable utilization targets (typically 75-85%) create realistic plans and reliable commitments by acknowledging that not all time is productive project time." },
        { id: "rm-alloc-q2", scenario: "A project manager requests that a key developer be assigned 100% exclusively to their project. However, three other projects each need 10% of that developer's time for code reviews. What is the best allocation approach?", options: ["Give the developer 100% to the project manager who asked first.", "Allocate 70% to the primary project and 10% each to the three projects requiring code reviews. This recognizes the developer's shared expertise role while giving the primary project a clear majority of their time. Build the code review time into the primary project's timeline expectations.", "The developer should do code reviews in their personal time.", "Refuse all requests and let the developer choose."], correctIndex: 1, explanation: "Rigid 100% exclusive allocation ignores the reality that specialists often provide value across multiple projects. A structured split with a primary assignment and supporting roles optimizes the specialist's overall contribution." },
        { id: "rm-alloc-q3", scenario: "Your organization uses a matrix structure. A project manager and a functional manager disagree about a team member's assignment. The PM wants them full-time on a project; the functional manager wants them on a training course next week. Who should have decision authority?", options: ["The project manager always wins \u2014 project deadlines matter more.", "This should be resolved through a pre-agreed RACI model: typically the functional manager owns resource development and long-term career planning, while the project manager directs day-to-day work assignments. A portfolio-level escalation path should exist for conflicts, weighing project urgency against development investment.", "The functional manager always wins.", "Let the team member decide."], correctIndex: 1, explanation: "Matrix conflicts require clear governance. A RACI model establishes decision rights, and the escalation path ensures that genuine conflicts are resolved based on the relative urgency and long-term value of each claim." },
      ],
    },
    {
      id: "rm-capacity",
      title: "Capacity Management & Forecasting",
      description: "Forecasting resource demand and managing organizational capacity",
      videoTitle: "Capacity Planning and Forecasting",
      videoDescription: "Learn to forecast resource demand across the portfolio horizon, build capacity models, identify future bottlenecks, and develop strategies to align capacity with anticipated demand.",
      keyConcepts: [
        "Capacity forecasting projects resource demand 3-12 months forward, using pipeline data and project plans to anticipate needs before they become urgent.",
        "Rolling wave capacity planning provides detailed near-term forecasts (1-3 months) with progressively less detail for longer horizons.",
        "Bottleneck identification highlights skills or roles where demand consistently exceeds supply, triggering proactive hiring, training, or outsourcing.",
        "Scenario planning models best-case, likely-case, and worst-case demand scenarios to prepare contingency plans for each.",
      ],
      questions: [
        { id: "rm-cap-q1", scenario: "Your 6-month capacity forecast shows adequate overall headcount but a critical shortage of cybersecurity specialists starting in month 4. Hiring takes 3 months. When should you act?", options: ["Wait until month 4 and then start hiring.", "Act immediately: initiate hiring now so specialists onboard by month 4, simultaneously explore short-term options (contracting, cross-training existing staff) in case hiring takes longer than expected. Early warning from the capacity forecast is only valuable if it triggers early action.", "The forecast is too uncertain to act on.", "Ask projects to delay cybersecurity work."], correctIndex: 1, explanation: "Capacity forecasting exists to enable proactive action. A 3-month hiring lead time against a month-4 shortfall means action must begin now. Waiting until the shortfall materializes wastes the forecast's early-warning value." },
        { id: "rm-cap-q2", scenario: "Three separate capacity forecasting tools are used across the organization: one by the PMO, one by HR, and one by Finance. Each shows different numbers. What should you recommend?", options: ["Let each team use their own tool.", "Consolidate into a single source of truth for capacity data. Multiple tools with different data create conflicting decisions \u2014 HR hires based on one forecast while the PMO plans based on another. A unified capacity management system ensures all stakeholders work from consistent data.", "Average the three forecasts.", "Only use the PMO's forecast since they manage projects."], correctIndex: 1, explanation: "Multiple conflicting capacity tools create decision chaos. A single source of truth ensures that hiring, allocation, and project authorization decisions are all based on consistent capacity data." },
        { id: "rm-cap-q3", scenario: "Your capacity model assumes all team members work at the same productivity level. A senior developer produces 3x the output of a junior developer. How does this affect capacity planning?", options: ["Treat all developers as interchangeable units.", "Factor productivity weighting into capacity models. Replacing a departing senior developer with a junior one does not maintain capacity even if headcount is unchanged. Capacity planning should use capability-weighted units that account for experience, skill level, and demonstrated productivity differences.", "Only count senior developers in capacity plans.", "Ignore productivity differences \u2014 they even out over time."], correctIndex: 1, explanation: "Treating all resources as equal units produces inaccurate capacity forecasts. Capability-weighted planning acknowledges that experience and skill materially affect throughput, enabling more realistic demand-supply matching." },
      ],
    },
    {
      id: "rm-demand",
      title: "Demand Management",
      description: "Shaping and controlling resource demand across the portfolio",
      videoTitle: "Managing Resource Demand",
      videoDescription: "Learn how to manage and shape resource demand through intake controls, demand smoothing, scope right-sizing, and portfolio-level demand governance.",
      keyConcepts: [
        "Demand management proactively shapes the volume and timing of resource requests rather than reactively responding to whatever arrives.",
        "Demand smoothing distributes resource demand more evenly across time periods, avoiding peaks that exceed capacity.",
        "Scope right-sizing ensures projects request only the resources they genuinely need, preventing gold-plating and over-staffing.",
        "Demand governance requires that new resource requests go through a portfolio-level review before allocation, preventing ad-hoc commitments.",
      ],
      questions: [
        { id: "rm-dem-q1", scenario: "Every project in your portfolio is requesting top-tier senior developers, but you only have a few. Mid-level and junior developers are underutilized. How should you address this demand pattern?", options: ["Only assign seniors \u2014 quality requires it.", "Implement demand right-sizing: work with project managers to identify which tasks genuinely require senior expertise and which can be performed by mid-level developers with appropriate support. This aligns demand with reality, optimizes senior resource utilization for high-impact work, and develops mid-level talent.", "Promote all mid-level developers to senior.", "Tell projects they cannot have senior developers."], correctIndex: 1, explanation: "Not all project work requires senior expertise. Demand right-sizing ensures seniors focus on tasks that truly need their skills while mid-level developers handle appropriate work with mentoring \u2014 developing the pipeline while optimizing allocation." },
        { id: "rm-dem-q2", scenario: "Three projects all want to start user acceptance testing in the same 2-week window, requiring the same pool of business testers. There are not enough testers for simultaneous UAT. What demand management technique should you apply?", options: ["Run all three UATs simultaneously and accept the quality risk.", "Apply demand smoothing: stagger the UAT phases across different 2-week windows so each project gets adequate tester coverage. This may require adjusting one or two project schedules slightly but ensures each UAT receives the attention needed for thorough testing.", "Cancel UAT for two of the three projects.", "Hire temporary testers who do not know the business."], correctIndex: 1, explanation: "Demand smoothing redistributes resource-intensive activities to avoid peaks. Slightly adjusting project schedules to stagger UAT is far less disruptive than running parallel under-resourced testing cycles that produce poor quality." },
        { id: "rm-dem-q3", scenario: "A project manager routinely over-requests resources \u2018just in case,\u2019 hoarding 3 extra team members who are often idle. Other projects are short-staffed. How should governance address this?", options: ["Allow it \u2014 the PM is being cautious.", "Implement resource request validation through governance: require justification for each resource request tied to specific deliverables and timelines. Track actual utilization against planned allocation and address chronic over-requesting through coaching and accountability. Unused allocated resources should be returned to the pool.", "Remove the PM from the project.", "Let other PMs also over-request to be fair."], correctIndex: 1, explanation: "Resource hoarding is an anti-pattern that starves other projects while wasting capacity. Governance should require evidence-based requests, monitor utilization, and create incentives for accurate forecasting rather than defensive over-allocation." },
      ],
    },
    {
      id: "rm-skills",
      title: "Skills Management & Development",
      description: "Building and maintaining the right skills across the organization",
      videoTitle: "Skills Management for Portfolio Success",
      videoDescription: "Learn how to assess organizational skill gaps, build development programs, and create a skills strategy that ensures the workforce can support current and future portfolio needs.",
      keyConcepts: [
        "A skills inventory maps each resource's competencies, certifications, experience levels, and development interests \u2014 the foundation for skill-based assignment.",
        "Skills gap analysis compares the skills the portfolio demands (now and future) against the skills the organization has, identifying development priorities.",
        "Build-versus-buy decisions determine whether skill gaps are addressed through training existing staff, hiring, or contracting.",
        "T-shaped professionals (deep expertise in one area with broad knowledge across related areas) provide the most versatile portfolio resources.",
      ],
      questions: [
        { id: "rm-sk-q1", scenario: "Your portfolio is shifting toward AI/ML projects, but your skills inventory shows zero data scientists and minimal Python expertise. The first AI project starts in 4 months. What is your recommended approach?", options: ["Cancel the AI projects until the organization has the skills.", "Implement a blended approach: hire 2-3 experienced data scientists immediately to lead the work and establish practices, simultaneously enroll promising existing analysts in intensive data science training programs, and engage a consulting firm for short-term capacity while internal capability builds.", "Train all existing staff in AI over 4 months.", "Outsource all AI work permanently."], correctIndex: 1, explanation: "Significant skill gaps require a multi-pronged response. Hiring brings immediate capability, training builds long-term internal capacity, and consulting bridges the transition \u2014 each alone is insufficient for a strategic capability shift." },
        { id: "rm-sk-q2", scenario: "Your skills inventory was created 2 years ago and has not been updated. A project manager complains that the \u2018Java expert\u2019 assigned to their project actually learned Java 10 years ago and is now primarily a Python developer. What process improvement is needed?", options: ["Skills inventories do not need updating.", "Implement a regular skills refresh process: conduct annual skills assessments, allow employees to self-update their profiles continuously, validate skills through managers and project performance reviews, and integrate skills tracking into HR systems so it stays current as people develop new capabilities and their older skills become outdated.", "Let project managers assess skills during interviews.", "Remove the skills inventory \u2014 it is inaccurate anyway."], correctIndex: 1, explanation: "A stale skills inventory is worse than none because it creates false confidence in assignments. Regular refresh processes, combined with self-service updates and validation, keep the inventory actionable and trustworthy." },
        { id: "rm-sk-q3", scenario: "A high-performing developer asks to spend 20% of their time learning a new technology that is not currently used in any project. Their manager wants to deny the request to maintain project output. How should you advise?", options: ["Deny it \u2014 100% of time should be on project work.", "Support a structured development investment: if the technology aligns with the portfolio's strategic direction, investing 20% of one person's time builds future capability that benefits the entire portfolio. Create a development agreement with expected outcomes, and consider how the new skill could be applied to upcoming pipeline projects.", "Only allow learning during personal time.", "Grant it without any conditions or expectations."], correctIndex: 1, explanation: "Strategic skill development is an investment, not a cost. If the technology aligns with where the portfolio is heading, developing internal expertise proactively is far cheaper than scrambling to acquire it reactively when projects demand it." },
      ],
    },
  ],
};

const risksAndIssues: TrainingModule = {
  id: "risks-and-issues",
  name: "Risks and Issues Management",
  subtitle: "Build skills in identifying, assessing, and mitigating risks and managing issues",
  certPrefix: "RI",
  lessons: [
    {
      id: "ri-identification",
      title: "Risk Identification Techniques",
      description: "Systematic methods for uncovering project and portfolio risks",
      videoTitle: "Identifying Risks Effectively",
      videoDescription: "Learn proven techniques for systematically identifying risks including brainstorming, checklists, SWOT analysis, assumption analysis, and expert interviews.",
      keyConcepts: [
        "Risk identification should be ongoing throughout the project lifecycle, not a one-time activity during planning.",
        "Techniques include brainstorming, Delphi method, checklists from historical data, SWOT analysis, root cause analysis, and assumption testing.",
        "Risks should be documented with clear descriptions of the uncertain event, its potential cause, and its potential impact on objectives.",
        "A risk breakdown structure (RBS) categorizes risks by source (technical, external, organizational, project management) for systematic coverage.",
      ],
      questions: [
        { id: "ri-id-q1", scenario: "Your project team conducted a risk identification workshop at project kickoff and identified 15 risks. It is now 3 months into a 12-month project and no new risks have been added. The team says all risks were identified initially. What should you do?", options: ["Accept their assessment \u2014 a thorough initial workshop is sufficient.", "Challenge this assumption: risk identification must be ongoing. Schedule regular risk review sessions (at least monthly), include new risks from status meetings, and conduct fresh identification workshops before each major project phase \u2014 new risks emerge as the project progresses and conditions change.", "Add a few generic risks to the register to fill it.", "Only review risks when something goes wrong."], correctIndex: 1, explanation: "Risk profiles change as projects progress. Initial identification captures planning-phase risks, but execution reveals new risks that were unknowable earlier. Ongoing identification is essential for effective risk management." },
        { id: "ri-id-q2", scenario: "You are using a risk checklist from a previous similar project to identify risks for a new project. The team is only checking items on the list without generating new risks. What is the problem?", options: ["Checklists are comprehensive enough on their own.", "Checklists should supplement but not replace creative risk identification techniques. While they capture known risks from previous experience, they miss novel risks specific to the current project context. Combine the checklist with brainstorming, assumption analysis, and expert interviews to identify both known and unknown risks.", "Use a longer checklist.", "Abandon checklists entirely."], correctIndex: 1, explanation: "Checklists capture historical risks but create a false sense of completeness. Every project has unique risks that no checklist anticipates. A combination of techniques ensures both known and novel risks are identified." },
        { id: "ri-id-q3", scenario: "A team member mentions during a casual conversation that the vendor might not be able to deliver the custom hardware on time. When you check the risk register, this is not documented. What should happen?", options: ["Casual conversations are not formal risk inputs.", "Any identified uncertain event that could impact project objectives should be captured in the risk register regardless of how it was discovered. Document the vendor delivery risk immediately with the team member's input, assess its probability and impact, and develop a response plan.", "Only add risks identified in formal workshops.", "Ask the team member to submit a formal risk form."], correctIndex: 1, explanation: "Risks can surface anywhere \u2014 in meetings, conversations, emails, or observations. The source does not matter; what matters is that the risk is captured, assessed, and managed. Making it easy to report risks encourages early identification." },
      ],
    },
    {
      id: "ri-assessment",
      title: "Risk Assessment & Analysis",
      description: "Qualitative and quantitative methods for evaluating risk severity",
      videoTitle: "Assessing and Analyzing Risks",
      videoDescription: "Learn how to evaluate risks using qualitative methods (probability-impact matrices) and quantitative methods (expected monetary value, Monte Carlo simulation) to prioritize response efforts.",
      keyConcepts: [
        "Qualitative analysis uses probability and impact scales (typically 1-5 or Low/Medium/High) to rank risks by severity.",
        "The probability-impact matrix maps risks into priority zones, focusing attention on high-probability/high-impact risks first.",
        "Quantitative analysis assigns numerical values (expected monetary value = probability \u00d7 impact) for cost-benefit analysis of responses.",
        "Monte Carlo simulation models the combined effect of multiple risks on project outcomes, producing probability distributions for cost and schedule.",
      ],
      questions: [
        { id: "ri-as-q1", scenario: "Your risk register has 50 risks, all rated as \u2018Medium\u2019 probability and \u2018Medium\u2019 impact. The project manager says this is because the team avoids extreme ratings. How does this undermine risk management?", options: ["Medium ratings for everything are appropriately cautious.", "When all risks are rated identically, the assessment provides no differentiation for prioritization. The team cannot determine which risks require immediate attention versus monitoring. Recalibrate the assessment by providing clear rating criteria with examples, using facilitated sessions to challenge assumptions, and ensuring the full rating scale is used.", "Re-rate everything as High to be safe.", "Remove the ratings and just list the risks."], correctIndex: 1, explanation: "Uniform ratings defeat the purpose of assessment: prioritization. Without differentiation, teams cannot focus limited resources on the most threatening risks. Clear calibration criteria and facilitated discussions help teams use the full scale accurately." },
        { id: "ri-as-q2", scenario: "A risk has a 10% probability of occurring, but if it does, it would cause $2M in cost overrun and a 6-month schedule delay. A team member argues it is a low priority because the probability is only 10%. How should you evaluate this?", options: ["10% probability means it is indeed low priority.", "Calculate the Expected Monetary Value (EMV): 10% \u00d7 $2M = $200K. Despite low probability, the extreme impact makes this a significant risk. The EMV of $200K plus the 6-month schedule exposure justifies a proactive response plan. Low-probability/high-impact risks are often the most dangerous because they are underestimated.", "Ignore it until probability increases.", "Only consider probability, not impact."], correctIndex: 1, explanation: "Risk priority must consider both probability AND impact. A 10% chance of a catastrophic outcome demands attention. EMV analysis quantifies this, and the qualitative impact (6-month delay) may justify response investment well beyond what EMV alone suggests." },
        { id: "ri-as-q3", scenario: "The project sponsor requests a Monte Carlo simulation for a small 3-month project with a $200K budget. Is this appropriate?", options: ["Yes \u2014 Monte Carlo should be used on every project.", "Monte Carlo simulation is typically warranted for large, complex projects where the combined effect of multiple uncertainties significantly impacts outcomes. For a small, short project, qualitative assessment with a simple probability-impact matrix is usually sufficient and more cost-effective. Reserve quantitative methods for projects where the scale justifies the analytical investment.", "Monte Carlo is never useful.", "Only use it if the software is already available."], correctIndex: 1, explanation: "Analysis techniques should be proportionate to project size and complexity. Monte Carlo adds value on large projects with many interacting risks; on small projects, simpler techniques provide adequate risk insight with less overhead." },
      ],
    },
    {
      id: "ri-response",
      title: "Risk Response Planning",
      description: "Strategies for threats and opportunities: avoid, transfer, mitigate, accept",
      videoTitle: "Planning Risk Responses",
      videoDescription: "Learn the four response strategies for threats (avoid, transfer, mitigate, accept) and four for opportunities (exploit, share, enhance, accept), and how to select the most cost-effective response for each risk.",
      keyConcepts: [
        "Threat responses: Avoid (eliminate the risk), Transfer (shift to a third party, e.g., insurance), Mitigate (reduce probability or impact), Accept (acknowledge and budget contingency).",
        "Opportunity responses: Exploit (ensure it happens), Share (partner to capture it), Enhance (increase probability or impact), Accept (take advantage if it occurs naturally).",
        "Response cost should not exceed the expected impact of the risk \u2014 a $100K mitigation for a $50K risk is a poor investment.",
        "Residual risk (remaining exposure after response) and secondary risk (new risks created by the response) must both be assessed.",
      ],
      questions: [
        { id: "ri-resp-q1", scenario: "A critical vendor might go bankrupt (20% probability), which would halt your project for 3 months and cost $500K. The team proposes three responses: (A) ignore it, (B) pre-qualify a backup vendor for $30K, (C) bring all work in-house for $400K. Which response is most appropriate?", options: ["A \u2014 20% is too low to worry about.", "B \u2014 Pre-qualifying a backup vendor for $30K is the most cost-effective mitigation. The EMV of the risk is $100K (20% \u00d7 $500K). Spending $30K to significantly reduce the impact is proportionate. Option C ($400K) costs nearly as much as the risk itself, and Option A leaves the project fully exposed.", "C \u2014 Eliminate all vendor dependency.", "Accept the risk but increase the contingency budget by $500K."], correctIndex: 1, explanation: "Response cost must be proportionate to risk exposure. A $30K mitigation against a $100K EMV is efficient. The $400K option is disproportionate, and ignoring a risk with $500K potential impact is negligent." },
        { id: "ri-resp-q2", scenario: "Your mitigation plan for a technology risk is to \u2018hire an expert.\u2019 The risk owner has not identified who, when, or at what cost. How should this response plan be improved?", options: ["The intent is clear enough.", "Response plans must be actionable: specify the type of expert needed, the timeline for engagement, the budget allocated, who is responsible for hiring, and the trigger condition that activates the response. Vague plans create a false sense of security because they cannot be executed when the risk materializes.", "Add \u2018ASAP\u2019 to the plan.", "Only detail plans for high-priority risks."], correctIndex: 1, explanation: "A risk response plan that cannot be immediately executed when needed is not a plan \u2014 it is a wish. Actionable responses specify the who, what, when, how much, and trigger conditions needed for timely execution." },
        { id: "ri-resp-q3", scenario: "After implementing a risk mitigation (adding redundant servers), a new risk emerges: the redundant infrastructure doubles the maintenance burden. What risk management concept does this illustrate?", options: ["The mitigation failed and should be reversed.", "This is a secondary risk \u2014 a new risk created by implementing a risk response. Secondary risks must be identified, assessed, and managed just like primary risks. The net risk position improves only if the original risk reduction outweighs the secondary risk introduced.", "Secondary risks are unavoidable and should be accepted.", "The risk register should only track original risks."], correctIndex: 1, explanation: "Every risk response can create secondary risks. Effective risk management identifies and assesses these secondary risks to ensure the response actually improves the net risk position rather than simply trading one risk for another." },
      ],
    },
    {
      id: "ri-monitoring",
      title: "Risk Monitoring & Control",
      description: "Tracking risks, triggers, and response effectiveness throughout the project",
      videoTitle: "Monitoring and Controlling Risks",
      videoDescription: "Learn how to establish ongoing risk monitoring processes including trigger tracking, risk audits, variance analysis, and the feedback loops that keep risk management effective throughout execution.",
      keyConcepts: [
        "Risk monitoring tracks identified risks, watches for trigger conditions, and detects new risks that emerge during execution.",
        "Risk triggers are early warning indicators that a risk event is about to occur, enabling proactive response activation.",
        "Risk audits evaluate the effectiveness of risk responses and the quality of the risk management process itself.",
        "Earned Value analysis and trend metrics can serve as quantitative risk indicators when SPI or CPI trends deteriorate.",
      ],
      questions: [
        { id: "ri-mon-q1", scenario: "A risk trigger was defined as \u2018vendor fails to deliver prototype by March 15.\u2019 It is now March 20 and no prototype has arrived, but the risk owner has not activated the response plan. What process failure occurred?", options: ["5 days late is not significant enough to act.", "The risk monitoring process failed: either the trigger was not being tracked, the risk owner was not aware of their responsibility, or there is no process to ensure triggers are reviewed regularly and responses are activated. Implement automated trigger tracking, assign clear ownership, and establish regular review checkpoints.", "The risk should be removed since the trigger has passed.", "Wait another week before acting."], correctIndex: 1, explanation: "Triggers exist to prompt timely action. A trigger that fires without activating a response means the monitoring process is broken. Regular reviews, clear ownership, and automated alerts ensure triggers translate into timely action." },
        { id: "ri-mon-q2", scenario: "Your project's SPI has declined from 1.0 to 0.92 to 0.85 over the past three months. The risk register does not include schedule risk because the initial plan was considered robust. What should you do?", options: ["SPI decline is a project management issue, not a risk.", "The SPI trend is a quantitative risk indicator: a consistent decline signals emerging schedule risk. Add a schedule performance risk to the register, investigate root causes (scope creep, resource issues, estimation accuracy), and implement corrective responses before the trend becomes a crisis.", "Only add it to the risk register when SPI drops below 0.80.", "Re-baseline the schedule to reset SPI to 1.0."], correctIndex: 1, explanation: "Quantitative performance trends are powerful risk indicators. A consistent SPI decline predicts future schedule problems. Adding it to the risk register formalizes monitoring and ensures corrective action is planned and tracked." },
        { id: "ri-mon-q3", scenario: "A risk audit finds that 60% of risk responses have not been tested or rehearsed. The risk owners say they will execute the responses when needed. What is the concern?", options: ["Responses should only be executed when risks occur.", "Untested risk responses may fail when needed most. Risk responses for high-priority risks should be validated through tabletop exercises, rehearsals, or proof-of-concept tests. Discovering that a response does not work during a crisis is far worse than investing in pre-testing during calm periods.", "Testing responses wastes time and budget.", "Only test responses for the top 3 risks."], correctIndex: 1, explanation: "Untested response plans have unknown effectiveness. Like disaster recovery plans that are never rehearsed, they may fail when needed most. Testing validates that responses work, identifies gaps, and builds team readiness." },
      ],
    },
    {
      id: "ri-issues",
      title: "Issue Management",
      description: "Tracking and resolving issues that have already materialized",
      videoTitle: "Managing Issues Effectively",
      videoDescription: "Learn the distinction between risks and issues, and master the issue management process: logging, categorizing, prioritizing, assigning, tracking, escalating, and resolving issues that impact project performance.",
      keyConcepts: [
        "Issues are current problems that are actively impacting the project, unlike risks which are uncertain future events.",
        "An issue log captures the issue description, impact, priority, owner, action plan, target resolution date, and current status.",
        "Escalation criteria define when issues must be elevated to higher management levels based on impact severity, resolution time, or cross-project effects.",
        "Root cause analysis for resolved issues prevents recurrence and feeds lessons learned back into risk identification for future projects.",
      ],
      questions: [
        { id: "ri-iss-q1", scenario: "A key team member has resigned (this has already happened \u2014 it is not uncertain). The project manager logged it in the risk register as a \u2018High\u2019 risk. What is wrong with this classification?", options: ["Nothing \u2014 it is a high-priority item.", "The team member's resignation is an issue, not a risk. It has already occurred and is actively impacting the project. It should be logged in the issue log with an immediate action plan (knowledge transfer, backfill timeline, interim coverage). Risks are uncertain future events; issues are current realities requiring immediate response.", "Classify it as both a risk and an issue.", "Remove it from all tracking \u2014 resignations happen."], correctIndex: 1, explanation: "The distinction between risks (uncertain future events) and issues (current problems) matters because they require different management approaches. Issues demand immediate action plans, not probability assessments." },
        { id: "ri-iss-q2", scenario: "An issue has been open for 6 weeks. The assigned owner submits weekly updates saying \u2018working on it\u2019 with no concrete progress or revised plan. What should the project manager do?", options: ["Continue accepting weekly updates \u2014 the owner needs time.", "Escalate the issue: 6 weeks without concrete progress signals the issue is either unresolvable at the current level, inadequately resourced, or deprioritized by the owner. Escalate to the appropriate management level with a clear summary of the impact, the actions attempted, and a request for additional support or decision authority.", "Remove the issue from the log since it is not progressing.", "Assign a new owner without escalation."], correctIndex: 1, explanation: "Stale issues with no progress indicate that the current resolution approach is not working. Escalation brings additional resources, authority, or attention to break the logjam before the impact grows." },
        { id: "ri-iss-q3", scenario: "After resolving a critical integration issue that delayed the project by 2 weeks, the team moves on immediately to catch up. No root cause analysis is performed. What organizational learning opportunity is lost?", options: ["Root cause analysis is only for manufacturing defects.", "Without root cause analysis, the organization cannot understand why the issue occurred, whether other projects face similar exposure, or what process changes would prevent recurrence. The lesson is lost, and similar integration issues will likely recur in future projects \u2014 costing time and money repeatedly.", "The issue is resolved \u2014 analysis adds no value.", "Only perform root cause analysis for issues that cause more than 4 weeks of delay."], correctIndex: 1, explanation: "Root cause analysis is how organizations learn. Without it, the same types of issues recur across projects. The investment in understanding why it happened pays dividends in preventing future occurrences across the entire portfolio." },
      ],
    },
  ],
};

const predictiveAnalytics: TrainingModule = {
  id: "predictive-analytics",
  name: "Predictive Analytics",
  subtitle: "Leverage data-driven insights and forecasting to make better project decisions",
  certPrefix: "PA",
  lessons: [
    {
      id: "pa-foundations",
      title: "Foundations of Project Analytics",
      description: "Building a data-driven project management culture",
      videoTitle: "Data-Driven Project Management",
      videoDescription: "Learn how data analytics transforms project management from reactive to proactive, and understand the data landscape of modern project portfolios.",
      keyConcepts: [
        "Predictive analytics uses historical data, statistical algorithms, and machine learning to forecast future project outcomes.",
        "Descriptive analytics (what happened) must be mastered before progressing to predictive (what will happen) and prescriptive (what should we do).",
        "Data quality is the foundation: inaccurate, incomplete, or inconsistent project data produces unreliable predictions regardless of analytical sophistication.",
        "A data-driven culture requires leadership commitment, tool investment, analytical skill development, and willingness to let data challenge intuition.",
      ],
      questions: [
        { id: "pa-found-q1", scenario: "Your organization tracks project status using manual Red/Amber/Green ratings based on project manager judgment. A VP wants to implement AI-powered predictive analytics. What prerequisite must be addressed first?", options: ["Implement AI immediately \u2014 it will fix data quality issues.", "Establish consistent, objective, quantitative data collection first. AI and predictive models require reliable historical data (actual vs. planned dates, effort, costs, scope changes) to train on. Subjective RAG ratings provide insufficient data quality and granularity for meaningful predictive analytics.", "Replace project managers with data scientists.", "Buy the most expensive analytics platform available."], correctIndex: 1, explanation: "Predictive analytics follows the garbage-in-garbage-out principle. Without a foundation of consistent, quantitative data collection, even sophisticated models will produce unreliable predictions. Data quality is the essential prerequisite." },
        { id: "pa-found-q2", scenario: "A PMO analyst has built a dashboard showing 50 different project metrics. Stakeholders are overwhelmed and ignore it. How should the analytics approach be improved?", options: ["Add more metrics for completeness.", "Curate a focused set of leading and lagging indicators that drive decisions. Identify the 5-8 metrics that actually influence portfolio actions (e.g., SPI trend, resource utilization, risk exposure, benefits realization rate), present them with context and thresholds, and provide drill-down capability for those who need detail.", "Remove all metrics and use intuition.", "Create a separate dashboard for each stakeholder."], correctIndex: 1, explanation: "Analytics value comes from actionable insight, not data volume. A curated set of decision-driving metrics with clear thresholds and context enables stakeholders to act, while excessive metrics create analysis paralysis." },
        { id: "pa-found-q3", scenario: "Your historical project data spans 5 years but the first 3 years used a different methodology and tracking system. An analyst wants to use all 5 years for predictive modeling. What concern should you raise?", options: ["More data is always better for predictions.", "Data consistency matters more than volume. If methodology, tracking processes, or definitions changed significantly, the first 3 years of data may not be comparable to the recent 2 years. Mixing incompatible data can produce misleading patterns. Use only the consistent recent data, or normalize the older data if the differences can be quantified.", "Only use the first 3 years since there is more data.", "Discard all data and start fresh."], correctIndex: 1, explanation: "Inconsistent historical data can poison predictive models. A model trained on mixed methodologies may learn patterns from the old approach that do not apply to current practices. Data consistency is more important than data volume." },
      ],
    },
    {
      id: "pa-forecasting",
      title: "Project Forecasting Methods",
      description: "Techniques for predicting project outcomes using data",
      videoTitle: "Forecasting Project Performance",
      videoDescription: "Master quantitative forecasting techniques including earned value projections, regression analysis, reference class forecasting, and trend-based estimation.",
      keyConcepts: [
        "Earned Value forecasting uses CPI and SPI trends to project final cost (EAC) and completion date, providing early warning of overruns.",
        "Reference class forecasting compares the current project to a reference class of similar completed projects, reducing optimism bias.",
        "Regression analysis identifies statistical relationships between project characteristics and outcomes, enabling predictions for new projects.",
        "Trend-based forecasting uses moving averages and velocity trends (common in agile) to project future performance.",
      ],
      questions: [
        { id: "pa-fc-q1", scenario: "A project is 40% complete with a CPI of 0.85. The project manager says the team will improve and finish on the original budget. Historical data shows that CPI at 40% completion is a strong predictor of final CPI. What should you forecast?", options: ["Trust the PM's optimism \u2014 they know their team.", "Use the data: calculate EAC (Estimate at Completion) using the current CPI. EAC = BAC / CPI = Budget / 0.85, projecting approximately 18% cost overrun. Research consistently shows that CPI stabilizes by 20-40% completion and rarely improves significantly. The data-driven forecast should be presented alongside the PM's optimistic scenario.", "Wait until 80% complete to forecast.", "Use the original budget as the forecast."], correctIndex: 1, explanation: "Research shows CPI rarely improves after 20% completion. Data-driven forecasting (EAC = BAC/CPI) provides a more reliable prediction than optimistic assumptions. Presenting both scenarios enables informed decision-making." },
        { id: "pa-fc-q2", scenario: "A new ERP implementation project is being estimated. The team estimates 12 months. Your reference class of 15 similar ERP implementations shows an average of 18 months with a range of 14-24 months. How should you use this data?", options: ["Ignore the reference class \u2014 this project is different.", "Present the reference class data to stakeholders: while the team estimates 12 months, the statistical evidence from 15 comparable projects suggests 18 months is more likely, with a range of 14-24 months. Use this to set realistic expectations, plan appropriate contingency, and identify what would need to be true for the 12-month estimate to hold.", "Average the team's estimate with the reference class (15 months).", "Only use the reference class if the team agrees."], correctIndex: 1, explanation: "Reference class forecasting is one of the most powerful debiasing tools available. Teams consistently underestimate due to optimism bias. Presenting comparable historical data provides a reality check without dismissing the team's specific knowledge." },
        { id: "pa-fc-q3", scenario: "An agile team's velocity has been 20, 22, 18, 21, 19, 23 story points per sprint over the last 6 sprints. The remaining backlog is 150 story points. How should you forecast the completion date?", options: ["Use the highest velocity (23) to show the best possible date.", "Calculate the average velocity (20.5 points/sprint) and use it to forecast approximately 7-8 sprints remaining. Also present a range using the min/max velocities: best case ~7 sprints (at 23/sprint) and worst case ~8-9 sprints (at 18/sprint). This gives stakeholders a realistic range rather than a single point estimate.", "Use the most recent sprint only (23).", "Do not forecast \u2014 agile means no predictions."], correctIndex: 1, explanation: "Velocity-based forecasting uses empirical data for credible predictions. The average provides the most likely outcome, while the range (based on min/max velocities) communicates uncertainty honestly, enabling better planning." },
      ],
    },
    {
      id: "pa-montecarlo",
      title: "Monte Carlo Simulation",
      description: "Using probabilistic modeling for schedule and cost analysis",
      videoTitle: "Monte Carlo Simulation for Projects",
      videoDescription: "Learn how Monte Carlo simulation models uncertainty by running thousands of scenarios, producing probability distributions that show the range of possible project outcomes.",
      keyConcepts: [
        "Monte Carlo simulation runs thousands of iterations with randomly sampled values from input distributions, producing a probability distribution of outcomes.",
        "Three-point estimates (optimistic, most likely, pessimistic) for each task provide the input distributions for simulation.",
        "Results are expressed as confidence levels: e.g., \u201c85% confidence the project will finish by June 30\u201d or \u201c90% confidence total cost will be under $5M.\u201d",
        "Sensitivity analysis identifies which uncertain inputs have the greatest impact on the overall outcome, focusing risk management on what matters most.",
      ],
      questions: [
        { id: "pa-mc-q1", scenario: "Your Monte Carlo simulation shows a 50% probability of completing the project by the committed deadline and a 90% probability of completing 6 weeks later. The project sponsor wants to commit to the 50% date. What should you advise?", options: ["50% is acceptable \u2014 it is the median outcome.", "Explain that committing to the 50% date means a coin-flip chance of missing the deadline. For critical commitments, organizations typically commit at the 80-90% confidence level. Recommend committing to a date at the 80% confidence level and presenting the 50% date as an aggressive internal target, with the buffer used to manage identified risks.", "Always commit to the 90% date.", "Simulations are too uncertain to use for commitments."], correctIndex: 1, explanation: "A 50% confidence commitment means the project is equally likely to be late as on time. For business commitments, the confidence level should reflect the consequences of missing the deadline. Higher-stakes commitments warrant higher confidence levels." },
        { id: "pa-mc-q2", scenario: "An analyst runs Monte Carlo simulation using single-point estimates (most likely only) for all task durations. The simulation produces a very narrow range. Why is this result misleading?", options: ["Narrow ranges are more precise and therefore better.", "Using single-point estimates eliminates the uncertainty that Monte Carlo is designed to model. Without three-point estimates (optimistic, most likely, pessimistic) that capture the range of possible durations for each task, the simulation cannot represent real-world variability. The narrow result creates false precision.", "The analyst should use even more iterations.", "Add random noise to the single-point estimates."], correctIndex: 1, explanation: "Monte Carlo's power lies in modeling uncertainty. Single-point estimates are deterministic \u2014 running them through simulation many times just produces the same answer. Three-point estimates capture the real-world range that makes the simulation valuable." },
        { id: "pa-mc-q3", scenario: "A sensitivity analysis from your Monte Carlo simulation shows that one task \u2014 \u2018regulatory approval\u2019 \u2014 accounts for 45% of the total schedule variance. How should this inform your risk management?", options: ["Focus equally on all tasks.", "Concentrate risk management effort on the regulatory approval task: develop detailed response plans, identify leading indicators, explore options to reduce its uncertainty (early filing, parallel submissions, pre-consultations with the regulator), and monitor it closely. This task's variance dominates the overall outcome, so reducing its uncertainty has the greatest impact on project predictability.", "Remove the task from the simulation.", "Accept that regulatory processes cannot be influenced."], correctIndex: 1, explanation: "Sensitivity analysis reveals leverage points. When one input drives 45% of outcome variance, risk management effort concentrated on that input has dramatically more impact than effort spread across all inputs equally." },
      ],
    },
    {
      id: "pa-indicators",
      title: "Leading Indicators & Early Warning Systems",
      description: "Identifying predictive signals before problems become crises",
      videoTitle: "Building Early Warning Systems",
      videoDescription: "Learn to identify and monitor leading indicators that predict future project problems, enabling proactive intervention before issues escalate into crises.",
      keyConcepts: [
        "Leading indicators predict future performance (e.g., requirements stability, team turnover rate), while lagging indicators report past results (e.g., actual cost, completion date).",
        "Effective early warning systems combine quantitative signals (SPI/CPI trends, defect rates) with qualitative signals (team morale, stakeholder engagement).",
        "Threshold-based alerts trigger escalation when indicators cross predefined boundaries, ensuring issues get attention before they become crises.",
        "Pattern recognition across the portfolio identifies systemic issues that affect multiple projects simultaneously.",
      ],
      questions: [
        { id: "pa-ind-q1", scenario: "A project reports Green status every week, but you notice that the requirements change rate has tripled in the last month and two key team members have updated their LinkedIn profiles. What do these signals suggest?", options: ["Requirements changes are normal; LinkedIn activity is personal.", "These are leading indicators of potential problems: a high requirements change rate suggests scope instability that will likely cause schedule and cost overruns. Updated LinkedIn profiles may indicate retention risk. Together, they paint a picture of a project under stress that the lagging indicators (status reports) have not yet reflected.", "Only trust the official Green status.", "Confront the team members about their LinkedIn activity."], correctIndex: 1, explanation: "Leading indicators often reveal problems before they appear in formal reports. Requirements volatility predicts rework and delays; retention signals predict knowledge loss. Effective PMs monitor these soft signals alongside hard metrics." },
        { id: "pa-ind-q2", scenario: "You want to create an early warning dashboard for the portfolio. A colleague suggests using only financial metrics (budget variance, forecast accuracy). What critical categories of leading indicators are missing?", options: ["Financial metrics are comprehensive enough.", "A complete early warning system should also include: schedule indicators (velocity trends, milestone slip rates), quality indicators (defect density trends, rework rates), resource indicators (utilization spikes, turnover, skill gap trends), stakeholder indicators (escalation frequency, decision backlog), and scope indicators (requirements change rate, scope creep measurements).", "Add one non-financial metric for balance.", "Only use metrics available in the project management tool."], correctIndex: 1, explanation: "Financial metrics are lagging indicators that reflect past decisions. A comprehensive early warning system needs leading indicators across multiple dimensions \u2014 scope, schedule, quality, resources, and stakeholders \u2014 to detect problems before they impact financials." },
        { id: "pa-ind-q3", scenario: "Your early warning system flags that 4 of 20 portfolio projects have SPI trends declining for 3 consecutive months. The individual project managers say each case is due to unique circumstances. Should you accept this explanation?", options: ["Yes \u2014 each project is unique.", "Investigate for systemic causes: while each project may have unique contributing factors, a pattern across 20% of the portfolio suggests a common root cause (resource pool issues, organizational change, shared vendor, estimation methodology problems). Portfolio-level pattern analysis reveals systemic issues that individual project managers cannot see.", "Only investigate if more than 50% of projects are affected.", "Trust the project managers and dismiss the pattern."], correctIndex: 1, explanation: "When multiple projects exhibit the same pattern, systemic analysis is essential. Individual project managers see their own context; the portfolio office can identify cross-cutting causes that no single PM would recognize." },
      ],
    },
    {
      id: "pa-advanced",
      title: "Advanced Analytics & Machine Learning",
      description: "Applying advanced techniques to portfolio decision-making",
      videoTitle: "Advanced Analytics for PMOs",
      videoDescription: "Explore how advanced analytics techniques including machine learning, natural language processing, and predictive modeling can enhance portfolio decision-making and project delivery.",
      keyConcepts: [
        "Machine learning models can predict project success probability based on characteristics identified from historical project data.",
        "Natural language processing (NLP) can analyze project reports, risk descriptions, and status updates to detect sentiment shifts and emerging concerns.",
        "Clustering algorithms can group projects by risk profile, identifying which portfolio segments require the most management attention.",
        "Prescriptive analytics goes beyond prediction to recommend optimal actions, such as the best resource allocation or risk response.",
      ],
      questions: [
        { id: "pa-adv-q1", scenario: "A vendor pitches an ML model that claims 95% accuracy in predicting project failure. Your PMO has 3 years of data from 80 completed projects. What questions should you ask before adopting this model?", options: ["95% accuracy means it is definitely worth buying.", "Ask critical questions: Was the model trained on data similar to your organization's projects? How was \u2018failure\u2019 defined? Does 95% accuracy refer to overall accuracy or does it correctly identify failures (recall)? With only 80 projects, is your data sufficient for training and validation? What are the false positive and false negative rates? Can you test it with your data before committing?", "Ask only about the price.", "If it has AI, it must be good."], correctIndex: 1, explanation: "ML model claims require scrutiny. Accuracy metrics can be misleading (a model that predicts \u2018success\u2019 for everything achieves high accuracy when most projects succeed). Understanding the training data, definitions, and error characteristics is essential before adoption." },
        { id: "pa-adv-q2", scenario: "Your PMO has started using sentiment analysis on weekly status reports. The tool flags a project with consistently negative sentiment despite the PM reporting Green status. What should you do?", options: ["Ignore the tool \u2014 the PM's assessment is authoritative.", "Investigate the discrepancy: negative sentiment in status reports while officially Green may indicate the PM is sugar-coating issues or that the team is frustrated with aspects not captured in the formal status. Have a candid conversation with the PM and team to understand the disconnect \u2014 the NLP tool may be detecting valid concerns that the PM is underreporting.", "Override the PM's status to Red based on the tool.", "Disable the sentiment analysis tool."], correctIndex: 1, explanation: "Sentiment analysis can detect undercurrents that formal reporting misses. A discrepancy between sentiment and status is a signal worth investigating \u2014 not to override the PM, but to understand whether important information is being lost in formal reporting." },
        { id: "pa-adv-q3", scenario: "A data scientist proposes building a custom ML model to predict project delivery dates. The model requires 6 months to build, validate, and deploy. In the meantime, the PMO has no predictive capability. What is a pragmatic approach?", options: ["Wait 6 months for the ML model.", "Implement simpler predictive techniques immediately (EVM forecasting, reference class forecasting, velocity-based projections) while the ML model is being developed. These proven methods provide valuable predictions today. When the ML model is ready, compare its predictions against the simpler methods to validate whether the additional sophistication adds meaningful accuracy.", "Cancel the ML project \u2014 simple methods are enough.", "Hire 5 more data scientists to build it faster."], correctIndex: 1, explanation: "Do not let the perfect be the enemy of the good. Simpler predictive methods provide immediate value while advanced capabilities are developed. The ML model's value should ultimately be measured by its incremental accuracy over simpler approaches." },
      ],
    },
  ],
};

const pmoGovernance: TrainingModule = {
  id: "pmo-governance",
  name: "PMO Governance",
  subtitle: "Establish and maintain governance frameworks for effective PMO operations",
  certPrefix: "GOV",
  lessons: [
    {
      id: "gov-frameworks",
      title: "PMO Governance Frameworks",
      description: "Designing governance structures that enable organizational effectiveness",
      videoTitle: "Building a PMO Governance Framework",
      videoDescription: "Learn how to design and implement a comprehensive PMO governance framework that balances oversight with agility, covering decision rights, policies, processes, and organizational structures.",
      keyConcepts: [
        "A governance framework defines decision rights, accountability, policies, and processes for how the PMO operates and oversees project delivery.",
        "Governance should be proportionate: heavyweight governance for large, strategic initiatives and lightweight governance for small, low-risk projects.",
        "The three pillars of PMO governance are structure (roles and bodies), process (how decisions are made), and compliance (how adherence is ensured).",
        "Effective governance enables rather than constrains: it provides clarity, reduces ambiguity, and accelerates decision-making.",
      ],
      questions: [
        { id: "gov-fw-q1", scenario: "Your PMO applies the same governance process to a $50K internal tool improvement and a $5M enterprise transformation. Project managers for small projects complain the overhead is disproportionate. Are they right?", options: ["All projects deserve equal governance rigor.", "Yes \u2014 governance should be proportionate to risk and investment. Implement tiered governance: streamlined processes for small, low-risk projects (delegated approval, light documentation) and rigorous governance for large, strategic initiatives (board approval, full documentation, stage gates). One size does not fit all.", "Remove governance for small projects entirely.", "Make large project governance lighter instead."], correctIndex: 1, explanation: "Proportionate governance matches oversight to risk. Applying enterprise-level governance to small projects creates overhead that discourages compliance and slows delivery without meaningfully reducing risk." },
        { id: "gov-fw-q2", scenario: "Your governance framework was designed 4 years ago when the organization used only waterfall methodology. The organization now uses a mix of waterfall, agile, and hybrid approaches. What governance update is needed?", options: ["Keep the same governance \u2014 methodology does not affect governance.", "Update the governance framework to accommodate different delivery methodologies. Agile projects need governance that aligns with iterative delivery (sprint-level checkpoints, working software as a gate criterion) rather than waterfall-style document-heavy stage gates. The framework should define methodology-appropriate governance for each approach.", "Apply waterfall governance to all agile projects.", "Let agile projects skip governance entirely."], correctIndex: 1, explanation: "Governance frameworks must evolve with the organization. Applying waterfall governance to agile projects creates friction, reduces agility, and drives teams to work around governance rather than within it." },
        { id: "gov-fw-q3", scenario: "A new governance framework has been designed with detailed policies and procedures. It is published on the intranet but no training is provided. After 6 months, compliance is below 30%. What went wrong?", options: ["The governance is too complex.", "Publishing without enablement guarantees low adoption. Governance implementation requires training sessions for all stakeholders, templates and tools that make compliance easy, champions in each team who model and coach the new practices, feedback mechanisms to address implementation issues, and visible executive sponsorship that signals organizational commitment.", "Make compliance mandatory with penalties.", "Simplify the governance to a single page."], correctIndex: 1, explanation: "Governance adoption requires active change management, not passive publication. Training, tooling, coaching, and executive sponsorship transform governance from a document into an organizational practice." },
      ],
    },
    {
      id: "gov-standards",
      title: "Methodology Standards & Templates",
      description: "Establishing consistent practices and deliverable standards",
      videoTitle: "PMO Standards and Methodologies",
      videoDescription: "Learn how to establish, maintain, and evolve methodology standards, templates, and best practices that ensure consistent project delivery quality across the organization.",
      keyConcepts: [
        "Methodology standards define the minimum set of practices, deliverables, and quality criteria that all projects must follow.",
        "Templates and checklists reduce effort, improve consistency, and embed best practices into daily project work.",
        "Standards should be living documents: regularly reviewed, updated based on lessons learned, and adjusted as organizational maturity evolves.",
        "Tailoring guidelines specify how standards can be adapted for different project types, sizes, and methodologies without compromising quality.",
      ],
      questions: [
        { id: "gov-std-q1", scenario: "Your PMO has created 45 mandatory templates for project delivery. Project managers spend more time filling out templates than managing projects. What principle has been violated?", options: ["More templates ensure higher quality.", "The standards have become bureaucratic overhead rather than value-adding guidance. Review all 45 templates, identify which directly contribute to project success and which are administrative, consolidate overlapping templates, and make most optional with a small core set of mandatory deliverables focused on decision support and risk management.", "Add more templates to be comprehensive.", "Make all templates optional."], correctIndex: 1, explanation: "Standards should enable project success, not burden it. When template compliance consumes more effort than the templates' value justifies, the standards have become counterproductive. A lean, focused core set maximizes value while minimizing overhead." },
        { id: "gov-std-q2", scenario: "An experienced project manager wants to skip the risk management template because they manage risks \u2018in their head.\u2019 They have a strong track record. Should you allow this exception?", options: ["Their track record justifies the exception.", "While respecting their experience, core risk management documentation serves purposes beyond the individual PM: it enables portfolio-level risk aggregation, supports transition if the PM leaves, provides audit evidence, and facilitates organizational learning. Offer to streamline the template for their projects rather than eliminating it entirely.", "Require every template without exception.", "Let all experienced PMs skip templates."], correctIndex: 1, explanation: "Even experienced PMs benefit from lightweight documentation. The template's value extends beyond the individual \u2014 portfolio visibility, continuity, compliance, and learning all depend on documented risk management that exists beyond one person's memory." },
        { id: "gov-std-q3", scenario: "Your methodology standards have not been updated in 3 years despite the organization adopting new tools, methodologies, and lessons from recent projects. What is the risk?", options: ["Stability in standards is a virtue.", "Stale standards create a growing gap between official practices and how teams actually work. Teams will either follow outdated practices (reducing effectiveness) or work around the standards (creating inconsistency and compliance issues). Schedule regular standards reviews, incorporate lessons learned, and update for new tools and methods.", "Wait until a major project fails to justify the update.", "Rewrite all standards from scratch."], correctIndex: 1, explanation: "Standards must evolve with the organization. Stale standards lose credibility, creating a shadow culture where teams follow unofficial practices that the PMO cannot see, measure, or improve." },
      ],
    },
    {
      id: "gov-maturity",
      title: "PMO Maturity Assessment",
      description: "Evaluating and advancing organizational project management maturity",
      videoTitle: "Assessing PMO Maturity",
      videoDescription: "Learn how to assess your PMO's maturity level using established models, identify improvement priorities, and create a roadmap for advancing capabilities.",
      keyConcepts: [
        "Maturity models (like OPM3, P3M3, or custom models) provide a structured framework for assessing current capabilities and identifying improvement targets.",
        "Common maturity levels progress from Ad-hoc (Level 1) through Defined (Level 3) to Optimizing (Level 5), with each level building on the previous.",
        "Assessment should cover processes, people, tools, governance, and culture \u2014 maturity is multi-dimensional.",
        "Improvement should be incremental: trying to jump from Level 1 to Level 5 without building intermediate capabilities leads to failure.",
      ],
      questions: [
        { id: "gov-mat-q1", scenario: "Your PMO maturity assessment shows Level 2 (Repeatable) across most areas, but the CIO wants to implement Level 5 (Optimizing) practices immediately. What should you advise?", options: ["Implement Level 5 practices \u2014 aim high.", "Advise against skipping maturity levels: each level builds on the capabilities of the previous one. Jumping to Level 5 without Level 3 and 4 foundations means the advanced practices will not be sustainable. Create a phased improvement roadmap that progresses through each level with measurable milestones and organizational readiness criteria.", "Stay at Level 2 \u2014 improvement is too costly.", "Implement Level 5 in one department as a pilot."], correctIndex: 1, explanation: "Maturity progression must be sequential because each level builds on the previous. Level 5 practices require Level 3-4 foundations. Skipping levels creates a facade of maturity without the underlying capabilities to sustain it." },
        { id: "gov-mat-q2", scenario: "Your PMO scores well on process maturity but poorly on people maturity \u2014 good processes exist but staff lack the skills to use them effectively. What does this imbalance indicate?", options: ["Process is more important than people.", "Maturity is multi-dimensional: strong processes with weak people capability means the processes will be executed poorly or circumvented. Investment must balance across dimensions. In this case, prioritize training, mentoring, certification programs, and hiring to bring people capability in line with process expectations.", "Hire all new staff.", "Simplify the processes to match current skill levels."], correctIndex: 1, explanation: "Process maturity without people maturity creates a gap between what is defined and what is practiced. The investment mix must balance all maturity dimensions \u2014 processes, people, tools, governance, and culture \u2014 for sustainable improvement." },
        { id: "gov-mat-q3", scenario: "After a maturity assessment, your improvement roadmap shows 25 improvement initiatives. The PMO team has capacity for 5. How should you prioritize?", options: ["Attempt all 25 in parallel.", "Identify the 5 initiatives that address the most critical capability gaps with the highest impact on organizational outcomes. Prioritize improvements that enable other improvements (foundational capabilities first), address the biggest pain points reported by stakeholders, and align with strategic objectives. Defer the remaining 20 for subsequent improvement cycles.", "Pick the 5 easiest to implement.", "Only improve areas where you scored lowest."], correctIndex: 1, explanation: "Improvement capacity must be managed like any other resource constraint. Prioritize initiatives that unlock the most value: foundational improvements that enable others, high-pain-point fixes that build stakeholder support, and strategic-aligned improvements." },
      ],
    },
    {
      id: "gov-compliance",
      title: "Compliance & Audit",
      description: "Ensuring adherence to governance standards and regulations",
      videoTitle: "PMO Compliance and Auditing",
      videoDescription: "Learn how to establish compliance monitoring, conduct governance audits, handle non-compliance, and balance enforcement with enablement.",
      keyConcepts: [
        "Compliance monitoring tracks whether teams follow established governance standards, enabling early intervention when deviations occur.",
        "Project audits provide independent assessment of governance adherence, process quality, and deliverable completeness.",
        "Non-compliance should be treated as a learning opportunity first and an enforcement issue second \u2014 understanding why teams deviate is more valuable than punishing deviation.",
        "Regulatory compliance (SOX, GDPR, industry-specific) may impose non-negotiable governance requirements that override internal flexibility.",
      ],
      questions: [
        { id: "gov-comp-q1", scenario: "A governance audit reveals that 40% of projects are not following the change management process. When asked why, project managers say the process is too slow for their needs. How should you respond?", options: ["Enforce compliance with penalties.", "Investigate whether the process is genuinely too slow or cumbersome. A 40% non-compliance rate suggests a systemic process issue, not widespread negligence. Streamline the change management process to be faster while maintaining control, then re-launch with training and support. Address the root cause of non-compliance rather than just the symptom.", "Remove the change management process entirely.", "Only audit the 60% who are compliant."], correctIndex: 1, explanation: "High non-compliance rates usually indicate a process problem, not a people problem. When 40% of practitioners independently arrive at the same workaround, the process likely needs redesign to be practical while maintaining necessary controls." },
        { id: "gov-comp-q2", scenario: "A project under SOX regulatory requirements has skipped two mandatory governance checkpoints because the project manager was \u2018too busy.\u2019 The project sponsor supports the PM's decision. What should you do?", options: ["Accept the sponsor's authority.", "Escalate immediately: regulatory compliance requirements are non-negotiable regardless of sponsor preferences. SOX checkpoints exist for legal compliance, not convenience. Document the deviation, implement the missed checkpoints retroactively where possible, and reinforce that regulatory governance cannot be waived by any internal authority.", "Wait for the next audit to address it.", "Make SOX compliance optional for sponsored projects."], correctIndex: 1, explanation: "Regulatory governance is non-negotiable. Unlike internal standards that can be tailored, legal requirements exist for compliance purposes. No internal authority can waive them, and deviations expose the organization to legal and financial risk." },
        { id: "gov-comp-q3", scenario: "Your PMO conducts quarterly audits that teams dread. Audit results are published as a \u2018compliance scorecard\u2019 that ranks teams publicly. Team managers say this creates a blame culture. How should you improve the approach?", options: ["Public accountability drives compliance.", "Shift from punitive to constructive auditing: use audit findings to identify improvement opportunities, share results privately with team managers first, focus on systemic patterns rather than individual failures, and offer support (training, coaching, tool improvements) alongside findings. Audits should be seen as helpful health checks, not punitive inspections.", "Stop auditing to improve morale.", "Only publish scores for teams that perform well."], correctIndex: 1, explanation: "Punitive auditing drives compliance underground rather than improving practices. Constructive auditing that identifies improvement opportunities and offers support builds a culture where teams welcome governance oversight as a helpful partner." },
      ],
    },
    {
      id: "gov-metrics",
      title: "PMO Performance Metrics",
      description: "Measuring and demonstrating PMO value to the organization",
      videoTitle: "Measuring PMO Performance",
      videoDescription: "Learn how to define, track, and communicate PMO performance metrics that demonstrate the PMO's value to the organization and guide continuous improvement.",
      keyConcepts: [
        "PMO metrics should measure both efficiency (how well the PMO operates) and effectiveness (the impact the PMO has on organizational outcomes).",
        "Leading PMO metrics include: project success rate, average schedule variance, benefits realization rate, stakeholder satisfaction, and resource utilization.",
        "The PMO must demonstrate its value proposition to survive budget cycles \u2014 metrics should connect PMO activities to business outcomes.",
        "Benchmarking against industry peers provides context for whether PMO performance is competitive or needs improvement.",
      ],
      questions: [
        { id: "gov-met-q1", scenario: "The CFO asks you to justify the PMO's existence by demonstrating its value. The PMO costs $2M/year. How should you build the value case?", options: ["List all the activities the PMO performs.", "Quantify the PMO's impact: measure the improvement in project success rates since the PMO was established, calculate cost avoidance from early risk detection and intervention, show the reduction in project failure costs, demonstrate improved resource utilization, and compare portfolio delivery performance before and after the PMO. Connect PMO activities directly to financial and strategic outcomes.", "Ask the CFO to trust that the PMO adds value.", "Cut the PMO budget to seem more efficient."], correctIndex: 1, explanation: "PMO value must be demonstrated in business terms. The CFO needs to see ROI: what the PMO costs versus what it saves, prevents, and enables. Connecting PMO activities to measurable organizational outcomes is essential for ongoing support." },
        { id: "gov-met-q2", scenario: "Your PMO tracks 30 metrics but cannot articulate which 3-5 matter most for demonstrating value. What should you do?", options: ["All 30 metrics are equally important.", "Identify the 3-5 metrics that most directly connect PMO activity to organizational value: project success rate (effectiveness), schedule and cost predictability (reliability), benefits realization rate (impact), and stakeholder satisfaction (perceived value). Use these as your headline metrics and keep others as supporting diagnostics available for drill-down.", "Track 50 metrics for more coverage.", "Only report the metrics that look good."], correctIndex: 1, explanation: "A focused set of headline metrics tells a clear value story. Too many metrics dilute the message and confuse stakeholders. The vital few should answer: Are we delivering? Are we reliable? Are we generating value? Are stakeholders satisfied?" },
        { id: "gov-met-q3", scenario: "Your PMO's project success rate has improved from 65% to 82% over 3 years. However, a new executive dismisses this saying \u2018the bar for success is probably too low.\u2019 How should you address this concern?", options: ["Ignore the executive \u2014 the data speaks for itself.", "Welcome the challenge and provide transparency: share the success criteria (on-time, on-budget, full scope delivery, benefits realization), show how they compare to industry benchmarks (where 60-70% is typical), present the specific improvements made, and offer to review and adjust the criteria collaboratively. Transparency builds credibility more effectively than defensiveness.", "Lower the success criteria to show higher numbers.", "Raise the criteria and accept a lower success rate."], correctIndex: 1, explanation: "Credibility comes from transparency. Showing the criteria, benchmarking against industry standards, and inviting collaborative review demonstrates confidence in the data while addressing the executive's legitimate concern about measurement rigor." },
      ],
    },
  ],
};

export const allModules: TrainingModule[] = [
  portfolioManagement,
  projectPortfolioManagement,
  optimization,
  resourceManagement,
  scheduleManagement,
  risksAndIssues,
  predictiveAnalytics,
  pmoGovernance,
];

export function getModuleById(id: string): TrainingModule | undefined {
  return allModules.find((m) => m.id === id);
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
