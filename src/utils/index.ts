// ─────────────────────────────────────────────────────────────────────────────
// index.ts
// Shared routing utilities used across the app.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Converts a human-readable page name into a URL path.
 * Spaces are replaced with hyphens so the result is URL-safe.
 *
 * Examples:
 *   createPageUrl('Dashboard')      → '/Dashboard'
 *   createPageUrl('Analyze Email')  → '/Analyze-Email'
 *   createPageUrl('Case Detail')    → '/Case-Detail'
 */
export function createPageUrl(pageName: string): string {
  return '/' + pageName.replace(/ /g, '-');
}