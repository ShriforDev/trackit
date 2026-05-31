import { IconDeviceLaptop, IconMoon, IconSun } from "@tabler/icons-react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useTheme } from "@/components/theme-provider"
import { cn } from "@/lib/utils"

/**
 * Tiny icon button that opens a 3-option theme menu (light, dark, system).
 * Sits in the topbar. Press `D` anywhere outside an input also cycles the
 * theme — wired by ThemeProvider.
 */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Toggle theme"
        className={cn(
          "grid size-8 place-items-center border bg-background text-muted-foreground ring-1 ring-foreground/10 transition-colors",
          "hover:bg-accent hover:text-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/40"
        )}
      >
        <IconSun className="size-3.5 dark:hidden" />
        <IconMoon className="hidden size-3.5 dark:block" />
        <span className="sr-only">Toggle theme</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[10rem]">
        <DropdownMenuItem
          onClick={() => setTheme("light")}
          data-active={theme === "light"}
          className="gap-2 data-[active=true]:bg-accent"
        >
          <IconSun className="size-3.5" />
          <span>Light</span>
          <kbd className="ml-auto font-mono text-[10px] text-muted-foreground">
            d
          </kbd>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => setTheme("dark")}
          data-active={theme === "dark"}
          className="gap-2 data-[active=true]:bg-accent"
        >
          <IconMoon className="size-3.5" />
          <span>Dark</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => setTheme("system")}
          data-active={theme === "system"}
          className="gap-2 data-[active=true]:bg-accent"
        >
          <IconDeviceLaptop className="size-3.5" />
          <span>System</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
