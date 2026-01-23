import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useOrganization } from "@/hooks/use-organization";
import { useOrganizationLessonsLearned } from "@/hooks/use-lessons-learned";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Lightbulb, Search, Filter, ExternalLink, Loader2 } from "lucide-react";
import { Link } from "wouter";
import { format } from "date-fns";
import type { LessonLearned } from "@shared/schema";

const CATEGORIES = ["Technical", "Process", "Communication", "Resource", "Risk", "Stakeholder", "General"];
const TYPES = ["Success", "Improvement", "Challenge", "Best Practice"];
const STATUSES = ["Draft", "Reviewed", "Approved", "Archived"];

function getTypeBadgeVariant(type: string | null): "default" | "secondary" | "destructive" | "outline" {
  switch (type) {
    case "Success": return "default";
    case "Challenge": return "destructive";
    case "Improvement": return "secondary";
    case "Best Practice": return "outline";
    default: return "secondary";
  }
}

function getStatusBadgeVariant(status: string | null): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "Approved": return "default";
    case "Reviewed": return "secondary";
    case "Draft": return "outline";
    case "Archived": return "secondary";
    default: return "outline";
  }
}

export default function LessonsLearned() {
  const { currentOrganization } = useOrganization();
  const { data: lessons, isLoading } = useOrganizationLessonsLearned(currentOrganization?.id);
  const { data: projects } = useQuery<any[]>({
    queryKey: ['/api/organizations', currentOrganization?.id, 'projects'],
    enabled: !!currentOrganization?.id,
  });

  const [searchTerm, setSearchTerm] = useState("");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  const filteredLessons = lessons?.filter((lesson) => {
    const matchesSearch = !searchTerm || 
      lesson.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lesson.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lesson.recommendation?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = filterCategory === "all" || lesson.category === filterCategory;
    const matchesType = filterType === "all" || lesson.type === filterType;
    const matchesStatus = filterStatus === "all" || lesson.status === filterStatus;
    return matchesSearch && matchesCategory && matchesType && matchesStatus;
  }) || [];

  const getProjectName = (projectId: number) => {
    const project = projects?.find(p => p.id === projectId);
    return project?.name || `Project #${projectId}`;
  };

  const stats = {
    total: lessons?.length || 0,
    successes: lessons?.filter(l => l.type === "Success").length || 0,
    improvements: lessons?.filter(l => l.type === "Improvement").length || 0,
    challenges: lessons?.filter(l => l.type === "Challenge").length || 0,
    bestPractices: lessons?.filter(l => l.type === "Best Practice").length || 0,
  };

  if (!currentOrganization) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Please select an organization to view lessons learned.</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Lightbulb className="h-8 w-8" />
            Lessons Learned
          </h1>
          <p className="text-muted-foreground mt-1">
            Knowledge captured across all projects in your organization
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Lessons</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold" data-testid="text-total-lessons">{stats.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-green-600">Successes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-600" data-testid="text-successes">{stats.successes}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-yellow-600">Improvements</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-yellow-600" data-testid="text-improvements">{stats.improvements}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-red-600">Challenges</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-red-600" data-testid="text-challenges">{stats.challenges}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-blue-600">Best Practices</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-blue-600" data-testid="text-best-practices">{stats.bestPractices}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search lessons..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
                data-testid="input-search-lessons"
              />
            </div>
            <Select value={filterCategory} onValueChange={setFilterCategory}>
              <SelectTrigger data-testid="select-filter-category">
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {CATEGORIES.map(cat => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger data-testid="select-filter-type">
                <SelectValue placeholder="All Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {TYPES.map(type => (
                  <SelectItem key={type} value={type}>{type}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger data-testid="select-filter-status">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {STATUSES.map(status => (
                  <SelectItem key={status} value={status}>{status}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredLessons.length === 0 ? (
            <div className="text-center py-12">
              <Lightbulb className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-lg font-medium">No lessons found</p>
              <p className="text-muted-foreground">
                {lessons?.length === 0 
                  ? "Start capturing lessons learned from your projects."
                  : "Try adjusting your filters to see more results."}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Impact</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLessons.map((lesson) => (
                  <TableRow key={lesson.id} data-testid={`lesson-row-${lesson.id}`}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{lesson.title}</p>
                        {lesson.description && (
                          <p className="text-sm text-muted-foreground line-clamp-1">{lesson.description}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Link href={`/projects/${lesson.projectId}`}>
                        <span className="text-primary hover:underline cursor-pointer">
                          {getProjectName(lesson.projectId)}
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{lesson.category}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={getTypeBadgeVariant(lesson.type)}>
                        {lesson.type}
                      </Badge>
                    </TableCell>
                    <TableCell>{lesson.impact || "-"}</TableCell>
                    <TableCell>
                      <Badge variant={getStatusBadgeVariant(lesson.status)}>
                        {lesson.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {lesson.identifiedDate 
                        ? format(new Date(lesson.identifiedDate), "MMM d, yyyy")
                        : lesson.createdAt 
                          ? format(new Date(lesson.createdAt), "MMM d, yyyy")
                          : "-"}
                    </TableCell>
                    <TableCell>
                      <Link href={`/projects/${lesson.projectId}?tab=lessons-learned`}>
                        <Button variant="ghost" size="icon" data-testid={`button-view-lesson-${lesson.id}`}>
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
