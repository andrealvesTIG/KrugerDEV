import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';

const outputPath = path.join(process.cwd(), 'FridayReportAI_SOC2_Gap_Analysis.pdf');

const doc = new PDFDocument({
  size: 'A4',
  bufferPages: true,
  margins: { top: 60, bottom: 60, left: 50, right: 50 },
  info: {
    Title: 'FridayReport.AI — SOC 2 Type 2 Gap Analysis',
    Author: 'FridayReport.AI',
    Subject: 'SOC 2 Type 2 Compliance Gap Analysis',
    CreationDate: new Date(),
  },
});

const stream = fs.createWriteStream(outputPath);
doc.pipe(stream);

const PAGE_WIDTH = 495;
const COLORS = {
  primary: '#1e3a5f',
  secondary: '#2563eb',
  accent: '#0f172a',
  green: '#16a34a',
  red: '#dc2626',
  amber: '#d97706',
  gray: '#6b7280',
  lightGray: '#f3f4f6',
  tableBorder: '#d1d5db',
  tableHeader: '#1e3a5f',
  white: '#ffffff',
};

function drawHeader(text: string, fontSize = 20, color = COLORS.primary) {
  doc.moveDown(0.5);
  doc.fontSize(fontSize).font('Helvetica-Bold').fillColor(color).text(text);
  doc.moveDown(0.3);
  doc.strokeColor(COLORS.secondary).lineWidth(1.5)
    .moveTo(doc.x, doc.y).lineTo(doc.x + PAGE_WIDTH, doc.y).stroke();
  doc.moveDown(0.5);
}

function drawSubHeader(text: string) {
  checkPageBreak(40);
  doc.moveDown(0.4);
  doc.fontSize(12).font('Helvetica-Bold').fillColor(COLORS.accent).text(text);
  doc.moveDown(0.3);
}

function drawBody(text: string) {
  doc.fontSize(9.5).font('Helvetica').fillColor('#374151').text(text, { lineGap: 2 });
  doc.moveDown(0.3);
}

function drawBullet(text: string, indent = 15) {
  checkPageBreak(20);
  const x = doc.x;
  doc.fontSize(9.5).font('Helvetica').fillColor('#374151');
  doc.text('•', x + indent - 12, doc.y, { continued: false });
  doc.text(text, x + indent, doc.y - doc.currentLineHeight(), {
    width: PAGE_WIDTH - indent,
    lineGap: 2,
  });
  doc.moveDown(0.15);
}

function checkPageBreak(needed: number) {
  if (doc.y + needed > doc.page.height - doc.page.margins.bottom) {
    doc.addPage();
  }
}

function statusIcon(status: string): { symbol: string; color: string } {
  if (status.includes('✅') || status.toLowerCase() === 'implemented') return { symbol: '✓', color: COLORS.green };
  if (status.includes('❌') || status.toLowerCase() === 'missing') return { symbol: '✗', color: COLORS.red };
  if (status.includes('⚠️') || status.toLowerCase().startsWith('partial') || status.toLowerCase().startsWith('weak')) return { symbol: '!', color: COLORS.amber };
  return { symbol: '-', color: COLORS.gray };
}

function drawStatusTable(rows: Array<{ control: string; status: string; details: string }>) {
  const colWidths = [170, 75, PAGE_WIDTH - 245];
  const startX = doc.x;
  const headerHeight = 22;
  const padding = 5;

  checkPageBreak(headerHeight + 25);

  doc.rect(startX, doc.y, PAGE_WIDTH, headerHeight).fill(COLORS.tableHeader);
  const headerY = doc.y + 5;
  doc.fontSize(8.5).font('Helvetica-Bold').fillColor(COLORS.white);
  doc.text('Control', startX + padding, headerY, { width: colWidths[0] });
  doc.text('Status', startX + colWidths[0] + padding, headerY, { width: colWidths[1] });
  doc.text('Details', startX + colWidths[0] + colWidths[1] + padding, headerY, { width: colWidths[2] });
  doc.y = doc.y + headerHeight - doc.currentLineHeight() + 2;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const bgColor = i % 2 === 0 ? COLORS.white : COLORS.lightGray;

    doc.fontSize(8.5).font('Helvetica').fillColor('#374151');
    const controlHeight = doc.heightOfString(row.control, { width: colWidths[0] - padding * 2 });
    const detailsHeight = doc.heightOfString(row.details, { width: colWidths[2] - padding * 2 });
    const rowHeight = Math.max(controlHeight, detailsHeight, 16) + padding * 2;

    checkPageBreak(rowHeight);

    const rowY = doc.y;
    doc.rect(startX, rowY, PAGE_WIDTH, rowHeight).fill(bgColor);

    doc.fillColor('#374151').font('Helvetica');
    doc.text(row.control, startX + padding, rowY + padding, { width: colWidths[0] - padding * 2 });

    const si = statusIcon(row.status);
    doc.font('Helvetica-Bold').fillColor(si.color);
    doc.text(`${si.symbol} ${row.status.replace(/[✅❌⚠️]/g, '').trim()}`, startX + colWidths[0] + padding, rowY + padding, { width: colWidths[1] - padding * 2 });

    doc.font('Helvetica').fillColor('#374151');
    doc.text(row.details, startX + colWidths[0] + colWidths[1] + padding, rowY + padding, { width: colWidths[2] - padding * 2 });

    doc.y = rowY + rowHeight;
  }

  doc.strokeColor(COLORS.tableBorder).lineWidth(0.5);
  doc.rect(startX, doc.y - rows.reduce((sum, _, i) => {
    doc.fontSize(8.5);
    const ch = doc.heightOfString(rows[i].control, { width: colWidths[0] - 10 });
    const dh = doc.heightOfString(rows[i].details, { width: colWidths[2] - 10 });
    return sum + Math.max(ch, dh, 16) + 10;
  }, 0) - headerHeight, PAGE_WIDTH, doc.y).stroke();

  doc.moveDown(0.5);
}

function drawSimpleTable(rows: Array<{ control: string; status: string; details: string }>) {
  for (const row of rows) {
    checkPageBreak(35);
    const si = statusIcon(row.status);
    const cleanStatus = row.status.replace(/[✅❌⚠️]/g, '').trim();
    const y = doc.y;

    doc.fontSize(9).font('Helvetica-Bold').fillColor(si.color)
      .text(`[${si.symbol}]`, doc.x, y, { continued: true })
      .fillColor('#374151').font('Helvetica-Bold')
      .text(` ${row.control}`, { continued: true })
      .font('Helvetica').fillColor(COLORS.gray)
      .text(` — ${cleanStatus}`);

    doc.fontSize(8.5).font('Helvetica').fillColor('#6b7280')
      .text(`    ${row.details}`, { indent: 20 });
    doc.moveDown(0.2);
  }
  doc.moveDown(0.3);
}

// ============ COVER PAGE ============

doc.moveDown(5);
doc.fontSize(32).font('Helvetica-Bold').fillColor(COLORS.primary)
  .text('SOC 2 Type 2', { align: 'center' });
doc.fontSize(28).text('Gap Analysis', { align: 'center' });

doc.moveDown(1);
doc.strokeColor(COLORS.secondary).lineWidth(2)
  .moveTo(150, doc.y).lineTo(445, doc.y).stroke();
doc.moveDown(1);

doc.fontSize(16).font('Helvetica').fillColor(COLORS.accent)
  .text('FridayReport.AI', { align: 'center' });
doc.fontSize(12).fillColor(COLORS.gray)
  .text('Enterprise Project Portfolio Management', { align: 'center' });

doc.moveDown(3);
doc.fontSize(10).fillColor(COLORS.gray);
doc.text(`Date: March 12, 2026`, { align: 'center' });
doc.text(`Scope: All Five Trust Service Criteria`, { align: 'center' });
doc.text(`Assessment: Application-Level Controls`, { align: 'center' });
doc.text(`Classification: Confidential`, { align: 'center' });

// ============ EXECUTIVE SUMMARY ============

doc.addPage();
drawHeader('Executive Summary', 22);


drawBody(
  'FridayReport.AI has a solid foundation for SOC 2 compliance with strong audit logging, role-based access control, and multi-provider authentication already in place. However, several critical gaps remain across all five criteria — most notably the absence of MFA, weak password policies, no session idle timeout, missing security headers, no health check endpoints, and no formal data retention enforcement.'
);
doc.moveDown(0.3);
drawBody(
  'This document details every control area across all five Trust Service Criteria (Security, Availability, Processing Integrity, Confidentiality, Privacy), identifies what is currently implemented, and highlights what is missing or needs improvement.'
);

// ============ 1. SECURITY ============

checkPageBreak(80);
drawHeader('1. SECURITY (CC — Common Criteria)', 20);

drawSubHeader('CC6.1 — Logical Access Controls');
drawSimpleTable([
  { control: 'User authentication', status: '✅ Implemented', details: 'Email/password, Google OAuth, Microsoft OAuth, Replit OAuth, Magic Links' },
  { control: 'Multi-factor authentication (MFA)', status: '❌ Missing', details: 'No MFA/2FA implementation. Critical gap for SOC 2.' },
  { control: 'Password complexity policy', status: '⚠️ Weak', details: 'Only 6-char minimum. No uppercase, number, or special character requirements.' },
  { control: 'Account lockout', status: '❌ Missing', details: 'No mechanism to lock accounts after repeated failed login attempts.' },
  { control: 'Role-based access control (RBAC)', status: '✅ Implemented', details: 'System roles (super_admin, marketing, user) and org roles (owner, org_admin, team_member).' },
  { control: 'Org-level access enforcement', status: '✅ Implemented', details: 'userHasOrgAccess middleware on all org-scoped endpoints.' },
  { control: 'API token authentication', status: '✅ Implemented', details: 'Bearer token auth with api_tokens table.' },
  { control: 'Force password change', status: '❌ Missing', details: 'No mechanism to force password change on first login or after admin reset.' },
]);

drawSubHeader('CC6.2 — Session Management');
drawSimpleTable([
  { control: 'Secure session storage', status: '✅ Implemented', details: 'PostgreSQL-backed sessions via connect-pg-simple.' },
  { control: 'Secure cookie flags', status: '✅ Implemented', details: 'httpOnly: true, secure: true (production), sameSite: lax.' },
  { control: 'Session logout', status: '✅ Implemented', details: 'Endpoint destroys session and clears cookie.' },
  { control: 'Session idle timeout', status: '❌ Missing', details: 'No inactivity timeout. Sessions last 30 days regardless of activity.' },
  { control: 'Concurrent session limits', status: '❌ Missing', details: 'No limit on simultaneous sessions per user.' },
]);

drawSubHeader('CC6.3 — Encryption');
drawSimpleTable([
  { control: 'HTTPS/TLS in transit', status: '✅ Implemented', details: 'Enforced by hosting platform (Replit).' },
  { control: 'Password hashing', status: '✅ Implemented', details: 'crypto.scrypt with unique 16-byte salt, 64-byte derived key.' },
  { control: 'Token encryption at rest', status: '✅ Implemented', details: 'AES-256-GCM for OAuth tokens (Microsoft Planner, integrations).' },
  { control: 'Database encryption at rest', status: '⚠️ Platform-dependent', details: 'Managed by PostgreSQL hosting provider; not application-controlled.' },
  { control: 'Sensitive field encryption', status: '⚠️ Partial', details: 'Only OAuth tokens encrypted. Financial data, PII in exports unencrypted.' },
]);

drawSubHeader('CC6.6 — Security Event Monitoring');
drawSimpleTable([
  { control: 'API request logging', status: '✅ Implemented', details: 'All requests logged with method, path, status, duration, user ID, IP.' },
  { control: 'User activity logging', status: '✅ Implemented', details: 'user_activity_logs tracks high-level actions with IP and user agent.' },
  { control: 'Error logging', status: '✅ Implemented', details: 'error_logs table captures stack traces, request context, user info.' },
  { control: 'Login success/failure logging', status: '❌ Missing', details: 'No dedicated security event log. Failed logins not tracked.' },
  { control: 'Privilege escalation tracking', status: '❌ Missing', details: 'Role changes not logged in a security-specific audit trail.' },
  { control: 'Security event alerting', status: '❌ Missing', details: 'No automated alerts for suspicious activity.' },
]);

drawSubHeader('CC6.7 — Security Headers');
drawSimpleTable([
  { control: 'Content-Security-Policy', status: '⚠️ Partial', details: 'Only frame-ancestors set (for Teams). No script-src, style-src.' },
  { control: 'Strict-Transport-Security (HSTS)', status: '❌ Missing', details: 'Not set in application.' },
  { control: 'X-Content-Type-Options', status: '❌ Missing', details: 'Not set.' },
  { control: 'Referrer-Policy', status: '❌ Missing', details: 'Not set.' },
  { control: 'Permissions-Policy', status: '❌ Missing', details: 'Not set.' },
]);

drawSubHeader('CC6.8 — Rate Limiting & DoS Protection');
drawSimpleTable([
  { control: 'Auth endpoint rate limiting', status: '⚠️ Partial', details: 'Custom in-memory limit on magic link/passwordless only (3 req/15 min).' },
  { control: 'Login endpoint rate limiting', status: '❌ Missing', details: 'No rate limit on password login endpoint.' },
  { control: 'General API rate limiting', status: '❌ Missing', details: 'express-rate-limit is a dependency but not applied.' },
  { control: 'Bot protection', status: '✅ Implemented', details: 'Honeypot mechanism and submission time validation on auth forms.' },
  { control: 'File upload limits', status: '✅ Implemented', details: '50MB for project files, 5MB for images.' },
]);

drawSubHeader('CC7.2 — CSRF Protection');
drawSimpleTable([
  { control: 'CSRF token validation', status: '❌ Missing', details: 'No CSRF tokens. Relies solely on SameSite: Lax cookie attribute.' },
]);

// ============ 2. AVAILABILITY ============

checkPageBreak(80);
drawHeader('2. AVAILABILITY (A1)', 20);

drawSubHeader('A1.1 — System Monitoring');
drawSimpleTable([
  { control: 'Health check endpoint', status: '❌ Missing', details: 'No /health or /status endpoint.' },
  { control: 'Uptime monitoring', status: '❌ Missing', details: 'No automated uptime tracking or alerting.' },
  { control: 'Performance monitoring', status: '⚠️ Partial', details: 'SuperAdmin shows API response times, but no persistent uptime metrics.' },
  { control: 'Database health monitoring', status: '⚠️ Partial', details: 'SuperAdmin database view exists but no persistent health history.' },
]);

drawSubHeader('A1.2 — Incident Management');
drawSimpleTable([
  { control: 'Incident tracking system', status: '❌ Missing', details: 'No formal incident management. Help tickets exist but not incident-specific.' },
  { control: 'Incident severity classification', status: '❌ Missing', details: 'No severity levels or response SLAs defined.' },
  { control: 'Incident timeline / root cause', status: '❌ Missing', details: 'No structured incident record-keeping.' },
  { control: 'Post-incident review', status: '❌ Missing', details: 'No process or tooling for post-mortems.' },
]);

drawSubHeader('A1.3 — Recovery & Continuity');
drawSimpleTable([
  { control: 'Graceful shutdown', status: '❌ Missing', details: 'No SIGTERM/SIGINT handling. DB connections not closed cleanly.' },
  { control: 'Automated backups', status: '⚠️ Platform-dependent', details: 'No application-level backup jobs. Relies on hosting provider.' },
  { control: 'Backup verification', status: '❌ Missing', details: 'No mechanism to verify backup integrity.' },
  { control: 'Disaster recovery testing', status: '❌ Missing', details: 'No tooling for DR testing or documentation.' },
]);

drawSubHeader('A1.4 — Maintenance Management');
drawSimpleTable([
  { control: 'Maintenance window scheduling', status: '❌ Missing', details: 'No ability to schedule or announce maintenance windows.' },
  { control: 'User notifications for downtime', status: '❌ Missing', details: 'No maintenance banner or pre-announcement system.' },
]);

// ============ 3. PROCESSING INTEGRITY ============

checkPageBreak(80);
drawHeader('3. PROCESSING INTEGRITY (PI1)', 20);

drawSubHeader('PI1.1 — Input Validation');
drawSimpleTable([
  { control: 'Schema validation (Zod)', status: '✅ Implemented', details: 'Extensive Zod schemas on all write paths, client and server.' },
  { control: 'Database constraints', status: '✅ Implemented', details: 'Unique indexes, foreign keys, NOT NULL constraints throughout.' },
  { control: 'Error classification', status: '✅ Implemented', details: 'classifyError maps PostgreSQL codes and Zod errors to HTTP responses.' },
  { control: 'Validation failure logging', status: '❌ Missing', details: 'Failures returned to client but not logged for compliance review.' },
]);

drawSubHeader('PI1.2 — Transaction Integrity');
drawSimpleTable([
  { control: 'Database transactions', status: '⚠️ Partial', details: 'Used in billing. Many multi-table writes not wrapped in transactions.' },
  { control: 'Idempotency handling', status: '⚠️ Partial', details: 'Billing uses requestId. No general idempotency middleware.' },
  { control: 'Duplicate detection', status: '⚠️ Partial', details: 'Upsert patterns in some operations. No comprehensive guard.' },
]);

drawSubHeader('PI1.3 — Processing Completeness');
drawSimpleTable([
  { control: 'Bulk operation tracking', status: '❌ Missing', details: 'Import/export operations lack comprehensive success/failure tracking.' },
  { control: 'Data integrity verification', status: '❌ Missing', details: 'No scheduled jobs for orphaned records or integrity violations.' },
  { control: 'Processing error monitoring', status: '⚠️ Partial', details: 'Errors logged but no dashboards for processing error trends.' },
]);

drawSubHeader('PI1.4 — Output Accuracy');
drawSimpleTable([
  { control: 'Report generation validation', status: '⚠️ Partial', details: 'Reports from live queries; no checksums or validation on output.' },
  { control: 'Export data verification', status: '❌ Missing', details: 'No row count or checksum verification on data exports.' },
]);

// ============ 4. CONFIDENTIALITY ============

checkPageBreak(80);
drawHeader('4. CONFIDENTIALITY (C1)', 20);

drawSubHeader('C1.1 — Data Classification');
drawSimpleTable([
  { control: 'Data classification labels', status: '❌ Missing', details: 'No formal system (Public/Internal/Confidential/Restricted).' },
  { control: 'Classification-based access', status: '❌ Missing', details: 'No access restrictions based on data sensitivity level.' },
  { control: 'Visual classification indicators', status: '❌ Missing', details: 'No badges or labels showing data sensitivity in UI.' },
]);

drawSubHeader('C1.2 — Access to Confidential Information');
drawSimpleTable([
  { control: 'Org-scoped data isolation', status: '✅ Implemented', details: 'All queries filter by organization ID. Multi-tenant isolation enforced.' },
  { control: 'User data sanitization', status: '✅ Implemented', details: 'sanitizeUser strips password hashes, tokens, API keys from responses.' },
  { control: 'API key masking', status: '✅ Implemented', details: 'Custom API keys masked (first/last 4 chars) in responses.' },
  { control: 'Data access audit logging', status: '❌ Missing', details: 'No tracking of who viewed sensitive data.' },
]);

drawSubHeader('C1.3 — Data Retention & Disposal');
drawSimpleTable([
  { control: 'Data retention policies', status: '❌ Missing', details: 'No configurable retention periods for any data type.' },
  { control: 'Automated data cleanup', status: '❌ Missing', details: 'No scheduled purge of old logs, expired tokens, or sessions.' },
  { control: 'Expired token cleanup', status: '❌ Missing', details: 'Magic link, password reset, invitation tokens never purged.' },
  { control: 'Session cleanup', status: '⚠️ Partial', details: 'connect-pg-simple may auto-prune, but not explicitly configured.' },
]);

// ============ 5. PRIVACY ============

checkPageBreak(80);
drawHeader('5. PRIVACY (P1)', 20);

drawSubHeader('P1.1 — Privacy Notice & Consent');
drawSimpleTable([
  { control: 'Privacy policy page', status: '✅ Implemented', details: 'Dedicated Privacy Statement page outlining data practices.' },
  { control: 'User consent tracking', status: '✅ Implemented', details: 'user_consents table with versioned records. Terms consent modal.' },
  { control: 'Consent withdrawal', status: '❌ Missing', details: 'No mechanism for users to withdraw previously given consent.' },
  { control: 'Consent change history', status: '⚠️ Partial', details: 'Records stored but no UI for users to view consent history.' },
]);

drawSubHeader('P1.2 — Right to Access & Portability');
drawSimpleTable([
  { control: 'Data export for users', status: '⚠️ Partial', details: 'Excel/CSV exports for timesheets, issues. No "export all my data" feature.' },
  { control: 'Personal data inventory', status: '❌ Missing', details: 'No single view showing what personal data the system holds.' },
]);

drawSubHeader('P1.3 — Right to Erasure');
drawSimpleTable([
  { control: 'User data deletion', status: '✅ Implemented', details: 'Hard delete function removes user records, nullifies references.' },
  { control: 'Anonymization', status: '⚠️ Partial', details: 'Hard delete nullifies FKs but doesn\'t replace PII with anonymized values.' },
  { control: 'Erasure certification', status: '❌ Missing', details: 'No formal certificate when user data is erased.' },
]);

drawSubHeader('P1.4 — Privacy Preferences');
drawSimpleTable([
  { control: 'Notification preferences', status: '⚠️ Partial', details: 'Org-level channel toggles. No per-user fine-grained preferences.' },
  { control: 'Privacy preference center', status: '❌ Missing', details: 'No user-facing page for managing privacy and data sharing settings.' },
]);

// ============ PRIORITY SUMMARY ============

checkPageBreak(80);
drawHeader('Priority Summary', 22);

drawSubHeader('Critical Gaps (Must Fix for SOC 2)');
const criticalGaps = [
  'No MFA/2FA — Most auditors will flag this as a critical finding',
  'Weak password policy — 6-char minimum is insufficient',
  'No account lockout — Allows unlimited brute-force attempts on login',
  'No session idle timeout — 30-day sessions without activity check',
  'Missing security headers — HSTS, X-Content-Type-Options, Referrer-Policy',
  'No security event audit log — Login failures, role changes not tracked',
  'No health check endpoints — Required for availability monitoring evidence',
  'No data retention enforcement — Logs and expired tokens accumulate indefinitely',
  'No graceful shutdown — Risk of data corruption on restart',
];
criticalGaps.forEach((gap, i) => drawBullet(`${i + 1}. ${gap}`));

doc.moveDown(0.3);
drawSubHeader('Important Gaps (Expected by Most Auditors)');
const importantGaps = [
  'No CSRF token protection',
  'No general API rate limiting',
  'No incident management system',
  'No data classification system',
  'No data access audit logging',
  'No validation failure logging',
  'Transaction wrappers missing on many multi-table operations',
  'No formal data integrity verification',
];
importantGaps.forEach((gap, i) => drawBullet(`${i + 10}. ${gap}`));

doc.moveDown(0.3);
drawSubHeader('Recommended Enhancements (Strengthens Audit Posture)');
const enhancements = [
  'Concurrent session limits',
  'Privacy preference center',
  'Erasure certification',
  'Compliance admin dashboard',
  'Access review workflow',
  'Policy acknowledgment tracking',
  'Processing completeness verification for bulk operations',
];
enhancements.forEach((gap, i) => drawBullet(`${i + 18}. ${gap}`));

// ============ EXISTING STRENGTHS ============

checkPageBreak(80);
drawHeader('Existing Strengths', 22);

drawBody(
  'The application has significant existing controls that will serve as strong evidence during an audit:'
);
doc.moveDown(0.3);

const strengths = [
  '13 audit/log tables across activity, API requests, billing, timesheets, change logs, and error tracking',
  'Multi-provider OAuth (Google, Microsoft, Replit) with secure token handling',
  'Comprehensive RBAC with organization-level data isolation',
  'AES-256-GCM encryption for sensitive integration tokens',
  'Zod schema validation on all write paths (client and server)',
  'SuperAdmin monitoring dashboard with API analytics and performance metrics',
  'Soft-delete with recycle bin for data recovery',
  'Full user hard-delete capability supporting right-to-erasure',
  'Bot protection (honeypot mechanism) on authentication forms',
  'Versioned consent tracking for privacy compliance',
  'Timesheet audit engine with comprehensive action logging',
  'Change log tables tracking before/after state for projects, tasks, issues',
  'Billing audit logs tracking subscription and seat changes',
];
strengths.forEach(s => drawBullet(s));

// ============ FOOTER NOTE ============

doc.moveDown(1);
doc.strokeColor(COLORS.tableBorder).lineWidth(0.5)
  .moveTo(doc.x, doc.y).lineTo(doc.x + PAGE_WIDTH, doc.y).stroke();
doc.moveDown(0.5);
doc.fontSize(8).font('Helvetica-Oblique').fillColor(COLORS.gray)
  .text(
    'This assessment covers application-level controls only. Infrastructure controls (network security, physical security, backup procedures, hosting provider certifications) should be assessed separately with your cloud provider\'s compliance documentation.',
    { lineGap: 2 }
  );

// ============ PAGE NUMBERS ============

const totalPages = doc.bufferedPageRange().count;
for (let i = 0; i < totalPages; i++) {
  doc.switchToPage(i);
  doc.fontSize(8).font('Helvetica').fillColor(COLORS.gray);
  if (i > 0) {
    doc.text(
      `FridayReport.AI — SOC 2 Gap Analysis  |  Page ${i + 1} of ${totalPages}  |  Confidential`,
      50,
      doc.page.height - 40,
      { align: 'center', width: PAGE_WIDTH }
    );
  }
}

doc.end();

stream.on('finish', () => {
  console.log(`PDF generated: ${outputPath}`);
});
