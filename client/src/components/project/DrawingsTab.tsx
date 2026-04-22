import { useState, useRef, useCallback, useEffect } from "react";
import { useDrawings, useDrawing, useCreateDrawing, useUpdateDrawing, useDeleteDrawing, useCreateRevision, useDrawingMarkups, useSaveMarkup, useDeleteMarkup, useDrawingSets, useCreateDrawingSet, useDeleteDrawingSet } from "@/hooks/use-drawings";
import { useAuth } from "@/hooks/use-auth";
import { useUpload } from "@/hooks/use-upload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Loader2, Plus, Search, FileImage, Upload, Eye, Trash2, Pencil, MoreVertical, ZoomIn, ZoomOut, Maximize2, ArrowLeft, Layers, Type, ArrowRight, Square, PenTool, MousePointer, ChevronDown, FolderOpen, GitCompare, SplitSquareHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import PdfCanvasRenderer from "./PdfCanvasRenderer";

const DISCIPLINES = [
  "Architectural",
  "Structural",
  "Mechanical",
  "Electrical",
  "Plumbing",
  "Fire Protection",
  "Civil",
  "Landscape",
  "General",
  "Other",
];

const STATUSES = ["Current", "Superseded", "Void"] as const;

function getStatusColor(status: string) {
  switch (status) {
    case "Current": return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400";
    case "Superseded": return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400";
    case "Void": return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
    default: return "bg-gray-100 text-gray-700";
  }
}

function getDisciplineColor(discipline: string) {
  const colors: Record<string, string> = {
    "Architectural": "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    "Structural": "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
    "Mechanical": "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
    "Electrical": "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
    "Plumbing": "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400",
    "Fire Protection": "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    "Civil": "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    "Landscape": "bg-lime-100 text-lime-700 dark:bg-lime-900/30 dark:text-lime-400",
  };
  return colors[discipline] || "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300";
}

interface MarkupElement {
  type: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  points?: Array<{ x: number; y: number }>;
  text?: string;
  color?: string;
  strokeWidth?: number;
}

interface RevisionInfo {
  id: number;
  revisionNumber: number;
  version: string | null;
  fileUrl: string;
  fileName: string;
}

interface DrawingRecord {
  id: number;
  projectId: number;
  organizationId: number;
  drawingSetId: number | null;
  drawingNumber: string;
  title: string;
  discipline: string | null;
  status: string;
  description: string | null;
  currentRevisionNumber: number | null;
  createdBy: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  deletedAt: string | null;
  deletedBy: string | null;
}

function renderMarkupElement(el: MarkupElement, idx: number) {
  const color = el.color || "#ef4444";
  const sw = el.strokeWidth || 2;

  switch (el.type) {
    case "text":
      return <text key={idx} x={el.x} y={el.y} fill={color} fontSize={14} fontWeight="bold">{el.text}</text>;
    case "arrow": {
      const pts = el.points || [];
      if (pts.length < 2) return null;
      const dx = pts[1].x - pts[0].x;
      const dy = pts[1].y - pts[0].y;
      const angle = Math.atan2(dy, dx);
      const headLen = 12;
      return (
        <g key={idx}>
          <line x1={pts[0].x} y1={pts[0].y} x2={pts[1].x} y2={pts[1].y} stroke={color} strokeWidth={sw} />
          <polygon
            points={`${pts[1].x},${pts[1].y} ${pts[1].x - headLen * Math.cos(angle - 0.4)},${pts[1].y - headLen * Math.sin(angle - 0.4)} ${pts[1].x - headLen * Math.cos(angle + 0.4)},${pts[1].y - headLen * Math.sin(angle + 0.4)}`}
            fill={color}
          />
        </g>
      );
    }
    case "rectangle":
      return <rect key={idx} x={el.x} y={el.y} width={el.width || 0} height={el.height || 0} stroke={color} strokeWidth={sw} fill="none" />;
    case "freehand": {
      const pts = el.points || [];
      if (pts.length < 2) return null;
      const d = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
      return <path key={idx} d={d} stroke={color} strokeWidth={sw} fill="none" strokeLinecap="round" strokeLinejoin="round" />;
    }
    default:
      return null;
  }
}

function SingleRevisionPane({
  fileUrl,
  fileName,
  zoom,
  pan,
  showMarkups,
  existingElements,
  currentMarkup,
  isDrawing,
  freehandPoints,
  markupColor,
  tool,
  containerRef,
  svgRef,
  onWheel,
  onMouseDown,
  onMouseMove,
  onMouseUp,
  isPanning,
  onImageLoad,
}: {
  fileUrl: string;
  fileName: string;
  zoom: number;
  pan: { x: number; y: number };
  showMarkups: boolean;
  existingElements: MarkupElement[];
  currentMarkup: MarkupElement[];
  isDrawing: boolean;
  freehandPoints: Array<{ x: number; y: number }>;
  markupColor: string;
  tool: string;
  containerRef: React.RefObject<HTMLDivElement | null>;
  svgRef: React.RefObject<SVGSVGElement | null>;
  onWheel: (e: React.WheelEvent) => void;
  onMouseDown: (e: React.MouseEvent) => void;
  onMouseMove: (e: React.MouseEvent) => void;
  onMouseUp: (e: React.MouseEvent) => void;
  isPanning: boolean;
  onImageLoad?: (e: React.SyntheticEvent<HTMLImageElement>) => void;
}) {
  const isPdf = fileName?.toLowerCase().endsWith(".pdf");

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-hidden relative"
      onWheel={onWheel}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      style={{ cursor: tool === "select" ? (isPanning ? "grabbing" : "grab") : "crosshair" }}
    >
      <div
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: "0 0",
          position: "relative",
          display: "inline-block",
        }}
      >
        {isPdf ? (
          <PdfCanvasRenderer fileUrl={fileUrl} />
        ) : (
          <img
            src={fileUrl}
            alt={fileName}
            className="max-w-none"
            draggable={false}
            onLoad={onImageLoad}
          />
        )}

        {showMarkups && (
          <svg
            ref={svgRef}
            className="absolute inset-0 w-full h-full pointer-events-none"
            style={{ overflow: "visible" }}
          >
            {existingElements.map((el, i) => renderMarkupElement(el, i))}
            {currentMarkup.map((el, i) => renderMarkupElement(el, i + 10000))}
            {isDrawing && tool === "freehand" && freehandPoints.length > 1 && (
              <path
                d={freehandPoints.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ")}
                stroke={markupColor}
                strokeWidth={2}
                fill="none"
                strokeLinecap="round"
                opacity={0.6}
              />
            )}
          </svg>
        )}
      </div>
    </div>
  );
}

function CompareRevisionPane({
  fileUrl,
  fileName,
  label,
}: {
  fileUrl: string;
  fileName: string;
  label: string;
}) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom(z => Math.min(Math.max(z * delta, 0.2), 5));
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsPanning(true);
    setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };
  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      setPan({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
    }
  };
  const handleMouseUp = () => setIsPanning(false);

  const isPdf = fileName?.toLowerCase().endsWith(".pdf");

  return (
    <div className="flex-1 flex flex-col border-r last:border-r-0 min-w-0">
      <div className="px-3 py-1.5 bg-muted/50 border-b flex items-center justify-between">
        <span className="text-xs font-medium truncate">{label}</span>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setZoom(z => Math.max(z / 1.3, 0.2))}>
            <ZoomOut className="h-3 w-3" />
          </Button>
          <span className="text-[10px] w-8 text-center">{Math.round(zoom * 100)}%</span>
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setZoom(z => Math.min(z * 1.3, 5))}>
            <ZoomIn className="h-3 w-3" />
          </Button>
        </div>
      </div>
      <div
        ref={containerRef}
        className="flex-1 overflow-hidden relative"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        style={{ cursor: isPanning ? "grabbing" : "grab" }}
      >
        <div
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: "0 0",
            position: "relative",
            display: "inline-block",
          }}
        >
          {isPdf ? (
            <PdfCanvasRenderer fileUrl={fileUrl} />
          ) : (
            <img
              src={fileUrl}
              alt={fileName}
              className="max-w-none"
              draggable={false}
              onLoad={(e) => {
                const img = e.currentTarget;
                if (containerRef.current) {
                  const containerWidth = containerRef.current.clientWidth;
                  const containerHeight = containerRef.current.clientHeight;
                  const fitZoom = Math.min(
                    containerWidth / img.naturalWidth,
                    containerHeight / img.naturalHeight,
                    1
                  );
                  setZoom(fitZoom * 0.9);
                  setPan({
                    x: (containerWidth - img.naturalWidth * fitZoom * 0.9) / 2,
                    y: (containerHeight - img.naturalHeight * fitZoom * 0.9) / 2,
                  });
                }
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function DrawingViewer({
  projectId,
  drawingId,
  fileUrl,
  fileName,
  revisionId,
  allRevisions,
  currentUserId,
  onClose,
}: {
  projectId: number;
  drawingId: number;
  fileUrl: string;
  fileName: string;
  revisionId: number;
  allRevisions: RevisionInfo[];
  currentUserId: string | null;
  onClose: () => void;
}) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [tool, setTool] = useState<"select" | "text" | "arrow" | "rectangle" | "freehand">("select");
  const [currentMarkup, setCurrentMarkup] = useState<MarkupElement[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState({ x: 0, y: 0 });
  const [freehandPoints, setFreehandPoints] = useState<Array<{ x: number; y: number }>>([]);
  const [markupColor, setMarkupColor] = useState("#ef4444");
  const [showMarkups, setShowMarkups] = useState(true);
  const [compareMode, setCompareMode] = useState(false);
  const [compareRevisionId, setCompareRevisionId] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const { data: markups = [] } = useDrawingMarkups(projectId, drawingId, revisionId);
  const saveMarkupMutation = useSaveMarkup();
  const deleteMarkupMutation = useDeleteMarkup();

  const existingElements: MarkupElement[] = markups.flatMap(m => m.markupData || []);

  const compareRevision = compareRevisionId ? allRevisions.find(r => r.id === compareRevisionId) : null;
  const currentRevision = allRevisions.find(r => r.id === revisionId);

  const handleZoomIn = () => setZoom(z => Math.min(z * 1.3, 5));
  const handleZoomOut = () => setZoom(z => Math.max(z / 1.3, 0.2));
  const handleReset = () => { setZoom(1); setPan({ x: 0, y: 0 }); };

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom(z => Math.min(Math.max(z * delta, 0.2), 5));
  }, []);

  const getRelativePos = (e: React.MouseEvent) => {
    if (!containerRef.current) return { x: 0, y: 0 };
    const rect = containerRef.current.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left - pan.x) / zoom,
      y: (e.clientY - rect.top - pan.y) / zoom,
    };
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (tool === "select") {
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
      return;
    }
    const pos = getRelativePos(e);
    setIsDrawing(true);
    setDrawStart(pos);
    if (tool === "freehand") {
      setFreehandPoints([pos]);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      setPan({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
      return;
    }
    if (!isDrawing) return;
    if (tool === "freehand") {
      const pos = getRelativePos(e);
      setFreehandPoints(prev => [...prev, pos]);
    }
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (isPanning) { setIsPanning(false); return; }
    if (!isDrawing) return;
    setIsDrawing(false);

    const pos = getRelativePos(e);
    let element: MarkupElement | null = null;

    if (tool === "text") {
      const text = prompt("Enter annotation text:");
      if (text) {
        element = { type: "text", x: drawStart.x, y: drawStart.y, text, color: markupColor, strokeWidth: 2 };
      }
    } else if (tool === "arrow") {
      element = {
        type: "arrow",
        x: drawStart.x,
        y: drawStart.y,
        points: [drawStart, pos],
        color: markupColor,
        strokeWidth: 2,
      };
    } else if (tool === "rectangle") {
      element = {
        type: "rectangle",
        x: Math.min(drawStart.x, pos.x),
        y: Math.min(drawStart.y, pos.y),
        width: Math.abs(pos.x - drawStart.x),
        height: Math.abs(pos.y - drawStart.y),
        color: markupColor,
        strokeWidth: 2,
      };
    } else if (tool === "freehand" && freehandPoints.length > 1) {
      element = {
        type: "freehand",
        x: freehandPoints[0].x,
        y: freehandPoints[0].y,
        points: freehandPoints,
        color: markupColor,
        strokeWidth: 2,
      };
      setFreehandPoints([]);
    }

    if (element) {
      setCurrentMarkup(prev => [...prev, element!]);
    }
  };

  const handleSaveMarkup = () => {
    if (currentMarkup.length === 0) return;
    saveMarkupMutation.mutate({
      projectId,
      drawingId,
      data: { revisionId, markupData: currentMarkup },
    }, {
      onSuccess: () => setCurrentMarkup([]),
    });
  };

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    if (containerRef.current) {
      const containerWidth = containerRef.current.clientWidth;
      const containerHeight = containerRef.current.clientHeight;
      const fitZoom = Math.min(
        containerWidth / img.naturalWidth,
        containerHeight / img.naturalHeight,
        1
      );
      setZoom(fitZoom * 0.9);
      setPan({
        x: (containerWidth - img.naturalWidth * fitZoom * 0.9) / 2,
        y: (containerHeight - img.naturalHeight * fitZoom * 0.9) / 2,
      });
    }
  };

  const otherRevisions = allRevisions.filter(r => r.id !== revisionId);
  const canCompare = allRevisions.length >= 2;

  return (
    <div className="fixed inset-0 z-50 bg-background/95 flex flex-col">
      <div className="flex items-center justify-between border-b px-4 py-2 bg-background">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onClose}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <span className="font-medium text-sm truncate max-w-xs">{fileName}</span>
          {currentRevision && (
            <Badge variant="outline" className="text-xs">
              Rev {currentRevision.revisionNumber}{currentRevision.version ? ` (${currentRevision.version})` : ""}
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-1">
          {!compareMode && (
            <>
              <div className="flex items-center border rounded-md mr-2">
                {([
                  { key: "select", icon: MousePointer, label: "Pan" },
                  { key: "text", icon: Type, label: "Text" },
                  { key: "arrow", icon: ArrowRight, label: "Arrow" },
                  { key: "rectangle", icon: Square, label: "Rectangle" },
                  { key: "freehand", icon: PenTool, label: "Freehand" },
                ] as const).map(({ key, icon: Icon, label }) => (
                  <Tooltip key={key}>
                    <TooltipTrigger asChild>
                      <Button
                        variant={tool === key ? "default" : "ghost"}
                        size="sm"
                        className="h-8 w-8 p-0"
                        onClick={() => setTool(key)}
                      >
                        <Icon className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{label}</TooltipContent>
                  </Tooltip>
                ))}
              </div>

              <input
                type="color"
                value={markupColor}
                onChange={(e) => setMarkupColor(e.target.value)}
                className="w-8 h-8 rounded border cursor-pointer"
                title="Markup color"
              />

              <div className="flex items-center border rounded-md ml-2">
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={handleZoomOut}>
                  <ZoomOut className="h-4 w-4" />
                </Button>
                <span className="text-xs w-12 text-center">{Math.round(zoom * 100)}%</span>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={handleZoomIn}>
                  <ZoomIn className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={handleReset}>
                  <Maximize2 className="h-4 w-4" />
                </Button>
              </div>

              <Button
                variant={showMarkups ? "default" : "outline"}
                size="sm"
                className="ml-2"
                onClick={() => setShowMarkups(!showMarkups)}
              >
                <Layers className="h-4 w-4 mr-1" /> Markups
              </Button>

              {currentMarkup.length > 0 && (
                <>
                  <Button size="sm" className="ml-2" onClick={handleSaveMarkup} disabled={saveMarkupMutation.isPending}>
                    {saveMarkupMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                    Save Markups ({currentMarkup.length})
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setCurrentMarkup([])}>
                    Clear
                  </Button>
                </>
              )}
            </>
          )}

          {canCompare && (
            <div className="flex items-center ml-2 border-l pl-2">
              {compareMode ? (
                <Button variant="default" size="sm" onClick={() => { setCompareMode(false); setCompareRevisionId(null); }}>
                  <SplitSquareHorizontal className="h-4 w-4 mr-1" /> Exit Compare
                </Button>
              ) : (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm">
                      <GitCompare className="h-4 w-4 mr-1" /> Compare <ChevronDown className="h-3 w-3 ml-1" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {otherRevisions.map(rev => (
                      <DropdownMenuItem
                        key={rev.id}
                        onClick={() => {
                          setCompareRevisionId(rev.id);
                          setCompareMode(true);
                        }}
                      >
                        Compare with Rev {rev.revisionNumber}{rev.version ? ` (${rev.version})` : ""}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          )}
        </div>
      </div>

      {compareMode && compareRevision ? (
        <div className="flex-1 flex">
          <CompareRevisionPane
            fileUrl={fileUrl}
            fileName={fileName}
            label={`Rev ${currentRevision?.revisionNumber || "?"}${currentRevision?.version ? ` (${currentRevision.version})` : ""} — Current`}
          />
          <CompareRevisionPane
            fileUrl={compareRevision.fileUrl}
            fileName={compareRevision.fileName}
            label={`Rev ${compareRevision.revisionNumber}${compareRevision.version ? ` (${compareRevision.version})` : ""} — Compare`}
          />
        </div>
      ) : (
        <SingleRevisionPane
          fileUrl={fileUrl}
          fileName={fileName}
          zoom={zoom}
          pan={pan}
          showMarkups={showMarkups}
          existingElements={existingElements}
          currentMarkup={currentMarkup}
          isDrawing={isDrawing}
          freehandPoints={freehandPoints}
          markupColor={markupColor}
          tool={tool}
          containerRef={containerRef}
          svgRef={svgRef}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          isPanning={isPanning}
          onImageLoad={handleImageLoad}
        />
      )}

      {!compareMode && markups.length > 0 && (
        <div className="border-t px-4 py-2 bg-muted/30 flex items-center gap-2 text-xs text-muted-foreground overflow-x-auto">
          <Layers className="h-3 w-3 flex-shrink-0" />
          <span>{markups.length} markup layer{markups.length !== 1 ? "s" : ""}</span>
          {markups.map(m => (
            <Badge key={m.id} variant="outline" className="text-xs gap-1">
              {m.createdByName || "Unknown"} · {m.markupData?.length || 0} items
              {currentUserId && m.createdBy === currentUserId && (
                <button
                  className="ml-1 text-destructive hover:text-destructive/80"
                  onClick={() => deleteMarkupMutation.mutate({ projectId, drawingId, markupId: m.id })}
                >
                  ×
                </button>
              )}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

export default function DrawingsTab({ projectId }: { projectId: number }) {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [disciplineFilter, setDisciplineFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [drawingSetFilter, setDrawingSetFilter] = useState<string>("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isCreateSetOpen, setIsCreateSetOpen] = useState(false);
  const [editDrawing, setEditDrawing] = useState<DrawingRecord | null>(null);
  const [viewingDrawing, setViewingDrawing] = useState<{ drawingId: number; revisionId: number; fileUrl: string; fileName: string; allRevisions: RevisionInfo[] } | null>(null);
  const [uploadDrawingId, setUploadDrawingId] = useState<number | null>(null);

  const [formData, setFormData] = useState({
    drawingNumber: "",
    title: "",
    discipline: "General",
    description: "",
    drawingSetId: "" as string,
  });

  const [setFormValues, setSetFormValues] = useState({
    name: "",
    discipline: "General",
    description: "",
  });

  const [revisionForm, setRevisionForm] = useState({
    version: "",
    notes: "",
  });

  const { data: drawingSets = [] } = useDrawingSets(projectId);
  const { data: drawingsList = [], isLoading } = useDrawings(projectId, {
    discipline: disciplineFilter || undefined,
    status: statusFilter || undefined,
    search: search || undefined,
    drawingSetId: drawingSetFilter ? Number(drawingSetFilter) : undefined,
  });

  const createMutation = useCreateDrawing();
  const updateMutation = useUpdateDrawing();
  const deleteMutation = useDeleteDrawing();
  const revisionMutation = useCreateRevision();
  const createSetMutation = useCreateDrawingSet();
  const deleteSetMutation = useDeleteDrawingSet();
  const { uploadFile, isUploading, progress } = useUpload();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const grouped = drawingsList.reduce<Record<string, typeof drawingsList>>((acc, d) => {
    const disc = d.discipline || "General";
    if (!acc[disc]) acc[disc] = [];
    acc[disc].push(d);
    return acc;
  }, {});

  const getSetName = (setId: number | null) => {
    if (!setId) return null;
    const set = drawingSets.find(s => s.id === setId);
    return set?.name || null;
  };

  const handleCreate = () => {
    createMutation.mutate({
      projectId,
      data: {
        drawingNumber: formData.drawingNumber,
        title: formData.title,
        discipline: formData.discipline,
        description: formData.description || undefined,
        drawingSetId: formData.drawingSetId ? Number(formData.drawingSetId) : null,
      },
    }, {
      onSuccess: () => {
        setIsCreateOpen(false);
        setFormData({ drawingNumber: "", title: "", discipline: "General", description: "", drawingSetId: "" });
      },
    });
  };

  const handleUpdate = () => {
    if (!editDrawing) return;
    updateMutation.mutate({
      projectId,
      drawingId: editDrawing.id,
      data: {
        drawingNumber: formData.drawingNumber,
        title: formData.title,
        discipline: formData.discipline,
        description: formData.description || null,
        drawingSetId: formData.drawingSetId ? Number(formData.drawingSetId) : null,
      },
    }, {
      onSuccess: () => {
        setEditDrawing(null);
        setFormData({ drawingNumber: "", title: "", discipline: "General", description: "", drawingSetId: "" });
      },
    });
  };

  const handleCreateSet = () => {
    createSetMutation.mutate({
      projectId,
      data: {
        name: setFormValues.name,
        discipline: setFormValues.discipline,
        description: setFormValues.description || undefined,
      },
    }, {
      onSuccess: () => {
        setIsCreateSetOpen(false);
        setSetFormValues({ name: "", discipline: "General", description: "" });
      },
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !uploadDrawingId) return;

    const allowedTypes = ["application/pdf", "image/png", "image/jpeg", "image/jpg", "image/tiff", "image/webp"];
    if (!allowedTypes.includes(file.type) && !file.name.match(/\.(pdf|png|jpe?g|tiff?|webp)$/i)) {
      toast({ title: "Invalid file type", description: "Please upload a PDF or image file (PNG, JPG, TIFF, WebP)", variant: "destructive" });
      return;
    }

    const result = await uploadFile(file);
    if (result) {
      revisionMutation.mutate({
        projectId,
        drawingId: uploadDrawingId,
        data: {
          fileUrl: result.objectPath,
          fileName: file.name,
          fileSize: file.size,
          fileType: file.type,
          version: revisionForm.version || undefined,
          notes: revisionForm.notes || undefined,
        },
      }, {
        onSuccess: () => {
          setUploadDrawingId(null);
          setRevisionForm({ version: "", notes: "" });
          if (fileInputRef.current) fileInputRef.current.value = "";
        },
      });
    }
  };

  const openEdit = (drawing: DrawingRecord) => {
    setFormData({
      drawingNumber: drawing.drawingNumber,
      title: drawing.title,
      discipline: drawing.discipline || "General",
      description: drawing.description || "",
      drawingSetId: drawing.drawingSetId ? String(drawing.drawingSetId) : "",
    });
    setEditDrawing(drawing);
  };

  if (viewingDrawing) {
    return (
      <DrawingViewer
        projectId={projectId}
        drawingId={viewingDrawing.drawingId}
        fileUrl={viewingDrawing.fileUrl}
        fileName={viewingDrawing.fileName}
        revisionId={viewingDrawing.revisionId}
        allRevisions={viewingDrawing.allRevisions}
        currentUserId={user?.id || null}
        onClose={() => setViewingDrawing(null)}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-1 w-full sm:w-auto flex-wrap">
          <div className="relative flex-1 max-w-sm min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by title or number..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={disciplineFilter} onValueChange={(v) => setDisciplineFilter(v === "all" ? "" : v)}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="All Disciplines" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Disciplines</SelectItem>
              {DISCIPLINES.map(d => (
                <SelectItem key={d} value={d}>{d}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v === "all" ? "" : v)}>
            <SelectTrigger className="w-[130px]">
              <SelectValue placeholder="All Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              {STATUSES.map(s => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {drawingSets.length > 0 && (
            <Select value={drawingSetFilter} onValueChange={(v) => setDrawingSetFilter(v === "all" ? "" : v)}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="All Sets" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sets</SelectItem>
                {drawingSets.map(s => (
                  <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setIsCreateSetOpen(true)}>
            <FolderOpen className="h-4 w-4 mr-1" /> New Set
          </Button>
          <Button onClick={() => setIsCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> New Drawing
          </Button>
        </div>
      </div>

      {drawingSets.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground">Sets:</span>
          {drawingSets.map(set => (
            <Badge
              key={set.id}
              variant="outline"
              className="text-xs gap-1 cursor-pointer hover:bg-muted"
              onClick={() => setDrawingSetFilter(drawingSetFilter === String(set.id) ? "" : String(set.id))}
            >
              <FolderOpen className="h-3 w-3" />
              {set.name}
              <button
                className="ml-1 text-destructive hover:text-destructive/80"
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm(`Delete set "${set.name}"? Drawings in this set will remain but be unlinked.`)) {
                    deleteSetMutation.mutate({ projectId, setId: set.id });
                  }
                }}
              >
                ×
              </button>
            </Badge>
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : drawingsList.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <FileImage className="h-12 w-12 text-muted-foreground mb-3" />
            <h3 className="font-medium text-lg mb-1">No drawings yet</h3>
            <p className="text-sm text-muted-foreground mb-4">Upload construction drawings to track revisions and add markups.</p>
            <Button onClick={() => setIsCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-1" /> Add First Drawing
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([discipline, items]) => (
            <div key={discipline}>
              <div className="flex items-center gap-2 mb-3">
                <Badge className={cn("font-medium", getDisciplineColor(discipline))}>{discipline}</Badge>
                <span className="text-sm text-muted-foreground">({items.length})</span>
              </div>
              <div className="grid gap-3">
                {items.map(drawing => (
                  <Card key={drawing.id} className="hover:shadow-sm transition-shadow">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <DrawingThumbnail projectId={projectId} drawingId={drawing.id} />
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-sm font-medium">{drawing.drawingNumber}</span>
                              <span className="text-sm font-medium truncate">{drawing.title}</span>
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <Badge variant="outline" className={getStatusColor(drawing.status)}>
                                {drawing.status}
                              </Badge>
                              {drawing.currentRevisionNumber ? (
                                <span className="text-xs text-muted-foreground">
                                  Rev {drawing.currentRevisionNumber}
                                </span>
                              ) : (
                                <span className="text-xs text-muted-foreground italic">No revisions</span>
                              )}
                              {getSetName(drawing.drawingSetId) && (
                                <Badge variant="secondary" className="text-xs">
                                  <FolderOpen className="h-3 w-3 mr-1" />
                                  {getSetName(drawing.drawingSetId)}
                                </Badge>
                              )}
                              {drawing.description && (
                                <span className="text-xs text-muted-foreground truncate max-w-xs hidden sm:inline">
                                  {drawing.description}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setUploadDrawingId(drawing.id)}
                          >
                            <Upload className="h-4 w-4 mr-1" /> Upload Rev
                          </Button>

                          <DrawingRevisionDropdown
                            projectId={projectId}
                            drawingId={drawing.id}
                            onView={(rev, allRevisions) => setViewingDrawing({
                              drawingId: drawing.id,
                              revisionId: rev.id,
                              fileUrl: rev.fileUrl,
                              fileName: rev.fileName,
                              allRevisions,
                            })}
                          />

                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => openEdit(drawing)}>
                                <Pencil className="h-4 w-4 mr-2" /> Edit
                              </DropdownMenuItem>
                              {STATUSES.filter(s => s !== drawing.status).map(s => (
                                <DropdownMenuItem
                                  key={s}
                                  onClick={() => updateMutation.mutate({ projectId, drawingId: drawing.id, data: { status: s } })}
                                >
                                  Mark as {s}
                                </DropdownMenuItem>
                              ))}
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={() => {
                                  if (confirm("Delete this drawing and all its revisions?")) {
                                    deleteMutation.mutate({ projectId, drawingId: drawing.id });
                                  }
                                }}
                              >
                                <Trash2 className="h-4 w-4 mr-2" /> Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Drawing</DialogTitle>
            <DialogDescription>Add a drawing to the project register.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Drawing Number *</Label>
                <Input value={formData.drawingNumber} onChange={(e) => setFormData(p => ({ ...p, drawingNumber: e.target.value }))} placeholder="e.g., A-101" />
              </div>
              <div>
                <Label>Discipline</Label>
                <Select value={formData.discipline} onValueChange={(v) => setFormData(p => ({ ...p, discipline: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DISCIPLINES.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Title *</Label>
              <Input value={formData.title} onChange={(e) => setFormData(p => ({ ...p, title: e.target.value }))} placeholder="e.g., First Floor Plan" />
            </div>
            {drawingSets.length > 0 && (
              <div>
                <Label>Drawing Set</Label>
                <Select value={formData.drawingSetId} onValueChange={(v) => setFormData(p => ({ ...p, drawingSetId: v === "none" ? "" : v }))}>
                  <SelectTrigger><SelectValue placeholder="No set" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No set</SelectItem>
                    {drawingSets.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label>Description</Label>
              <Textarea value={formData.description} onChange={(e) => setFormData(p => ({ ...p, description: e.target.value }))} placeholder="Optional description" rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={!formData.drawingNumber || !formData.title || createMutation.isPending}>
              {createMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editDrawing} onOpenChange={(open) => { if (!open) setEditDrawing(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Drawing</DialogTitle>
            <DialogDescription>Update drawing details.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Drawing Number *</Label>
                <Input value={formData.drawingNumber} onChange={(e) => setFormData(p => ({ ...p, drawingNumber: e.target.value }))} />
              </div>
              <div>
                <Label>Discipline</Label>
                <Select value={formData.discipline} onValueChange={(v) => setFormData(p => ({ ...p, discipline: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DISCIPLINES.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Title *</Label>
              <Input value={formData.title} onChange={(e) => setFormData(p => ({ ...p, title: e.target.value }))} />
            </div>
            {drawingSets.length > 0 && (
              <div>
                <Label>Drawing Set</Label>
                <Select value={formData.drawingSetId} onValueChange={(v) => setFormData(p => ({ ...p, drawingSetId: v === "none" ? "" : v }))}>
                  <SelectTrigger><SelectValue placeholder="No set" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No set</SelectItem>
                    {drawingSets.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label>Description</Label>
              <Textarea value={formData.description} onChange={(e) => setFormData(p => ({ ...p, description: e.target.value }))} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDrawing(null)}>Cancel</Button>
            <Button onClick={handleUpdate} disabled={!formData.drawingNumber || !formData.title || updateMutation.isPending}>
              {updateMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isCreateSetOpen} onOpenChange={setIsCreateSetOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Drawing Set</DialogTitle>
            <DialogDescription>Create a drawing set to organize related drawings.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Set Name *</Label>
              <Input value={setFormValues.name} onChange={(e) => setSetFormValues(p => ({ ...p, name: e.target.value }))} placeholder="e.g., Foundation Package" />
            </div>
            <div>
              <Label>Discipline</Label>
              <Select value={setFormValues.discipline} onValueChange={(v) => setSetFormValues(p => ({ ...p, discipline: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DISCIPLINES.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={setFormValues.description} onChange={(e) => setSetFormValues(p => ({ ...p, description: e.target.value }))} placeholder="Optional description" rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateSetOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateSet} disabled={!setFormValues.name || createSetMutation.isPending}>
              {createSetMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Create Set
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!uploadDrawingId} onOpenChange={(open) => { if (!open) { setUploadDrawingId(null); setRevisionForm({ version: "", notes: "" }); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload Revision</DialogTitle>
            <DialogDescription>Upload a new drawing revision (PDF or image file).</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Version Label</Label>
              <Input value={revisionForm.version} onChange={(e) => setRevisionForm(p => ({ ...p, version: e.target.value }))} placeholder="e.g., Rev A, v2.0" />
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea value={revisionForm.notes} onChange={(e) => setRevisionForm(p => ({ ...p, notes: e.target.value }))} placeholder="Optional revision notes" rows={2} />
            </div>
            <div>
              <Label>Drawing File *</Label>
              <Input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.tiff,.tif,.webp"
                onChange={handleFileUpload}
                disabled={isUploading || revisionMutation.isPending}
              />
              {isUploading && (
                <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Uploading... {progress}%
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setUploadDrawingId(null); setRevisionForm({ version: "", notes: "" }); }}>Cancel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DrawingThumbnail({ projectId, drawingId }: { projectId: number; drawingId: number }) {
  const { data: drawingData } = useDrawing(projectId, drawingId);
  const [imgError, setImgError] = useState(false);
  const latestRevision = drawingData?.revisions?.[0];
  const thumbnailUrl = latestRevision?.thumbnailUrl;

  if (thumbnailUrl && !imgError) {
    return (
      <div className="w-10 h-10 rounded-md overflow-hidden flex-shrink-0 border">
        <img
          src={thumbnailUrl}
          alt="Drawing thumbnail"
          className="w-full h-full object-cover"
          onError={() => setImgError(true)}
        />
      </div>
    );
  }

  return (
    <div className="w-10 h-10 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
      <FileImage className="h-5 w-5 text-muted-foreground" />
    </div>
  );
}

function DrawingRevisionDropdown({
  projectId,
  drawingId,
  onView,
}: {
  projectId: number;
  drawingId: number;
  onView: (rev: { id: number; fileUrl: string; fileName: string; revisionNumber: number; version: string | null }, allRevisions: RevisionInfo[]) => void;
}) {
  const { data: drawingData } = useDrawing(projectId, drawingId);
  const revisions = drawingData?.revisions || [];

  const revisionInfos: RevisionInfo[] = revisions.map(r => ({
    id: r.id,
    revisionNumber: r.revisionNumber,
    version: r.version,
    fileUrl: r.fileUrl,
    fileName: r.fileName,
  }));

  if (revisions.length === 0) {
    return (
      <Button variant="ghost" size="sm" disabled className="text-muted-foreground">
        <Eye className="h-4 w-4 mr-1" /> No files
      </Button>
    );
  }

  if (revisions.length === 1) {
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onView(revisions[0], revisionInfos)}
      >
        <Eye className="h-4 w-4 mr-1" /> View
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm">
          <Eye className="h-4 w-4 mr-1" /> View <ChevronDown className="h-3 w-3 ml-1" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {revisions.map(rev => (
          <DropdownMenuItem key={rev.id} onClick={() => onView(rev, revisionInfos)}>
            Rev {rev.revisionNumber}{rev.version ? ` (${rev.version})` : ""} — {rev.fileName}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
