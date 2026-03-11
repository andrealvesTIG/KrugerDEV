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
