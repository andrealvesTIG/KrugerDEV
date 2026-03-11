import { useState, useEffect } from "react";
import type { ComponentType } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  GraduationCap,
  Briefcase,
  Users,
  Settings,
  FolderKanban,
  TrendingUp,
  UserCog,
  CalendarDays,
  AlertTriangle,
  BarChart3,
  Shield,
  BookOpen,
  Award,
  Trophy,
  ChevronRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getModuleProgress, allModules as staticModules } from "@/lib/trainingData";
import type { TrainingModule } from "@/lib/trainingData";

interface SubjectArea {
  id: string;
  name: string;
  icon: ComponentType<{ className?: string }>;
  description: string;
}

const subjectAreas: SubjectArea[] = [
  {
    id: "portfolio-management",
    name: "Portfolio Management",
    icon: Briefcase,
    description: "Learn how to organize and manage strategic project portfolios for maximum business value.",
  },
  {
    id: "project-portfolio-management",
    name: "Project Portfolio Management",
    icon: FolderKanban,
    description: "Master the discipline of managing multiple projects as a unified portfolio aligned with organizational strategy.",
  },
  {
    id: "optimization",
    name: "Optimization",
    icon: TrendingUp,
    description: "Discover techniques for optimizing resource allocation, budgets, and project prioritization.",
  },
  {
    id: "resource-management",
    name: "Resource Management",
    icon: UserCog,
    description: "Understand how to plan, allocate, and manage resources effectively across your portfolio.",
  },
  {
    id: "schedule-management",
    name: "Schedule Management",
    icon: CalendarDays,
    description: "Learn best practices for creating, maintaining, and controlling project schedules.",
  },
  {
    id: "risks-and-issues",
    name: "Risks and Issues Management",
    icon: AlertTriangle,
    description: "Build skills in identifying, assessing, and mitigating risks and managing issues proactively.",
  },
  {
    id: "predictive-analytics",
    name: "Predictive Analytics",
    icon: BarChart3,
    description: "Leverage data-driven insights and forecasting to make better project decisions.",
  },
  {
    id: "pmo-governance",
    name: "PMO Governance",
    icon: Shield,
    description: "Establish and maintain governance frameworks for effective PMO operations.",
  },
];

interface Role {
  id: string;
  name: string;
  icon: ComponentType<{ className?: string }>;
  description: string;
}

const roles: Role[] = [
  {
    id: "project-manager",
    name: "Project Manager",
    icon: Users,
    description: "Training track for project managers responsible for delivering individual projects successfully.",
  },
  {
    id: "portfolio-manager",
    name: "Portfolio Manager",
    icon: Briefcase,
    description: "Training track for portfolio managers overseeing strategic collections of projects.",
  },
  {
    id: "functional-administrator",
    name: "Functional Administrator",
    icon: Settings,
    description: "Training track for administrators who configure and maintain the platform.",
  },
];

function ModuleCard({ subject, apiModule, allModulesSource }: { subject: SubjectArea; apiModule?: TrainingModule; allModulesSource?: TrainingModule[] }) {
  const [, setLocation] = useLocation();
  const lessonCount = apiModule ? apiModule.lessons.length : 5;
  const questionCount = apiModule ? apiModule.lessons.reduce((s, l) => s + l.questions.length, 0) : 15;
  const [progress, setProgress] = useState({ completed: 0, total: lessonCount, percentage: 0, started: false });
  const Icon = subject.icon;

  useEffect(() => {
    setProgress(getModuleProgress(subject.id, allModulesSource));
  }, [subject.id, allModulesSource]);

  const isComplete = progress.percentage === 100;
  const isStarted = progress.started;

  const route = `/training/${subject.id}`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Card
        className="group relative overflow-hidden border border-border/50 hover:border-primary/30 hover:shadow-md transition-all duration-200 cursor-pointer"
        onClick={() => setLocation(route)}
      >
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-base font-semibold">{subject.name}</CardTitle>
              </div>
            </div>
            {isComplete ? (
              <Badge className="bg-green-500 text-white border-green-500 text-xs">
                <Trophy className="h-3 w-3 mr-1" />
                Completed
              </Badge>
            ) : isStarted ? (
              <Badge variant="default" className="text-xs">
                In Progress
              </Badge>
            ) : (
              <Badge variant="outline" className="text-xs text-primary border-primary/30">
                <ChevronRight className="h-3 w-3 mr-1" />
                Start Learning
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <CardDescription className="text-sm leading-relaxed">
            {subject.description}
          </CardDescription>
          <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <BookOpen className="h-3.5 w-3.5" />
              <span>Lessons: {lessonCount}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <BookOpen className="h-3.5 w-3.5" />
              <span>Questions: {questionCount}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Award className="h-3.5 w-3.5" />
              <span>Certificate available</span>
            </div>
          </div>
          <div className="mt-3 h-1.5 w-full rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${progress.percentage}%` }}
            />
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">
            {isComplete
              ? "All lessons completed"
              : isStarted
                ? `${progress.completed}/${progress.total} lessons completed (${progress.percentage}%)`
                : "No progress yet"}
          </p>
        </CardContent>
      </Card>
    </motion.div>
  );
}

function RoleHeader({ role }: { role: Role }) {
  const Icon = role.icon;
  return (
    <div className="mb-6 flex items-start gap-4">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Icon className="h-6 w-6" />
      </div>
      <div>
        <h2 className="text-lg font-semibold">{role.name}</h2>
        <p className="text-sm text-muted-foreground">{role.description}</p>
      </div>
    </div>
  );
}

export default function Training() {
  const { data: apiModules } = useQuery<TrainingModule[]>({
    queryKey: ['/api/training/modules'],
    staleTime: 60000,
  });

  const moduleMap = new Map<string, TrainingModule>();
  const modules = (apiModules && apiModules.length > 0) ? apiModules : staticModules;
  modules.forEach((m) => moduleMap.set(m.id, m));

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <GraduationCap className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Friday Academy</h1>
              <p className="text-sm text-muted-foreground">Training & Certification</p>
            </div>
          </div>
          <p className="mt-3 max-w-2xl text-muted-foreground">
            Build your expertise in project portfolio management. Select your role below to explore training modules 
            across key subject areas. Complete the training and earn your certification.
          </p>
        </div>

        <Tabs defaultValue={roles[0].id} className="w-full">
          <TabsList className="mb-6 w-full justify-start">
            {roles.map((role) => {
              const Icon = role.icon;
              return (
                <TabsTrigger key={role.id} value={role.id} className="flex items-center gap-2">
                  <Icon className="h-4 w-4" />
                  {role.name}
                </TabsTrigger>
              );
            })}
          </TabsList>

          {roles.map((role) => (
            <TabsContent key={role.id} value={role.id}>
              <RoleHeader role={role} />
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {subjectAreas.map((subject) => (
                  <ModuleCard key={subject.id} subject={subject} apiModule={moduleMap.get(subject.id)} allModulesSource={modules} />
                ))}
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </div>
  );
}
