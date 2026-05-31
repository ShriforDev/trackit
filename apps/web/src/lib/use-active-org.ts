/**
 * Better Auth's `useActiveOrganization` flips `isPending` to `false` as soon
 * as the session lookup succeeds, even though the full active-org payload
 * (name, members, …) is fetched in a *separate* request that may still be
 * in flight. On the re-login transition this leaves a ~200 ms window where
 * any UI that reads `activeOrg.name` / `activeOrg.members` falls back to
 * placeholder values ("?", "0 MEMBERS").
 *
 * This hook closes that window: as long as the session reports an
 * `activeOrganizationId` but Better Auth hasn't returned the matching
 * organization payload yet, treat the data as still loading.
 *
 * Use this everywhere we render org-dependent UI — never call
 * `useActiveOrganization` directly.
 */
import { useActiveOrganization, useSession } from "@/lib/auth-client"

type RawUseActiveOrg = ReturnType<typeof useActiveOrganization>

export interface ActiveOrgState {
  /** Full org payload, or `null` until it's available. */
  activeOrg: RawUseActiveOrg["data"]
  /**
   * `true` while the active org payload is loading — including the
   * post-login hydration window where Better Auth has already flipped
   * `isPending` to false but hasn't yet populated the org cache.
   */
  isLoading: boolean
  /**
   * `true` when the user truly has no active org (verified by the
   * session, not just a transient absence of data). Useful for showing
   * an "create or join an organization" empty state.
   */
  hasNoOrg: boolean
  /** Re-fetch the active organization payload from the server. */
  refetch: RawUseActiveOrg["refetch"]
}

export function useActiveOrg(): ActiveOrgState {
  const { data: session, isPending: sessionPending } = useSession()
  const {
    data: activeOrg,
    isPending: orgPending,
    refetch,
  } = useActiveOrganization()

  const sessionActiveId = session?.session?.activeOrganizationId ?? null
  const dataReady = !!activeOrg && activeOrg.id === sessionActiveId

  const isLoading =
    sessionPending ||
    orgPending ||
    // Session says we should have an active org but the data isn't here
    // yet (or is stale from a previous session) — keep loading.
    (!!sessionActiveId && !dataReady)

  const hasNoOrg = !sessionPending && !sessionActiveId

  return {
    activeOrg: dataReady ? activeOrg : null,
    isLoading,
    hasNoOrg,
    refetch,
  }
}
