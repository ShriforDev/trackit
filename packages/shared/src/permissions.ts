import { createAccessControl } from "better-auth/plugins/access"
import {
  adminAc,
  defaultStatements,
  memberAc,
  ownerAc,
} from "better-auth/plugins/organization/access"

/**
 * Access-control statement for trackit.
 *
 * Three custom resources sit alongside Better Auth's built-in `organization`,
 * `member`, and `invitation` (provided by `defaultStatements`):
 *
 *   • device   — the things being tracked (phones today, IoT later)
 *   • location — live + historical position fixes
 *   • share    — cross-user device sharing requests inside an org
 *
 * `as const` is required so TypeScript narrows action arrays into literal
 * tuples — Better Auth uses these for compile-time permission checks.
 */
export const statement = {
  ...defaultStatements,
  device: ["create", "read", "update", "delete", "archive"],
  location: ["read"],
  share: ["create", "read", "approve", "deny", "revoke"],
} as const

export const ac = createAccessControl(statement)

/**
 * Owner — full control. Inherits Better Auth's built-in owner permissions
 * (org delete, member CRUD, invitation CRUD) and gets every action on every
 * trackit resource.
 */
export const owner = ac.newRole({
  ...ownerAc.statements,
  device: ["create", "read", "update", "delete", "archive"],
  location: ["read"],
  share: ["create", "read", "approve", "deny", "revoke"],
})

/**
 * Admin — same as owner for trackit resources, but inherits Better Auth's
 * admin defaults which prevent deleting the organization itself.
 */
export const admin = ac.newRole({
  ...adminAc.statements,
  device: ["create", "read", "update", "delete", "archive"],
  location: ["read"],
  share: ["create", "read", "approve", "deny", "revoke"],
})

/**
 * Member — limited. Can manage their own devices and request shares, but
 * cannot delete devices outright (only archive), cannot approve/deny shares,
 * and cannot manage other members. Read of locations is gated by ownership
 * + share status at the query layer.
 */
export const member = ac.newRole({
  ...memberAc.statements,
  device: ["create", "read", "update", "archive"],
  location: ["read"],
  share: ["create", "read"],
})

export const roles = { owner, admin, member }

export type Role = keyof typeof roles
