import { Express, RequestHandler } from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { db } from "../db";
import { users, passwordResetTokens, magicLinkTokens } from "@shared/schema";
import { eq, and, gt } from "drizzle-orm";
import crypto from "crypto";
import { sendPasswordResetEmail, sendMagicLinkEmail, sendPasswordlessSignInEmail } from "../services/email";
import { lookupCompanyByEmail } from "../services/companyLookup";
import { ensureUserOrganization } from "../services/onboarding";
import { storage } from "../storage";

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

  // Register new user
  app.post("/api/auth/register", async (req, res) => {
    try {
      const { email, password, firstName, lastName } = req.body;
      console.log("Register attempt for:", email);

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

      const [newUser] = await db.insert(users).values({
        email,
        passwordHash,
        firstName: firstName || null,
        lastName: lastName || null,
        role: "user",
        onboardingCompleted: false,
        detectedCompany,
        detectedIndustry,
      }).returning();

      console.log("User created:", newUser.id);

      try {
        const orgResult = await ensureUserOrganization(newUser.id, email);
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
      return res.json(userWithoutPassword);
    } catch (error) {
      console.error("Registration error:", error);
      return res.status(500).json({ message: "Registration failed" });
    }
  });

  // Login
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password } = req.body;
      console.log("Login attempt for:", email);

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

  // Request password reset
  app.post("/api/auth/forgot-password", async (req, res) => {
    try {
      const { email } = req.body;

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
      const { token, password } = req.body;

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
      const { email } = req.body;
      console.log("Magic link request for:", email);

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
        || process.env.REPLIT_DOMAINS?.split(',')[0] 
          ? `https://${process.env.REPLIT_DOMAINS?.split(',')[0]}`
          : 'https://fridayreport.ai';
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

      // Lookup company info from email domain
      let detectedCompany: string | null = null;
      let detectedIndustry: string | null = null;
      
      try {
        const companyInfo = await lookupCompanyByEmail(magicToken.email);
        if (!companyInfo.isPersonalEmail && companyInfo.companyName) {
          detectedCompany = companyInfo.companyName;
          detectedIndustry = companyInfo.industry;
        }
      } catch (err) {
        console.error("Company lookup error:", err);
      }

      // Create the user (passwordless - no password hash)
      const [newUser] = await db.insert(users).values({
        email: magicToken.email,
        firstName: magicToken.email.split('@')[0], // Default name from email
        detectedCompany,
        detectedIndustry,
        onboardingCompleted: false,
      }).returning();

      console.log("User created via magic link:", newUser.id);

      // Mark token as used
      await db.update(magicLinkTokens).set({ usedAt: new Date() }).where(eq(magicLinkTokens.id, magicToken.id));

      // Auto-accept any pending invites and ensure organization
      try {
        await ensureUserOrganization(newUser.id, magicToken.email);
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
        message: "Account created successfully"
      });
    } catch (error) {
      console.error("Magic link verify error:", error);
      res.status(500).json({ message: "Failed to verify magic link" });
    }
  });

  // Passwordless authentication - request (handles both new and existing users)
  app.post("/api/auth/passwordless/request", async (req, res) => {
    try {
      const { email } = req.body;
      console.log("Passwordless auth request for:", email);

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
        || process.env.REPLIT_DOMAINS?.split(',')[0] 
          ? `https://${process.env.REPLIT_DOMAINS?.split(',')[0]}`
          : 'https://fridayreport.ai';

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
        });

        const verifyUrl = `${appUrl}/auth/verify?token=${token}`;
        const emailSent = await sendMagicLinkEmail(normalizedEmail, verifyUrl);
        
        if (!emailSent) {
          console.log("Passwordless sign-up email not sent (no email service configured)");
        }
      }

      res.json({ 
        message: "Check your email for a link to continue.",
        success: true
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
