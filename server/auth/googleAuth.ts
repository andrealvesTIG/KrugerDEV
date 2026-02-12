import { Express, Request } from "express";
import { db } from "../db";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";
import { lookupCompanyByEmail } from "../services/companyLookup";
import { ensureUserOrganization } from "../services/onboarding";
import crypto from "crypto";
import { objectStorageClient } from "../replit_integrations/object_storage/objectStorage";

declare module "express-session" {
  interface SessionData {
    googleOAuthState?: string;
    googleOAuthNonce?: string;
  }
}

interface GoogleUserInfo {
  sub: string;
  email: string;
  email_verified: boolean;
  name: string;
  given_name: string;
  family_name: string;
  picture: string;
}

function generateSecureToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

function getRedirectUri(req: Request): string {
  // In production, use APP_URL for consistent redirect URI
  if (process.env.APP_URL) {
    return `${process.env.APP_URL}/api/auth/google/callback`;
  }
  const protocol = req.headers["x-forwarded-proto"] || req.protocol;
  const host = req.headers["x-forwarded-host"] || req.get("host");
  return `${protocol}://${host}/api/auth/google/callback`;
}

function getGoogleClientId(): string {
  return (process.env.GOOGLE_CLIENT_ID || "").trim();
}

function getGoogleClientSecret(): string {
  return (process.env.GOOGLE_CLIENT_SECRET || "").trim();
}

function isGoogleConfigured(): boolean {
  const clientId = getGoogleClientId();
  const clientSecret = getGoogleClientSecret();
  const configured = !!(clientId && clientSecret);
  if (configured) {
    console.log("Google OAuth configured:", {
      clientIdLength: clientId.length,
      clientIdPrefix: clientId.substring(0, 10),
      clientIdSuffix: clientId.substring(clientId.length - 20),
      secretLength: clientSecret.length,
      secretPrefix: clientSecret.substring(0, 4),
    });
  }
  return configured;
}

async function fetchAndUploadGooglePhoto(photoUrl: string, userId: string): Promise<string | null> {
  try {
    const response = await fetch(photoUrl);
    if (!response.ok) {
      console.log("No Google profile photo available");
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const contentType = response.headers.get("content-type") || "image/jpeg";
    
    const privateObjectDir = process.env.PRIVATE_OBJECT_DIR;
    if (!privateObjectDir) {
      console.error("PRIVATE_OBJECT_DIR not set, cannot upload Google photo");
      return null;
    }

    const objectId = `google-avatar-${userId}-${Date.now()}`;
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
    
    console.log(`Successfully uploaded Google profile photo: /objects/${objectName}`);
    return `/objects/${objectName}`;
  } catch (error) {
    console.error("Error fetching/uploading Google profile photo:", error);
    return null;
  }
}

export function setupGoogleAuth(app: Express) {
  app.get("/api/auth/google/status", (_req, res) => {
    res.json({ configured: isGoogleConfigured() });
  });

  app.get("/api/auth/google/login", async (req, res) => {
    if (!isGoogleConfigured()) {
      return res.status(503).json({ 
        message: "Google authentication is not configured. Please add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET." 
      });
    }

    const state = generateSecureToken();
    const nonce = generateSecureToken();
    
    req.session.googleOAuthState = state;
    req.session.googleOAuthNonce = nonce;
    
    // Also store state in cookies as backup for mobile viewport switching
    res.cookie('google_oauth_state', state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 10 * 60 * 1000, // 10 minutes
    });
    res.cookie('google_oauth_nonce', nonce, {
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
    const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authUrl.searchParams.set("client_id", getGoogleClientId());
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", "openid email profile");
    authUrl.searchParams.set("state", state);
    authUrl.searchParams.set("nonce", nonce);
    authUrl.searchParams.set("access_type", "offline");
    authUrl.searchParams.set("prompt", "consent");

    res.redirect(authUrl.toString());
  });

  app.get("/api/auth/google/callback", async (req, res) => {
    const { code, state, error, error_description } = req.query;

    if (error) {
      console.error("Google OAuth error:", error, error_description);
      return res.redirect(`/auth?error=${encodeURIComponent(String(error_description || error))}`);
    }

    // Try session first, then fall back to cookies (for mobile viewport switching)
    let savedState = req.session.googleOAuthState;
    let savedNonce = req.session.googleOAuthNonce;
    
    // Fall back to cookie values if session doesn't have them
    if (!savedState && req.cookies?.google_oauth_state) {
      savedState = req.cookies.google_oauth_state;
      savedNonce = req.cookies.google_oauth_nonce;
      console.log("Using cookie-based Google OAuth state (session state was lost)");
    }
    
    // Clean up session state
    delete req.session.googleOAuthState;
    delete req.session.googleOAuthNonce;
    
    // Clear the OAuth cookies
    res.clearCookie('google_oauth_state');
    res.clearCookie('google_oauth_nonce');

    if (!state || state !== savedState) {
      console.error("CSRF state mismatch", { 
        received: state, 
        expected: savedState,
        hasSession: !!req.session,
        sessionId: req.sessionID,
        hadCookieState: !!req.cookies?.google_oauth_state
      });
      if (!savedState) {
        return res.redirect("/auth?error=Session expired. Please try signing in again.");
      }
      return res.redirect("/auth?error=Security validation failed. Please try again.");
    }

    if (!code || typeof code !== "string") {
      return res.redirect("/auth?error=No authorization code received");
    }

    try {
      const redirectUri = getRedirectUri(req);
      
      const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          code,
          client_id: getGoogleClientId(),
          client_secret: getGoogleClientSecret(),
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
        }),
      });

      if (!tokenResponse.ok) {
        const errorData = await tokenResponse.text();
        console.error("Token exchange failed:", {
          status: tokenResponse.status,
          error: errorData,
          redirectUri,
        });
        return res.redirect("/auth?error=Failed to exchange authorization code");
      }

      const tokens = await tokenResponse.json();
      
      const userInfoResponse = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
        headers: {
          Authorization: `Bearer ${tokens.access_token}`,
        },
      });

      if (!userInfoResponse.ok) {
        return res.redirect("/auth?error=Failed to fetch user information");
      }

      const userInfo: GoogleUserInfo = await userInfoResponse.json();
      
      const email = userInfo.email?.toLowerCase();
      if (!email) {
        return res.redirect("/auth?error=No email found in Google account");
      }

      const googleId = userInfo.sub;
      const firstName = userInfo.given_name || "";
      const lastName = userInfo.family_name || "";
      const displayName = userInfo.name || `${firstName} ${lastName}`.trim();
      const profileImageUrl = userInfo.picture || null;

      const existingUser = await db.query.users.findFirst({
        where: eq(users.email, email),
      });

      if (existingUser) {
        if (!existingUser.googleId) {
          await db
            .update(users)
            .set({ googleId })
            .where(eq(users.id, existingUser.id));
        }

        if (profileImageUrl && (!existingUser.profileImageUrl || !existingUser.avatarUrl)) {
          try {
            const photoUrl = await fetchAndUploadGooglePhoto(profileImageUrl, existingUser.id);
            if (photoUrl) {
              await db
                .update(users)
                .set({ 
                  profileImageUrl: photoUrl,
                  avatarUrl: photoUrl 
                })
                .where(eq(users.id, existingUser.id));
              console.log(`Updated Google profile photo for user: ${existingUser.email}`);
            }
          } catch (photoError) {
            console.error("Error updating Google profile photo:", photoError);
          }
        }

        try {
          await ensureUserOrganization(existingUser.id, email);
        } catch (orgError) {
          console.error("Error ensuring organization for existing Google user:", orgError);
        }

        req.session.userId = existingUser.id;
        await new Promise<void>((resolve, reject) => {
          req.session.save((err) => {
            if (err) reject(err);
            else resolve();
          });
        });

        return res.redirect("/");
      }

      const companyInfo = await lookupCompanyByEmail(email);
      const userId = crypto.randomUUID();
      
      let uploadedPhotoUrl: string | null = null;
      if (profileImageUrl) {
        uploadedPhotoUrl = await fetchAndUploadGooglePhoto(profileImageUrl, userId);
      }

      let detectedCompany: string | null = null;
      let detectedIndustry: string | null = null;
      if (companyInfo && !companyInfo.isPersonalEmail && companyInfo.companyName) {
        detectedCompany = companyInfo.companyName;
        detectedIndustry = companyInfo.industry || null;
      }

      const [newUser] = await db
        .insert(users)
        .values({
          id: userId,
          email,
          googleId,
          firstName,
          lastName,
          profileImageUrl: uploadedPhotoUrl,
          avatarUrl: uploadedPhotoUrl,
          detectedCompany,
          detectedIndustry,
          emailVerified: userInfo.email_verified,
        })
        .returning();

      await ensureUserOrganization(newUser.id, email);

      req.session.userId = newUser.id;
      await new Promise<void>((resolve, reject) => {
        req.session.save((err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      res.redirect("/");
    } catch (error) {
      console.error("Google OAuth callback error:", error);
      res.redirect("/auth?error=Authentication failed. Please try again.");
    }
  });
}
