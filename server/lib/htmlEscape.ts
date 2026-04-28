/**
 * Minimal HTML-escape helper for use when interpolating user-supplied strings
 * into outgoing email HTML or other HTML contexts. Centralized so we can audit
 * every call-site that touches user input in HTML.
 */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Escapes a string for HTML and converts newlines to <br> for plain-text
 * paragraphs being rendered in HTML emails.
 */
export function escapeHtmlMultiline(s: string): string {
  return escapeHtml(s).replace(/\n/g, "<br>");
}
