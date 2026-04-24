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
  content_id?: string;
}

export async function sendEmail({
  to,
  subject,
  text,
  html,
  from,
  cc,
  attachments,
}: {
  to: string;
  subject: string;
  text: string;
  html?: string;
  from?: string;
  cc?: string[];
  attachments?: EmailAttachment[];
}): Promise<boolean> {
  const client = getResendClient();
  
  if (!client) {
    console.log("Email would be sent to:", to);
    if (cc && cc.length > 0) {
      console.log("CC:", cc.join(", "));
    }
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
      cc?: string[];
      subject: string;
      text: string;
      html: string;
      attachments?: { filename: string; content: Buffer; contentId?: string; contentType?: string }[];
    } = {
      from: fromAddress,
      to: [to],
      subject,
      text,
      html: html || text,
    };

    if (cc && cc.length > 0) {
      emailPayload.cc = cc;
    }
    
    if (attachments && attachments.length > 0) {
      emailPayload.attachments = attachments.map(att => {
        const mapped: { filename: string; content: Buffer; contentId?: string; contentType?: string } = {
          filename: att.filename,
          content: Buffer.isBuffer(att.content) ? att.content : Buffer.from(att.content, 'base64'),
        };
        if (att.content_id) {
          mapped.contentId = att.content_id;
        }
        if (att.contentType) {
          mapped.contentType = att.contentType;
        }
        return mapped;
      });
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
    <p style="font-size: 11px; color: #9ca3af; margin: 12px 0 0; text-align: center;">
      <a href="https://fridayreport.ai/profile?section=notifications" style="color: #9ca3af; text-decoration: underline;">Manage notification preferences</a>
    </p>
  </div>
</body>
</html>
`;

  return sendEmail({ to: email, subject, text, html });
}

export async function sendEmailVerificationEmail(email: string, verifyUrl: string): Promise<boolean> {
  const subject = "Verify Your Email - FridayReport.AI";
  
  const text = `
Welcome to FridayReport.AI!

Please verify your email address by clicking the link below:
${verifyUrl}

This link will expire in 24 hours.

If you didn't create an account with us, you can safely ignore this email.

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
    <h2 style="margin-top: 0; color: #1f2937;">Verify Your Email</h2>
    
    <p>Welcome to FridayReport.AI! Please verify your email address to complete your registration.</p>
    
    <div style="text-align: center; margin: 30px 0;">
      <a href="${verifyUrl}" style="background: #f97316; color: white; padding: 12px 30px; border-radius: 6px; text-decoration: none; font-weight: 600; display: inline-block;">Verify Email</a>
    </div>
    
    <p style="font-size: 14px; color: #6b7280;">This link will expire in 24 hours.</p>
    
    <p style="font-size: 14px; color: #6b7280;">If you didn't create an account with us, you can safely ignore this email.</p>
    
    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
    
    <p style="font-size: 12px; color: #9ca3af; margin-bottom: 0;">
      If the button doesn't work, copy and paste this link into your browser:<br>
      <a href="${verifyUrl}" style="color: #f97316; word-break: break-all;">${verifyUrl}</a>
    </p>
    <p style="font-size: 11px; color: #9ca3af; margin: 12px 0 0; text-align: center;">
      <a href="https://fridayreport.ai/profile?section=notifications" style="color: #9ca3af; text-decoration: underline;">Manage notification preferences</a>
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

export async function sendIntakeStepTransitionEmail(
  recipientEmail: string,
  options: {
    intakeId: number;
    projectName: string;
    organizationName?: string;
    stepLabel: string;
    transition: 'entry' | 'exit';
    fromStepLabel?: string | null;
    toStepLabel?: string | null;
    actorName?: string | null;
    appUrl: string;
  }
): Promise<boolean> {
  const escapeHtml = (str: string) =>
    String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const isEntry = options.transition === 'entry';
  const safeProject = escapeHtml(options.projectName);
  const safeStep = escapeHtml(options.stepLabel);
  const safeOrg = options.organizationName ? escapeHtml(options.organizationName) : '';
  const safeActor = options.actorName ? escapeHtml(options.actorName) : '';
  const safeFrom = options.fromStepLabel ? escapeHtml(options.fromStepLabel) : '';
  const safeTo = options.toStepLabel ? escapeHtml(options.toStepLabel) : '';

  const action = isEntry ? 'entered' : 'exited';
  const subject = `Intake "${options.projectName}" ${action} step "${options.stepLabel}"`;
  const intakeUrl = `${options.appUrl.replace(/\/$/, '')}/intakes/${options.intakeId}`;

  const transitionLine = isEntry
    ? (options.fromStepLabel
        ? `This intake just moved from "${options.fromStepLabel}" into "${options.stepLabel}".`
        : `This intake just entered the "${options.stepLabel}" step.`)
    : (options.toStepLabel
        ? `This intake just left "${options.stepLabel}" and is now in "${options.toStepLabel}".`
        : `This intake just exited the "${options.stepLabel}" step.`);

  const actorLine = options.actorName ? `Updated by ${options.actorName}.` : '';

  const text = `
${transitionLine}

Intake: ${options.projectName}${options.organizationName ? `\nOrganization: ${options.organizationName}` : ''}
Step: ${options.stepLabel}
Transition: ${isEntry ? 'Entry' : 'Exit'}
${actorLine ? actorLine + '\n' : ''}
View intake: ${intakeUrl}

- The FridayReport.AI Team
`;

  const safeTransitionLine = isEntry
    ? (options.fromStepLabel
        ? `This intake just moved from <strong>${safeFrom}</strong> into <strong>${safeStep}</strong>.`
        : `This intake just entered the <strong>${safeStep}</strong> step.`)
    : (options.toStepLabel
        ? `This intake just left <strong>${safeStep}</strong> and is now in <strong>${safeTo}</strong>.`
        : `This intake just exited the <strong>${safeStep}</strong> step.`);

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
    <h2 style="margin-top: 0; color: #1f2937;">Intake Workflow Update</h2>

    <p>${safeTransitionLine}</p>

    <div style="background: #f9fafb; padding: 20px; border-radius: 6px; margin: 20px 0;">
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 6px 0; color: #6b7280; font-size: 14px; width: 110px;">Intake</td>
          <td style="padding: 6px 0; font-weight: 600;">${safeProject}</td>
        </tr>
        ${safeOrg ? `<tr>
          <td style="padding: 6px 0; color: #6b7280; font-size: 14px;">Organization</td>
          <td style="padding: 6px 0;">${safeOrg}</td>
        </tr>` : ''}
        <tr>
          <td style="padding: 6px 0; color: #6b7280; font-size: 14px;">Step</td>
          <td style="padding: 6px 0; font-weight: 600;">${safeStep}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #6b7280; font-size: 14px;">Transition</td>
          <td style="padding: 6px 0;">${isEntry ? 'Entry' : 'Exit'}</td>
        </tr>
        ${safeActor ? `<tr>
          <td style="padding: 6px 0; color: #6b7280; font-size: 14px;">Updated by</td>
          <td style="padding: 6px 0;">${safeActor}</td>
        </tr>` : ''}
      </table>
    </div>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${escapeHtml(intakeUrl)}" style="display: inline-block; background-color: #f97316; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 6px; font-weight: 600; font-size: 16px;">View Intake</a>
    </div>

    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">

    <p style="font-size: 12px; color: #9ca3af; margin-bottom: 0;">
      You're receiving this because your email was added to the notification list for this workflow step.
    </p>
    <p style="font-size: 11px; color: #9ca3af; margin: 12px 0 0; text-align: center;">
      <a href="https://fridayreport.ai/profile?section=notifications" style="color: #9ca3af; text-decoration: underline;">Manage notification preferences</a>
    </p>
  </div>
</body>
</html>
`;

  return sendEmail({ to: recipientEmail, subject, text, html });
}

export async function sendAccessRequestNotification(
  adminEmail: string,
  requesterName: string,
  organizationName: string,
  requestMessage?: string
): Promise<boolean> {
  const subject = `Access Request for ${organizationName} - FridayReport.AI`;
  
  const text = `
A user has requested admin access to ${organizationName}.

Requester: ${requesterName}
${requestMessage ? `Message: ${requestMessage}` : ''}

Please log in to FridayReport.AI to review this request in Organization Settings > Members.

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
    <h2 style="margin-top: 0; color: #1f2937;">Access Request</h2>
    
    <p>A user has requested admin access to <strong>${organizationName}</strong>.</p>
    
    <div style="background: #f9fafb; padding: 20px; border-radius: 6px; margin: 20px 0;">
      <p style="margin: 0 0 10px 0;"><strong>Requester:</strong> ${requesterName}</p>
      ${requestMessage ? `<p style="margin: 0;"><strong>Message:</strong> ${requestMessage}</p>` : ''}
    </div>
    
    <p>Please log in to FridayReport.AI to review this request in <strong>Organization Settings &gt; Members</strong>.</p>
    
    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
    
    <p style="font-size: 12px; color: #9ca3af; margin-bottom: 0;">
      This is an automated notification from FridayReport.AI
    </p>
    <p style="font-size: 11px; color: #9ca3af; margin: 12px 0 0; text-align: center;">
      <a href="https://fridayreport.ai/profile?section=notifications" style="color: #9ca3af; text-decoration: underline;">Manage notification preferences</a>
    </p>
  </div>
</body>
</html>
`;

  return sendEmail({ to: adminEmail, subject, text, html });
}

export async function sendOrganizationInviteEmail(
  email: string,
  organizationName: string,
  inviterName: string,
  role: string,
  appUrl: string,
  inviteToken?: string
): Promise<boolean> {
  // If a token is provided, create a magic link, otherwise just use the app URL
  const acceptUrl = inviteToken 
    ? `${appUrl}/auth?invite=${inviteToken}`
    : appUrl;
  
  const subject = `You've been invited to join ${organizationName} - FridayReport.AI`;
  
  const text = `
You've been invited to join ${organizationName} on FridayReport.AI.

${inviterName} has invited you to join as a ${role}.

To accept this invitation, click the link below:
${acceptUrl}

Simply log in with your Microsoft account to get started.

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
    <h2 style="margin-top: 0; color: #1f2937;">You're Invited!</h2>
    
    <p><strong>${inviterName}</strong> has invited you to join <strong>${organizationName}</strong> as a <strong>${role}</strong>.</p>
    
    <div style="background: #f9fafb; padding: 20px; border-radius: 6px; margin: 20px 0;">
      <p style="margin: 0;">FridayReport.AI is a project portfolio management platform that helps teams track projects, milestones, and collaborate effectively.</p>
    </div>
    
    <div style="text-align: center; margin: 30px 0;">
      <!--[if mso]>
      <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${acceptUrl}" style="height:48px;v-text-anchor:middle;width:200px;" arcsize="13%" strokecolor="#ea580c" fillcolor="#f97316">
        <w:anchorlock/>
        <center style="color:#ffffff;font-family:sans-serif;font-size:16px;font-weight:bold;">Accept Invitation</center>
      </v:roundrect>
      <![endif]-->
      <!--[if !mso]><!-->
      <a href="${acceptUrl}" style="display: inline-block; background-color: #f97316; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 6px; font-weight: 600; font-size: 16px; mso-hide: all;">Accept Invitation</a>
      <!--<![endif]-->
    </div>
    
    <p style="font-size: 14px; color: #6b7280;">Simply sign in with your Microsoft account to join the organization.</p>
    
    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
    
    <p style="font-size: 12px; color: #9ca3af; margin-bottom: 0;">
      If you didn't expect this invitation, you can safely ignore this email.
    </p>
    <p style="font-size: 11px; color: #9ca3af; margin: 12px 0 0; text-align: center;">
      <a href="https://fridayreport.ai/profile?section=notifications" style="color: #9ca3af; text-decoration: underline;">Manage notification preferences</a>
    </p>
  </div>
</body>
</html>
`;

  return sendEmail({ to: email, subject, text, html });
}

export async function sendTaskAssignmentNotificationEmail(
  email: string,
  resourceName: string,
  taskName: string,
  projectName: string,
  startDate: string | null,
  endDate: string | null,
  projectUrl: string
): Promise<boolean> {
  const escapeHtml = (str: string) => str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const safeResourceName = escapeHtml(resourceName);
  const safeTaskName = escapeHtml(taskName);
  const safeProjectName = escapeHtml(projectName);

  const subject = `Task Assignment: ${taskName} - ${projectName}`;

  const dateInfo = startDate && endDate
    ? `${startDate} – ${endDate}`
    : startDate
      ? `Starting ${startDate}`
      : endDate
        ? `Due ${endDate}`
        : 'No dates set';

  const text = `
Hi ${resourceName},

You have been assigned to the task "${taskName}" in project "${projectName}".

Dates: ${dateInfo}

View the project here: ${projectUrl}

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
    <h2 style="margin-top: 0; color: #1f2937;">Task Assignment</h2>
    
    <p>Hi <strong>${safeResourceName}</strong>,</p>
    
    <p>You have been assigned to a task in <strong>${safeProjectName}</strong>.</p>
    
    <div style="background: #f9fafb; padding: 20px; border-radius: 6px; margin: 20px 0;">
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 6px 0; color: #6b7280; font-size: 14px; width: 80px;">Task</td>
          <td style="padding: 6px 0; font-weight: 600;">${safeTaskName}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #6b7280; font-size: 14px;">Project</td>
          <td style="padding: 6px 0; font-weight: 600;">${safeProjectName}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #6b7280; font-size: 14px;">Dates</td>
          <td style="padding: 6px 0;">${dateInfo}</td>
        </tr>
      </table>
    </div>
    
    <div style="text-align: center; margin: 30px 0;">
      <a href="${escapeHtml(projectUrl)}" style="display: inline-block; background-color: #f97316; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 6px; font-weight: 600; font-size: 16px;">View Project</a>
    </div>
    
    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
    
    <p style="font-size: 12px; color: #9ca3af; margin-bottom: 0;">
      This notification was sent because you are assigned to this task.
    </p>
    <p style="font-size: 11px; color: #9ca3af; margin: 12px 0 0; text-align: center;">
      <a href="https://fridayreport.ai/profile?section=notifications" style="color: #9ca3af; text-decoration: underline;">Manage notification preferences</a>
    </p>
  </div>
</body>
</html>
`;

  return sendEmail({ to: email, subject, text, html });
}

export async function sendAccessRequestDecisionNotification(
  userEmail: string,
  organizationName: string,
  approved: boolean,
  reviewerName?: string
): Promise<boolean> {
  const subject = `Access Request ${approved ? 'Approved' : 'Declined'} - ${organizationName}`;
  
  const text = approved
    ? `Your request for admin access to ${organizationName} has been approved${reviewerName ? ` by ${reviewerName}` : ''}. You now have admin access to the organization.`
    : `Your request for admin access to ${organizationName} has been declined${reviewerName ? ` by ${reviewerName}` : ''}. Please contact the organization administrators for more information.`;

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
    <h2 style="margin-top: 0; color: #1f2937;">Access Request ${approved ? 'Approved' : 'Declined'}</h2>
    
    <p>${approved 
      ? `Your request for admin access to <strong>${organizationName}</strong> has been approved${reviewerName ? ` by ${reviewerName}` : ''}.`
      : `Your request for admin access to <strong>${organizationName}</strong> has been declined${reviewerName ? ` by ${reviewerName}` : ''}.`
    }</p>
    
    <div style="background: ${approved ? '#ecfdf5' : '#fef2f2'}; padding: 20px; border-radius: 6px; margin: 20px 0; border-left: 4px solid ${approved ? '#10b981' : '#ef4444'};">
      <p style="margin: 0; color: ${approved ? '#065f46' : '#991b1b'};">
        ${approved 
          ? 'You now have admin access to the organization. You can manage settings, members, and all organization resources.'
          : 'Please contact the organization administrators if you believe this decision was made in error.'}
      </p>
    </div>
    
    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
    
    <p style="font-size: 12px; color: #9ca3af; margin-bottom: 0;">
      This is an automated notification from FridayReport.AI
    </p>
    <p style="font-size: 11px; color: #9ca3af; margin: 12px 0 0; text-align: center;">
      <a href="https://fridayreport.ai/profile?section=notifications" style="color: #9ca3af; text-decoration: underline;">Manage notification preferences</a>
    </p>
  </div>
</body>
</html>
`;

  return sendEmail({ to: userEmail, subject, text, html });
}

export async function sendMagicLinkEmail(
  email: string,
  verifyUrl: string
): Promise<boolean> {
  const subject = `Sign in to FridayReport.AI`;
  
  const text = `
Welcome to FridayReport.AI!

Click the link below to complete your sign-up:
${verifyUrl}

This link will expire in 15 minutes.

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
    <h2 style="margin-top: 0; color: #1f2937;">Welcome!</h2>
    
    <p>Click the button below to sign in to FridayReport.AI:</p>
    
    <div style="text-align: center; margin: 30px 0;">
      <!--[if mso]>
      <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${verifyUrl}" style="height:48px;v-text-anchor:middle;width:200px;" arcsize="13%" strokecolor="#ea580c" fillcolor="#f97316">
        <w:anchorlock/>
        <center style="color:#ffffff;font-family:sans-serif;font-size:16px;font-weight:bold;">Complete Sign Up</center>
      </v:roundrect>
      <![endif]-->
      <!--[if !mso]><!-->
      <a href="${verifyUrl}" style="display: inline-block; background-color: #f97316; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 6px; font-weight: 600; font-size: 16px;">Complete Sign Up</a>
      <!--<![endif]-->
    </div>
    
    <div style="background: #f9fafb; padding: 15px; border-radius: 6px; margin: 20px 0;">
      <p style="margin: 0; font-size: 14px; color: #6b7280;">This link will expire in 15 minutes. If you didn't request this email, you can safely ignore it.</p>
    </div>
    
    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
    
    <p style="font-size: 12px; color: #9ca3af; margin-bottom: 0;">
      If the button doesn't work, copy and paste this link into your browser:<br>
      <a href="${verifyUrl}" style="color: #f97316; word-break: break-all;">${verifyUrl}</a>
    </p>
    <p style="font-size: 11px; color: #9ca3af; margin: 12px 0 0; text-align: center;">
      <a href="https://fridayreport.ai/profile?section=notifications" style="color: #9ca3af; text-decoration: underline;">Manage notification preferences</a>
    </p>
  </div>
</body>
</html>
`;

  return sendEmail({ to: email, subject, text, html });
}

export async function sendEnterpriseInquiryEmail(
  userEmail: string,
  userName: string,
  planName: string,
  organizationName?: string
): Promise<{ userSent: boolean; salesSent: boolean }> {
  const salesEmail = "sales@fridayreport.ai";
  const subject = `Enterprise Plan Inquiry - ${userName}`;
  
  const userText = `
Hi ${userName},

Thank you for your interest in our ${planName} plan!

We've received your inquiry and our sales team will reach out to you shortly to discuss custom pricing options tailored to your organization's needs.

In the meantime, if you have any questions, feel free to reply to this email or contact us at ${salesEmail}.

Best regards,
The FridayReport.AI Team
`;

  const userHtml = `
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
    <h2 style="margin-top: 0; color: #1f2937;">Thank You for Your Interest!</h2>
    
    <p>Hi ${userName},</p>
    
    <p>Thank you for your interest in our <strong>${planName}</strong> plan!</p>
    
    <div style="background: #f9fafb; padding: 20px; border-radius: 6px; margin: 20px 0;">
      <p style="margin: 0;">We've received your inquiry and our sales team will reach out to you shortly to discuss custom pricing options tailored to your organization's needs.</p>
    </div>
    
    <p>In the meantime, if you have any questions, feel free to reply to this email or contact us at <a href="mailto:${salesEmail}" style="color: #f97316;">${salesEmail}</a>.</p>
    
    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
    
    <p style="font-size: 12px; color: #9ca3af; margin-bottom: 0;">
      Best regards,<br>The FridayReport.AI Team
    </p>
    <p style="font-size: 11px; color: #9ca3af; margin: 12px 0 0; text-align: center;">
      <a href="https://fridayreport.ai/profile?section=notifications" style="color: #9ca3af; text-decoration: underline;">Manage notification preferences</a>
    </p>
  </div>
</body>
</html>
`;

  const salesText = `
New Enterprise Inquiry

A user has expressed interest in the ${planName} plan.

User Details:
- Name: ${userName}
- Email: ${userEmail}
${organizationName ? `- Organization: ${organizationName}` : ''}

Please follow up with this lead as soon as possible.

- FridayReport.AI System
`;

  const salesHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #f97316 0%, #ea580c 100%); padding: 30px; border-radius: 8px 8px 0 0; text-align: center;">
    <h1 style="color: white; margin: 0; font-size: 24px;">New Enterprise Lead</h1>
  </div>
  
  <div style="background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
    <h2 style="margin-top: 0; color: #1f2937;">Enterprise Plan Inquiry</h2>
    
    <p>A user has expressed interest in the <strong>${planName}</strong> plan.</p>
    
    <div style="background: #ecfdf5; padding: 20px; border-radius: 6px; margin: 20px 0; border-left: 4px solid #10b981;">
      <h3 style="margin: 0 0 15px 0; color: #065f46;">User Details</h3>
      <p style="margin: 5px 0;"><strong>Name:</strong> ${userName}</p>
      <p style="margin: 5px 0;"><strong>Email:</strong> <a href="mailto:${userEmail}" style="color: #f97316;">${userEmail}</a></p>
      ${organizationName ? `<p style="margin: 5px 0;"><strong>Organization:</strong> ${organizationName}</p>` : ''}
    </div>
    
    <p><strong>Action Required:</strong> Please follow up with this lead as soon as possible.</p>
    
    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
    
    <p style="font-size: 12px; color: #9ca3af; margin-bottom: 0;">
      This is an automated notification from FridayReport.AI
    </p>
    <p style="font-size: 11px; color: #9ca3af; margin: 12px 0 0; text-align: center;">
      <a href="https://fridayreport.ai/profile?section=notifications" style="color: #9ca3af; text-decoration: underline;">Manage notification preferences</a>
    </p>
  </div>
</body>
</html>
`;

  const userSent = await sendEmail({ 
    to: userEmail, 
    subject: `Your ${planName} Inquiry - FridayReport.AI`, 
    text: userText, 
    html: userHtml 
  });
  
  const salesSent = await sendEmail({ 
    to: salesEmail, 
    subject, 
    text: salesText, 
    html: salesHtml 
  });
  
  return { userSent, salesSent };
}

export async function sendPasswordlessSignInEmail(
  email: string,
  firstName: string,
  verifyUrl: string
): Promise<boolean> {
  const subject = `Sign in to FridayReport.AI`;
  
  const text = `
Hi ${firstName},

Click the link below to sign in to FridayReport.AI:
${verifyUrl}

This link will expire in 15 minutes.

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
    <h2 style="margin-top: 0; color: #1f2937;">Hi ${firstName}!</h2>
    
    <p>Click the button below to sign in to your FridayReport.AI account:</p>
    
    <div style="text-align: center; margin: 30px 0;">
      <!--[if mso]>
      <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${verifyUrl}" style="height:48px;v-text-anchor:middle;width:200px;" arcsize="13%" strokecolor="#ea580c" fillcolor="#f97316">
        <w:anchorlock/>
        <center style="color:#ffffff;font-family:sans-serif;font-size:16px;font-weight:bold;">Sign In</center>
      </v:roundrect>
      <![endif]-->
      <!--[if !mso]><!-->
      <a href="${verifyUrl}" style="display: inline-block; background-color: #f97316; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 6px; font-weight: 600; font-size: 16px;">Sign In</a>
      <!--<![endif]-->
    </div>
    
    <div style="background: #f9fafb; padding: 15px; border-radius: 6px; margin: 20px 0;">
      <p style="margin: 0; font-size: 14px; color: #6b7280;">This link will expire in 15 minutes. If you didn't request this email, you can safely ignore it.</p>
    </div>
    
    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
    
    <p style="font-size: 12px; color: #9ca3af; margin-bottom: 0;">
      If the button doesn't work, copy and paste this link into your browser:<br>
      <a href="${verifyUrl}" style="color: #f97316; word-break: break-all;">${verifyUrl}</a>
    </p>
    <p style="font-size: 11px; color: #9ca3af; margin: 12px 0 0; text-align: center;">
      <a href="https://fridayreport.ai/profile?section=notifications" style="color: #9ca3af; text-decoration: underline;">Manage notification preferences</a>
    </p>
  </div>
</body>
</html>
`;

  return sendEmail({ to: email, subject, text, html });
}

export async function sendResourceInviteEmail(
  email: string,
  organizationName: string,
  inviterName: string,
  projectName: string | null,
  taskName: string | null,
  magicLinkUrl: string
): Promise<boolean> {
  const subject = `You've been assigned to a project - ${organizationName}`;
  
  const assignmentText = taskName && projectName
    ? `You've been assigned to the task "${taskName}" in the project "${projectName}".`
    : projectName 
      ? `You've been added as a resource to the project "${projectName}".`
      : `You've been added as a team member.`;
  
  const text = `
${assignmentText}

${inviterName} from ${organizationName} has added you to their team on FridayReport.AI.

Click the link below to accept this invitation and access your assignments:
${magicLinkUrl}

This link will expire in 7 days.

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
    <h2 style="margin-top: 0; color: #1f2937;">You've Been Assigned!</h2>
    
    <p>${assignmentText}</p>
    
    <p><strong>${inviterName}</strong> from <strong>${organizationName}</strong> has added you to their team.</p>
    
    ${projectName ? `
    <div style="background: #f9fafb; padding: 20px; border-radius: 6px; margin: 20px 0; border-left: 4px solid #f97316;">
      <p style="margin: 0; font-size: 14px;"><strong>Project:</strong> ${projectName}</p>
      ${taskName ? `<p style="margin: 10px 0 0 0; font-size: 14px;"><strong>Task:</strong> ${taskName}</p>` : ''}
    </div>
    ` : ''}
    
    <div style="text-align: center; margin: 30px 0;">
      <a href="${magicLinkUrl}" style="display: inline-block; background-color: #f97316; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 6px; font-weight: 600; font-size: 16px;">Accept & Join</a>
    </div>
    
    <p style="font-size: 14px; color: #6b7280;">Click the button above to create your account (or sign in if you already have one) and view your assignments.</p>
    
    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
    
    <p style="font-size: 12px; color: #9ca3af; margin-bottom: 0;">
      If you didn't expect this invitation, you can safely ignore this email.<br>
      If the button doesn't work, copy and paste this link into your browser:<br>
      <a href="${magicLinkUrl}" style="color: #f97316; word-break: break-all;">${magicLinkUrl}</a>
    </p>
    <p style="font-size: 11px; color: #9ca3af; margin: 12px 0 0; text-align: center;">
      <a href="https://fridayreport.ai/profile?section=notifications" style="color: #9ca3af; text-decoration: underline;">Manage notification preferences</a>
    </p>
  </div>
</body>
</html>
`;

  return sendEmail({ to: email, subject, text, html });
}

export async function sendWelcomeEmail(email: string, firstName?: string | null): Promise<boolean> {
  const subject = "Welcome to FridayReport.AI - Thank You for Signing Up!";
  const name = firstName || "there";
  
  const text = `
Hi ${name},

Thank you for signing up for FridayReport.AI! We're thrilled to have you on board.

FridayReport.AI is your all-in-one project management platform designed to help teams plan, track, and deliver projects with confidence. Here's what you can do right away:

- Create and manage projects with real-time dashboards
- Track tasks, issues, and timesheets across your team
- Build portfolios to oversee multiple projects at a glance
- Run simulations to forecast project outcomes
- Generate reports and stay on top of deadlines

Getting Started:
1. Set up your organization and invite your team
2. Create your first project
3. Add tasks and start tracking progress

If you have any questions or need help getting started, don't hesitate to reach out. We're here to help you succeed.

Welcome aboard!

- The FridayReport.AI Team
https://fridayreport.ai
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
    <h2 style="margin-top: 0; color: #1f2937;">Welcome, ${name}!</h2>
    
    <p>Thank you for signing up for FridayReport.AI! We're thrilled to have you on board.</p>
    
    <p>FridayReport.AI is your all-in-one project management platform designed to help teams plan, track, and deliver projects with confidence.</p>
    
    <h3 style="color: #1f2937; margin-bottom: 12px;">Here's what you can do right away:</h3>
    
    <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
      <tr>
        <td style="padding: 10px 12px; border-bottom: 1px solid #f3f4f6;">
          <span style="color: #f97316; font-weight: bold; margin-right: 8px;">&#9654;</span>
          <strong>Projects & Portfolios</strong> - Create and manage projects with real-time dashboards
        </td>
      </tr>
      <tr>
        <td style="padding: 10px 12px; border-bottom: 1px solid #f3f4f6;">
          <span style="color: #f97316; font-weight: bold; margin-right: 8px;">&#9654;</span>
          <strong>Tasks & Issues</strong> - Track work items and issues across your team
        </td>
      </tr>
      <tr>
        <td style="padding: 10px 12px; border-bottom: 1px solid #f3f4f6;">
          <span style="color: #f97316; font-weight: bold; margin-right: 8px;">&#9654;</span>
          <strong>Timesheets</strong> - Log time and monitor team utilization
        </td>
      </tr>
      <tr>
        <td style="padding: 10px 12px; border-bottom: 1px solid #f3f4f6;">
          <span style="color: #f97316; font-weight: bold; margin-right: 8px;">&#9654;</span>
          <strong>Simulations</strong> - Run what-if scenarios to forecast project outcomes
        </td>
      </tr>
      <tr>
        <td style="padding: 10px 12px;">
          <span style="color: #f97316; font-weight: bold; margin-right: 8px;">&#9654;</span>
          <strong>Reports</strong> - Generate insights and stay on top of deadlines
        </td>
      </tr>
    </table>
    
    <div style="background: #fff7ed; padding: 20px; border-radius: 6px; margin: 24px 0; border-left: 4px solid #f97316;">
      <h3 style="margin: 0 0 10px 0; color: #1f2937; font-size: 15px;">Getting Started:</h3>
      <ol style="margin: 0; padding-left: 20px; color: #4b5563;">
        <li style="margin-bottom: 6px;">Set up your organization and invite your team</li>
        <li style="margin-bottom: 6px;">Create your first project</li>
        <li>Add tasks and start tracking progress</li>
      </ol>
    </div>
    
    <div style="text-align: center; margin: 30px 0;">
      <a href="https://fridayreport.ai" style="background: #f97316; color: white; padding: 12px 30px; border-radius: 6px; text-decoration: none; font-weight: 600; display: inline-block;">Go to FridayReport.AI</a>
    </div>
    
    <p style="font-size: 14px; color: #6b7280;">If you have any questions or need help getting started, don't hesitate to reach out. We're here to help you succeed.</p>
    
    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
    
    <p style="font-size: 12px; color: #9ca3af; margin-bottom: 0; text-align: center;">
      FridayReport.AI - Project Management Made Simple<br>
      <a href="https://fridayreport.ai" style="color: #f97316;">fridayreport.ai</a>
    </p>
    <p style="font-size: 11px; color: #9ca3af; margin: 12px 0 0; text-align: center;">
      <a href="https://fridayreport.ai/profile?section=notifications" style="color: #9ca3af; text-decoration: underline;">Manage notification preferences</a>
    </p>
  </div>
</body>
</html>
`;

  return sendEmail({ to: email, subject, text, html, cc: ["info@fridayreport.ai"] });
}

function sanitizeHtmlContent(html: string): string {
  const sanitizeHtml = require('sanitize-html');
  return sanitizeHtml(html, {
    allowedTags: ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 'a', 'ul', 'ol', 'li', 'h2', 'h3', 'span'],
    allowedAttributes: {
      a: ['href', 'target', 'rel', 'style'],
      span: ['style'],
      p: ['style'],
      h2: ['style'],
      h3: ['style'],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
  });
}

function htmlToPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<li>/gi, '- ')
    .replace(/<\/h[23]>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function addInlineStylesToHtml(html: string): string {
  return html
    .replace(/<p>/g, '<p style="color: #374151; margin: 8px 0; line-height: 1.6;">')
    .replace(/<h2>/g, '<h2 style="color: #1f2937; font-size: 18px; font-weight: 600; margin: 16px 0 8px;">')
    .replace(/<h3>/g, '<h3 style="color: #1f2937; font-size: 16px; font-weight: 600; margin: 12px 0 6px;">')
    .replace(/<ul>/g, '<ul style="color: #374151; padding-left: 20px; margin: 8px 0;">')
    .replace(/<ol>/g, '<ol style="color: #374151; padding-left: 20px; margin: 8px 0;">')
    .replace(/<li>/g, '<li style="margin-bottom: 6px;">')
    .replace(/<a /g, '<a style="color: #f97316; text-decoration: underline;" ')
    .replace(/<strong>/g, '<strong style="font-weight: 600;">')
    .replace(/<u>/g, '<u style="text-decoration: underline;">');
}

export async function sendUpgradeOfferEmail({
  to,
  userName,
  customMessage,
  senderName,
}: {
  to: string;
  userName: string;
  customMessage: string;
  senderName: string;
}): Promise<boolean> {
  const subject = "Unlock More with FridayReport.AI Pro";
  const appUrl = "https://fridayreport.ai";

  const sanitized = sanitizeHtmlContent(customMessage);
  const styledMessage = addInlineStylesToHtml(sanitized);
  const plainMessage = htmlToPlainText(sanitized);

  const text = `
Hi ${userName},

${plainMessage}

Upgrade to a paid plan today and unlock:
- Unlimited projects and portfolios
- Advanced reporting and analytics
- Priority support
- Team collaboration features

Visit ${appUrl} to explore our plans.

Best regards,
${senderName}
FridayReport.AI Team
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
    <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0; font-size: 14px;">Unlock your team's full potential</p>
  </div>
  
  <div style="background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
    <h2 style="margin-top: 0; color: #1f2937;">Hi ${userName},</h2>
    
    <div style="margin: 16px 0;">
      ${styledMessage}
    </div>
    
    <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin: 24px 0;">
      <h3 style="margin-top: 0; color: #1f2937; font-size: 16px;">What you get with a paid plan:</h3>
      <ul style="color: #374151; padding-left: 20px;">
        <li style="margin-bottom: 8px;">Unlimited projects and portfolios</li>
        <li style="margin-bottom: 8px;">Advanced reporting and analytics</li>
        <li style="margin-bottom: 8px;">Priority support</li>
        <li style="margin-bottom: 8px;">Team collaboration features</li>
      </ul>
    </div>
    
    <div style="text-align: center; margin: 30px 0;">
      <a href="${appUrl}" style="background: #f97316; color: white; padding: 12px 30px; border-radius: 6px; text-decoration: none; font-weight: 600; display: inline-block;">Explore Plans</a>
    </div>
    
    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
    
    <p style="font-size: 13px; color: #6b7280; margin-bottom: 0;">
      Best regards,<br>
      <strong>${senderName}</strong><br>
      FridayReport.AI Team
    </p>
    <p style="font-size: 11px; color: #9ca3af; margin: 12px 0 0; text-align: center;">
      <a href="https://fridayreport.ai/profile?section=notifications" style="color: #9ca3af; text-decoration: underline;">Manage notification preferences</a>
    </p>
  </div>
</body>
</html>
`;

  return sendEmail({ to, subject, text, html });
}

export async function sendTimesheetSubmissionReminder(
  to: string,
  userName: string,
  urgency: 'friendly' | 'nudge' | 'firm',
  weekStart: string,
  weekEnd: string,
  hoursLogged: number,
  appUrl: string
): Promise<boolean> {
  const urgencyConfig = {
    friendly: {
      emoji: '🕐',
      subject: `Friendly Reminder: Submit your timesheet for ${weekStart}`,
      heading: 'Timesheet Reminder',
      tone: `Just a friendly reminder to submit your timesheet for the week of ${weekStart} to ${weekEnd}.`,
      color: '#3b82f6',
    },
    nudge: {
      emoji: '⏰',
      subject: `Action Needed: Timesheet due for ${weekStart}`,
      heading: 'Timesheet Due Today',
      tone: `Your timesheet for the week of ${weekStart} to ${weekEnd} is due today. Please submit it before end of day.`,
      color: '#f59e0b',
    },
    firm: {
      emoji: '🚨',
      subject: `Overdue: Timesheet for ${weekStart} not submitted`,
      heading: 'Timesheet Overdue',
      tone: `Your timesheet for the week of ${weekStart} to ${weekEnd} is overdue. Please submit it immediately to avoid escalation.`,
      color: '#ef4444',
    },
  };

  const config = urgencyConfig[urgency];

  const text = `Hi ${userName},\n\n${config.tone}\n\nHours logged so far: ${hoursLogged}\n\nSubmit now: ${appUrl}/timesheets\n\n- FridayReport.AI`;

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background-color: #f1f5f9;">
  <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <div style="background: white; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); overflow: hidden;">
      <div style="background: ${config.color}; padding: 30px; text-align: center;">
        <h1 style="margin: 0; color: white; font-size: 24px;">${config.emoji} ${config.heading}</h1>
      </div>
      <div style="padding: 30px;">
        <p style="color: #475569;">Hi ${userName},</p>
        <p style="color: #475569;">${config.tone}</p>
        <div style="background: #f8fafc; border-radius: 8px; padding: 16px; margin: 20px 0;">
          <p style="margin: 0; color: #64748b; font-size: 14px;">Hours logged so far</p>
          <p style="margin: 4px 0 0; color: #0f172a; font-size: 24px; font-weight: 700;">${hoursLogged}h</p>
        </div>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${appUrl}/timesheets" style="display: inline-block; background: ${config.color}; color: white; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; font-size: 16px;">Submit Now</a>
        </div>
      </div>
      <div style="background: #f8fafc; padding: 16px; text-align: center; border-top: 1px solid #e2e8f0;">
        <p style="margin: 0; color: #94a3b8; font-size: 12px;">Automated reminder from FridayReport.AI</p>
        <p style="margin: 8px 0 0; font-size: 11px;"><a href="https://fridayreport.ai/profile?section=notifications" style="color: #94a3b8; text-decoration: underline;">Manage notification preferences</a></p>
      </div>
    </div>
  </div>
</body>
</html>`;

  return sendEmail({ to, subject: config.subject, text, html });
}

export async function sendManagerApprovalReminder(
  to: string,
  managerName: string,
  pendingEntries: Array<{ name: string; hours: number; date: string }>,
  daysOld: number,
  appUrl: string
): Promise<boolean> {
  const isUrgent = daysOld >= 4;
  const subject = isUrgent
    ? `🚨 Urgent: ${pendingEntries.length} timesheets awaiting your approval`
    : `⏳ ${pendingEntries.length} timesheets pending your approval`;

  const entriesHtml = pendingEntries.slice(0, 10).map(e => `
    <tr>
      <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; color: #0f172a;">${e.name}</td>
      <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; color: #475569; text-align: right;">${e.hours}h</td>
      <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; color: #475569; text-align: right;">${e.date}</td>
    </tr>
  `).join('');

  const text = `Hi ${managerName},\n\nYou have ${pendingEntries.length} timesheet entries pending approval (oldest: ${daysOld} days).\n\nReview now: ${appUrl}/timesheets\n\n- FridayReport.AI`;

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background-color: #f1f5f9;">
  <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <div style="background: white; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); overflow: hidden;">
      <div style="background: ${isUrgent ? '#ef4444' : '#f59e0b'}; padding: 30px; text-align: center;">
        <h1 style="margin: 0; color: white; font-size: 24px;">Pending Approvals</h1>
        <p style="margin: 8px 0 0; color: rgba(255,255,255,0.9); font-size: 14px;">${pendingEntries.length} entries waiting (${daysOld} days oldest)</p>
      </div>
      <div style="padding: 30px;">
        <p style="color: #475569;">Hi ${managerName},</p>
        <p style="color: #475569;">The following timesheet entries are awaiting your approval:</p>
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <thead>
            <tr style="background: #f8fafc;">
              <th style="padding: 8px 12px; text-align: left; color: #64748b; font-size: 12px; text-transform: uppercase;">Team Member</th>
              <th style="padding: 8px 12px; text-align: right; color: #64748b; font-size: 12px; text-transform: uppercase;">Hours</th>
              <th style="padding: 8px 12px; text-align: right; color: #64748b; font-size: 12px; text-transform: uppercase;">Date</th>
            </tr>
          </thead>
          <tbody>${entriesHtml}</tbody>
        </table>
        ${pendingEntries.length > 10 ? `<p style="color: #94a3b8; font-size: 13px;">... and ${pendingEntries.length - 10} more</p>` : ''}
        <div style="text-align: center; margin: 30px 0;">
          <a href="${appUrl}/timesheets" style="display: inline-block; background: ${isUrgent ? '#ef4444' : '#f59e0b'}; color: white; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; font-size: 16px;">Review Now</a>
        </div>
      </div>
      <div style="background: #f8fafc; padding: 16px; text-align: center; border-top: 1px solid #e2e8f0;">
        <p style="margin: 0; color: #94a3b8; font-size: 12px;">Automated reminder from FridayReport.AI</p>
        <p style="margin: 8px 0 0; font-size: 11px;"><a href="https://fridayreport.ai/profile?section=notifications" style="color: #94a3b8; text-decoration: underline;">Manage notification preferences</a></p>
      </div>
    </div>
  </div>
</body>
</html>`;

  return sendEmail({ to, subject, text, html });
}

export async function sendTimesheetEscalationEmail(
  to: string,
  recipientName: string,
  managerName: string,
  pendingNames: string[],
  thresholdDays: number,
  appUrl: string
): Promise<boolean> {
  const subject = `🔺 Escalation: Timesheets unapproved for ${thresholdDays}+ days (Manager: ${managerName})`;

  const namesList = pendingNames.map(n => `• ${n}`).join('\n');
  const text = `Hi ${recipientName},\n\nTimesheets for the following team members managed by ${managerName} have exceeded the ${thresholdDays}-day SLA:\n${namesList}\n\nPlease follow up to ensure timely approval.\n\nView: ${appUrl}/timesheets\n\n- FridayReport.AI`;

  const namesHtml = pendingNames.map(n => `<li style="padding: 4px 0; color: #0f172a;">${n}</li>`).join('');

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background-color: #f1f5f9;">
  <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <div style="background: white; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); overflow: hidden;">
      <div style="background: #dc2626; padding: 30px; text-align: center;">
        <h1 style="margin: 0; color: white; font-size: 24px;">🔺 SLA Breach Escalation</h1>
        <p style="margin: 8px 0 0; color: rgba(255,255,255,0.9); font-size: 14px;">Timesheets unapproved for ${thresholdDays}+ business days</p>
      </div>
      <div style="padding: 30px;">
        <p style="color: #475569;">Hi ${recipientName},</p>
        <p style="color: #475569;">The following timesheets managed by <strong>${managerName}</strong> have exceeded the ${thresholdDays}-day approval SLA:</p>
        <div style="background: #fef2f2; border-left: 4px solid #dc2626; border-radius: 4px; padding: 16px; margin: 20px 0;">
          <ul style="margin: 0; padding-left: 20px;">${namesHtml}</ul>
        </div>
        <p style="color: #475569;">Please follow up with the manager to ensure timely approval of these timesheets.</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${appUrl}/timesheets" style="display: inline-block; background: #dc2626; color: white; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; font-size: 16px;">View Timesheets</a>
        </div>
      </div>
      <div style="background: #f8fafc; padding: 16px; text-align: center; border-top: 1px solid #e2e8f0;">
        <p style="margin: 0; color: #94a3b8; font-size: 12px;">Automated escalation from FridayReport.AI</p>
        <p style="margin: 8px 0 0; font-size: 11px;"><a href="https://fridayreport.ai/profile?section=notifications" style="color: #94a3b8; text-decoration: underline;">Manage notification preferences</a></p>
      </div>
    </div>
  </div>
</body>
</html>`;

  return sendEmail({ to, subject, text, html });
}

export async function sendManagerWeeklyDigestEmail(
  to: string,
  managerName: string,
  weekStart: string,
  weekEnd: string,
  summary: {
    submitted: string[];
    notSubmitted: string[];
    pendingApproval: string[];
    overdue: string[];
    totalDirectReports: number;
  },
  appUrl: string
): Promise<boolean> {
  const subject = `📋 Weekly Timesheet Digest - ${weekStart}`;

  const text = `Hi ${managerName},\n\nWeekly Timesheet Digest for ${weekStart} to ${weekEnd}\n\nSubmitted: ${summary.submitted.length}/${summary.totalDirectReports}\nNot Submitted: ${summary.notSubmitted.join(', ') || 'None'}\nPending Approval: ${summary.pendingApproval.length}\nOverdue: ${summary.overdue.length}\n\nView: ${appUrl}/timesheets\n\n- FridayReport.AI`;

  const submittedHtml = summary.submitted.length > 0
    ? summary.submitted.map(n => `<span style="display: inline-block; background: #ecfdf5; color: #065f46; padding: 4px 10px; border-radius: 12px; font-size: 13px; margin: 2px;">${n} ✓</span>`).join(' ')
    : '<span style="color: #94a3b8;">None</span>';

  const notSubmittedHtml = summary.notSubmitted.length > 0
    ? summary.notSubmitted.map(n => `<span style="display: inline-block; background: #fef2f2; color: #991b1b; padding: 4px 10px; border-radius: 12px; font-size: 13px; margin: 2px;">${n} ✗</span>`).join(' ')
    : '<span style="color: #94a3b8;">None</span>';

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background-color: #f1f5f9;">
  <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <div style="background: white; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); overflow: hidden;">
      <div style="background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); padding: 30px; text-align: center;">
        <h1 style="margin: 0; color: white; font-size: 24px;">📋 Weekly Timesheet Digest</h1>
        <p style="margin: 8px 0 0; color: rgba(255,255,255,0.9); font-size: 14px;">Week of ${weekStart} to ${weekEnd}</p>
      </div>
      <div style="padding: 30px;">
        <p style="color: #475569;">Hi ${managerName},</p>
        <p style="color: #475569;">Here's a summary of your team's timesheet status for last week:</p>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 20px 0;">
          <div style="background: #f0fdf4; border-radius: 8px; padding: 16px; text-align: center;">
            <p style="margin: 0; color: #065f46; font-size: 28px; font-weight: 700;">${summary.submitted.length}</p>
            <p style="margin: 4px 0 0; color: #059669; font-size: 13px;">Submitted</p>
          </div>
          <div style="background: ${summary.notSubmitted.length > 0 ? '#fef2f2' : '#f8fafc'}; border-radius: 8px; padding: 16px; text-align: center;">
            <p style="margin: 0; color: ${summary.notSubmitted.length > 0 ? '#991b1b' : '#64748b'}; font-size: 28px; font-weight: 700;">${summary.notSubmitted.length}</p>
            <p style="margin: 4px 0 0; color: ${summary.notSubmitted.length > 0 ? '#dc2626' : '#94a3b8'}; font-size: 13px;">Not Submitted</p>
          </div>
          <div style="background: ${summary.pendingApproval.length > 0 ? '#fffbeb' : '#f8fafc'}; border-radius: 8px; padding: 16px; text-align: center;">
            <p style="margin: 0; color: ${summary.pendingApproval.length > 0 ? '#92400e' : '#64748b'}; font-size: 28px; font-weight: 700;">${summary.pendingApproval.length}</p>
            <p style="margin: 4px 0 0; color: ${summary.pendingApproval.length > 0 ? '#d97706' : '#94a3b8'}; font-size: 13px;">Pending Approval</p>
          </div>
          <div style="background: ${summary.overdue.length > 0 ? '#fef2f2' : '#f8fafc'}; border-radius: 8px; padding: 16px; text-align: center;">
            <p style="margin: 0; color: ${summary.overdue.length > 0 ? '#991b1b' : '#64748b'}; font-size: 28px; font-weight: 700;">${summary.overdue.length}</p>
            <p style="margin: 4px 0 0; color: ${summary.overdue.length > 0 ? '#dc2626' : '#94a3b8'}; font-size: 13px;">Overdue</p>
          </div>
        </div>

        <div style="margin: 20px 0;">
          <h3 style="margin: 0 0 8px; color: #1e293b; font-size: 14px;">Submitted</h3>
          <div style="margin-bottom: 16px;">${submittedHtml}</div>
          <h3 style="margin: 0 0 8px; color: #1e293b; font-size: 14px;">Not Submitted</h3>
          <div>${notSubmittedHtml}</div>
        </div>

        <div style="text-align: center; margin: 30px 0;">
          <a href="${appUrl}/timesheets" style="display: inline-block; background: #3b82f6; color: white; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; font-size: 16px;">View Team Timesheets</a>
        </div>
      </div>
      <div style="background: #f8fafc; padding: 16px; text-align: center; border-top: 1px solid #e2e8f0;">
        <p style="margin: 0; color: #94a3b8; font-size: 12px;">Weekly digest from FridayReport.AI</p>
        <p style="margin: 8px 0 0; font-size: 11px;"><a href="https://fridayreport.ai/profile?section=notifications" style="color: #94a3b8; text-decoration: underline;">Manage notification preferences</a></p>
      </div>
    </div>
  </div>
</body>
</html>`;

  return sendEmail({ to, subject, text, html });
}

export async function sendUnconSelfieFollowupEmail(email: string, firstName: string, _shareToken: string, brandedImage?: Buffer, rawSelfie?: Buffer | null): Promise<boolean> {
  const escapeHtml = (str: string) => str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const sanitize = (str: string) => str.replace(/[\r\n\x00-\x1f\x7f]/g, '');
  const safeFirstName = escapeHtml(firstName);
  const cleanFirstName = sanitize(firstName);
  const subject = "Fun meeting you at unCON \u{1F604}";

  const imageBuffer = brandedImage || rawSelfie;
  const imageContentType = brandedImage ? 'image/png' : 'image/jpeg';

  const text = `Hi ${cleanFirstName},

It was great meeting you at unCON in San Diego — thanks again for stopping by the FridayReport.ai booth.

We had a ton of great conversations at the event, and we're really glad we got to connect with you.

I've attached the selfie we took together — always fun putting faces to conversations.

If you're up for it, we'd love to reconnect and pick up where we left off — whether that's around reporting, team visibility, or just swapping ideas.

No pressure at all — just a casual follow-up.

Talk soon,
FridayReport.ai Team

https://fridayreport.ai`;

  let selfieImgHtml = '';
  if (imageBuffer) {
    selfieImgHtml = `<tr>
            <td style="background-color: #17255A; padding: 0 30px 20px; text-align: center;">
              <img src="cid:selfie-followup" alt="Our selfie from unCON" width="540" style="width: 100%; max-width: 540px; display: block; margin: 0 auto; border-radius: 8px;" />
            </td>
          </tr>`;
  }

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #f0f0f0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f0f0f0;">
    <tr>
      <td align="center" style="padding: 20px 0;">
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px; width: 100%; background-color: #ffffff; border: 1px solid #e0e0e0;">
          <tr>
            <td style="background-color: #17255A; padding: 30px 30px 20px; text-align: center;">
              <p style="color: #D4A84A; font-size: 13px; margin: 0 0 4px; letter-spacing: 2px; font-weight: 700;">PMO unCON NORTH AMERICA 2026</p>
              <h1 style="color: #ffffff; font-size: 22px; margin: 8px 0 0;">Fun meeting you at unCON \u{1F604}</h1>
            </td>
          </tr>
          ${selfieImgHtml}
          <tr>
            <td style="background-color: #ffffff; padding: 30px;">
              <p style="color: #333333; font-size: 16px; line-height: 1.7; margin: 0 0 16px;">
                Hi ${safeFirstName},
              </p>
              <p style="color: #333333; font-size: 15px; line-height: 1.7; margin: 0 0 16px;">
                It was great meeting you at unCON in San Diego &mdash; thanks again for stopping by the FridayReport.ai booth.
              </p>
              <p style="color: #333333; font-size: 15px; line-height: 1.7; margin: 0 0 16px;">
                We had a ton of great conversations at the event, and we're really glad we got to connect with you.
              </p>
              <p style="color: #333333; font-size: 15px; line-height: 1.7; margin: 0 0 16px;">
                I've attached the selfie we took together \u{1F4F8} &mdash; always fun putting faces to conversations.
              </p>
              <p style="color: #333333; font-size: 15px; line-height: 1.7; margin: 0 0 16px;">
                If you're up for it, we'd love to reconnect and pick up where we left off &mdash; whether that's around reporting, team visibility, or just swapping ideas.
              </p>
              <p style="color: #333333; font-size: 15px; line-height: 1.7; margin: 0 0 24px;">
                No pressure at all &mdash; just a casual follow-up.
              </p>
              <p style="color: #333333; font-size: 15px; line-height: 1.7; margin: 0 0 4px;">
                Talk soon,
              </p>
              <p style="color: #FF751F; font-size: 15px; font-weight: 700; margin: 0;">
                FridayReport.ai Team
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color: #ffffff; padding: 0 30px 30px; text-align: center;">
              <a href="https://fridayreport.ai" style="display: inline-block; background-color: #FF751F; color: #ffffff; text-decoration: none; padding: 14px 40px; border-radius: 8px; font-weight: 700; font-size: 16px;">Visit FridayReport.ai</a>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f8f8f8; padding: 16px 30px; text-align: center; border-top: 1px solid #e0e0e0;">
              <p style="color: #999999; font-size: 12px; margin: 0;">
                &copy; 2026 FridayReport.AI &mdash; Project Portfolio Management, Reimagined.
              </p>
              <p style="margin: 8px 0 0; font-size: 11px;"><a href="https://fridayreport.ai/profile?section=notifications" style="color: #999999; text-decoration: underline;">Manage notification preferences</a></p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const emailAttachments: EmailAttachment[] = [];
  if (imageBuffer) {
    const ext = brandedImage ? 'png' : 'jpg';
    const safeName = cleanFirstName.replace(/[^a-zA-Z0-9]/g, '-');
    emailAttachments.push({
      filename: `selfie-inline.${ext}`,
      content: imageBuffer,
      contentType: imageContentType,
      content_id: 'selfie-followup',
    });
    emailAttachments.push({
      filename: `unCON-2026-selfie-${safeName}.${ext}`,
      content: imageBuffer,
      contentType: imageContentType,
    });
  }

  return sendEmail({ to: email, subject, text, html, attachments: emailAttachments.length > 0 ? emailAttachments : undefined });
}

export async function sendUnconSelfieThankYouEmail(email: string, userName: string, brandedImage?: Buffer): Promise<boolean> {
  const escapeHtml = (str: string) => str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const sanitize = (str: string) => str.replace(/[\r\n\x00-\x1f\x7f]/g, '');
  const safeUserName = escapeHtml(userName);
  const cleanUserName = sanitize(userName);
  const subject = `Thank you for visiting FridayReport.AI at PMO unCON 2026, ${cleanUserName}!`;

  const text = `Hi ${cleanUserName},

Thank you for stopping by the FridayReport.AI booth at PMO unCON North America 2026!

It was great meeting you and sharing how FridayReport.AI can transform your project portfolio management.

Here's what FridayReport.AI offers:
- AI-Powered Project Insights - Smart recommendations and predictive analytics
- Portfolio Management - Complete oversight of all your projects
- Resource Optimization - Maximize team efficiency and capacity
- Risk Management - Proactive risk identification and mitigation
- Real-time Dashboards - Beautiful, actionable project analytics

We'd love to show you more! Visit https://fridayreport.ai to start your free trial.

Best regards,
The FridayReport.AI Team

https://fridayreport.ai`;

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #f0f0f0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f0f0f0;">
    <tr>
      <td align="center" style="padding: 20px 0;">
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px; width: 100%; background-color: #ffffff; border: 1px solid #e0e0e0;">
          <tr>
            <td style="background-color: #17255A; padding: 30px 30px 20px; text-align: center;">
              <p style="color: #D4A84A; font-size: 13px; margin: 0 0 4px; letter-spacing: 2px; font-weight: 700;">PMO unCON NORTH AMERICA 2026</p>
            </td>
          </tr>
          ${brandedImage ? `<tr>
            <td style="background-color: #17255A; padding: 0 30px 20px; text-align: center;">
              <img src="cid:selfie-card" alt="Your PMO unCON 2026 Selfie" width="540" style="width: 100%; max-width: 540px; display: block; margin: 0 auto;" />
            </td>
          </tr>` : ''}
          <tr>
            <td style="background-color: #ffffff; padding: 30px;">
              <h1 style="color: #FF751F; font-size: 22px; margin: 0 0 8px; text-align: center;">Thank You, ${safeUserName}!</h1>
              <p style="color: #17255A; font-size: 13px; text-align: center; margin: 0 0 20px; letter-spacing: 2px; font-weight: 700;">PMO unCON NORTH AMERICA 2026</p>
              <p style="color: #333333; font-size: 15px; line-height: 1.6; margin: 0;">
                It was great meeting you at our booth! We hope you enjoyed the selfie experience. Here's a quick look at what FridayReport.AI can do for your team:
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color: #ffffff; padding: 0 30px 10px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f8f8f8; border: 1px solid #e8e8e8;">
                <tr><td style="padding: 16px;">
                  <h3 style="color: #FF751F; font-size: 15px; margin: 0 0 4px;">AI-Powered Project Insights</h3>
                  <p style="color: #555555; font-size: 13px; margin: 0;">Smart recommendations and predictive analytics to keep projects on track.</p>
                </td></tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background-color: #ffffff; padding: 0 30px 10px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f8f8f8; border: 1px solid #e8e8e8;">
                <tr><td style="padding: 16px;">
                  <h3 style="color: #FF751F; font-size: 15px; margin: 0 0 4px;">Portfolio Management</h3>
                  <p style="color: #555555; font-size: 13px; margin: 0;">Complete oversight of all your projects in one unified dashboard.</p>
                </td></tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background-color: #ffffff; padding: 0 30px 10px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f8f8f8; border: 1px solid #e8e8e8;">
                <tr><td style="padding: 16px;">
                  <h3 style="color: #FF751F; font-size: 15px; margin: 0 0 4px;">Resource Optimization</h3>
                  <p style="color: #555555; font-size: 13px; margin: 0;">Maximize team efficiency with capacity planning and workload balancing.</p>
                </td></tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background-color: #ffffff; padding: 0 30px 10px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f8f8f8; border: 1px solid #e8e8e8;">
                <tr><td style="padding: 16px;">
                  <h3 style="color: #FF751F; font-size: 15px; margin: 0 0 4px;">Risk Management</h3>
                  <p style="color: #555555; font-size: 13px; margin: 0;">Proactive risk identification and mitigation with the PMO Radar.</p>
                </td></tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background-color: #ffffff; padding: 0 30px 20px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f8f8f8; border: 1px solid #e8e8e8;">
                <tr><td style="padding: 16px;">
                  <h3 style="color: #FF751F; font-size: 15px; margin: 0 0 4px;">Real-time Dashboards</h3>
                  <p style="color: #555555; font-size: 13px; margin: 0;">Beautiful, actionable project analytics at your fingertips.</p>
                </td></tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background-color: #ffffff; padding: 0 30px 30px; text-align: center;">
              <!--[if mso]>
              <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="https://fridayreport.ai" style="height:48px;v-text-anchor:middle;width:240px;" arcsize="17%" fillcolor="#FF751F" stroke="f">
                <w:anchorlock/>
                <center style="color:#ffffff;font-family:sans-serif;font-size:16px;font-weight:bold;">Start Your Free Trial</center>
              </v:roundrect>
              <![endif]-->
              <!--[if !mso]><!-->
              <a href="https://fridayreport.ai" style="display: inline-block; background-color: #FF751F; color: #ffffff; text-decoration: none; padding: 14px 40px; border-radius: 8px; font-weight: 700; font-size: 16px;">Start Your Free Trial</a>
              <!--<![endif]-->
            </td>
          </tr>
          <tr>
            <td style="background-color: #f8f8f8; padding: 16px 30px; text-align: center; border-top: 1px solid #e0e0e0;">
              <p style="color: #999999; font-size: 12px; margin: 0;">
                &copy; 2026 FridayReport.AI &mdash; Project Portfolio Management, Reimagined.
              </p>
              <p style="margin: 8px 0 0; font-size: 11px;"><a href="https://fridayreport.ai/profile?section=notifications" style="color: #999999; text-decoration: underline;">Manage notification preferences</a></p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const emailAttachments: EmailAttachment[] = [];
  if (brandedImage) {
    emailAttachments.push({
      filename: `PMO-unCON-2026-${cleanUserName.replace(/[^a-zA-Z0-9]/g, '-')}.png`,
      content: brandedImage,
      contentType: 'image/png',
      content_id: 'selfie-card',
    });
  }

  return sendEmail({ to: email, subject, text, html, cc: ["info@fridayreport.ai"], attachments: emailAttachments.length > 0 ? emailAttachments : undefined });
}
