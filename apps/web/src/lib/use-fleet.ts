/**
 * Backwards-compatible facade over the new FleetStream provider. The
 * hook now reads from React context instead of opening its own WS, so
 * mounting it in multiple places no longer causes duplicate broadcasts.
 *
 * The provider must be present in the tree — it's mounted in main.tsx.
 */

export { useFleet, type FleetStatus } from "./fleet-stream"
