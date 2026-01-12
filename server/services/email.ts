import { Resend } from "resend";

let resend: Resend | null = null;

function getResendClient(): Resend | null {
  if (!process.env.RESEND_API_KEY) {
    console.warn("Email not configured: RESEND_API_KEY environment variable required");
    return null;
  }

  if (!resend) {
    resend = new Resend(process.env.RESEND_API_KEY);
  }

  return resend;
}

export interface EmailAttachment {
  filename: string;
  content: Buffer | string;
  contentType?: string;
}

export async function sendEmail({
  to,
  subject,
  text,
  html,
  from,
  attachments,
}: {
  to: string;
  subject: string;
  text: string;
  html?: string;
  from?: string;
  attachments?: EmailAttachment[];
}): Promise<boolean> {
  const client = getResendClient();
  
  if (!client) {
    console.log("Email would be sent to:", to);
    console.log("Subject:", subject);
    console.log("Body:", text);
    if (attachments) {
      console.log("Attachments:", attachments.map(a => a.filename).join(", "));
    }
    return false;
  }

  try {
    const fromAddress = from || process.env.RESEND_FROM_EMAIL || "FridayReport.AI <onboarding@resend.dev>";
    
    const emailPayload: {
      from: string;
      to: string[];
      subject: string;
      text: string;
      html: string;
      attachments?: { filename: string; content: Buffer }[];
    } = {
      from: fromAddress,
      to: [to],
      subject,
      text,
      html: html || text,
    };
    
    if (attachments && attachments.length > 0) {
      emailPayload.attachments = attachments.map(att => ({
        filename: att.filename,
        content: Buffer.isBuffer(att.content) ? att.content : Buffer.from(att.content, 'base64'),
      }));
    }
    
    const { data, error } = await client.emails.send(emailPayload);

    if (error) {
      console.error("Failed to send email:", error);
      return false;
    }

    console.log(`Email sent successfully to ${to}, ID: ${data?.id}`);
    return true;
  } catch (error) {
    console.error("Failed to send email:", error);
    return false;
  }
}

export async function sendPasswordResetEmail(email: string, resetUrl: string): Promise<boolean> {
  const subject = "Reset Your Password - FridayReport.AI";
  
  const text = `
You requested a password reset for your FridayReport.AI account.

Click the link below to reset your password:
${resetUrl}

This link will expire in 1 hour.

If you didn't request this, you can safely ignore this email.

- The FridayReport.AI Team
`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #f97316 0%, #ea580c 100%); padding: 30px; border-radius: 8px 8px 0 0; text-align: center;">
    <h1 style="color: white; margin: 0; font-size: 24px;">FridayReport.AI</h1>
  </div>
  
  <div style="background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
    <h2 style="margin-top: 0; color: #1f2937;">Reset Your Password</h2>
    
    <p>You requested a password reset for your FridayReport.AI account.</p>
    
    <p>Click the button below to set a new password:</p>
    
    <div style="text-align: center; margin: 30px 0;">
      <a href="${resetUrl}" style="background: #f97316; color: white; padding: 12px 30px; border-radius: 6px; text-decoration: none; font-weight: 600; display: inline-block;">Reset Password</a>
    </div>
    
    <p style="font-size: 14px; color: #6b7280;">This link will expire in 1 hour.</p>
    
    <p style="font-size: 14px; color: #6b7280;">If you didn't request this password reset, you can safely ignore this email.</p>
    
    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
    
    <p style="font-size: 12px; color: #9ca3af; margin-bottom: 0;">
      If the button doesn't work, copy and paste this link into your browser:<br>
      <a href="${resetUrl}" style="color: #f97316; word-break: break-all;">${resetUrl}</a>
    </p>
  </div>
</body>
</html>
`;

  return sendEmail({ to: email, subject, text, html });
}

export async function verifyEmailConnection(): Promise<boolean> {
  const client = getResendClient();
  
  if (!client) {
    return false;
  }

  try {
    const { data, error } = await client.domains.list();
    if (error) {
      console.error("Resend connection failed:", error);
      return false;
    }
    console.log("Resend connection verified successfully");
    return true;
  } catch (error) {
    console.error("Resend connection failed:", error);
    return false;
  }
}
