import { Express, Request } from "express";
import { ConfidentialClientApplication, AuthorizationCodeRequest, Configuration } from "@azure/msal-node";
import { db } from "../db";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";
import { lookupCompanyByEmail } from "../services/companyLookup";
import { ensureUserOrganization } from "../services/onboarding";
import { sendWelcomeEmail } from "../services/email";
import crypto from "crypto";
import { objectStorageClient } from "../replit_integrations/object_storage/objectStorage";
import { storage } from "../storage";

async function fetchAndUploadMicrosoftPhoto(accessToken: string, userId: string): Promise<string | null> {
  try {
    const response = await fetch("https://graph.microsoft.com/v1.0/me/photo/$value", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      console.error("Failed to fetch Microsoft photo:", response.status, response.statusText);
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const contentType = response.headers.get("content-type") || "image/jpeg";
    
    const privateObjectDir = process.env.PRIVATE_OBJECT_DIR;
    if (!privateObjectDir) {
      console.error("PRIVATE_OBJECT_DIR not set, cannot upload Microsoft photo");
      return null;
    }

    const objectId = `ms-avatar-${userId}-${Date.now()}`;
    const extension = contentType.includes("png") ? "png" : "jpg";
    const objectName = `uploads/${objectId}.${extension}`;
    
    const parts = privateObjectDir.replace(/^\//, "").split("/");
    const bucketName = parts[0];
    const prefix = parts.slice(1).join("/");
    const fullObjectName = prefix ? `${prefix}/${objectName}` : objectName;

    const bucket = objectStorageClient.bucket(bucketName);
    const file = bucket.file(fullObjectName);
    
    await file.save(buffer, {
      metadata: {
        contentType,
      },
    });

    return `/objects/${objectName}`;
  } catch (error) {
    console.error("Error fetching/uploading Microsoft profile photo:", error);
    return null;
  }
}

declare module "express-session" {
  interface SessionData {
    msOAuthState?: string;
    msOAuthNonce?: string;
    oauthSignupSource?: string;
  }
}

interface MicrosoftTokenClaims {
  oid: string;
  tid: string;
  email?: string;
  preferred_username?: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  nonce?: string;
}

let msalClient: ConfidentialClientApplication | null = null;

function getMsalConfig(): Configuration | null {
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
  const tenantId = "common";

  if (!clientId || !clientSecret) {
    return null;
  }

  return {
    auth: {
      clientId,
      clientSecret,
      authority: `https://login.microsoftonline.com/${tenantId}`,
    },
  };
}

function getMsalClient(): ConfidentialClientApplication | null {
  if (msalClient) return msalClient;

  const config = getMsalConfig();
  if (!config) return null;

  msalClient = new ConfidentialClientApplication(config);
  return msalClient;
}

function getRedirectUri(req: Request): string {
  const protocol = req.protocol || "https";
  const host = req.get("host") || "localhost:5000";
  return `${protocol}://${host}/api/auth/microsoft/callback`;
}

function generateSecureToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export async function setupMicrosoftAuth(app: Express) {
  app.get("/api/auth/microsoft/status", (req, res) => {
    const isConfigured = !!(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET);
    res.json({ configured: isConfigured });
  });

  app.get("/api/auth/microsoft/login", async (req, res) => {
    const client = getMsalClient();
    if (!client) {
      return res.status(503).json({ 
        message: "Microsoft authentication is not configured. Please add MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET." 
      });
    }

    const state = generateSecureToken();
    const nonce = generateSecureToken();
    
    req.session.msOAuthState = state;
    req.session.msOAuthNonce = nonce;
    
    const signupSource = (req.query.source as string) || "microsoft";
    req.session.oauthSignupSource = signupSource;
    
    // Also store state in a cookie as backup for mobile viewport switching scenarios
    // This helps when session might change but cookies persist
    res.cookie('oauth_signup_source', signupSource, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 10 * 60 * 1000,
    });
    res.cookie('ms_oauth_state', state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 10 * 60 * 1000, // 10 minutes
    });
    res.cookie('ms_oauth_nonce', nonce, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 10 * 60 * 1000, // 10 minutes
    });
    
    await new Promise<void>((resolve, reject) => {
      req.session.save((err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    const redirectUri = getRedirectUri(req);
    const authCodeUrlParameters = {
      scopes: ["openid", "profile", "email", "User.Read"],
      redirectUri,
      prompt: "select_account" as const,
      state,
      nonce,
    };

    try {
      const authUrl = await client.getAuthCodeUrl(authCodeUrlParameters);
      res.redirect(authUrl);
    } catch (error) {
      console.error("Microsoft auth URL error:", error);
      res.status(500).json({ message: "Failed to initiate Microsoft login" });
    }
  });

  app.get("/api/auth/microsoft/callback", async (req, res) => {
    const { code, error, error_description, state } = req.query;

    if (error) {
      console.error("Microsoft OAuth error:", error, error_description);
      return res.redirect(`/auth?error=${encodeURIComponent(String(error_description || error))}`);
    }

    // Try session first, then fall back to cookies (for mobile viewport switching)
    let savedState = req.session.msOAuthState;
    let savedNonce = req.session.msOAuthNonce;
    
    // Fall back to cookie values if session doesn't have them
    if (!savedState && req.cookies?.ms_oauth_state) {
      savedState = req.cookies.ms_oauth_state;
      savedNonce = req.cookies.ms_oauth_nonce;
    }
    
    // Clean up session state
    delete req.session.msOAuthState;
    delete req.session.msOAuthNonce;
    
    // Clear the OAuth cookies
    res.clearCookie('ms_oauth_state');
    res.clearCookie('ms_oauth_nonce');

    if (!state || state !== savedState) {
      console.error("CSRF state mismatch", { 
        received: state, 
        expected: savedState,
        hasSession: !!req.session,
        sessionId: req.sessionID,
        cookiePresent: !!req.headers.cookie,
        hadCookieState: !!req.cookies?.ms_oauth_state
      });
      // If no saved state at all (session and cookie both lost), provide a more helpful error
      if (!savedState) {
        return res.redirect("/auth?error=Session expired. Please try signing in again.");
      }
      return res.redirect("/auth?error=Security validation failed. Please try again.");
    }

    if (!code || typeof code !== "string") {
      return res.redirect("/auth?error=No authorization code received");
    }

    const client = getMsalClient();
    if (!client) {
      return res.redirect("/auth?error=Microsoft authentication not configured");
    }

    try {
      const redirectUri = getRedirectUri(req);
      const tokenRequest: AuthorizationCodeRequest = {
        code,
        scopes: ["openid", "profile", "email", "User.Read"],
        redirectUri,
      };

      const response = await client.acquireTokenByCode(tokenRequest);
      
      if (!response || !response.idTokenClaims) {
        throw new Error("No ID token received from Microsoft");
      }

      const claims = response.idTokenClaims as MicrosoftTokenClaims;
      
      if (savedNonce && claims.nonce !== savedNonce) {
        console.error("Nonce mismatch - possible token replay attack");
        return res.redirect("/auth?error=Security validation failed. Please try again.");
      }
      
      const microsoftId = claims.oid;
      const tenantId = claims.tid;
      const email = (claims.email || claims.preferred_username)?.toLowerCase().trim();
      const firstName = claims.given_name || claims.name?.split(" ")[0];
      const lastName = claims.family_name || claims.name?.split(" ").slice(1).join(" ");

      if (!microsoftId || !email) {
        throw new Error("Missing required claims from Microsoft token");
      }

      let [existingUser] = await db
        .select()
        .from(users)
        .where(eq(users.microsoftId, microsoftId))
        .limit(1);

      if (!existingUser) {
        [existingUser] = await db
          .select()
          .from(users)
          .where(eq(users.email, email))
          .limit(1);

        if (existingUser) {
          // When linking Microsoft account, also mark email as verified since Microsoft verified it
          await db
            .update(users)
            .set({ 
              microsoftId, 
              microsoftTenantId: tenantId,
              emailVerified: true,
              emailVerificationToken: null,
              emailVerificationExpiry: null,
              ...(firstName && !existingUser.firstName ? { firstName } : {}),
              ...(lastName && !existingUser.lastName ? { lastName } : {}),
            })
            .where(eq(users.id, existingUser.id));
        } else {
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

          // emailVerified is true for Microsoft auth since the email is verified by Microsoft
          [existingUser] = await db.insert(users).values({
            email,
            microsoftId,
            microsoftTenantId: tenantId,
            firstName: firstName || null,
            lastName: lastName || null,
            role: "user",
            onboardingCompleted: false,
            detectedCompany,
            detectedIndustry,
            emailVerified: true,
            signupSource: req.session.oauthSignupSource || req.cookies?.oauth_signup_source || "microsoft",
          }).returning();

          // Capture acquisition data (UTMs/referrer/device/geo) for the new user.
          try {
            const { recordAcquisition, parseFirstTouch } = await import("../services/acquisition");
            let firstTouch: unknown = null;
            const cookieFt = req.cookies?.fr_first_touch;
            if (cookieFt) {
              try { firstTouch = JSON.parse(cookieFt); } catch { firstTouch = null; }
            }
            await recordAcquisition({
              userId: existingUser.id,
              signupMethod: 'microsoft',
              firstTouch: parseFirstTouch(firstTouch),
              req,
            });
          } catch (acqErr) {
            console.error("Failed to record acquisition for Microsoft OAuth user:", acqErr);
          }

          sendWelcomeEmail(email, firstName || null).catch(err => {
            console.error("Failed to send welcome email for Microsoft OAuth user:", err);
          });
        }
      } else {
        // Ensure email is verified for returning Microsoft users
        await db
          .update(users)
          .set({ 
            microsoftTenantId: tenantId,
            emailVerified: true,
            emailVerificationToken: null,
            emailVerificationExpiry: null,
          })
          .where(eq(users.id, existingUser.id));
      }

      // Fetch and upload Microsoft profile photo if user doesn't have one
      if (response.accessToken && (!existingUser.profileImageUrl || !existingUser.avatarUrl)) {
        try {
          const photoUrl = await fetchAndUploadMicrosoftPhoto(response.accessToken, existingUser.id);
          if (photoUrl) {
            await db
              .update(users)
              .set({ 
                profileImageUrl: photoUrl,
                avatarUrl: photoUrl 
              })
              .where(eq(users.id, existingUser.id));
          }
        } catch (photoError) {
          console.error("Error updating Microsoft profile photo:", photoError);
        }
      }

      try {
        await ensureUserOrganization(existingUser.id, email);
      } catch (orgError) {
        console.error("Error ensuring user organization:", orgError);
      }

      try {
        await storage.claimInvitesForUser(email, existingUser.id);
      } catch (inviteError) {
        console.error("Error claiming organization invites:", inviteError);
      }

      req.session.userId = existingUser.id;
      
      await new Promise<void>((resolve, reject) => {
        req.session.save((err) => {
          if (err) {
            console.error("Session save error:", err);
            reject(err);
          } else {
            resolve();
          }
        });
      });

      res.redirect("/");
    } catch (error) {
      console.error("Microsoft auth callback error:", error);
      const errorMessage = error instanceof Error ? error.message : "Authentication failed";
      res.redirect(`/auth?error=${encodeURIComponent(errorMessage)}`);
    }
  });
}
