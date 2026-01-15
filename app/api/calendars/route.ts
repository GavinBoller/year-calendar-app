import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { mergeAccountsFromDbAndSession, refreshGoogleAccessToken } from "@/lib/google-accounts";
import { mergeMicrosoftAccountsFromDbAndSession, refreshMicrosoftAccessToken } from "@/lib/microsoft-accounts";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const debug = url.searchParams.get("debug") === "1";
  const session = await getServerSession(authOptions);
  console.log("Calendars API - session user:", (session as any)?.user);
  console.log("Calendars API - microsoft accounts:", (session as any)?.microsoftAccounts);
  if (!(session as any)?.user?.id) {
    console.log("Calendars API - no authenticated user");
    return NextResponse.json({ calendars: [] }, { status: 200 });
  }

  // Get accounts from both providers
  const googleAccounts = await mergeAccountsFromDbAndSession(
    (session as any).user.id as string,
    session as any
  );
  const microsoftAccounts = await mergeMicrosoftAccountsFromDbAndSession(
    (session as any).user.id as string,
    session as any
  );

  const allAccounts = [...googleAccounts, ...microsoftAccounts];

  if (allAccounts.length === 0) {
    return NextResponse.json({ calendars: [] }, { status: 200 });
  }

  const fetches = allAccounts.map(async (acc: any) => {
    // Determine provider and API endpoint
    const isMicrosoft = microsoftAccounts.some(ma => ma.accountId === acc.accountId);
    const baseUrl = isMicrosoft
      ? "https://graph.microsoft.com/v1.0/me/calendars"
      : "https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=reader&maxResults=250";

    let tokenToUse: string | undefined = acc.accessToken as string | undefined;
    let finalStatus: number | undefined;
    let finalError: string | undefined;

    async function doFetch(accessToken: string) {
      console.log(`Fetching ${baseUrl} for ${isMicrosoft ? 'Microsoft' : 'Google'}`);
      const res = await fetch(baseUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      });
      const status = res.status;
      console.log(`Response status: ${status}`);
      if (!res.ok) {
        let error: string | undefined;
        try {
          const errJson = await res.json();
          error = isMicrosoft
            ? errJson?.error?.message || errJson?.message
            : errJson?.error?.message || errJson?.error_description;
          console.log(`API error:`, errJson);
        } catch (e) {
          console.log(`Failed to parse error response:`, e);
        }
        return { ok: false as const, status, error, data: null as any };
      }
      const data = await res.json();
      console.log(`API success, data keys:`, Object.keys(data));
      console.log(`API data value:`, isMicrosoft ? data.value : data.items);
      return { ok: true as const, status, error: undefined, data };
    }

    if (!tokenToUse) {
      return {
        items: [] as any[],
        accountId: acc.accountId,
        email: acc.email,
        status: 0,
        error: "missing access token",
        _debug: debug ? { status: 0, error: "missing access token" } : undefined,
      };
    }

    let attempt = await doFetch(tokenToUse);
    if (!attempt.ok && attempt.status === 401 && acc.refreshToken) {
      // refresh and retry once
      try {
        const refreshed = isMicrosoft
          ? await refreshMicrosoftAccessToken(acc.refreshToken)
          : await refreshGoogleAccessToken(acc.refreshToken);
        tokenToUse = refreshed.accessToken;
        attempt = await doFetch(tokenToUse);
      } catch (e) {
        // keep first error
      }
    }

    if (!attempt.ok) {
      finalStatus = attempt.status;
      finalError = attempt.error;
      return {
        items: [] as any[],
        accountId: acc.accountId,
        email: acc.email,
        status: finalStatus,
        error: finalError,
        _debug: debug ? { status: finalStatus, error: finalError } : undefined,
      };
    }

    // Transform Microsoft calendar data to match Google format
    let items = attempt.data.items || attempt.data.value || [];
    if (isMicrosoft) {
      items = items.map((cal: any) => ({
        id: cal.id,
        summary: cal.name,
        primary: false, // Microsoft doesn't have a primary calendar concept like Google
        backgroundColor: "#3174ad", // Default Microsoft blue
        accessRole: cal.canEdit ? "writer" : "reader",
      }));
    }

    return {
      items,
      accountId: acc.accountId,
      email: acc.email,
      status: attempt.status,
      _debug: debug ? { status: attempt.status } : undefined,
    };
  });

  const results = await Promise.all(fetches);
  const calendars = results.flatMap((r) =>
    (r.items || []).map((c: any) => ({
      id: `${r.accountId}|${c.id as string}`,
      originalId: c.id as string,
      accountId: r.accountId,
      accountEmail: r.email,
      summary: (c.summary as string) || "(Untitled)",
      primary: !!c.primary,
      backgroundColor: c.backgroundColor as string | undefined,
      accessRole: c.accessRole as string | undefined,
    }))
  );
  const accountsSummary = results.map((r) => ({
    accountId: r.accountId,
    email: r.email,
    status: (r as any).status,
    error: (r as any).error,
  }));

  console.log("Calendars API final result - calendars count:", calendars.length, "calendars:", calendars.map(c => ({ id: c.id, summary: c.summary })));

  if (debug) {
    const diag = results.map((r) => ({
      accountId: (r as any).accountId,
      ...(r as any)._debug,
    }));
    return NextResponse.json({ calendars, accounts: accountsSummary, debug: diag });
  }
  return NextResponse.json({ calendars, accounts: accountsSummary });
}
