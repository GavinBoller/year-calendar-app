import NextAuth, { type NextAuthOptions } from "next-auth";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import GoogleProvider from "next-auth/providers/google";
import MicrosoftProvider from "next-auth/providers/azure-ad";
// @ts-ignore - ESM interop
import { prisma } from "./prisma";

// Ensure we always request offline access and explicit consent so Google issues a refresh_token.

function base64UrlDecode(input: string): string {
  const pad = input.length % 4 === 2 ? "==" : input.length % 4 === 3 ? "=" : "";
  const base64 = input.replace(/-/g, "+").replace(/_/g, "/") + pad;
  return Buffer.from(base64, "base64").toString("utf8");
}
function emailFromIdToken(idToken?: string): string | undefined {
  if (!idToken || typeof idToken !== "string") return undefined;
  const parts = idToken.split(".");
  if (parts.length < 2) return undefined;
  try {
    const payloadJson = base64UrlDecode(parts[1] || "");
    const payload = JSON.parse(payloadJson);
    return typeof payload?.email === "string" ? payload.email : undefined;
  } catch {
    return undefined;
  }
}

async function refreshAccessToken(token: any) {
  try {
    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      grant_type: "refresh_token",
      refresh_token: token.refreshToken as string,
    });
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
    const data = await res.json();
    if (!res.ok) throw data;
    return {
      ...token,
      accessToken: data.access_token,
      accessTokenExpires: Date.now() + data.expires_in * 1000,
      refreshToken: token.refreshToken ?? data.refresh_token,
    };
  } catch (e) {
    return { ...token, error: "RefreshAccessTokenError" as const };
  }
}

async function refreshSingleGoogleAccount(account: any) {
  try {
    if (!account.refreshToken) return account;
    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      grant_type: "refresh_token",
      refresh_token: account.refreshToken as string,
    });
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
    const data = await res.json();
    if (!res.ok) throw data;
    return {
      ...account, // Preserve all original fields including provider
      accessToken: data.access_token,
      accessTokenExpires: Date.now() + data.expires_in * 1000,
      refreshToken: account.refreshToken ?? data.refresh_token,
    };
  } catch (e) {
    return { ...account, error: "RefreshAccessTokenError" as const };
  }
}

async function refreshSingleMicrosoftAccount(account: any) {
  try {
    if (!account.refreshToken) return account;
    const params = new URLSearchParams({
      client_id: process.env.MICROSOFT_CLIENT_ID!,
      client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
      grant_type: "refresh_token",
      refresh_token: account.refreshToken as string,
    });
    const res = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
    const data = await res.json();
    if (!res.ok) throw data;
    return {
      ...account, // Preserve all original fields including provider
      accessToken: data.access_token,
      accessTokenExpires: Date.now() + data.expires_in * 1000,
      refreshToken: account.refreshToken ?? data.refresh_token,
    };
  } catch (e) {
    return { ...account, error: "RefreshAccessTokenError" as const };
  }
}

async function refreshSingleAccount(account: any) {
  if (account.provider === "google") {
    return await refreshSingleGoogleAccount(account);
  } else if (account.provider === "azure-ad") {
    return await refreshSingleMicrosoftAccount(account);
  }
  return account;
}

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          // Rely on provider default base URL; just supply params so NextAuth merges them correctly.
          prompt: "select_account",
          access_type: "offline",
          response_type: "code",
          scope:
            "openid email profile https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/calendar.events",
        },
      } as any,
    }),
    MicrosoftProvider({
      clientId: process.env.MICROSOFT_CLIENT_ID!,
      clientSecret: process.env.MICROSOFT_CLIENT_SECRET!,
      tenantId: "common",
      authorization: {
        params: {
          scope: "openid email profile https://graph.microsoft.com/Calendars.Read https://graph.microsoft.com/Calendars.ReadWrite offline_access",
        },
      } as any,
      profile(profile) {
        console.log("Microsoft profile callback:", JSON.stringify(profile, null, 2));
        return {
          id: profile.sub,
          name: profile.name || profile.displayName,
          email: profile.email || profile.mail || profile.userPrincipalName,
          image: profile.picture,
          // Store additional Microsoft-specific fields
          mail: profile.mail,
          userPrincipalName: profile.userPrincipalName,
          displayName: profile.displayName,
        };
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account, profile, email }) {
      // Allow all sign-ins for now to debug
      console.log("SignIn callback:", { provider: account?.provider, email: user?.email, userId: user?.id, userKeys: Object.keys(user || {}) });
      try {
        // Test database connection
        await prisma.user.count();
        console.log("Database connection OK");
        return true;
      } catch (dbError) {
        console.error("Database connection failed:", dbError);
        return false; // Fail sign-in if database is unreachable
      }
    },
    async jwt({ token, account, user }) {
      console.log("JWT callback - START - token.dbUserId:", (token as any).dbUserId, "user:", JSON.stringify(user, null, 2), "account:", account?.provider);

      // Ensure user exists in database
      if (user && !token.dbUserId) {
        try {
          // Extract user data - Microsoft uses different field names than Google
          let userEmail = user.email;
          let userName = user.name;
          let userImage = user.image;

          // For Microsoft accounts, check profile fields if user fields are missing
          if (account?.provider === "azure-ad") {
            const profile = user as any;
            userEmail = userEmail || profile.mail || profile.userPrincipalName || profile.email;
            userName = userName || profile.displayName || profile.name;
            userImage = userImage || profile.picture || profile.photo;
            console.log("Microsoft user data - email:", userEmail, "name:", userName, "profile fields:", Object.keys(profile));
          }

          console.log("Attempting to create user with email:", userEmail, "name:", userName, "provider:", account?.provider);

          if (userEmail) {
            const dbUser = await prisma.user.upsert({
              where: { email: userEmail },
              update: {
                name: userName,
                image: userImage,
              },
              create: {
                email: userEmail,
                name: userName,
                image: userImage,
              },
            });
            token.dbUserId = dbUser.id;
            console.log("Created/found user:", dbUser.id, dbUser.email);
          } else {
            console.log("No email found in user object:", user);
          }
        } catch (error) {
          console.error("Error creating user:", error);
        }
      }

      console.log("JWT callback - Before account processing - token.dbUserId:", (token as any).dbUserId);

      // When a (re)sign-in occurs, add/update this account in the appropriate array.
      if (account) {
        console.log("JWT callback - Processing account:", account.provider, account.providerAccountId);
        const expiresInSecRaw = (account as any)?.expires_in;
        const expiresInSec =
          typeof expiresInSecRaw === "number"
            ? expiresInSecRaw
            : typeof expiresInSecRaw === "string"
              ? parseInt(expiresInSecRaw, 10)
              : undefined;
        const acctId = account.providerAccountId as string;
        // Try to attach the correct per-account email using id_token if available
        const acctEmail =
          emailFromIdToken((account as any)?.id_token as string | undefined) ||
          (user?.email as string | undefined);

        // Manually save account to database for reliability
        if (token.dbUserId) {
          try {
            await prisma.account.upsert({
              where: {
                provider_providerAccountId: {
                  provider: account.provider,
                  providerAccountId: acctId,
                },
              },
              update: {
                access_token: account.access_token as string,
                refresh_token: (account.refresh_token as string) || null,
                expires_at: expiresInSec ? Math.floor(Date.now() / 1000) + expiresInSec : null,
              },
              create: {
                userId: token.dbUserId as string,
                provider: account.provider,
                providerAccountId: acctId,
                access_token: account.access_token as string,
                refresh_token: (account.refresh_token as string) || null,
                expires_at: expiresInSec ? Math.floor(Date.now() / 1000) + expiresInSec : null,
                type: (account.type as string) || "oauth",
              },
            });
            console.log(`Saved ${account.provider} account to database:`, acctId);
          } catch (error) {
            console.error(`Failed to save ${account.provider} account to database:`, error);
          }
        } else {
          console.error(`Cannot save ${account.provider} account - no dbUserId set for user:`, user);
        }

        if (account.provider === "google") {
          const existing = (token.googleAccounts as any[]) || [];
          const updated = existing.filter((a) => a.accountId !== acctId);
          updated.push({
            provider: account.provider,
            accountId: acctId,
            email: acctEmail,
            accessToken: account.access_token as string,
            refreshToken: (account.refresh_token as string) || undefined,
            accessTokenExpires:
              Date.now() + (expiresInSec ? expiresInSec * 1000 : 3600 * 1000),
          });
          token.googleAccounts = updated;
        } else if (account.provider === "azure-ad") {
          console.log("Adding Microsoft account to token:", { acctId, acctEmail, hasAccessToken: !!account.access_token });
          const existing = (token.microsoftAccounts as any[]) || [];
          const updated = existing.filter((a) => a.accountId !== acctId);
          updated.push({
            provider: account.provider,
            accountId: acctId,
            email: acctEmail,
            accessToken: account.access_token as string,
            refreshToken: (account.refresh_token as string) || undefined,
            accessTokenExpires:
              Date.now() + (expiresInSec ? expiresInSec * 1000 : 3600 * 1000),
          });
          token.microsoftAccounts = updated;
          console.log("Microsoft accounts in token:", token.microsoftAccounts);
        }

        // Keep backward compat single-token fields to the latest account
        token.accessToken = account.access_token as string;
        token.refreshToken = (account.refresh_token as string) || token.refreshToken;
        token.accessTokenExpires =
          Date.now() + (expiresInSec ? expiresInSec * 1000 : 3600 * 1000);
        token.user = user;
        console.log("JWT callback - END - returning token with dbUserId:", (token as any).dbUserId, "googleAccounts:", Array.isArray(token.googleAccounts) ? token.googleAccounts.length : 0, "microsoftAccounts:", Array.isArray(token.microsoftAccounts) ? token.microsoftAccounts.length : 0);
        return token;
      }

      // Refresh any accounts that are expiring.
      const allAccounts = [
        ...(Array.isArray(token.googleAccounts) ? token.googleAccounts : []),
        ...(Array.isArray(token.microsoftAccounts) ? token.microsoftAccounts : []),
      ];

      console.log("JWT refresh - allAccounts length:", allAccounts.length, "microsoft accounts:", token.microsoftAccounts);

      if (allAccounts.length > 0) {
        const now = Date.now() + 60_000; // 1 min buffer
        const refreshed = await Promise.all(
          allAccounts.map((a: any) =>
            a.accessTokenExpires && a.accessTokenExpires > now
              ? a
              : refreshSingleAccount(a)
          )
        );

        // Split back into provider arrays
        token.googleAccounts = refreshed.filter((a: any) => a.provider === "google");
        token.microsoftAccounts = refreshed.filter((a: any) => a.provider === "azure-ad");

        console.log("JWT refresh - after filtering - microsoft accounts:", token.microsoftAccounts);

        // Maintain single-token fields for convenience (use the first account)
        const first = refreshed[0];
        if (first) {
          token.accessToken = first.accessToken;
          token.refreshToken = first.refreshToken;
          token.accessTokenExpires = first.accessTokenExpires;
        }
        return token;
      }

      // Legacy single-account refresh
      if (Date.now() < (token.accessTokenExpires as number) - 60000) {
        return token;
      }
      return await refreshAccessToken(token);
    },
    async session({ session, token }) {
      console.log("Session callback - token.dbUserId:", (token as any).dbUserId, "token.sub:", (token as any).sub);

      (session as any).accessToken = token.accessToken;
      (session as any).googleAccounts = token.googleAccounts || [];
      (session as any).microsoftAccounts = token.microsoftAccounts || [];
      // Carry over any user object we stored on the token during sign-in
      const existingUser = (token as any).user || (session as any).user || {};
      // Use the database user ID if available, otherwise fall back to JWT subject
      const ensuredUser = {
        ...existingUser,
        id: (token as any).dbUserId || (existingUser && existingUser.id) || (token as any).sub,
      };
      (session as any).user = ensuredUser;
      console.log("Session user.id:", ensuredUser.id);
      return session;
    },
  },
  session: { strategy: "jwt" },
  secret: process.env.NEXTAUTH_SECRET,
  pages: {
    signIn: "/",
    error: "/",
  },
};
