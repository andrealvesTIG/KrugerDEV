import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  Play,
  ChevronRight,
  Trophy,
  BookOpen,
  HelpCircle,
  Video,
  Lock,
  Download,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { jsPDF } from "jspdf";

interface QuizQuestion {
  id: string;
  scenario: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

interface Lesson {
  id: string;
  title: string;
  description: string;
  videoTitle: string;
  videoDescription: string;
  keyConcepts: string[];
  questions: QuizQuestion[];
}

const lessons: Lesson[] = [
  {
    id: "intro",
    title: "Introduction to Schedule Management",
    description: "What it is, why it matters",
    videoTitle: "Introduction to Schedule Management",
    videoDescription:
      "This lesson covers the fundamentals of schedule management in project environments. You will learn why schedule management is a critical knowledge area, how it fits within overall project management, and the key processes involved in planning, developing, and controlling a project schedule.",
    keyConcepts: [
      "Schedule management is the process of planning, developing, managing, executing, and controlling the project schedule.",
      "A well-managed schedule ensures timely delivery, resource optimization, and stakeholder confidence.",
      "Key inputs include the project scope statement, WBS, activity list, and organizational process assets.",
      "The schedule management plan defines the methodology, tools, and reporting frequency for schedule activities.",
    ],
    questions: [
      {
        id: "intro-q1",
        scenario:
          "Your organization has just kicked off a large infrastructure project. The project sponsor asks you to explain why a formal schedule management plan is needed when the team already has a list of tasks. What is the best response?",
        options: [
          "A task list is sufficient; a schedule management plan only adds bureaucracy.",
          "A schedule management plan defines the methodology, tools, level of accuracy, and reporting cadence for developing and controlling the schedule — it turns a task list into an actionable roadmap.",
          "The schedule management plan is only required for agile projects.",
          "Schedule management plans are only needed when the project has more than 100 tasks.",
        ],
        correctIndex: 1,
        explanation:
          "A schedule management plan goes beyond a simple task list by establishing the framework for how schedules will be developed, monitored, and controlled throughout the project lifecycle.",
      },
      {
        id: "intro-q2",
        scenario:
          "During a portfolio review, a program manager notices that one project consistently delivers late while others are on track. Which aspect of schedule management should be examined first?",
        options: [
          "The project's budget allocation.",
          "Whether the project has a documented schedule management plan with defined processes for estimating, sequencing, and controlling activities.",
          "The number of team members assigned to the project.",
          "The project's risk register.",
        ],
        correctIndex: 1,
        explanation:
          "Before examining specific schedule elements, you should verify that foundational schedule management processes are in place. Without a structured approach, schedule issues are systemic rather than isolated.",
      },
      {
        id: "intro-q3",
        scenario:
          "A new PMO analyst asks you what the primary outputs of the schedule management planning process are. Which answer is most complete?",
        options: [
          "A Gantt chart and a list of key dates.",
          "The schedule management plan, which documents the scheduling methodology, tool selection, level of accuracy, units of measure, control thresholds, and performance measurement rules.",
          "A resource histogram and a staffing plan.",
          "A risk register and an issue log.",
        ],
        correctIndex: 1,
        explanation:
          "The schedule management plan is the primary output. It establishes how every subsequent scheduling process will operate, including methodology, precision, thresholds, and measurement approaches.",
      },
    ],
  },
  {
    id: "wbs",
    title: "Creating a Work Breakdown Structure (WBS)",
    description: "Decomposing work into manageable tasks",
    videoTitle: "Building an Effective WBS",
    videoDescription:
      "Learn how to decompose project scope into a structured hierarchy of deliverables and work packages. This lesson walks through the WBS creation process, decomposition techniques, and best practices for ensuring complete scope coverage.",
    keyConcepts: [
      "The WBS is a hierarchical decomposition of the total scope of work to accomplish project objectives and create deliverables.",
      "Work packages are the lowest level of the WBS and form the basis for schedule activities, cost estimates, and resource assignments.",
      "The 100% Rule states that the WBS must include 100% of the work defined by the project scope — nothing more, nothing less.",
      "Decomposition should continue until work packages are small enough to be reliably estimated and assigned (typically 8–80 hours of effort).",
    ],
    questions: [
      {
        id: "wbs-q1",
        scenario:
          "You are managing a software development project. Your team has created a WBS but one branch only decomposes to the 'Testing' level without identifying specific types of testing. A team lead says further decomposition is unnecessary. What should you do?",
        options: [
          "Accept the team lead's assessment since they are the technical expert.",
          "Decompose 'Testing' further into work packages (e.g., unit testing, integration testing, UAT) to ensure reliable estimation, clear ownership, and schedule traceability.",
          "Add a single task called 'All Testing Activities' under the Testing branch.",
          "Remove testing from the WBS since it is a supporting activity, not a deliverable.",
        ],
        correctIndex: 1,
        explanation:
          "Work packages must be decomposed to a level where they can be reliably estimated and assigned. 'Testing' is too broad — breaking it into specific testing types enables accurate scheduling and accountability.",
      },
      {
        id: "wbs-q2",
        scenario:
          "During a WBS review, a stakeholder suggests adding 'Ongoing Maintenance' as a work package even though it is not part of the approved project scope. How should you respond?",
        options: [
          "Add it to keep the stakeholder happy and avoid conflict.",
          "Explain that the WBS must adhere to the 100% Rule — it includes all work within the project scope and excludes work outside of it. Ongoing maintenance would require a scope change request.",
          "Add it but mark it as 'out of scope' in the WBS dictionary.",
          "Create a separate WBS for maintenance and merge them later.",
        ],
        correctIndex: 1,
        explanation:
          "The 100% Rule ensures the WBS captures exactly the project scope. Adding out-of-scope work violates this principle and can lead to scope creep, inaccurate estimates, and resource conflicts.",
      },
      {
        id: "wbs-q3",
        scenario:
          "Your project has 200 tasks in the WBS. A junior PM asks how to verify the WBS is complete. What is the most reliable validation approach?",
        options: [
          "Count the tasks and compare against similar past projects.",
          "Conduct a WBS review with subject matter experts to verify that every deliverable traces to a scope requirement, every work package can be estimated and assigned, and the 100% Rule is satisfied at each level.",
          "Run the WBS through scheduling software to check for errors.",
          "Ask the project sponsor to approve it.",
        ],
        correctIndex: 1,
        explanation:
          "WBS validation requires expert review to confirm traceability to scope, estimability of work packages, and adherence to the 100% Rule. Automated tools cannot verify completeness of scope coverage.",
      },
    ],
  },
  {
    id: "dependencies",
    title: "Task Dependencies & the Critical Path",
    description: "Understanding FS/SS/FF/SF relationships and CPM",
    videoTitle: "Task Dependencies and Critical Path Method",
    videoDescription:
      "This lesson explains the four types of task dependencies (Finish-to-Start, Start-to-Start, Finish-to-Finish, Start-to-Finish), how to sequence activities, and how the Critical Path Method (CPM) identifies the longest path through the project network.",
    keyConcepts: [
      "Finish-to-Start (FS): The successor cannot start until the predecessor finishes. This is the most common dependency type.",
      "Start-to-Start (SS): The successor cannot start until the predecessor starts. Finish-to-Finish (FF): The successor cannot finish until the predecessor finishes.",
      "The Critical Path is the longest sequence of dependent activities that determines the minimum project duration.",
      "Total Float is the amount of time an activity can be delayed without delaying the project end date. Critical path activities have zero float.",
    ],
    questions: [
      {
        id: "dep-q1",
        scenario:
          "You are scheduling a construction project. The foundation must be poured before framing can begin, but site preparation and permit acquisition can happen in parallel. A team member suggests using Start-to-Start dependencies between all activities. What is the correct approach?",
        options: [
          "Use SS for all relationships since it allows maximum parallelism.",
          "Use Finish-to-Start (FS) between foundation and framing (sequential dependency), and allow site preparation and permits to run in parallel since they have no dependency relationship with each other.",
          "Use Finish-to-Finish (FF) for everything to ensure all tasks end together.",
          "Use Start-to-Finish (SF) between foundation and framing.",
        ],
        correctIndex: 1,
        explanation:
          "Dependencies should reflect the actual logical relationships between activities. Foundation must finish before framing starts (FS), while independent activities should run in parallel without artificial constraints.",
      },
      {
        id: "dep-q2",
        scenario:
          "After running CPM analysis, you discover the critical path has 15 tasks with zero total float and the project end date is 3 weeks past the deadline. What is the most effective first step?",
        options: [
          "Add more resources to every task in the project.",
          "Analyze the critical path activities for opportunities to fast-track (overlap sequential tasks) or crash (add resources to compress durations on critical path tasks where cost-effective).",
          "Remove tasks from the schedule to reduce the total duration.",
          "Change all FS dependencies to SS dependencies.",
        ],
        correctIndex: 1,
        explanation:
          "When the critical path exceeds the deadline, focus compression techniques (fast-tracking and crashing) specifically on critical path activities, as these are the only tasks that directly affect the project end date.",
      },
      {
        id: "dep-q3",
        scenario:
          "A project has activities A(5d) → B(3d) → C(4d) on one path and A(5d) → D(8d) → E(2d) on another. Both paths converge at F(3d). What is the critical path and total project duration?",
        options: [
          "A-B-C-F, 15 days.",
          "A-D-E-F, 18 days. This is the longest path through the network and determines the minimum project duration.",
          "Both paths are critical at 15 days each.",
          "The critical path cannot be determined without knowing resource assignments.",
        ],
        correctIndex: 1,
        explanation:
          "Path A-D-E-F = 5+8+2+3 = 18 days. Path A-B-C-F = 5+3+4+3 = 15 days. The critical path is the longest path (18 days), which determines the minimum project duration. Path A-B-C-F has 3 days of total float.",
      },
    ],
  },
  {
    id: "baselines",
    title: "Schedule Baselines & Variance",
    description: "Setting baselines and tracking schedule performance",
    videoTitle: "Schedule Baselines and Performance Tracking",
    videoDescription:
      "Learn how to establish a schedule baseline, measure schedule performance using earned value metrics (SPI, SV), and interpret variance to make informed decisions about project health and corrective actions.",
    keyConcepts: [
      "A schedule baseline is the approved version of the project schedule used as a reference point for measuring performance.",
      "Schedule Variance (SV) = Earned Value (EV) - Planned Value (PV). A negative SV indicates the project is behind schedule.",
      "Schedule Performance Index (SPI) = EV / PV. An SPI < 1.0 means the project is progressing slower than planned.",
      "Variance analysis should be performed regularly and triggers corrective action when thresholds defined in the schedule management plan are exceeded.",
    ],
    questions: [
      {
        id: "base-q1",
        scenario:
          "At month 3 of a 12-month project, the Planned Value (PV) is $300,000 and the Earned Value (EV) is $240,000. The project manager reports the project is 'on track' because spending is under budget. Is this assessment correct?",
        options: [
          "Yes, being under budget means the project is performing well.",
          "No. SV = EV - PV = $240K - $300K = -$60K and SPI = 0.80, indicating the project is 20% behind schedule. Being under budget may simply mean less work has been completed than planned.",
          "The assessment is correct because EV is positive.",
          "More data is needed; SPI alone cannot determine schedule health.",
        ],
        correctIndex: 1,
        explanation:
          "An SPI of 0.80 means only 80% of planned work has been completed. Low spending often correlates with schedule delays rather than cost savings — less work done means less money spent, but the project is behind.",
      },
      {
        id: "base-q2",
        scenario:
          "Your project sponsor wants to re-baseline the schedule after a 2-week delay caused by a vendor. Under what circumstances is re-baselining appropriate?",
        options: [
          "Re-baseline immediately to eliminate the negative variance from reports.",
          "Re-baselining should only occur when an approved change request fundamentally alters the project scope, timeline, or budget. A 2-week delay alone does not justify re-baselining — instead, develop a recovery plan and track variance against the original baseline.",
          "Re-baseline at every status meeting to keep metrics current.",
          "Never re-baseline; the original baseline must always be preserved.",
        ],
        correctIndex: 1,
        explanation:
          "Re-baselining to hide variances defeats the purpose of performance measurement. Baselines should only change through formal change control when the project fundamentals shift. Delays should be managed through corrective actions.",
      },
      {
        id: "base-q3",
        scenario:
          "During a portfolio review, three projects report the following SPIs: Project A = 1.05, Project B = 0.72, Project C = 0.95. The variance threshold in the schedule management plan is 0.90. Which projects require corrective action?",
        options: [
          "All three projects need corrective action.",
          "Only Project B (SPI = 0.72) requires corrective action because it falls below the 0.90 threshold. Project C (0.95) is within tolerance. Project A (1.05) is ahead of schedule.",
          "Only Project A needs attention because it is ahead of schedule, which could indicate scope issues.",
          "None — SPI is only relevant at project completion.",
        ],
        correctIndex: 1,
        explanation:
          "With a threshold of 0.90, Project B's SPI of 0.72 is significantly below the control limit and requires immediate corrective action. Project C is within acceptable variance, and Project A is performing well.",
      },
    ],
  },
  {
    id: "control",
    title: "Schedule Control & Recovery",
    description: "Techniques for getting back on track when schedules slip",
    videoTitle: "Schedule Control and Recovery Techniques",
    videoDescription:
      "This lesson covers proactive schedule monitoring, common recovery techniques including crashing, fast-tracking, and scope negotiation, and how to implement effective schedule control processes to keep projects on track.",
    keyConcepts: [
      "Schedule control involves monitoring the status of activities, managing changes to the schedule baseline, and implementing corrective actions.",
      "Crashing adds resources to critical path activities to compress the schedule, often at increased cost.",
      "Fast-tracking overlaps sequential activities that would normally be done in sequence, increasing risk but reducing duration.",
      "When crashing and fast-tracking are insufficient, scope negotiation with stakeholders may be necessary to meet deadlines.",
    ],
    questions: [
      {
        id: "ctrl-q1",
        scenario:
          "Your project is 3 weeks behind schedule with 8 weeks remaining. The critical path runs through a software development phase. You have budget available. The project sponsor demands the original end date be maintained. What approach should you evaluate first?",
        options: [
          "Tell the team to work overtime until the project catches up.",
          "Evaluate crashing the critical path activities by adding skilled developers to compress task durations, then assess fast-tracking opportunities where sequential development and testing activities can safely overlap — while analyzing the cost and risk trade-offs of each option.",
          "Cut scope unilaterally to meet the deadline.",
          "Change the project methodology from waterfall to agile.",
        ],
        correctIndex: 1,
        explanation:
          "A structured recovery approach starts with crashing (adding resources) and fast-tracking (overlapping activities) on the critical path, while carefully evaluating cost increases and risk implications of each compression technique.",
      },
      {
        id: "ctrl-q2",
        scenario:
          "You are fast-tracking a project by overlapping the design and development phases. Halfway through, you discover that design changes are causing rework in development. What should you do?",
        options: [
          "Continue fast-tracking because reversing the decision will delay the project further.",
          "Reassess the fast-tracking decision: evaluate whether the rework cost and schedule impact exceed the time saved by overlapping. If so, re-sequence the activities and implement a change freeze on design deliverables before they enter development.",
          "Eliminate the design phase entirely and let developers design as they build.",
          "Add more developers to absorb the rework.",
        ],
        correctIndex: 1,
        explanation:
          "Fast-tracking introduces risk of rework. When rework negates the time savings, the approach must be reassessed. A change freeze on design outputs before development begins can reduce rework while maintaining some overlap.",
      },
      {
        id: "ctrl-q3",
        scenario:
          "During a schedule review, you identify that a non-critical path activity has consumed all its float and any further delay will make it critical. What proactive measure should you take?",
        options: [
          "Ignore it — it is not on the critical path yet.",
          "Implement near-critical path monitoring: flag the activity for close tracking, assign a risk response, and consider allocating buffer or additional resources to prevent it from becoming critical and potentially extending the project end date.",
          "Move the activity off the project schedule to avoid complications.",
          "Reassign the float to a different activity.",
        ],
        correctIndex: 1,
        explanation:
          "Near-critical activities that have consumed their float are at high risk of becoming critical. Proactive monitoring and intervention prevent schedule surprises and protect the project end date.",
      },
    ],
  },
];

const STORAGE_KEY = "friday-schedule-mgmt-progress";

function getStoredProgress(): Record<string, boolean> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

function setStoredProgress(progress: Record<string, boolean>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
}

function markStarted() {
  localStorage.setItem(STORAGE_KEY + "-started", "true");
}

function hasStarted() {
  return localStorage.getItem(STORAGE_KEY + "-started") === "true";
}

export function getScheduleManagementProgress(): {
  completed: number;
  total: number;
  percentage: number;
  started: boolean;
} {
  const progress = getStoredProgress();
  const completed = lessons.filter((l) => progress[l.id]).length;
  return {
    completed,
    total: lessons.length,
    percentage: Math.round((completed / lessons.length) * 100),
    started: completed > 0 || hasStarted(),
  };
}

function VideoPlaceholder({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="relative aspect-video w-full rounded-lg bg-gradient-to-br from-primary/5 to-primary/10 border border-border/50 flex flex-col items-center justify-center overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(var(--primary-rgb,59,130,246),0.08)_0%,transparent_70%)]" />
      <div className="relative flex flex-col items-center gap-3 px-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 border border-primary/20">
          <Play className="h-7 w-7 text-primary ml-1" />
        </div>
        <h3 className="text-lg font-semibold text-foreground">{title}</h3>
        <p className="text-sm text-muted-foreground max-w-md">{description}</p>
        <Badge variant="outline" className="mt-1 text-xs">
          <Video className="h-3 w-3 mr-1" />
          Video Lesson
        </Badge>
      </div>
    </div>
  );
}

function QuizSection({
  questions,
  onComplete,
  isCompleted,
}: {
  questions: QuizQuestion[];
  onComplete: () => void;
  isCompleted: boolean;
}) {
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);
  const [quizFinished, setQuizFinished] = useState(isCompleted);

  const question = questions[currentQuestion];

  const handleSelect = (index: number) => {
    if (showFeedback) return;
    setSelectedAnswer(index);
    setShowFeedback(true);
    if (index === question.correctIndex) {
      setCorrectCount((c) => c + 1);
    }
  };

  const handleNext = () => {
    if (currentQuestion < questions.length - 1) {
      setCurrentQuestion((c) => c + 1);
      setSelectedAnswer(null);
      setShowFeedback(false);
    } else {
      setQuizFinished(true);
      onComplete();
    }
  };

  if (quizFinished) {
    return (
      <Card className="border-green-500/30 bg-green-500/5">
        <CardContent className="pt-6 text-center">
          <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-green-700 dark:text-green-400">
            Quiz Complete!
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            {isCompleted
              ? "You have already completed this lesson's quiz."
              : `You answered ${correctCount} out of ${questions.length} questions correctly.`}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold flex items-center gap-2">
          <HelpCircle className="h-5 w-5 text-primary" />
          Question {currentQuestion + 1} of {questions.length}
        </h3>
        <Badge variant="outline">
          {correctCount}/{currentQuestion + (showFeedback ? 1 : 0)} correct
        </Badge>
      </div>

      <Card>
        <CardContent className="pt-6">
          <p className="text-sm leading-relaxed mb-4">{question.scenario}</p>

          <div className="space-y-2">
            {question.options.map((option, index) => {
              let optionClass =
                "border border-border/50 hover:border-primary/50 cursor-pointer";
              if (showFeedback) {
                if (index === question.correctIndex) {
                  optionClass =
                    "border-2 border-green-500 bg-green-500/10 cursor-default";
                } else if (
                  index === selectedAnswer &&
                  index !== question.correctIndex
                ) {
                  optionClass =
                    "border-2 border-red-500 bg-red-500/10 cursor-default";
                } else {
                  optionClass = "border border-border/30 opacity-50 cursor-default";
                }
              } else if (index === selectedAnswer) {
                optionClass = "border-2 border-primary bg-primary/5 cursor-pointer";
              }

              return (
                <div
                  key={index}
                  onClick={() => handleSelect(index)}
                  className={cn(
                    "rounded-lg p-3 text-sm transition-all",
                    optionClass
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={cn(
                        "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-medium",
                        showFeedback && index === question.correctIndex
                          ? "bg-green-500 text-white border-green-500"
                          : showFeedback &&
                              index === selectedAnswer &&
                              index !== question.correctIndex
                            ? "bg-red-500 text-white border-red-500"
                            : "border-border"
                      )}
                    >
                      {String.fromCharCode(65 + index)}
                    </div>
                    <span className="pt-0.5">{option}</span>
                  </div>
                </div>
              );
            })}
          </div>

          <AnimatePresence>
            {showFeedback && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-4"
              >
                <div
                  className={cn(
                    "rounded-lg p-4 text-sm",
                    selectedAnswer === question.correctIndex
                      ? "bg-green-500/10 border border-green-500/30"
                      : "bg-amber-500/10 border border-amber-500/30"
                  )}
                >
                  <p className="font-medium mb-1">
                    {selectedAnswer === question.correctIndex
                      ? "Correct!"
                      : "Not quite right."}
                  </p>
                  <p className="text-muted-foreground">
                    {question.explanation}
                  </p>
                </div>
                <Button
                  onClick={handleNext}
                  className="mt-3 w-full"
                  size="sm"
                >
                  {currentQuestion < questions.length - 1
                    ? "Next Question"
                    : "Complete Quiz"}
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </CardContent>
      </Card>
    </div>
  );
}

const LOGO_BASE64 = "data:image/png;base64,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";

function generateCertificatePDF() {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  const cx = w / 2;

  const brandOrange = { r: 249, g: 115, b: 22 };
  const brandBlue = { r: 37, g: 99, b: 235 };
  const darkSlate = { r: 30, g: 41, b: 59 };
  const medGray = { r: 100, g: 116, b: 139 };
  const lightGray = { r: 241, g: 245, b: 249 };

  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, w, h, "F");

  doc.setFillColor(brandBlue.r, brandBlue.g, brandBlue.b);
  doc.rect(0, 0, w, 3, "F");

  doc.setFillColor(brandOrange.r, brandOrange.g, brandOrange.b);
  doc.rect(0, 3, w, 1.5, "F");

  doc.setFillColor(brandOrange.r, brandOrange.g, brandOrange.b);
  doc.rect(0, h - 1.5, w, 1.5, "F");
  doc.setFillColor(brandBlue.r, brandBlue.g, brandBlue.b);
  doc.rect(0, h - 3, w, 1.5, "F");

  doc.setDrawColor(brandBlue.r, brandBlue.g, brandBlue.b);
  doc.setLineWidth(0.6);
  doc.roundedRect(12, 10, w - 24, h - 20, 2, 2);

  doc.setDrawColor(brandOrange.r, brandOrange.g, brandOrange.b);
  doc.setLineWidth(0.3);
  doc.roundedRect(15, 13, w - 30, h - 26, 1.5, 1.5);

  const cornerSize = 8;
  const cornerInset = 17;
  doc.setDrawColor(brandOrange.r, brandOrange.g, brandOrange.b);
  doc.setLineWidth(0.8);
  const corners: [number, number, number, number][] = [
    [cornerInset, cornerInset, 1, 1],
    [w - cornerInset, cornerInset, -1, 1],
    [cornerInset, h - cornerInset, 1, -1],
    [w - cornerInset, h - cornerInset, -1, -1],
  ];
  corners.forEach(([x, y, dx, dy]) => {
    doc.line(x, y, x + cornerSize * dx, y);
    doc.line(x, y, x, y + cornerSize * dy);
  });

  doc.setFillColor(lightGray.r, lightGray.g, lightGray.b);
  doc.roundedRect(cx - 55, 19, 110, 22, 3, 3, "F");

  try {
    doc.addImage(LOGO_BASE64, "PNG", cx - 7, 21, 14, 14, undefined, "FAST");
  } catch {
    doc.setFillColor(brandOrange.r, brandOrange.g, brandOrange.b);
    doc.circle(cx, 28, 5, "F");
  }

  doc.setTextColor(brandBlue.r, brandBlue.g, brandBlue.b);
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.text("FRIDAYREPORT.AI", cx, 38, { align: "center" });

  doc.setTextColor(brandOrange.r, brandOrange.g, brandOrange.b);
  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.text("A C A D E M Y", cx, 41.5, { align: "center" });

  doc.setFillColor(brandBlue.r, brandBlue.g, brandBlue.b);
  doc.rect(cx - 40, 47, 80, 0.4, "F");
  doc.setFillColor(brandOrange.r, brandOrange.g, brandOrange.b);
  doc.rect(cx - 30, 48, 60, 0.3, "F");

  doc.setTextColor(darkSlate.r, darkSlate.g, darkSlate.b);
  doc.setFontSize(28);
  doc.setFont("helvetica", "bold");
  doc.text("Certificate of Completion", cx, 60, { align: "center" });

  doc.setFillColor(brandOrange.r, brandOrange.g, brandOrange.b);
  const lineY = 64;
  doc.rect(cx - 25, lineY, 50, 0.6, "F");
  doc.setFillColor(brandBlue.r, brandBlue.g, brandBlue.b);
  doc.circle(cx - 27, lineY + 0.3, 0.8, "F");
  doc.circle(cx + 27, lineY + 0.3, 0.8, "F");

  doc.setTextColor(medGray.r, medGray.g, medGray.b);
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.text("This is to certify that the participant has successfully completed", cx, 73, { align: "center" });
  doc.text("all coursework and assessments for the", cx, 79, { align: "center" });

  doc.setFillColor(brandBlue.r, brandBlue.g, brandBlue.b);
  doc.roundedRect(cx - 62, 85, 124, 16, 2, 2, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  doc.text("Schedule Management", cx, 95.5, { align: "center" });

  doc.setTextColor(darkSlate.r, darkSlate.g, darkSlate.b);
  doc.setFontSize(12);
  doc.setFont("helvetica", "normal");
  doc.text("Professional Training Module", cx, 109, { align: "center" });

  doc.setFillColor(lightGray.r, lightGray.g, lightGray.b);
  doc.roundedRect(cx - 75, 115, 150, 40, 2, 2, "F");

  doc.setTextColor(darkSlate.r, darkSlate.g, darkSlate.b);
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.text("CURRICULUM COMPLETED", cx, 122, { align: "center" });

  doc.setFillColor(brandOrange.r, brandOrange.g, brandOrange.b);
  doc.rect(cx - 15, 124, 30, 0.3, "F");

  const topics = [
    "Introduction to Schedule Management",
    "Creating a Work Breakdown Structure (WBS)",
    "Task Dependencies & the Critical Path",
    "Schedule Baselines & Variance Analysis",
    "Schedule Control & Recovery Techniques",
  ];
  doc.setTextColor(medGray.r, medGray.g, medGray.b);
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  const topicStartY = 129;
  const colWidth = 70;
  topics.forEach((topic, i) => {
    const col = i < 3 ? 0 : 1;
    const row = i < 3 ? i : i - 3;
    const xPos = col === 0 ? cx - 35 : cx + 35;
    doc.setFillColor(brandBlue.r, brandBlue.g, brandBlue.b);
    doc.circle(xPos - colWidth / 2 + 3, topicStartY + row * 6 - 0.5, 0.8, "F");
    doc.text(topic, xPos - colWidth / 2 + 7, topicStartY + row * 6);
  });

  doc.setTextColor(medGray.r, medGray.g, medGray.b);
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.text("5 Lessons  |  15 Assessments  |  100% Completion", cx, 152, { align: "center" });

  const completionDate = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  doc.setDrawColor(medGray.r, medGray.g, medGray.b);
  doc.setLineWidth(0.3);

  const sigY = 170;
  doc.line(cx - 80, sigY, cx - 30, sigY);
  doc.line(cx + 30, sigY, cx + 80, sigY);

  doc.setTextColor(darkSlate.r, darkSlate.g, darkSlate.b);
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.text(completionDate, cx - 55, sigY + 5, { align: "center" });
  doc.text("FridayReport.AI Academy", cx + 55, sigY + 5, { align: "center" });

  doc.setTextColor(medGray.r, medGray.g, medGray.b);
  doc.setFontSize(6.5);
  doc.text("Date of Completion", cx - 55, sigY + 9, { align: "center" });
  doc.text("Issuing Authority", cx + 55, sigY + 9, { align: "center" });

  const certId = `FR-SM-${Date.now().toString(36).toUpperCase()}`;
  doc.setTextColor(180, 180, 190);
  doc.setFontSize(6);
  doc.setFont("helvetica", "normal");
  doc.text(`Certificate ID: ${certId}`, cx, h - 16, { align: "center" });
  doc.text("This certificate is issued by FridayReport.AI Academy upon successful completion of all module requirements.", cx, h - 12, { align: "center" });

  doc.save("Schedule-Management-Certificate.pdf");
}

export default function ScheduleManagement() {
  const [, setLocation] = useLocation();
  const [completedLessons, setCompletedLessons] = useState<
    Record<string, boolean>
  >(getStoredProgress);
  const [activeLessonIndex, setActiveLessonIndex] = useState(0);

  useEffect(() => {
    markStarted();
    const progress = getStoredProgress();
    setCompletedLessons(progress);
    const firstIncomplete = lessons.findIndex((l) => !progress[l.id]);
    if (firstIncomplete >= 0) {
      setActiveLessonIndex(firstIncomplete);
    }
  }, []);

  const completedCount = lessons.filter((l) => completedLessons[l.id]).length;
  const progressPercentage = Math.round(
    (completedCount / lessons.length) * 100
  );
  const allComplete = completedCount === lessons.length;
  const activeLesson = lessons[activeLessonIndex];

  const handleLessonComplete = useCallback(() => {
    const updated = { ...completedLessons, [activeLesson.id]: true };
    setCompletedLessons(updated);
    setStoredProgress(updated);
  }, [activeLesson.id, completedLessons]);

  const canAccessLesson = (index: number) => {
    if (index === 0) return true;
    return completedLessons[lessons[index - 1].id] === true;
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLocation("/training")}
            className="mb-3 -ml-2"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to Training
          </Button>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">
                Schedule Management
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Master the fundamentals of project schedule management
              </p>
            </div>
            {allComplete && (
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={generateCertificatePDF}
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  <Download className="h-3.5 w-3.5 mr-1" />
                  Certificate
                </Button>
                <Badge className="bg-green-500 text-white border-green-500">
                  <Trophy className="h-3.5 w-3.5 mr-1" />
                  Module Complete
                </Badge>
              </div>
            )}
          </div>
          <div className="mt-4 flex items-center gap-3">
            <Progress value={progressPercentage} className="h-2 flex-1" />
            <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">
              {completedCount}/{lessons.length} lessons
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[280px_1fr]">
          <div className="space-y-1">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 px-2">
              Lessons
            </h2>
            {lessons.map((lesson, index) => {
              const isCompleted = completedLessons[lesson.id];
              const isActive = index === activeLessonIndex;
              const isAccessible = canAccessLesson(index);

              return (
                <button
                  key={lesson.id}
                  onClick={() => isAccessible && setActiveLessonIndex(index)}
                  disabled={!isAccessible}
                  className={cn(
                    "w-full flex items-start gap-3 rounded-lg px-3 py-3 text-left transition-all text-sm",
                    isActive
                      ? "bg-primary/10 border border-primary/30"
                      : isAccessible
                        ? "hover:bg-muted/50"
                        : "opacity-50 cursor-not-allowed",
                    !isActive && isAccessible && "border border-transparent"
                  )}
                >
                  <div className="mt-0.5 shrink-0">
                    {isCompleted ? (
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                    ) : isAccessible ? (
                      <Circle className="h-5 w-5 text-muted-foreground" />
                    ) : (
                      <Lock className="h-5 w-5 text-muted-foreground/50" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p
                      className={cn(
                        "font-medium leading-tight",
                        isActive && "text-primary"
                      )}
                    >
                      {lesson.title}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                      {lesson.description}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="space-y-6">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeLesson.id}
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.2 }}
                className="space-y-6"
              >
                <div>
                  <h2 className="text-xl font-semibold mb-1">
                    {activeLesson.title}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {activeLesson.description}
                  </p>
                </div>

                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Video className="h-4 w-4 text-primary" />
                    <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                      Video Lesson
                    </h3>
                  </div>
                  <VideoPlaceholder
                    title={activeLesson.videoTitle}
                    description={activeLesson.videoDescription}
                  />
                </div>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <BookOpen className="h-4 w-4 text-primary" />
                      Key Concepts
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {activeLesson.keyConcepts.map((concept, i) => (
                        <li
                          key={i}
                          className="flex items-start gap-2 text-sm text-muted-foreground"
                        >
                          <ChevronRight className="h-4 w-4 shrink-0 mt-0.5 text-primary/60" />
                          <span>{concept}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>

                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <HelpCircle className="h-4 w-4 text-primary" />
                    <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                      Knowledge Check
                    </h3>
                  </div>
                  <QuizSection
                    key={activeLesson.id}
                    questions={activeLesson.questions}
                    onComplete={handleLessonComplete}
                    isCompleted={completedLessons[activeLesson.id] || false}
                  />
                </div>

                {completedLessons[activeLesson.id] &&
                  activeLessonIndex < lessons.length - 1 && (
                    <Button
                      onClick={() =>
                        setActiveLessonIndex(activeLessonIndex + 1)
                      }
                      className="w-full"
                    >
                      Next Lesson
                      <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  )}

                {allComplete && activeLessonIndex === lessons.length - 1 && (
                  <Card className="border-green-500/30 bg-green-500/5">
                    <CardContent className="pt-6 text-center">
                      <Trophy className="h-16 w-16 text-green-500 mx-auto mb-3" />
                      <h3 className="text-xl font-bold text-green-700 dark:text-green-400">
                        Congratulations!
                      </h3>
                      <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
                        You have completed the Schedule Management training
                        module. You now have a solid foundation in schedule
                        planning, WBS creation, critical path analysis, baseline
                        management, and schedule control techniques.
                      </p>
                      <div className="mt-5 flex flex-col sm:flex-row items-center justify-center gap-3">
                        <Button
                          onClick={generateCertificatePDF}
                          className="bg-green-600 hover:bg-green-700 text-white"
                        >
                          <Download className="h-4 w-4 mr-2" />
                          Download Certificate
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => setLocation("/training")}
                        >
                          <ArrowLeft className="h-4 w-4 mr-1" />
                          Return to Training
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}
