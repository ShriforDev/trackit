import * as React from "react"

import { cn } from "@/lib/utils"

interface PageHeaderProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  /** Small uppercase label above the title — usually the section name. */
  eyebrow?: React.ReactNode
  title: React.ReactNode
  description?: React.ReactNode
  /** Right-aligned action buttons. */
  actions?: React.ReactNode
  /** Below the description but above the divider. */
  meta?: React.ReactNode
}

/**
 * Consistent page header. Sits at the top of the main content area inside
 * AppShell. Lays out as:
 *
 *   [eyebrow]
 *   Title              [actions]
 *   description
 *   [meta]
 *   ─────────────────────────────
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  meta,
  className,
  ...props
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 border-b pb-6",
        className
      )}
      {...props}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1.5">
          {eyebrow ? (
            <span className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              {eyebrow}
            </span>
          ) : null}
          <h1 className="font-heading text-2xl font-medium leading-tight tracking-tight">
            {title}
          </h1>
          {description ? (
            <p className="max-w-2xl text-xs leading-relaxed text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </div>
      {meta ? (
        <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
          {meta}
        </div>
      ) : null}
    </div>
  )
}
