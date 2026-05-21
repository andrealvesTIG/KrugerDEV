import { AlertTriangle } from "lucide-react";

/**
 * Same-sized placeholder rendered in place of a form item that references a
 * deleted/unknown field, block, or custom-field definition. Keeps the grid
 * layout intact (no row collapse) and tells admins what to fix via tooltip.
 *
 * Used by both intake and project form renderers and by their per-field
 * sub-renderers so unknown refs never inject in-flow red text that breaks the
 * column grid.
 */
export function MissingRefPlaceholder({
  kind,
  itemKey,
  testIdPrefix = "missing-ref",
}: {
  kind: string;
  itemKey: string;
  testIdPrefix?: string;
}) {
  return (
    <div
      className="rounded-md border border-dashed border-amber-400 bg-amber-50/60 dark:bg-amber-950/20 dark:border-amber-700 p-3 text-xs text-amber-900 dark:text-amber-200 flex items-center gap-2 min-h-[40px]"
      title={`Layout references a missing ${kind} "${itemKey}". An admin can remove or replace it in Settings → Governance.`}
      data-testid={`${testIdPrefix}-${itemKey}`}
    >
      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">
        Missing {kind}: <span className="font-mono">{itemKey}</span>
      </span>
    </div>
  );
}
