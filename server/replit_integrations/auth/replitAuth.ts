import * as client from "openid-client";
import { Strategy, type VerifyFunction } from "openid-client/passport";

import passport from "passport";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import memoize from "memoizee";
import connectPgSimple from "connect-pg-simple";
import { authStorage } from "./storage";
import { ensureUserOrganization } from "../../services/onboarding";
import { db } from "../../db";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";

const PgSession = connectPgSimple(session);

const getOidcConfig = memoize(
  async () => {
    return await client.discovery(
      new URL(process.env.ISSUER_URL ?? "https://replit.com/oidc"),
      process.env.REPL_ID!
    );
  },
  { maxAge: 3600 * 1000 }
);

export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set");
  }

  return session({
    store: new PgSession({
      conString: process.env.DATABASE_URL,
      createTableIfMissing: true,
      tableName: "sessions",
    }),
    secret: process.env.SESSION_SECRET!,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: sessionTtl,
      sameSite: "lax",
    },
  });
}

function updateUserSession(
  user: any,
  tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers
) {
  user.claims = tokens.claims();
  user.access_token = tokens.access_token;
  user.refresh_token = tokens.refresh_token;
  user.expires_at = user.claims?.exp;
}

async function upsertUser(claims: any) {
  const user = await authStorage.upsertUser({
    id: claims["sub"],
    email: claims["email"],
    firstName: claims["first_name"],
    lastName: claims["last_name"],
    profileImageUrl: claims["profile_image_url"],
  });

  if (claims["email"]) {
    try {
      const orgResult = await ensureUserOrganization(user.id, claims["email"]);
      if (orgResult.created) {
        console.log(`Auto-created org for Replit user: ${claims["email"]}`);
      }
    } catch (orgError) {
      console.error("Error ensuring user organization:", orgError);
    }
  }
}

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());

  passport.serializeUser((user: Express.User, cb) => cb(null, user));
  passport.deserializeUser((user: Express.User, cb) => cb(null, user));
}

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  const user = req.user as any;

  if (!req.isAuthenticated() || !user.expires_at) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  // Active-user gate: even with a valid OIDC token, a deactivated account
  // can't continue using the app. This matches the email-auth middleware
  // so both auth paths reject deactivated users uniformly. The lookup is
  // intentionally cheap (one indexed row) and only runs on authenticated
  // requests, so it doesn't widen the surface for unauth traffic.
  const sub = user?.claims?.sub;
  if (!sub) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  // Fail closed: if we can't verify the user's revocation/version state
  // against the live row, deny the request rather than letting a
  // deactivated or version-bumped session ride through on a DB hiccup.
  let liveUser: { deactivatedAt: Date | null; permissionsVersion: number | null } | undefined;
  try {
    const [u] = await db.select({
      deactivatedAt: users.deactivatedAt,
      permissionsVersion: (users as any).permissionsVersion,
    }).from(users).where(eq(users.id, String(sub))).limit(1);
    liveUser = u as any;
  } catch (err) {
    console.error("[auth] revocation lookup failed:", err);
    return res.status(503).json({ message: "Auth verification unavailable" });
  }
  if (!liveUser) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  if (liveUser.deactivatedAt) {
    req.logout?.(() => {});
    return res.status(401).json({ message: "Account is deactivated" });
  }
  // Session-version gate (OIDC path): bumping `permissions_version` on
  // revocation forces these sessions back through the login surface
  // instead of riding stale RBAC. Stored on the passport `user` object
  // (which sits inside the session) so it survives across requests.
  const liveVersion: number = liveUser.permissionsVersion ?? 0;
  if (user.permissionsVersion == null) {
    user.permissionsVersion = liveVersion;
  } else if (user.permissionsVersion !== liveVersion) {
    req.logout?.(() => {});
    return res.status(401).json({ message: "Session expired, please sign in again" });
  }

  const now = Math.floor(Date.now() / 1000);
  if (now <= user.expires_at) {
    return next();
  }

  const refreshToken = user.refresh_token;
  if (!refreshToken) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  try {
    const config = await getOidcConfig();
    const tokenResponse = await client.refreshTokenGrant(config, refreshToken);
    updateUserSession(user, tokenResponse);
    return next();
  } catch (error) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
};
