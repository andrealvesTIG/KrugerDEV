import { Express, RequestHandler } from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { db } from "../db";
import { users, passwordResetTokens, magicLinkTokens } from "@shared/schema";
import { eq, and, gt } from "drizzle-orm";
import crypto from "crypto";
import { sendPasswordResetEmail, sendMagicLinkEmail, sendPasswordlessSignInEmail, sendEmailVerificationEmail } from "../services/email";
import { ensureUserOrganization } from "../services/onboarding";
import { storage } from "../storage";
import { lookupCompanyByEmail } from "../services/companyLookup";

const PgSession = connectPgSimple(session);

declare module "express-session" {
  interface SessionData {
    userId: string;
  }
}

async function hashPassword(password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString("hex");
    crypto.scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) reject(err);
      resolve(salt + ":" + derivedKey.toString("hex"));
    });
  });
}

async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const [salt, key] = hash.split(":");
    crypto.scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) reject(err);
      resolve(key === derivedKey.toString("hex"));
    });
  });
}

async function verifyTurnstileToken(token: string): Promise<boolean> {
  try {
    const secretKey = process.env.TURNSTILE_SECRET_KEY || "1x0000000000000000000000000000000AA";
    
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        secret: secretKey,
        response: token,
      }),
    });

    const data = await response.json();
    return data.success === true;
  } catch (error) {
    console.error("Turnstile verification error:", error);
    return false;
  }
}

interface HoneypotData {
  honeypot1?: string;
  honeypot2?: string;
  formLoadTime?: number;
}

function verifyHoneypot(data: HoneypotData): { valid: boolean; error?: string } {
  if (data.honeypot1 || data.honeypot2) {
    console.log("Honeypot triggered - bot detected");
    return { valid: false, error: "Invalid submission detected" };
  }
  
  if (data.formLoadTime) {
    const submissionTime = Date.now();
    const timeElapsed = submissionTime - data.formLoadTime;
    const minimumTimeMs = 500; // Reduced to 500ms to allow autofill users
    
    if (timeElapsed < minimumTimeMs) {
      console.log(`Form submitted too quickly: ${timeElapsed}ms (minimum: ${minimumTimeMs}ms)`);
      return { valid: false, error: "Please take your time filling out the form" };
    }
  }
  
  return { valid: true };
}

export function getSession() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set");
  }

  if (!process.env.SESSION_SECRET) {
    throw new Error("SESSION_SECRET is not set - please configure this environment variable");
  }

  return session({
    store: new PgSession({
      conString: process.env.DATABASE_URL,
      createTableIfMissing: true,
      tableName: "sessions",
    }),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      sameSite: "lax",
    },
  });
}

export async function setupAuth(app: Express) {
  // NOTE: Session middleware is already set up by Replit Auth
  // We only register the email/password auth endpoints here

  // Cloudflare Turnstile verification endpoint
  app.post("/api/auth/verify-turnstile", async (req, res) => {
    try {
      const { token } = req.body;

      if (!token) {
        return res.status(400).json({ success: false, message: "Missing verification token" });
      }

      const secretKey = process.env.TURNSTILE_SECRET_KEY || "1x0000000000000000000000000000000AA";
      
      const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          secret: secretKey,
          response: token,
        }),
      });

      const data = await response.json();

      if (data.success) {
        res.json({ success: true });
      } else {
        console.log("Turnstile verification failed:", data["error-codes"]);
        res.status(400).json({ success: false, message: "Verification failed" });
      }
    } catch (error) {
      console.error("Turnstile verification error:", error);
      res.status(500).json({ success: false, message: "Verification service error" });
    }
  });

  // Register new user
  app.post("/api/auth/register", async (req, res) => {
    try {
      const { email, password, firstName, lastName, turnstileToken, honeypot1, honeypot2, formLoadTime } = req.body;
      console.log("Register attempt for:", email);

      // Verify honeypot (bot protection without external service)
      const honeypotCheck = verifyHoneypot({ honeypot1, honeypot2, formLoadTime });
      if (!honeypotCheck.valid) {
        return res.status(400).json({ message: honeypotCheck.error || "Invalid submission" });
      }

      // Also verify Turnstile token if provided (optional additional protection)
      if (turnstileToken && !(await verifyTurnstileToken(turnstileToken))) {
        return res.status(400).json({ message: "Security verification failed. Please try again." });
      }

      if (!email || !password) {
        return res.status(400).json({ message: "Email and password are required" });
      }

      if (password.length < 6) {
        return res.status(400).json({ message: "Password must be at least 6 characters" });
      }

      // Check if user already exists
      const [existingUser] = await db.select().from(users).where(eq(users.email, email)).limit(1);
      if (existingUser) {
        return res.status(400).json({ message: "Email already registered" });
      }

      const passwordHash = await hashPassword(password);
      
      // Lookup company info from email domain
      let detectedCompany: string | null = null;
      let detectedIndustry: string | null = null;
      
      try {
        const companyInfo = await lookupCompanyByEmail(email);
        if (!companyInfo.isPersonalEmail && companyInfo.companyName) {
          detectedCompany = companyInfo.companyName;
          detectedIndustry = companyInfo.industry;
        }
      } catch (err) {
        console.error("Company lookup error:", err);
      }

      // Generate email verification token
      const emailVerificationToken = crypto.randomBytes(32).toString("hex");
      const emailVerificationExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

      const [newUser] = await db.insert(users).values({
        email,
        passwordHash,
        firstName: firstName || null,
        lastName: lastName || null,
        role: "user",
        onboardingCompleted: false,
        detectedCompany,
        detectedIndustry,
        emailVerified: false,
        emailVerificationToken,
        emailVerificationExpiry,
      }).returning();

      console.log("User created:", newUser.id);

      // Send email verification
      const appUrl = process.env.APP_URL 
        || (process.env.REPLIT_DOMAINS?.split(',')[0] 
          ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}`
          : 'https://fridayreport.ai');
      const verifyEmailUrl = `${appUrl}/verify-email?token=${emailVerificationToken}`;
      
      const emailSent = await sendEmailVerificationEmail(email, verifyEmailUrl);
      if (!emailSent) {
        console.log(`\n===== EMAIL VERIFICATION LINK =====`);
        console.log(`Email: ${email}`);
        console.log(`Verify URL: ${verifyEmailUrl}`);
        console.log(`Expires: ${emailVerificationExpiry.toISOString()}`);
        console.log(`===================================\n`);
      }

      // Track organization creation for onboarding
      let organizationCreated = false;
      let organizationId: number | null = null;
      let organizationName: string | null = null;

      try {
        const orgResult = await ensureUserOrganization(newUser.id, email);
        organizationCreated = orgResult.created === true;
        if (orgResult.organization) {
          organizationId = orgResult.organization.id;
          organizationName = orgResult.organization.name;
        }
        if (orgResult.created) {
          console.log(`Auto-created org for new user: ${email}`);
        }
      } catch (orgError) {
        console.error("Error ensuring user organization:", orgError);
      }

      // Claim any pending organization invites for this email
      try {
        const claimedMembers = await storage.claimInvitesForUser(email, newUser.id);
        if (claimedMembers.length > 0) {
          console.log(`Claimed ${claimedMembers.length} org invite(s) for new user: ${email}`);
        }
      } catch (inviteError) {
        console.error("Error claiming organization invites:", inviteError);
      }

      // Track referral if referral code was provided
      const { referralCode } = req.body;
      if (referralCode) {
        try {
          const { referralCodes, referrals } = await import("@shared/schema");
          const [refCode] = await db.select().from(referralCodes)
            .where(and(eq(referralCodes.code, referralCode.toUpperCase()), eq(referralCodes.isActive, true)));
          
          if (refCode) {
            await db.insert(referrals).values({
              referralCodeId: refCode.id,
              referrerId: refCode.userId,
              referredUserId: newUser.id,
              referredEmail: email,
              status: 'SIGNED_UP',
              signedUpAt: new Date(),
            });
            
            // Update total referrals count
            await db.update(referralCodes)
              .set({ totalReferrals: (refCode.totalReferrals || 0) + 1 })
              .where(eq(referralCodes.id, refCode.id));
            
            console.log(`Tracked referral for new user: ${email} via code: ${referralCode}`);
          }
        } catch (refError) {
          console.error("Error tracking referral:", refError);
        }
      }

      req.session.userId = newUser.id;
      
      await new Promise<void>((resolve, reject) => {
        req.session.save((err) => {
          if (err) {
            console.error("Session save error:", err);
            reject(err);
          } else {
            console.log("Session saved for user:", newUser.id);
            resolve();
          }
        });
      });

      const { passwordHash: _, ...userWithoutPassword } = newUser;
      console.log("Sending response for user:", newUser.id);
      return res.json({
        ...userWithoutPassword,
        isNewUser: true,
        organizationCreated,
        organizationId,
        organizationName,
      });
    } catch (error) {
      console.error("Registration error:", error);
      return res.status(500).json({ message: "Registration failed" });
    }
  });

  // Login
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password, turnstileToken, honeypot1, honeypot2, formLoadTime } = req.body;
      console.log("Login attempt for:", email);

      // Verify honeypot (bot protection without external service)
      const honeypotCheck = verifyHoneypot({ honeypot1, honeypot2, formLoadTime });
      if (!honeypotCheck.valid) {
        return res.status(400).json({ message: honeypotCheck.error || "Invalid submission" });
      }

      // Also verify Turnstile token if provided (optional additional protection)
      if (turnstileToken && !(await verifyTurnstileToken(turnstileToken))) {
        return res.status(400).json({ message: "Security verification failed. Please try again." });
      }

      if (!email || !password) {
        return res.status(400).json({ message: "Email and password are required" });
      }

      const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
      if (!user || !user.passwordHash) {
        return res.status(401).json({ message: "Invalid email or password" });
      }

      const isValid = await verifyPassword(password, user.passwordHash);
      if (!isValid) {
        return res.status(401).json({ message: "Invalid email or password" });
      }

      console.log("Password verified for user:", user.id);

      try {
        const orgResult = await ensureUserOrganization(user.id, email);
        if (orgResult.created) {
          console.log(`Auto-created org for existing user: ${email}`);
        }
      } catch (orgError) {
        console.error("Error ensuring user organization:", orgError);
      }

      // Claim any pending organization invites for this email
      try {
        const claimedMembers = await storage.claimInvitesForUser(email, user.id);
        if (claimedMembers.length > 0) {
          console.log(`Claimed ${claimedMembers.length} org invite(s) for existing user: ${email}`);
        }
      } catch (inviteError) {
        console.error("Error claiming organization invites:", inviteError);
      }

      req.session.userId = user.id;
      
      await new Promise<void>((resolve, reject) => {
        req.session.save((err) => {
          if (err) {
            console.error("Session save error:", err);
            reject(err);
          } else {
            console.log("Session saved for user:", user.id, "sessionId:", req.sessionID);
            resolve();
          }
        });
      });

      const { passwordHash: _, ...userWithoutPassword } = user;
      console.log("Sending login response for user:", user.id);
      return res.json(userWithoutPassword);
    } catch (error) {
      console.error("Login error:", error);
      return res.status(500).json({ message: "Login failed" });
    }
  });

  // Logout
  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ message: "Logout failed" });
      }
      res.clearCookie("connect.sid");
      res.json({ message: "Logged out successfully" });
    });
  });

  // Get current user
  app.get("/api/auth/user", async (req, res) => {
    console.log("Auth check - sessionID:", req.sessionID, "userId:", req.session.userId);
    if (!req.session.userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    try {
      const [user] = await db.select().from(users).where(eq(users.id, req.session.userId)).limit(1);
      if (!user) {
        req.session.destroy(() => {});
        return res.status(401).json({ message: "Unauthorized" });
      }

      const { passwordHash: _, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
    } catch (error) {
      console.error("Get user error:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Set up password for authenticated users who don't have one yet (e.g., invited users)
  app.post("/api/auth/setup-password", async (req, res) => {
    try {
      if (!req.session.userId) {
        return res.status(401).json({ message: "You must be logged in to set up a password." });
      }

      const { password } = req.body;

      if (!password || typeof password !== "string") {
        return res.status(400).json({ message: "Password is required." });
      }

      if (password.length < 6) {
        return res.status(400).json({ message: "Password must be at least 6 characters." });
      }

      const [user] = await db.select().from(users).where(eq(users.id, req.session.userId)).limit(1);
      if (!user) {
        return res.status(401).json({ message: "User not found." });
      }

      if (user.passwordHash) {
        return res.status(400).json({ message: "You already have a password set. Use the profile page to change it." });
      }

      const newHash = await hashPassword(password);
      await db.update(users).set({ passwordHash: newHash }).where(eq(users.id, user.id));

      console.log(`Password set up for user: ${user.email}`);
      res.json({ success: true, message: "Password has been set up successfully." });
    } catch (error) {
      console.error("Setup password error:", error);
      res.status(500).json({ message: "Failed to set up password." });
    }
  });

  // Request password reset
  app.post("/api/auth/forgot-password", async (req, res) => {
    try {
      const { email, turnstileToken, honeypot1, honeypot2, formLoadTime } = req.body;

      // Verify honeypot (bot protection without external service)
      const honeypotCheck = verifyHoneypot({ honeypot1, honeypot2, formLoadTime });
      if (!honeypotCheck.valid) {
        return res.status(400).json({ message: honeypotCheck.error || "Invalid submission" });
      }

      // Also verify Turnstile token if provided (optional additional protection)
      if (turnstileToken && !(await verifyTurnstileToken(turnstileToken))) {
        return res.status(400).json({ message: "Security verification failed. Please try again." });
      }

      if (!email) {
        return res.status(400).json({ message: "Email is required" });
      }

      const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
      
      // Always return success to prevent email enumeration
      if (!user) {
        return res.json({ message: "If an account exists with this email, a reset link has been sent." });
      }

      // Invalidate any existing tokens for this user
      await db.update(passwordResetTokens)
        .set({ usedAt: new Date() })
        .where(eq(passwordResetTokens.userId, user.id));

      // Generate secure token
      const token = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      // Store token in database
      await db.insert(passwordResetTokens).values({
        userId: user.id,
        token,
        expiresAt,
      });

      // Build reset URL and send email
      const resetUrl = `${req.protocol}://${req.get("host")}/reset-password?token=${token}`;
      
      // Try to send email, but always return success message to prevent enumeration
      const emailSent = await sendPasswordResetEmail(email, resetUrl);
      
      if (!emailSent) {
        // If email service not configured, log for development
        console.log(`\n===== PASSWORD RESET LINK =====`);
        console.log(`Email: ${email}`);
        console.log(`Reset URL: ${resetUrl}`);
        console.log(`Expires: ${expiresAt.toISOString()}`);
        console.log(`===============================\n`);
      }

      res.json({ message: "If an account exists with this email, a reset link has been sent." });
    } catch (error) {
      console.error("Forgot password error:", error);
      res.status(500).json({ message: "Failed to process request" });
    }
  });

  // Verify reset token
  app.get("/api/auth/verify-reset-token", async (req, res) => {
    try {
      const { token } = req.query;

      if (!token || typeof token !== "string") {
        return res.status(400).json({ valid: false, message: "Token is required" });
      }

      const [resetToken] = await db
        .select()
        .from(passwordResetTokens)
        .where(
          and(
            eq(passwordResetTokens.token, token),
            gt(passwordResetTokens.expiresAt, new Date())
          )
        )
        .limit(1);

      if (!resetToken || resetToken.usedAt) {
        return res.json({ valid: false, message: "Invalid or expired token" });
      }

      res.json({ valid: true });
    } catch (error) {
      console.error("Verify token error:", error);
      res.status(500).json({ valid: false, message: "Failed to verify token" });
    }
  });

  // Reset password
  app.post("/api/auth/reset-password", async (req, res) => {
    try {
      const { token, password, turnstileToken } = req.body;

      // Verify Turnstile token server-side
      if (!turnstileToken || !(await verifyTurnstileToken(turnstileToken))) {
        return res.status(400).json({ message: "Security verification failed. Please try again." });
      }

      if (!token || !password) {
        return res.status(400).json({ message: "Token and password are required" });
      }

      if (password.length < 6) {
        return res.status(400).json({ message: "Password must be at least 6 characters" });
      }

      const [resetToken] = await db
        .select()
        .from(passwordResetTokens)
        .where(
          and(
            eq(passwordResetTokens.token, token),
            gt(passwordResetTokens.expiresAt, new Date())
          )
        )
        .limit(1);

      if (!resetToken || resetToken.usedAt) {
        return res.status(400).json({ message: "Invalid or expired reset link" });
      }

      // Hash new password and update user
      const passwordHash = await hashPassword(password);
      await db.update(users).set({ passwordHash }).where(eq(users.id, resetToken.userId));

      // Mark token as used
      await db.update(passwordResetTokens).set({ usedAt: new Date() }).where(eq(passwordResetTokens.id, resetToken.id));

      res.json({ message: "Password has been reset successfully" });
    } catch (error) {
      console.error("Reset password error:", error);
      res.status(500).json({ message: "Failed to reset password" });
    }
  });

  // Magic link sign-up - request
  // Rate limiting: track recent requests per email
  const magicLinkRateLimit = new Map<string, { count: number; resetAt: number }>();
  const MAGIC_LINK_RATE_LIMIT = 3; // max requests per window
  const MAGIC_LINK_RATE_WINDOW = 15 * 60 * 1000; // 15 minutes

  app.post("/api/auth/magic-link/request", async (req, res) => {
    try {
      const { email, turnstileToken, honeypot1, honeypot2, formLoadTime } = req.body;
      console.log("Magic link request for:", email);

      // Verify honeypot (bot protection without external service)
      const honeypotCheck = verifyHoneypot({ honeypot1, honeypot2, formLoadTime });
      if (!honeypotCheck.valid) {
        return res.status(400).json({ message: honeypotCheck.error || "Invalid submission" });
      }

      // Also verify Turnstile token if provided (optional additional protection)
      if (turnstileToken && !(await verifyTurnstileToken(turnstileToken))) {
        return res.status(400).json({ message: "Security verification failed. Please try again." });
      }

      if (!email) {
        return res.status(400).json({ message: "Email is required" });
      }

      const normalizedEmail = email.toLowerCase().trim();

      // Rate limiting check
      const now = Date.now();
      const rateData = magicLinkRateLimit.get(normalizedEmail);
      if (rateData) {
        if (now < rateData.resetAt) {
          if (rateData.count >= MAGIC_LINK_RATE_LIMIT) {
            return res.status(429).json({ 
              message: "Too many requests. Please try again in a few minutes." 
            });
          }
          rateData.count++;
        } else {
          magicLinkRateLimit.set(normalizedEmail, { count: 1, resetAt: now + MAGIC_LINK_RATE_WINDOW });
        }
      } else {
        magicLinkRateLimit.set(normalizedEmail, { count: 1, resetAt: now + MAGIC_LINK_RATE_WINDOW });
      }

      // Check if user already exists
      const [existingUser] = await db.select().from(users).where(eq(users.email, normalizedEmail)).limit(1);
      
      if (existingUser) {
        // User exists - tell them to log in instead
        return res.status(409).json({ 
          message: "An account with this email already exists. Please log in instead.",
          userExists: true
        });
      }

      // Note: We allow multiple outstanding tokens per email
      // Each token is only invalidated upon successful verification
      // Tokens are short-lived (15 min) and cryptographically random (32 bytes)

      // Generate secure token (256 bits of entropy)
      const token = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

      // Store token with hashed version for comparison
      // Note: For magic links, the token IS the secret - no additional binding needed
      // as this is sign-up only (not login to existing accounts)
      await db.insert(magicLinkTokens).values({
        email: normalizedEmail,
        token,
        expiresAt,
      });

      // Build verification URL
      const appUrl = process.env.APP_URL 
        || (process.env.REPLIT_DOMAINS?.split(',')[0] 
          ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}`
          : 'https://fridayreport.ai');
      const verifyUrl = `${appUrl}/auth/verify?token=${token}`;

      // Send email
      const emailSent = await sendMagicLinkEmail(normalizedEmail, verifyUrl);
      
      if (!emailSent) {
        console.log("Magic link email not sent (no email service configured)");
      }

      res.json({ 
        message: "If this email is not already registered, you will receive a sign-up link shortly.",
        success: true
      });
    } catch (error) {
      console.error("Magic link request error:", error);
      res.status(500).json({ message: "Failed to send magic link" });
    }
  });

  // Magic link sign-up - verify
  app.get("/api/auth/magic-link/verify", async (req, res) => {
    try {
      const { token } = req.query;

      if (!token || typeof token !== "string") {
        return res.status(400).json({ message: "Invalid token" });
      }

      const [magicToken] = await db
        .select()
        .from(magicLinkTokens)
        .where(
          and(
            eq(magicLinkTokens.token, token),
            gt(magicLinkTokens.expiresAt, new Date())
          )
        )
        .limit(1);

      if (!magicToken || magicToken.usedAt) {
        return res.status(400).json({ 
          message: "Invalid or expired link",
          expired: true
        });
      }

      // Verify this is a signup token (not a signin token)
      if (magicToken.type && magicToken.type !== "signup") {
        return res.status(400).json({ 
          message: "Invalid link type. Please use the correct verification link.",
          invalidType: true
        });
      }

      // Check if user was created in the meantime (race condition)
      const [existingUser] = await db.select().from(users).where(eq(users.email, magicToken.email)).limit(1);
      
      if (existingUser) {
        // Mark token as used
        await db.update(magicLinkTokens).set({ usedAt: new Date() }).where(eq(magicLinkTokens.id, magicToken.id));
        return res.status(409).json({ 
          message: "An account with this email already exists. Please log in instead.",
          userExists: true
        });
      }

      // Use domain name as default company name (skip AI lookup to avoid incorrect results)
      const emailDomain = magicToken.email.split('@')[1] || '';
      const domainParts = emailDomain.split('.');
      let detectedCompany: string | null = null;
      
      if (domainParts.length > 0 && domainParts[0]) {
        // Format domain name nicely: "saltyfreedomusa" -> "Saltyfreedomusa"
        const name = domainParts[0];
        detectedCompany = name.charAt(0).toUpperCase() + name.slice(1);
      }

      // Parse metadata to check for terms acceptance
      let termsAcceptedAt: Date | null = null;
      if (magicToken.metadata) {
        try {
          const metadata = JSON.parse(magicToken.metadata);
          if (metadata.termsAccepted) {
            termsAcceptedAt = new Date();
          }
        } catch (e) {
          console.error("Error parsing magic link metadata:", e);
        }
      }

      // Create the user (passwordless - no password hash)
      // emailVerified is true for passwordless signups since they verified via the magic link
      const [newUser] = await db.insert(users).values({
        email: magicToken.email,
        firstName: magicToken.email.split('@')[0], // Default name from email
        detectedCompany,
        detectedIndustry: null,
        onboardingCompleted: false,
        emailVerified: true,
        termsAcceptedAt,
      }).returning();

      console.log("User created via magic link:", newUser.id);

      // Mark token as used
      await db.update(magicLinkTokens).set({ usedAt: new Date() }).where(eq(magicLinkTokens.id, magicToken.id));

      // Auto-accept any pending invites and ensure organization
      let organizationCreated = false;
      let organizationId: number | null = null;
      let organizationName: string | null = null;
      
      try {
        const orgResult = await ensureUserOrganization(newUser.id, magicToken.email);
        organizationCreated = orgResult.created === true;
        // Always set org details if organization exists, regardless of created flag
        if (orgResult.organization) {
          organizationId = orgResult.organization.id;
          organizationName = orgResult.organization.name;
        }
      } catch (err) {
        console.error("Error ensuring organization for new user:", err);
      }

      // Create session
      req.session.userId = newUser.id;
      await new Promise<void>((resolve, reject) => {
        req.session.save((err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      res.json({ 
        success: true,
        message: "Account created successfully",
        isNewUser: true,
        organizationCreated,
        organizationId,
        organizationName
      });
    } catch (error) {
      console.error("Magic link verify error:", error);
      res.status(500).json({ message: "Failed to verify magic link" });
    }
  });

  // Passwordless authentication - request (handles both new and existing users)
  app.post("/api/auth/passwordless/request", async (req, res) => {
    try {
      const { email, turnstileToken, honeypot1, honeypot2, formLoadTime, termsAccepted } = req.body;
      console.log("Passwordless auth request for:", email);

      // Verify honeypot (bot protection without external service)
      const honeypotCheck = verifyHoneypot({ honeypot1, honeypot2, formLoadTime });
      if (!honeypotCheck.valid) {
        return res.status(400).json({ message: honeypotCheck.error || "Invalid submission" });
      }

      // Also verify Turnstile token if provided (optional additional protection)
      if (turnstileToken && !(await verifyTurnstileToken(turnstileToken))) {
        return res.status(400).json({ message: "Security verification failed. Please try again." });
      }

      if (!email) {
        return res.status(400).json({ message: "Email is required" });
      }

      const normalizedEmail = email.toLowerCase().trim();

      // Rate limiting check (reuse same rate limiter)
      const now = Date.now();
      const rateData = magicLinkRateLimit.get(normalizedEmail);
      if (rateData) {
        if (now < rateData.resetAt) {
          if (rateData.count >= MAGIC_LINK_RATE_LIMIT) {
            return res.status(429).json({ 
              message: "Too many requests. Please try again in a few minutes." 
            });
          }
          rateData.count++;
        } else {
          magicLinkRateLimit.set(normalizedEmail, { count: 1, resetAt: now + MAGIC_LINK_RATE_WINDOW });
        }
      } else {
        magicLinkRateLimit.set(normalizedEmail, { count: 1, resetAt: now + MAGIC_LINK_RATE_WINDOW });
      }

      // Check if user exists
      const [existingUser] = await db.select().from(users).where(eq(users.email, normalizedEmail)).limit(1);
      
      // Generate secure token
      const token = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

      // Build app URL
      const appUrl = process.env.APP_URL 
        || (process.env.REPLIT_DOMAINS?.split(',')[0] 
          ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}`
          : 'https://fridayreport.ai');

      if (existingUser) {
        // Existing user - send sign-in email
        console.log("Passwordless: existing user found, sending sign-in email");
        
        await db.insert(magicLinkTokens).values({
          email: normalizedEmail,
          token,
          type: "signin",
          expiresAt,
        });

        const verifyUrl = `${appUrl}/signin/verify?token=${token}`;
        const emailSent = await sendPasswordlessSignInEmail(normalizedEmail, existingUser.firstName || "there", verifyUrl);
        
        if (!emailSent) {
          console.log("Passwordless sign-in email not sent (no email service configured)");
        }
      } else {
        // New user - send sign-up email (like magic link flow)
        console.log("Passwordless: new user, sending sign-up email");
        
        await db.insert(magicLinkTokens).values({
          email: normalizedEmail,
          token,
          type: "signup",
          expiresAt,
          metadata: termsAccepted ? JSON.stringify({ termsAccepted: true }) : null,
        });

        const verifyUrl = `${appUrl}/auth/verify?token=${token}`;
        const emailSent = await sendMagicLinkEmail(normalizedEmail, verifyUrl);
        
        if (!emailSent) {
          console.log("Passwordless sign-up email not sent (no email service configured)");
        }
      }

      res.json({ 
        message: "Check your email for a link to continue.",
        success: true,
        userExists: !!existingUser
      });
    } catch (error) {
      console.error("Passwordless auth request error:", error);
      res.status(500).json({ message: "Failed to send authentication link" });
    }
  });

  // Passwordless sign-in - verify
  app.get("/api/auth/passwordless/verify", async (req, res) => {
    try {
      const { token } = req.query;

      if (!token || typeof token !== "string") {
        return res.status(400).json({ message: "Invalid token" });
      }

      const [magicToken] = await db
        .select()
        .from(magicLinkTokens)
        .where(
          and(
            eq(magicLinkTokens.token, token),
            gt(magicLinkTokens.expiresAt, new Date())
          )
        )
        .limit(1);

      if (!magicToken || magicToken.usedAt) {
        return res.status(400).json({ 
          message: "Invalid or expired link",
          expired: true
        });
      }

      // Verify this is a signin token (not a signup token)
      if (magicToken.type && magicToken.type !== "signin") {
        return res.status(400).json({ 
          message: "Invalid link type. Please use the correct verification link.",
          invalidType: true
        });
      }

      // Find the user
      const [existingUser] = await db.select().from(users).where(eq(users.email, magicToken.email)).limit(1);
      
      if (!existingUser) {
        // Mark token as used
        await db.update(magicLinkTokens).set({ usedAt: new Date() }).where(eq(magicLinkTokens.id, magicToken.id));
        return res.status(400).json({ 
          message: "User not found. Please sign up instead.",
          userNotFound: true
        });
      }

      // Mark token as used
      await db.update(magicLinkTokens).set({ usedAt: new Date() }).where(eq(magicLinkTokens.id, magicToken.id));

      console.log("Passwordless sign-in successful for user:", existingUser.id);

      // Create session
      req.session.userId = existingUser.id;
      await new Promise<void>((resolve, reject) => {
        req.session.save((err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      res.json({ 
        success: true,
        message: "Signed in successfully"
      });
    } catch (error) {
      console.error("Passwordless sign-in verify error:", error);
      res.status(500).json({ message: "Failed to verify sign-in link" });
    }
  });

  // Verify email address
  app.get("/api/auth/verify-email", async (req, res) => {
    try {
      const { token } = req.query;

      if (!token || typeof token !== "string") {
        return res.status(400).json({ message: "Invalid token", valid: false });
      }

      // Find user with this verification token
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.emailVerificationToken, token))
        .limit(1);

      if (!user) {
        return res.status(400).json({ message: "Invalid verification link", valid: false });
      }

      // Check if token is expired
      if (user.emailVerificationExpiry && new Date() > new Date(user.emailVerificationExpiry)) {
        return res.status(400).json({ message: "Verification link has expired", valid: false, expired: true });
      }

      // Mark email as verified and clear token
      await db.update(users)
        .set({ 
          emailVerified: true, 
          emailVerificationToken: null, 
          emailVerificationExpiry: null 
        })
        .where(eq(users.id, user.id));

      console.log("Email verified for user:", user.id);

      res.json({ 
        success: true, 
        message: "Email verified successfully",
        valid: true
      });
    } catch (error) {
      console.error("Email verification error:", error);
      res.status(500).json({ message: "Failed to verify email", valid: false });
    }
  });

  // Resend verification email
  app.post("/api/auth/resend-verification", async (req, res) => {
    try {
      // User must be logged in
      if (!req.session.userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const [user] = await db.select().from(users).where(eq(users.id, req.session.userId)).limit(1);
      
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      if (user.emailVerified) {
        return res.json({ message: "Email is already verified", alreadyVerified: true });
      }

      // Generate new verification token
      const emailVerificationToken = crypto.randomBytes(32).toString("hex");
      const emailVerificationExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

      await db.update(users)
        .set({ emailVerificationToken, emailVerificationExpiry })
        .where(eq(users.id, user.id));

      // Send verification email
      const appUrl = process.env.APP_URL 
        || (process.env.REPLIT_DOMAINS?.split(',')[0] 
          ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}`
          : 'https://fridayreport.ai');
      const verifyEmailUrl = `${appUrl}/verify-email?token=${emailVerificationToken}`;
      
      const emailSent = await sendEmailVerificationEmail(user.email, verifyEmailUrl);
      
      if (!emailSent) {
        console.log(`\n===== EMAIL VERIFICATION LINK =====`);
        console.log(`Email: ${user.email}`);
        console.log(`Verify URL: ${verifyEmailUrl}`);
        console.log(`Expires: ${emailVerificationExpiry.toISOString()}`);
        console.log(`===================================\n`);
      }

      res.json({ success: true, message: "Verification email sent" });
    } catch (error) {
      console.error("Resend verification error:", error);
      res.status(500).json({ message: "Failed to resend verification email" });
    }
  });

  // Accept Terms of Service and Privacy Policy
  app.post("/api/auth/accept-terms", async (req, res) => {
    try {
      // User must be logged in
      if (!req.session.userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const [user] = await db.select().from(users).where(eq(users.id, req.session.userId)).limit(1);
      
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      // Update terms accepted timestamp
      await db.update(users)
        .set({ termsAcceptedAt: new Date() })
        .where(eq(users.id, user.id));

      res.json({ success: true, message: "Terms accepted" });
    } catch (error) {
      console.error("Accept terms error:", error);
      res.status(500).json({ message: "Failed to accept terms" });
    }
  });

  // Resource invite verification - handles magic link from resource invitation
  // Supports auto-signup: if user doesn't have an account, one is created automatically
  app.get("/api/auth/resource-invite/verify", async (req, res) => {
    try {
      const { token } = req.query;

      if (!token || typeof token !== "string") {
        return res.status(400).json({ message: "Invalid token" });
      }

      // Find the magic link token
      const [magicToken] = await db
        .select()
        .from(magicLinkTokens)
        .where(
          and(
            eq(magicLinkTokens.token, token),
            gt(magicLinkTokens.expiresAt, new Date())
          )
        )
        .limit(1);

      if (!magicToken) {
        return res.status(400).json({ 
          message: "Invalid or expired invitation link. Please ask for a new invitation.",
          expired: true
        });
      }

      // Verify this is a resource_invite token
      if (magicToken.type !== "resource_invite") {
        return res.status(400).json({ 
          message: "Invalid invitation link type."
        });
      }

      // Check if already used
      if (magicToken.usedAt) {
        return res.status(400).json({
          message: "This invitation link has already been used.",
          alreadyUsed: true
        });
      }

      // Parse metadata
      let metadata: { organizationId?: number; resourceId?: number; projectId?: number; taskId?: number; riskId?: number; issueId?: number } = {};
      try {
        if (magicToken.metadata) {
          metadata = JSON.parse(magicToken.metadata);
        }
      } catch (e) {
        console.error("Failed to parse magic link metadata:", e);
      }

      // Import storage functions
      const { storage } = await import("../storage");
      const { organizationInvites } = await import("@shared/schema");

      // Check if user with this email already exists
      const [existingUser] = await db.select().from(users).where(eq(users.email, magicToken.email.toLowerCase())).limit(1);
      
      let currentUser = existingUser;
      let isNewUser = false;
      
      if (!existingUser) {
        // Create a new user account automatically
        const emailParts = magicToken.email.split('@');
        const localPart = emailParts[0];
        
        // Extract first and last name from email if possible
        let firstName = localPart;
        let lastName = "";
        if (localPart.includes('.')) {
          const nameParts = localPart.split('.');
          firstName = nameParts[0].charAt(0).toUpperCase() + nameParts[0].slice(1);
          lastName = nameParts.slice(1).map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
        } else if (localPart.includes('_')) {
          const nameParts = localPart.split('_');
          firstName = nameParts[0].charAt(0).toUpperCase() + nameParts[0].slice(1);
          lastName = nameParts.slice(1).map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
        } else {
          firstName = localPart.charAt(0).toUpperCase() + localPart.slice(1);
        }
        
        // Generate a unique user ID
        const userId = crypto.randomUUID();
        
        // Create the user - they're auto-verified since they clicked the magic link
        const [newUser] = await db.insert(users).values({
          id: userId,
          email: magicToken.email.toLowerCase(),
          firstName,
          lastName,
          role: "user",
          emailVerified: true, // Auto-verified via magic link
          onboardingCompleted: false,
        }).returning();
        
        currentUser = newUser;
        isNewUser = true;
        console.log(`Auto-created user account for ${magicToken.email} via resource invite`);
      } else if (req.session.userId && req.session.userId !== existingUser.id) {
        // User is logged in with a different account
        return res.status(400).json({
          message: `This invitation was sent to ${magicToken.email}. Please sign out and sign in with that email, or use a different browser.`,
          emailMismatch: true
        });
      }

      // Log the user in by setting their session
      req.session.userId = currentUser.id;
      await new Promise<void>((resolve, reject) => {
        req.session.save((err) => {
          if (err) {
            console.error("Session save error during resource invite:", err);
            reject(err);
          } else {
            console.log("Session saved for user:", currentUser.id, "sessionId:", req.sessionID);
            resolve();
          }
        });
      });
      
      // DIRECT MEMBERSHIP MODEL:
      // Add the user directly to the inviting organization as a team_member
      
      if (!metadata.organizationId) {
        return res.status(400).json({
          message: "Invalid invitation: missing organization information."
        });
      }
      
      const sourceOrg = await storage.getOrganization(metadata.organizationId);
      if (!sourceOrg) {
        return res.status(400).json({
          message: "The organization this invitation belongs to no longer exists."
        });
      }
      
      const organizationName = sourceOrg.name;
      
      // Check if user is already a member of this organization
      const existingMembers = await storage.getOrganizationMembers(metadata.organizationId);
      const alreadyMember = existingMembers.some(m => m.userId === currentUser.id);
      
      if (!alreadyMember) {
        // Verify a pending invite exists for this org + email before granting membership
        const [pendingInvite] = await db.select().from(organizationInvites)
          .where(
            and(
              eq(organizationInvites.organizationId, metadata.organizationId),
              eq(organizationInvites.email, currentUser.email?.toLowerCase() || ""),
              eq(organizationInvites.status, "pending")
            )
          )
          .limit(1);
        
        if (!pendingInvite) {
          // Also check if the resource already has this user linked (re-invite scenario)
          const hasLinkedResource = metadata.resourceId
            ? await storage.getResource(metadata.resourceId).then(r => r?.userId === currentUser.id)
            : false;
          
          if (!hasLinkedResource) {
            console.log(`No pending invite found for ${currentUser.email} in org ${metadata.organizationId}`);
            return res.status(400).json({
              message: "No pending invitation found for your email in this organization. The invitation may have already been used or expired."
            });
          }
        }
        
        // Enforce seat limits before adding
        const { checkSeatLimit } = await import("../services/billing");
        const seatCheck = await checkSeatLimit(metadata.organizationId, 1);
        if (!seatCheck.allowed) {
          console.log(`Seat limit reached for org ${metadata.organizationId}: ${seatCheck.currentSeats}/${seatCheck.maxSeats}`);
          return res.status(400).json({
            message: `${organizationName} has reached its seat limit. Please ask an administrator to upgrade the plan or add more seats.`,
            seatLimitReached: true
          });
        }
        
        // Add user as a team_member to the inviting organization
        await storage.addOrganizationMember({
          organizationId: metadata.organizationId,
          userId: currentUser.id,
          role: 'team_member'
        });
        console.log(`Added user ${currentUser.id} to organization ${metadata.organizationId} as team_member`);
      } else {
        console.log(`User ${currentUser.id} is already a member of organization ${metadata.organizationId}`);
      }
      
      // Update any pending invites to mark as accepted
      await db.update(organizationInvites)
        .set({ status: "accepted", acceptedAt: new Date() })
        .where(
          and(
            eq(organizationInvites.organizationId, metadata.organizationId),
            eq(organizationInvites.email, currentUser.email?.toLowerCase() || ""),
            eq(organizationInvites.status, "pending")
          )
        );

      // Link the resource to the user
      if (metadata.resourceId) {
        const resource = await storage.getResource(metadata.resourceId);
        if (resource) {
          const updates: any = {};
          
          // Link user to resource if not already linked
          if (!resource.userId) {
            updates.userId = currentUser.id;
            updates.firstName = currentUser.firstName;
            updates.lastName = currentUser.lastName;
          }
          
          // Add project to invitedProjectIds if provided in invite metadata
          if (metadata.projectId) {
            const existingProjectIds = resource.invitedProjectIds || [];
            if (!existingProjectIds.includes(metadata.projectId)) {
              updates.invitedProjectIds = [...existingProjectIds, metadata.projectId];
            }
          }
          
          if (Object.keys(updates).length > 0) {
            await storage.updateResource(metadata.resourceId, updates);
            console.log(`Updated resource ${metadata.resourceId}: linked to user ${currentUser.id}, invited projects: ${updates.invitedProjectIds || resource.invitedProjectIds}`);
          }
        }
      }

      // Mark token as used
      await db.update(magicLinkTokens)
        .set({ usedAt: new Date() })
        .where(eq(magicLinkTokens.id, magicToken.id));

      console.log(`Resource invite accepted for user: ${currentUser.id} (new user: ${isNewUser}), joined org: ${metadata.organizationId}`);

      res.json({ 
        success: true,
        message: isNewUser 
          ? `Welcome! Your account has been created and you've been added to ${organizationName}.`
          : `You've been added to ${organizationName}.`,
        organizationName,
        isNewUser,
        isExternalShare: false,
        organizationId: metadata.organizationId,
        organizationSetupComplete: true
      });
    } catch (error) {
      console.error("Resource invite verification error:", error);
      res.status(500).json({ message: "Failed to verify invitation" });
    }
  });
}

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const [user] = await db.select().from(users).where(eq(users.id, req.session.userId)).limit(1);
    if (!user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // Attach user to request for downstream use
    (req as any).user = { id: user.id, claims: { sub: user.id } };
    next();
  } catch (error) {
    res.status(401).json({ message: "Unauthorized" });
  }
};

export { hashPassword, verifyPassword };
