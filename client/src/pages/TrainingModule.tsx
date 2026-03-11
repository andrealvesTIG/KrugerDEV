import { useState, useEffect, useCallback, useMemo } from "react";
import { useLocation, useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
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
  AlertTriangle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { jsPDF } from "jspdf";
import {
  getStoredModuleProgress,
  setStoredModuleProgress,
  markModuleStarted,
  canAttemptQuiz,
  recordQuizAttempt,
  getQuizAttempts,
  setTrainingUserId,
  PASSING_GRADE,
  MAX_ATTEMPTS,
  type QuizQuestion,
  type TrainingModule as TModule,
} from "@/lib/trainingData";
import type { TrainingModule as APIModule } from "@/lib/trainingData";
import { useAuth } from "@/hooks/use-auth";

const LOGO_BASE64 = "data:image/png;base64,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";

function generateCertificatePDF(mod: TModule) {
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
  ([[cornerInset, cornerInset, 1, 1], [w - cornerInset, cornerInset, -1, 1], [cornerInset, h - cornerInset, 1, -1], [w - cornerInset, h - cornerInset, -1, -1]] as [number, number, number, number][]).forEach(([x, y, dx, dy]) => {
    doc.line(x, y, x + cornerSize * dx, y);
    doc.line(x, y, x, y + cornerSize * dy);
  });
  doc.setFillColor(lightGray.r, lightGray.g, lightGray.b);
  doc.roundedRect(cx - 55, 19, 110, 22, 3, 3, "F");
  try { doc.addImage(LOGO_BASE64, "PNG", cx - 7, 21, 14, 14, undefined, "FAST"); } catch { doc.setFillColor(brandOrange.r, brandOrange.g, brandOrange.b); doc.circle(cx, 28, 5, "F"); }
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
  doc.rect(cx - 25, 64, 50, 0.6, "F");
  doc.setFillColor(brandBlue.r, brandBlue.g, brandBlue.b);
  doc.circle(cx - 27, 64.3, 0.8, "F");
  doc.circle(cx + 27, 64.3, 0.8, "F");
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
  doc.text(mod.name, cx, 95.5, { align: "center" });
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
  const topics = mod.lessons.map((l) => l.title);
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
  const totalQ = mod.lessons.reduce((s, l) => s + l.questions.length, 0);
  doc.setTextColor(medGray.r, medGray.g, medGray.b);
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.text(`${mod.lessons.length} Lessons  |  ${totalQ} Assessments  |  100% Completion`, cx, 152, { align: "center" });
  const completionDate = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
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
  const certId = `FR-${mod.certPrefix}-${Date.now().toString(36).toUpperCase()}`;
  doc.setTextColor(180, 180, 190);
  doc.setFontSize(6);
  doc.text(`Certificate ID: ${certId}`, cx, h - 16, { align: "center" });
  doc.text("This certificate is issued by FridayReport.AI Academy upon successful completion of all module requirements.", cx, h - 12, { align: "center" });
  doc.save(`${mod.name.replace(/\s+/g, "-")}-Certificate.pdf`);
}

function VideoPlaceholder({ title, description }: { title: string; description: string }) {
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

function QuizSection({ questions, onComplete, isCompleted, lessonId }: { questions: QuizQuestion[]; onComplete: () => void; isCompleted: boolean; lessonId: string }) {
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);
  const [quizFinished, setQuizFinished] = useState(false);
  const [quizPassed, setQuizPassed] = useState(false);
  const [attemptData, setAttemptData] = useState(() => getQuizAttempts(lessonId));
  const [cooldownEnd, setCooldownEnd] = useState<number | null>(null);

  useEffect(() => {
    const check = canAttemptQuiz(lessonId);
    if (!check.allowed && check.cooldownEnds) {
      setCooldownEnd(check.cooldownEnds);
    } else {
      setCooldownEnd(null);
      setAttemptData(getQuizAttempts(lessonId));
    }
  }, [lessonId]);

  useEffect(() => {
    if (!cooldownEnd) return;
    const remaining = cooldownEnd - Date.now();
    if (remaining <= 0) {
      setCooldownEnd(null);
      setAttemptData(getQuizAttempts(lessonId));
      return;
    }
    const timer = setTimeout(() => {
      setCooldownEnd(null);
      setAttemptData(getQuizAttempts(lessonId));
    }, remaining);
    return () => clearTimeout(timer);
  }, [cooldownEnd, lessonId]);

  const question = questions[currentQuestion];
  const requiredCorrect = Math.ceil(questions.length * PASSING_GRADE);

  const handleSelect = (index: number) => {
    if (showFeedback) return;
    setSelectedAnswer(index);
    setShowFeedback(true);
    if (index === question.correctIndex) setCorrectCount((c) => c + 1);
  };

  const handleNext = () => {
    if (currentQuestion < questions.length - 1) {
      setCurrentQuestion((c) => c + 1);
      setSelectedAnswer(null);
      setShowFeedback(false);
    } else {
      const passed = correctCount >= requiredCorrect;
      setQuizFinished(true);
      setQuizPassed(passed);
      const updated = recordQuizAttempt(lessonId, passed);
      setAttemptData(updated);
      if (passed) {
        onComplete();
      } else if (updated.attempts >= MAX_ATTEMPTS) {
        setCooldownEnd(updated.lastAttemptTime + 24 * 60 * 60 * 1000);
      }
    }
  };

  const handleRetry = () => {
    const check = canAttemptQuiz(lessonId);
    if (!check.allowed) {
      if (check.cooldownEnds) setCooldownEnd(check.cooldownEnds);
      return;
    }
    setAttemptData(getQuizAttempts(lessonId));
    setCurrentQuestion(0);
    setSelectedAnswer(null);
    setShowFeedback(false);
    setCorrectCount(0);
    setQuizFinished(false);
    setQuizPassed(false);
  };

  if (isCompleted) {
    return (
      <Card className="border-green-500/30 bg-green-500/5">
        <CardContent className="pt-6 text-center">
          <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-green-700 dark:text-green-400">Quiz Passed!</h3>
          <p className="text-sm text-muted-foreground mt-1">You have already passed this lesson's quiz.</p>
        </CardContent>
      </Card>
    );
  }

  if (cooldownEnd && !quizFinished) {
    const remaining = cooldownEnd - Date.now();
    if (remaining > 0) {
      const hours = Math.ceil(remaining / (1000 * 60 * 60));
      return (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="pt-6 text-center">
            <Lock className="h-12 w-12 text-amber-500 mx-auto mb-3" />
            <h3 className="text-lg font-semibold text-amber-700 dark:text-amber-400">Quiz Temporarily Locked</h3>
            <p className="text-sm text-muted-foreground mt-1">
              You've used all {MAX_ATTEMPTS} attempts. Please wait approximately {hours} hour{hours !== 1 ? 's' : ''} before trying again.
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              Available again: {new Date(cooldownEnd).toLocaleString()}
            </p>
          </CardContent>
        </Card>
      );
    }
  }

  if (quizFinished) {
    const scorePercent = Math.round((correctCount / questions.length) * 100);
    if (quizPassed) {
      return (
        <Card className="border-green-500/30 bg-green-500/5">
          <CardContent className="pt-6 text-center">
            <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-3" />
            <h3 className="text-lg font-semibold text-green-700 dark:text-green-400">Quiz Passed!</h3>
            <p className="text-sm text-muted-foreground mt-1">
              You scored {correctCount}/{questions.length} ({scorePercent}%). Passing grade is {Math.round(PASSING_GRADE * 100)}%.
            </p>
          </CardContent>
        </Card>
      );
    }
    const attemptsLeft = MAX_ATTEMPTS - attemptData.attempts;
    return (
      <Card className="border-red-500/30 bg-red-500/5">
        <CardContent className="pt-6 text-center">
          <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-red-700 dark:text-red-400">Quiz Not Passed</h3>
          <p className="text-sm text-muted-foreground mt-1">
            You scored {correctCount}/{questions.length} ({scorePercent}%). You need at least {Math.round(PASSING_GRADE * 100)}% to pass.
          </p>
          {attemptsLeft > 0 ? (
            <div className="mt-4">
              <p className="text-xs text-muted-foreground mb-2">
                {attemptsLeft} attempt{attemptsLeft !== 1 ? 's' : ''} remaining
              </p>
              <Button onClick={handleRetry} size="sm" variant="outline">
                Try Again
              </Button>
            </div>
          ) : (
            <div className="mt-4">
              <p className="text-xs text-muted-foreground">
                No attempts remaining. You can try again in 24 hours.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  const attemptsUsed = attemptData.attempts;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold flex items-center gap-2">
          <HelpCircle className="h-5 w-5 text-primary" />
          Question {currentQuestion + 1} of {questions.length}
        </h3>
        <div className="flex items-center gap-2">
          {attemptsUsed > 0 && (
            <Badge variant="secondary" className="text-xs">Attempt {attemptsUsed + 1}/{MAX_ATTEMPTS}</Badge>
          )}
          <Badge variant="outline">{correctCount}/{currentQuestion + (showFeedback ? 1 : 0)} correct</Badge>
        </div>
      </div>
      <div className="text-xs text-muted-foreground">
        Passing grade: {Math.round(PASSING_GRADE * 100)}% ({requiredCorrect}/{questions.length} correct answers required)
      </div>
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm leading-relaxed mb-4">{question.scenario}</p>
          <div className="space-y-2">
            {question.options.map((option, index) => {
              let optionClass = "border border-border/50 hover:border-primary/50 cursor-pointer";
              if (showFeedback) {
                if (index === question.correctIndex) optionClass = "border-2 border-green-500 bg-green-500/10 cursor-default";
                else if (index === selectedAnswer && index !== question.correctIndex) optionClass = "border-2 border-red-500 bg-red-500/10 cursor-default";
                else optionClass = "border border-border/30 opacity-50 cursor-default";
              } else if (index === selectedAnswer) optionClass = "border-2 border-primary bg-primary/5 cursor-pointer";
              return (
                <div key={index} onClick={() => handleSelect(index)} className={cn("rounded-lg p-3 text-sm transition-all", optionClass)}>
                  <div className="flex items-start gap-3">
                    <div className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-medium", showFeedback && index === question.correctIndex ? "bg-green-500 text-white border-green-500" : showFeedback && index === selectedAnswer && index !== question.correctIndex ? "bg-red-500 text-white border-red-500" : "border-border")}>
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
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="mt-4">
                <div className={cn("rounded-lg p-4 text-sm", selectedAnswer === question.correctIndex ? "bg-green-500/10 border border-green-500/30" : "bg-amber-500/10 border border-amber-500/30")}>
                  <p className="font-medium mb-1">{selectedAnswer === question.correctIndex ? "Correct!" : "Not quite right."}</p>
                  <p className="text-muted-foreground">{question.explanation}</p>
                </div>
                <Button onClick={handleNext} className="mt-3 w-full" size="sm">
                  {currentQuestion < questions.length - 1 ? "Next Question" : "Finish Quiz"}
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

export default function TrainingModulePage() {
  const { user } = useAuth();
  setTrainingUserId(user?.id ?? null);

  const [, setLocation] = useLocation();
  const [, params] = useRoute("/training/:moduleId");
  const moduleId = params?.moduleId || "";

  const { data: apiModules, isLoading: modulesLoading } = useQuery<TModule[]>({
    queryKey: ['/api/training/modules'],
    staleTime: 60000,
  });

  const mod = useMemo(() => {
    if (apiModules && apiModules.length > 0) {
      return apiModules.find((m) => m.id === moduleId) || null;
    }
    return null;
  }, [apiModules, moduleId]);

  const [completedLessons, setCompletedLessons] = useState<Record<string, boolean>>({});
  const [activeLessonIndex, setActiveLessonIndex] = useState(0);

  useEffect(() => {
    if (!mod) return;
    markModuleStarted(moduleId);
    const progress = getStoredModuleProgress(moduleId);
    setCompletedLessons(progress);
    const firstIncomplete = mod.lessons.findIndex((l) => !progress[l.id]);
    if (firstIncomplete >= 0) setActiveLessonIndex(firstIncomplete);
  }, [moduleId, mod]);

  if (modulesLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!mod) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold mb-2">Module not found</h2>
          <Button variant="outline" onClick={() => setLocation("/training")}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back to Training
          </Button>
        </div>
      </div>
    );
  }

  const lessons = mod.lessons;
  const completedCount = lessons.filter((l) => completedLessons[l.id]).length;
  const progressPercentage = Math.round((completedCount / lessons.length) * 100);
  const allComplete = completedCount === lessons.length;
  const activeLesson = lessons[activeLessonIndex];

  const handleLessonComplete = useCallback(() => {
    const updated = { ...completedLessons, [activeLesson.id]: true };
    setCompletedLessons(updated);
    setStoredModuleProgress(moduleId, updated);
  }, [activeLesson?.id, completedLessons, moduleId]);

  const canAccessLesson = (index: number) => {
    if (index === 0) return true;
    return completedLessons[lessons[index - 1].id] === true;
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6">
          <Button variant="ghost" size="sm" onClick={() => setLocation("/training")} className="mb-3 -ml-2">
            <ArrowLeft className="h-4 w-4 mr-1" /> Back to Training
          </Button>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">{mod.name}</h1>
              <p className="text-sm text-muted-foreground mt-1">{mod.subtitle}</p>
            </div>
            {allComplete && (
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={() => generateCertificatePDF(mod)} className="bg-green-600 hover:bg-green-700 text-white">
                  <Download className="h-3.5 w-3.5 mr-1" /> Certificate
                </Button>
                <Badge className="bg-green-500 text-white border-green-500">
                  <Trophy className="h-3.5 w-3.5 mr-1" /> Module Complete
                </Badge>
              </div>
            )}
          </div>
          <div className="mt-4 flex items-center gap-3">
            <Progress value={progressPercentage} className="h-2 flex-1" />
            <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">{completedCount}/{lessons.length} lessons</span>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[280px_1fr]">
          <div className="space-y-1">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 px-2">Lessons</h2>
            {lessons.map((lesson, index) => {
              const isCompleted = completedLessons[lesson.id];
              const isActive = index === activeLessonIndex;
              const isAccessible = canAccessLesson(index);
              return (
                <button key={lesson.id} onClick={() => isAccessible && setActiveLessonIndex(index)} disabled={!isAccessible}
                  className={cn("w-full flex items-start gap-3 rounded-lg px-3 py-3 text-left transition-all text-sm",
                    isActive ? "bg-primary/10 border border-primary/30" : isAccessible ? "hover:bg-muted/50" : "opacity-50 cursor-not-allowed",
                    !isActive && isAccessible && "border border-transparent")}>
                  <div className="mt-0.5 shrink-0">
                    {isCompleted ? <CheckCircle2 className="h-5 w-5 text-green-500" /> : isAccessible ? <Circle className="h-5 w-5 text-muted-foreground" /> : <Lock className="h-5 w-5 text-muted-foreground/50" />}
                  </div>
                  <div className="min-w-0">
                    <p className={cn("font-medium leading-tight", isActive && "text-primary")}>{lesson.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{lesson.description}</p>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="space-y-6">
            <AnimatePresence mode="wait">
              <motion.div key={activeLesson.id} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.2 }} className="space-y-6">
                <div>
                  <h2 className="text-xl font-semibold mb-1">{activeLesson.title}</h2>
                  <p className="text-sm text-muted-foreground">{activeLesson.description}</p>
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Video className="h-4 w-4 text-primary" />
                    <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Video Lesson</h3>
                  </div>
                  <VideoPlaceholder title={activeLesson.videoTitle} description={activeLesson.videoDescription} />
                </div>
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <BookOpen className="h-4 w-4 text-primary" /> Key Concepts
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {activeLesson.keyConcepts.map((concept, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
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
                    <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Knowledge Check</h3>
                  </div>
                  <QuizSection key={activeLesson.id} questions={activeLesson.questions} onComplete={handleLessonComplete} isCompleted={completedLessons[activeLesson.id] || false} lessonId={activeLesson.id} />
                </div>
                {completedLessons[activeLesson.id] && activeLessonIndex < lessons.length - 1 && (
                  <Button onClick={() => setActiveLessonIndex(activeLessonIndex + 1)} className="w-full">
                    Next Lesson <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                )}
                {allComplete && activeLessonIndex === lessons.length - 1 && (
                  <Card className="border-green-500/30 bg-green-500/5">
                    <CardContent className="pt-6 text-center">
                      <Trophy className="h-16 w-16 text-green-500 mx-auto mb-3" />
                      <h3 className="text-xl font-bold text-green-700 dark:text-green-400">Congratulations!</h3>
                      <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
                        You have completed the {mod.name} training module. You now have a solid foundation in all topics covered.
                      </p>
                      <div className="mt-5 flex flex-col sm:flex-row items-center justify-center gap-3">
                        <Button onClick={() => generateCertificatePDF(mod)} className="bg-green-600 hover:bg-green-700 text-white">
                          <Download className="h-4 w-4 mr-2" /> Download Certificate
                        </Button>
                        <Button variant="outline" onClick={() => setLocation("/training")}>
                          <ArrowLeft className="h-4 w-4 mr-1" /> Return to Training
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
