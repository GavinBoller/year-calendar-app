import { prisma } from "./prisma";

export type MicrosoftAccountRecord = {
  accountId: string;
  email?: string;
  accessToken: string;
  refreshToken?: string;
  accessTokenExpires?: number; // ms epoch
};

export async function refreshMicrosoftAccessToken(refreshToken: string) {
  const params = new URLSearchParams({
    client_id: process.env.MICROSOFT_CLIENT_ID!,
    client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  const res = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
    cache: "no-store",
  });
  const data = await res.json();
  if (!res.ok) throw data;
  return {
    accessToken: data.access_token as string,
    expiresAtMs: Date.now() + (data.expires_in ? data.expires_in * 1000 : 3600 * 1000),
    refreshToken: (data.refresh_token as string) || undefined,
  };
}

export async function fetchMicrosoftEmail(accessToken: string): Promise<string | undefined> {
  try {
    const res = await fetch("https://graph.microsoft.com/v1.0/me", {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    if (res.ok) {
      const data = await res.json();
      return data?.mail || data?.userPrincipalName as string | undefined;
    }
  } catch {}
  return undefined;
}

export async function getFreshMicrosoftAccountsForUser(userId: string): Promise<MicrosoftAccountRecord[]> {
  const accounts = await prisma.account.findMany({
    where: { userId, provider: "azure-ad" },
    select: {
      providerAccountId: true,
      access_token: true,
      refresh_token: true,
      expires_at: true,
    },
  });
  const now = Date.now() + 60_000;
  const records: MicrosoftAccountRecord[] = [];
  for (const a of accounts) {
    let accessToken = a.access_token || "";
    let refreshToken = a.refresh_token || undefined;
    let expiresAtMs = a.expires_at ? a.expires_at * 1000 : undefined;
    if ((!expiresAtMs || expiresAtMs < now) && refreshToken) {
      try {
        const refreshed = await refreshMicrosoftAccessToken(refreshToken);
        accessToken = refreshed.accessToken;
        expiresAtMs = refreshed.expiresAtMs;
        refreshToken = refreshed.refreshToken ?? refreshToken;
        // Persist refreshed tokens
        await prisma.account.update({
          where: { provider_providerAccountId: { provider: "azure-ad", providerAccountId: a.providerAccountId } },
          data: {
            access_token: accessToken,
            refresh_token: refreshToken,
            expires_at: Math.floor((expiresAtMs || 0) / 1000),
          },
        });
      } catch {
        // Keep old token; API calls may fail and return empty
      }
    }
    if (accessToken) {
      const email = await fetchMicrosoftEmail(accessToken).catch(() => undefined);
      records.push({
        accountId: a.providerAccountId,
        email,
        accessToken,
        refreshToken,
        accessTokenExpires: expiresAtMs,
      });
    }
  }
  return records;
}

export async function mergeMicrosoftAccountsFromDbAndSession(userId: string, session: any) {
  // Load DB accounts (may refresh and persist)
  const dbAccounts = await getFreshMicrosoftAccountsForUser(userId);
  const sessAccs = Array.isArray(session?.microsoftAccounts) ? (session.microsoftAccounts as any[]) : [];
  const byId = new Map<
    string,
    {
      accountId: string;
      email?: string;
      accessToken?: string;
      refreshToken?: string;
      accessTokenExpires?: number;
      source: "db" | "session";
    }
  >();
  for (const a of dbAccounts) {
    byId.set(a.accountId, { ...a, source: "db" });
  }
  for (const a of sessAccs) {
    const existing = byId.get(a.accountId as string);
    const cand = {
      accountId: a.accountId as string,
      email: a.email as string | undefined,
      accessToken: a.accessToken as string | undefined,
      refreshToken: a.refreshToken as string | undefined,
      accessTokenExpires: a.accessTokenExpires as number | undefined,
      source: "session" as const,
    };
    if (!existing) {
      byId.set(cand.accountId, cand);
    } else {
      // Prefer a candidate that has a refresh token, otherwise the one with later expiry
      const preferSess =
        (!!cand.refreshToken && !existing.refreshToken) ||
        ((cand.accessTokenExpires || 0) > (existing.accessTokenExpires || 0));
      if (preferSess) byId.set(cand.accountId, cand);
    }
  }
  const now = Date.now() + 60_000;
  const merged: any[] = [];
  for (const entry of byId.values()) {
    let accessToken = entry.accessToken;
    let refreshToken = entry.refreshToken;
    let expiresAtMs = entry.accessTokenExpires;
    if ((!expiresAtMs || expiresAtMs < now) && refreshToken) {
      try {
        const refreshed = await refreshMicrosoftAccessToken(refreshToken);
        accessToken = refreshed.accessToken;
        expiresAtMs = refreshed.expiresAtMs;
        refreshToken = refreshed.refreshToken ?? refreshToken;
      } catch {
        // keep existing token on refresh failure
      }
    }
    if (accessToken) {
      let email = entry.email;
      if (!email) {
        email = await fetchMicrosoftEmail(accessToken).catch(() => undefined);
      }
      merged.push({
        accountId: entry.accountId,
        email,
        accessToken,
        refreshToken,
        accessTokenExpires: expiresAtMs,
      });
    }
  }
  return merged;
}

/**
 * Fetches a URL with automatic token refresh on 401 errors.
 * Returns the response, and if a refresh occurred, the new access token.
 */
export async function fetchMicrosoftWithAutoRefresh(
  url: string,
  options: RequestInit,
  account: MicrosoftAccountRecord
): Promise<{ response: Response; accessToken: string }> {
  let accessToken = account.accessToken;
  let response = await fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
  });

  // If 401 and we have a refresh token, try refreshing and retrying once
  if (response.status === 401 && account.refreshToken) {
    try {
      const refreshed = await refreshMicrosoftAccessToken(account.refreshToken);
      accessToken = refreshed.accessToken;
      response = await fetch(url, {
        ...options,
        headers: {
          ...options.headers,
          Authorization: `Bearer ${accessToken}`,
        },
        cache: "no-store",
      });
    } catch {
      // Return original response if refresh fails
    }
  }

  return { response, accessToken };
}
