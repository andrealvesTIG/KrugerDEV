"use client"

import { GripVertical } from "lucide-react"
import * as ResizablePrimitive from "react-resizable-panels"

import { cn } from "@/lib/utils"

const ResizablePanelGroup = ({
  className,
  ...props
}: React.ComponentProps<typeof ResizablePrimitive.PanelGroup>) => (
  <ResizablePrimitive.PanelGroup
    className={cn(
      "flex h-full w-full data-[panel-group-direction=vertical]:flex-col",
      className
    )}
    {...props}
  />
)

const ResizablePanel = ResizablePrimitive.Panel

const ResizableHandle = ({
  withHandle,
  className,
  ...props
}: React.ComponentProps<typeof ResizablePrimitive.PanelResizeHandle> & {
  withHandle?: boolean
}) => (
  <ResizablePrimitive.PanelResizeHandle
    className={cn(
      "relative flex w-[3px] items-center justify-center bg-border/80 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1 data-[panel-group-direction=vertical]:h-px data-[panel-group-direction=vertical]:w-full [&[data-panel-group-direction=vertical]>div]:rotate-90 cursor-col-resize hover:bg-primary/60 active:bg-primary/70 transition-colors",
      className
    )}
    {...props}
  >
    {withHandle && (
      <div className="z-10 flex h-8 w-[6px] items-center justify-center rounded-sm bg-muted-foreground/40 hover:bg-primary/60 transition-colors shadow-sm">
        <div className="flex flex-col gap-[2px]">
          <div className="h-[2px] w-[2px] rounded-full bg-background/80" />
          <div className="h-[2px] w-[2px] rounded-full bg-background/80" />
          <div className="h-[2px] w-[2px] rounded-full bg-background/80" />
        </div>
      </div>
    )}
  </ResizablePrimitive.PanelResizeHandle>
)

export { ResizablePanelGroup, ResizablePanel, ResizableHandle }
