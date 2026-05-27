/**
 * Better Auth additional fields on the `user` table. Imported by both the
 * server config (auth.ts → user.additionalFields) and the web client
 * (auth-client.ts → inferAdditionalFields()) so the schema is declared once.
 *
 * If you add fields here, run `bun --filter '@trackit/api' auth:generate`
 * followed by `bun --filter '@trackit/api' db:push` to materialize them.
 *
 * NOTE: the trailing `as const` is required — Better Auth keys field
 * optionality off the LITERAL `required: false` (not the widened
 * `required: boolean`). Without `as const` the fields would be marked
 * required at the type level and break sign-up payloads.
 */
export const userAdditionalFields = {
  /** Timestamp at which the user accepted the current tracking-consent version. */
  trackingConsentAt: {
    type: "date",
    required: false,
    input: true,
  },
  /** Version string of the consent the user accepted. See ./consent.ts. */
  trackingConsentVersion: {
    type: "string",
    required: false,
    input: true,
  },
} as const
