/**
 * Tracking consent version. When this string changes (e.g. a new resource is
 * added to what trackit collects), every existing user is bounced back to the
 * /consent screen on their next page load and must re-accept.
 *
 * Bump this whenever the consent copy materially changes.
 */
export const TRACKING_CONSENT_VERSION = "v1"
