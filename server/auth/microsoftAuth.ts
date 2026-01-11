import { Express, Request } from "express";
import { ConfidentialClientApplication, AuthorizationCodeRequest, Configuration } from "@azure/msal-node";
import { db } from "../db";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";
import { lookupCompanyByEmail } from "../services/companyLookup";
import crypto from "crypto";

declare module "express-session" {
  interface SessionData {
    msOAuthState?: string;
    msOAuthNonce?: string;
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
  const tenantId = process.env.MICROSOFT_TENANT_ID || "common";

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

    const savedState = req.session.msOAuthState;
    const savedNonce = req.session.msOAuthNonce;
    
    delete req.session.msOAuthState;
    delete req.session.msOAuthNonce;

    if (!state || state !== savedState) {
      console.error("CSRF state mismatch", { received: state, expected: savedState });
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
      const email = claims.email || claims.preferred_username;
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
          await db
            .update(users)
            .set({ 
              microsoftId, 
              microsoftTenantId: tenantId,
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
          }).returning();
        }
      } else {
        await db
          .update(users)
          .set({ microsoftTenantId: tenantId })
          .where(eq(users.id, existingUser.id));
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
