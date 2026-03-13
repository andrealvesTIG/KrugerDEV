import { useState, useCallback, useEffect } from 'react';

export type SortDirection = 'asc' | 'desc' | null;

export interface ColumnSort {
  columnId: string;
  direction: SortDirection;
}

export interface ColumnWidths {
  [columnId: string]: number;
}

export interface ColumnState {
  widths: ColumnWidths;
  sort: ColumnSort | null;
}

interface UseColumnStateOptions {
  viewType: 'grid' | 'gantt';
  organizationId: number | null;
  defaultWidths?: ColumnWidths;
  defaultSort?: ColumnSort | null;
  minWidth?: number;
  maxWidth?: number;
}

const MIN_COLUMN_WIDTH = 80;
const MAX_COLUMN_WIDTH = 500;

function getStorageKey(viewType: string, organizationId: number | null): string {
  return `column-state-${viewType}-${organizationId || 'default'}`;
}

function loadColumnState(viewType: string, organizationId: number | null): ColumnState | null {
  try {
    const key = getStorageKey(viewType, organizationId);
    const stored = localStorage.getItem(key);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.warn('Failed to load column state:', e);
  }
  return null;
}

function saveColumnState(viewType: string, organizationId: number | null, state: ColumnState): void {
  try {
    const key = getStorageKey(viewType, organizationId);
    localStorage.setItem(key, JSON.stringify(state));
  } catch (e) {
    console.warn('Failed to save column state:', e);
  }
}

export function useColumnState({
  viewType,
  organizationId,
  defaultWidths = {},
  defaultSort = null,
  minWidth = MIN_COLUMN_WIDTH,
  maxWidth = MAX_COLUMN_WIDTH,
}: UseColumnStateOptions) {
  const [columnWidths, setColumnWidths] = useState<ColumnWidths>(() => {
    const stored = loadColumnState(viewType, organizationId);
    return stored?.widths || defaultWidths;
  });

  const [sortState, setSortState] = useState<ColumnSort | null>(() => {
    const stored = loadColumnState(viewType, organizationId);
    return stored?.sort ?? defaultSort;
  });

  useEffect(() => {
    const stored = loadColumnState(viewType, organizationId);
    if (stored) {
      setColumnWidths(stored.widths || defaultWidths);
      setSortState(stored.sort ?? defaultSort);
    } else {
      setColumnWidths(defaultWidths);
      setSortState(defaultSort);
    }
  }, [viewType, organizationId, defaultWidths, defaultSort]);

  useEffect(() => {
    saveColumnState(viewType, organizationId, {
      widths: columnWidths,
      sort: sortState,
    });
  }, [viewType, organizationId, columnWidths, sortState]);

  const handleColumnResize = useCallback((columnId: string, width: number) => {
    const clampedWidth = Math.min(Math.max(width, minWidth), maxWidth);
    setColumnWidths(prev => ({
      ...prev,
      [columnId]: clampedWidth,
    }));
  }, [minWidth, maxWidth]);

  const handleColumnSort = useCallback((columnId: string) => {
    setSortState(prev => {
      if (!prev || prev.columnId !== columnId) {
        return { columnId, direction: 'asc' };
      }
      if (prev.direction === 'asc') {
        return { columnId, direction: 'desc' };
      }
      return null;
    });
  }, []);

  const getColumnWidth = useCallback((columnId: string, fallback: number = 150): number => {
    return columnWidths[columnId] || fallback;
  }, [columnWidths]);

  const getSortDirection = useCallback((columnId: string): SortDirection => {
    if (sortState?.columnId === columnId) {
      return sortState.direction;
    }
    return null;
  }, [sortState]);

  const resetColumnState = useCallback(() => {
    setColumnWidths(defaultWidths);
    setSortState(null);
  }, [defaultWidths]);

  return {
    columnWidths,
    sortState,
    handleColumnResize,
    handleColumnSort,
    getColumnWidth,
    getSortDirection,
    resetColumnState,
  };
}

export function sortData<T>(
  data: T[],
  sortState: ColumnSort | null,
  getFieldValue: (item: T, columnId: string) => any
): T[] {
  if (!sortState || !sortState.direction) {
    return data;
  }

  const { columnId, direction } = sortState;

  return [...data].sort((a, b) => {
    const aValue = getFieldValue(a, columnId);
    const bValue = getFieldValue(b, columnId);

    if (aValue === null || aValue === undefined) return direction === 'asc' ? 1 : -1;
    if (bValue === null || bValue === undefined) return direction === 'asc' ? -1 : 1;

    if (typeof aValue === 'string' && typeof bValue === 'string') {
      const comparison = aValue.localeCompare(bValue, undefined, { sensitivity: 'base' });
      return direction === 'asc' ? comparison : -comparison;
    }

    if (typeof aValue === 'number' && typeof bValue === 'number') {
      return direction === 'asc' ? aValue - bValue : bValue - aValue;
    }

    if (aValue instanceof Date && bValue instanceof Date) {
      return direction === 'asc' 
        ? aValue.getTime() - bValue.getTime() 
        : bValue.getTime() - aValue.getTime();
    }

    const aStr = String(aValue);
    const bStr = String(bValue);
    const comparison = aStr.localeCompare(bStr, undefined, { sensitivity: 'base' });
    return direction === 'asc' ? comparison : -comparison;
  });
}
