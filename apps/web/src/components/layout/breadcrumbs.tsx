import { Fragment } from "react"
import { Link } from "react-router"
import { IconChevronRight } from "@tabler/icons-react"

import { cn } from "@/lib/utils"

export interface BreadcrumbItem {
  label: string
  to?: string
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[]
  className?: string
}

/**
 * Breadcrumb trail. The last item is rendered as the current page (no
 * link); prior items are linkified when `to` is provided. Uses the mono
 * face for that engineering-tool feel.
 */
export function Breadcrumbs({ items, className }: BreadcrumbsProps) {
  if (items.length === 0) return null
  return (
    <nav
      aria-label="Breadcrumb"
      className={cn(
        "flex min-w-0 items-center gap-1 font-mono text-[11px] tracking-tight text-muted-foreground",
        className
      )}
    >
      {items.map((item, idx) => {
        const isLast = idx === items.length - 1
        return (
          <Fragment key={`${item.label}-${idx}`}>
            {idx > 0 ? (
              <IconChevronRight
                className="size-3 shrink-0 opacity-50"
                aria-hidden
              />
            ) : null}
            {item.to && !isLast ? (
              <Link
                to={item.to}
                className="truncate transition-colors hover:text-foreground"
              >
                {item.label}
              </Link>
            ) : (
              <span
                className={cn(
                  "truncate",
                  isLast ? "font-medium text-foreground" : null
                )}
                aria-current={isLast ? "page" : undefined}
              >
                {item.label}
              </span>
            )}
          </Fragment>
        )
      })}
    </nav>
  )
}
