import { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import type { Task, TaskDependency } from '@shared/schema';
import { parseISO, differenceInDays } from 'date-fns';

// Types for dependency link rendering
interface BarRect {
  xStart: number;
  xEnd: number;
  yCenter: number;
  rowIndex: number;
}

interface DependencyLink {
  id: string;
  fromTaskId: number;
  toTaskId: number;
  type: 'FS' | 'SS' | 'FF' | 'SF';
  lagDays: number;
  path: string;
  fromRect: BarRect;
  toRect: BarRect;
}

interface GanttDependencyLinksProps {
  tasks: Task[];
  dependencies: TaskDependency[];
  minDate: Date;
  maxDate: Date;
  containerWidth: number;
  rowHeight: number;
  headerHeight: number;
  showBaseline?: boolean;
  onDependencyClick?: (dependency: TaskDependency) => void;
  onDependencyHover?: (dependency: TaskDependency | null) => void;
  selectedDependencyId?: string | null;
  highlightedTaskIds?: Set<number>;
}

// Constants for link rendering
const STUB_LENGTH = 12; // horizontal stub out of anchor
const ARROW_SIZE = 6; // arrowhead size
const BACK_LINK_OFFSET = 24; // extra offset for back-links
const ROW_OVERLAP_OFFSET = 4; // vertical offset for overlapping links

/**
 * Calculate the bar rectangle for a task in viewport coordinates
 */
function getBarRect(
  task: Task,
  taskIndex: number,
  minDate: Date,
  maxDate: Date,
  containerWidth: number,
  rowHeight: number,
  headerHeight: number,
  showBaseline: boolean = false,
  cumulativeYOffset: number = 0
): BarRect | null {
  if (!task.startDate || !task.endDate) return null;
  
  const start = parseISO(task.startDate);
  const end = parseISO(task.endDate);
  const totalDays = differenceInDays(maxDate, minDate) || 1;
  
  const startOffset = differenceInDays(start, minDate);
  const endOffset = differenceInDays(end, minDate) + 1;
  
  const xStart = (startOffset / totalDays) * containerWidth;
  const xEnd = (endOffset / totalDays) * containerWidth;
  
  const barTop = 4;
  const barHeight = showBaseline && task.baselineStartDate && task.baselineEndDate ? 16 : 20;
  const yCenter = headerHeight + cumulativeYOffset + barTop + (barHeight / 2);
  
  return {
    xStart: Math.max(0, xStart),
    xEnd: Math.min(containerWidth, xEnd),
    yCenter,
    rowIndex: taskIndex
  };
}

/**
 * Get anchor points based on dependency type
 * FS: end of predecessor → start of successor
 * SS: start → start
 * FF: end → end
 * SF: start → end
 */
function getAnchors(
  type: 'FS' | 'SS' | 'FF' | 'SF',
  fromRect: BarRect,
  toRect: BarRect
): { fromX: number; fromY: number; toX: number; toY: number } {
  let fromX: number, toX: number;
  
  switch (type) {
    case 'FS':
      fromX = fromRect.xEnd;
      toX = toRect.xStart;
      break;
    case 'SS':
      fromX = fromRect.xStart;
      toX = toRect.xStart;
      break;
    case 'FF':
      fromX = fromRect.xEnd;
      toX = toRect.xEnd;
      break;
    case 'SF':
      fromX = fromRect.xStart;
      toX = toRect.xEnd;
      break;
    default:
      fromX = fromRect.xEnd;
      toX = toRect.xStart;
  }
  
  return {
    fromX,
    fromY: fromRect.yCenter,
    toX,
    toY: toRect.yCenter
  };
}

/**
 * Generate orthogonal path for dependency connector
 * Uses right-angle polyline with proper routing
 * All paths terminate exactly at the successor anchor point
 */
function getLinkPath(
  type: 'FS' | 'SS' | 'FF' | 'SF',
  fromRect: BarRect,
  toRect: BarRect,
  linkIndex: number = 0
): string {
  const { fromX, fromY, toX, toY } = getAnchors(type, fromRect, toRect);
  
  // Small vertical offset for overlapping links on same row pair
  const overlapOffset = linkIndex * ROW_OVERLAP_OFFSET;
  const adjustedFromY = fromY + overlapOffset;
  const adjustedToY = toY + overlapOffset;
  
  // Determine direction
  const isGoingRight = toX >= fromX;
  const isGoingDown = toRect.rowIndex > fromRect.rowIndex;
  
  // Handle back-links for FS (target start is to the left of source end)
  if (!isGoingRight && type === 'FS') {
    // Route around: right from source, down/up, left around bars, then to target
    const stubX1 = fromX + STUB_LENGTH;
    const midY = isGoingDown 
      ? adjustedFromY + ((adjustedToY - adjustedFromY) / 2)
      : adjustedFromY - 15;
    const stubX2 = Math.min(fromRect.xStart, toRect.xStart) - BACK_LINK_OFFSET;
    
    return `M ${fromX} ${adjustedFromY} 
            L ${stubX1} ${adjustedFromY}
            L ${stubX1} ${midY}
            L ${stubX2} ${midY}
            L ${stubX2} ${adjustedToY}
            L ${toX} ${adjustedToY}`;
  }
  
  // Standard orthogonal routing based on type
  if (type === 'FS') {
    const stubX1 = fromX + STUB_LENGTH;
    const midX = Math.max(stubX1, toX - STUB_LENGTH);
    return `M ${fromX} ${adjustedFromY}
            L ${midX} ${adjustedFromY}
            L ${midX} ${adjustedToY}
            L ${toX} ${adjustedToY}`;
  }
  
  if (type === 'SS') {
    // Start to Start: route left of both bars
    const stubX = Math.min(fromX, toX) - STUB_LENGTH;
    
    return `M ${fromX} ${adjustedFromY}
            L ${stubX} ${adjustedFromY}
            L ${stubX} ${adjustedToY}
            L ${toX} ${adjustedToY}`;
  }
  
  if (type === 'FF') {
    // Finish to Finish: route right of both bars
    const stubX = Math.max(fromX, toX) + STUB_LENGTH;
    
    return `M ${fromX} ${adjustedFromY}
            L ${stubX} ${adjustedFromY}
            L ${stubX} ${adjustedToY}
            L ${toX} ${adjustedToY}`;
  }
  
  if (type === 'SF') {
    // Start to Finish: route left from source, then right to target end
    const stubX1 = fromX - STUB_LENGTH;
    const stubX2 = toX + STUB_LENGTH;
    const midY = (adjustedFromY + adjustedToY) / 2;
    
    return `M ${fromX} ${adjustedFromY}
            L ${stubX1} ${adjustedFromY}
            L ${stubX1} ${midY}
            L ${stubX2} ${midY}
            L ${stubX2} ${adjustedToY}
            L ${toX} ${adjustedToY}`;
  }
  
  // Fallback: simple line
  return `M ${fromX} ${adjustedFromY} L ${toX} ${adjustedToY}`;
}

/**
 * GanttDependencyLinks component
 * Renders an SVG overlay with dependency connectors
 */
export function GanttDependencyLinks({
  tasks,
  dependencies,
  minDate,
  maxDate,
  containerWidth,
  rowHeight,
  headerHeight,
  showBaseline = false,
  onDependencyClick,
  onDependencyHover,
  selectedDependencyId,
  highlightedTaskIds
}: GanttDependencyLinksProps) {
  const [hoveredDependency, setHoveredDependency] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  
  // Build task ID to index map for quick lookup
  const taskIndexMap = useMemo(() => {
    const map = new Map<number, number>();
    tasks.forEach((task, index) => {
      map.set(task.id, index);
    });
    return map;
  }, [tasks]);
  
  // Build task ID to task map
  const taskMap = useMemo(() => {
    const map = new Map<number, Task>();
    tasks.forEach(task => {
      map.set(task.id, task);
    });
    return map;
  }, [tasks]);

  const cumulativeYOffsets = useMemo(() => {
    const map = new Map<number, number>();
    let cumY = 0;
    tasks.forEach((task) => {
      map.set(task.id, cumY);
      const effectiveRowHeight = showBaseline && task.baselineStartDate && task.baselineEndDate ? 36 : rowHeight;
      cumY += effectiveRowHeight;
    });
    return map;
  }, [tasks, rowHeight, showBaseline]);
  
  // Calculate all dependency links
  const links = useMemo(() => {
    const result: DependencyLink[] = [];
    
    const rowPairCounts = new Map<string, number>();
    
    dependencies.forEach(dep => {
      const fromTask = taskMap.get(dep.dependsOnTaskId);
      const toTask = taskMap.get(dep.taskId);
      
      if (!fromTask || !toTask) return;
      
      const fromIndex = taskIndexMap.get(dep.dependsOnTaskId);
      const toIndex = taskIndexMap.get(dep.taskId);
      
      if (fromIndex === undefined || toIndex === undefined) return;

      const fromYOffset = cumulativeYOffsets.get(dep.dependsOnTaskId) ?? 0;
      const toYOffset = cumulativeYOffsets.get(dep.taskId) ?? 0;
      
      const fromRect = getBarRect(fromTask, fromIndex, minDate, maxDate, containerWidth, rowHeight, headerHeight, showBaseline, fromYOffset);
      const toRect = getBarRect(toTask, toIndex, minDate, maxDate, containerWidth, rowHeight, headerHeight, showBaseline, toYOffset);
      
      if (!fromRect || !toRect) return;
      
      const rowPairKey = `${Math.min(fromIndex, toIndex)}-${Math.max(fromIndex, toIndex)}`;
      const linkIndex = rowPairCounts.get(rowPairKey) || 0;
      rowPairCounts.set(rowPairKey, linkIndex + 1);
      
      const rawType = dep.dependencyType || 'FS';
      const normalized = rawType.toLowerCase().replace(/[\s_-]/g, '');
      const type: 'FS' | 'SS' | 'FF' | 'SF' = 
        (normalized === 'finishtostart' || normalized === 'fs') ? 'FS' :
        (normalized === 'starttostart' || normalized === 'ss') ? 'SS' :
        (normalized === 'finishtofinish' || normalized === 'ff') ? 'FF' :
        (normalized === 'starttofinish' || normalized === 'sf') ? 'SF' : 'FS';
      const path = getLinkPath(type, fromRect, toRect, linkIndex);
      
      result.push({
        id: `${dep.dependsOnTaskId}-${dep.taskId}`,
        fromTaskId: dep.dependsOnTaskId,
        toTaskId: dep.taskId,
        type,
        lagDays: dep.lagDays || 0,
        path,
        fromRect,
        toRect
      });
    });
    
    return result;
  }, [dependencies, taskMap, taskIndexMap, cumulativeYOffsets, minDate, maxDate, containerWidth, rowHeight, headerHeight, showBaseline]);
  
  // Calculate SVG height based on tasks
  const svgHeight = useMemo(() => {
    let totalHeight = headerHeight;
    tasks.forEach(task => {
      const effectiveRowHeight = showBaseline && task.baselineStartDate && task.baselineEndDate 
        ? 36 : rowHeight;
      totalHeight += effectiveRowHeight;
    });
    return totalHeight + 28; // Add extra row for add task
  }, [tasks, headerHeight, rowHeight, showBaseline]);
  
  const handleMouseEnter = useCallback((link: DependencyLink, dep: TaskDependency) => {
    setHoveredDependency(link.id);
    onDependencyHover?.(dep);
  }, [onDependencyHover]);
  
  const handleMouseLeave = useCallback(() => {
    setHoveredDependency(null);
    onDependencyHover?.(null);
  }, [onDependencyHover]);
  
  const handleClick = useCallback((dep: TaskDependency) => {
    onDependencyClick?.(dep);
  }, [onDependencyClick]);
  
  if (links.length === 0) {
    return null;
  }
  
  return (
    <svg
      ref={svgRef}
      className="absolute top-0 left-0"
      style={{ 
        width: containerWidth,
        height: svgHeight,
        overflow: 'visible'
      }}
      data-testid="gantt-dependency-links"
    >
      {/* Arrow marker definition */}
      <defs>
        <marker
          id="dependency-arrow"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth={ARROW_SIZE}
          markerHeight={ARROW_SIZE}
          orient="auto-start-reverse"
        >
          <path
            d="M 0 0 L 10 5 L 0 10 z"
            fill="currentColor"
            className="text-muted-foreground"
          />
        </marker>
        <marker
          id="dependency-arrow-hover"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth={ARROW_SIZE}
          markerHeight={ARROW_SIZE}
          orient="auto-start-reverse"
        >
          <path
            d="M 0 0 L 10 5 L 0 10 z"
            fill="currentColor"
            className="text-primary"
          />
        </marker>
        <marker
          id="dependency-arrow-critical"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth={ARROW_SIZE}
          markerHeight={ARROW_SIZE}
          orient="auto-start-reverse"
        >
          <path
            d="M 0 0 L 10 5 L 0 10 z"
            fill="currentColor"
            className="text-destructive"
          />
        </marker>
      </defs>
      
      {/* Render dependency links */}
      {links.map(link => {
        const dep = dependencies.find(
          d => d.dependsOnTaskId === link.fromTaskId && d.taskId === link.toTaskId
        );
        if (!dep) return null;
        
        const isHovered = hoveredDependency === link.id;
        const isSelected = selectedDependencyId === link.id;
        const isHighlighted = highlightedTaskIds?.has(link.fromTaskId) || 
                              highlightedTaskIds?.has(link.toTaskId);
        const isCritical = isHighlighted && highlightedTaskIds?.size === 2;
        
        return (
          <g key={link.id}>
            {/* Visible path - rendered first so hitbox is on top */}
            <path
              d={link.path}
              fill="none"
              stroke="currentColor"
              strokeWidth={isHovered || isSelected ? 2 : 1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              markerEnd={
                isHovered || isSelected
                  ? "url(#dependency-arrow-hover)"
                  : isCritical
                    ? "url(#dependency-arrow-critical)"
                    : "url(#dependency-arrow)"
              }
              pointerEvents="none"
              className={cn(
                "transition-colors duration-150",
                isHovered || isSelected 
                  ? "text-primary" 
                  : isCritical 
                    ? "text-destructive"
                    : "text-muted-foreground/60"
              )}
              data-testid={`dependency-link-${link.id}`}
            />
            {/* Invisible wider path for easier hover/click - on top for interaction */}
            <path
              d={link.path}
              fill="none"
              stroke="rgba(0,0,0,0.001)"
              strokeWidth={14}
              strokeLinecap="round"
              strokeLinejoin="round"
              pointerEvents="stroke"
              cursor="pointer"
              onMouseEnter={() => handleMouseEnter(link, dep)}
              onMouseLeave={handleMouseLeave}
              onClick={() => handleClick(dep)}
              data-testid={`dependency-hitbox-${link.id}`}
            />
          </g>
        );
      })}
    </svg>
  );
}

export default GanttDependencyLinks;
