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
      attachments?: { filename: string; content: Buffer }[];
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
  const appUrl = process.env.REPLIT_DEV_DOMAIN 
    ? `https://${process.env.REPLIT_DEV_DOMAIN}` 
    : process.env.APP_URL || "https://fridayreport.ai";

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
  </div>
</body>
</html>
`;

  return sendEmail({ to, subject, text, html });
}
