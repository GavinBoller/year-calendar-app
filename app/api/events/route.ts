import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { mergeAccountsFromDbAndSession, refreshGoogleAccessToken, fetchWithAutoRefresh } from "@/lib/google-accounts";
import { mergeMicrosoftAccountsFromDbAndSession, refreshMicrosoftAccessToken, fetchMicrosoftWithAutoRefresh } from "@/lib/microsoft-accounts";

export const dynamic = "force-dynamic";

function startOfYearIso(year: number) {
  return new Date(Date.UTC(year, 0, 1)).toISOString();
}
function endOfYearIso(year: number) {
  return new Date(Date.UTC(year + 1, 0, 1)).toISOString();
}

function isIsoDateOnly(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function addDaysIsoDateOnly(isoDate: string, days: number) {
  const [y, m, d] = isoDate.split("-").map((p) => parseInt(p, 10));
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  dt.setUTCDate(dt.getUTCDate() + days);
  const yy = dt.getUTCFullYear();
  const mm = `${dt.getUTCMonth() + 1}`.padStart(2, "0");
  const dd = `${dt.getUTCDate()}`.padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const year = parseInt(
    searchParams.get("year") || `${new Date().getFullYear()}`,
    10
  );
  const calendarIdsParam = searchParams.get("calendarIds") || "";
  const calendarIds = calendarIdsParam
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  console.log(`Events API called: year=${year}, calendarIdsParam=${calendarIdsParam}, calendarIds=${calendarIds}`);

  const session = await getServerSession(authOptions);
  if (!(session as any)?.user?.id) {
    console.log('No user session');
    return NextResponse.json({ events: [] }, { status: 200 });
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

  console.log(`Accounts: google=${googleAccounts.length}, microsoft=${microsoftAccounts.length}, total=${allAccounts.length}`);

  if (allAccounts.length === 0) {
    console.log('No accounts found');
    return NextResponse.json({ events: [] }, { status: 200 });
  }

  // calendarIds are composite: `${accountId}|${calendarId}`
  const idsByAccount = new Map<string, string[]>();
  if (calendarIds.length > 0) {
    for (const comp of calendarIds) {
      const [accId, calId] = comp.split("|");
      if (!accId || !calId) continue;
      const arr = idsByAccount.get(accId) ?? [];
      arr.push(calId);
      idsByAccount.set(accId, arr);
    }
  }

  console.log('idsByAccount:', Object.fromEntries(idsByAccount));

  const fetches: Promise<any>[] = [];

  for (const acc of allAccounts) {
    const isMicrosoft = microsoftAccounts.some(ma => ma.accountId === acc.accountId);
    let tokenToUse: string | undefined = acc.accessToken as string | undefined;

    // Get calendars for this account
    const cals = idsByAccount.size > 0 ? idsByAccount.get(acc.accountId) || [] : ["primary"];

    for (const calId of cals) {
      if (isMicrosoft) {
        // Microsoft Graph API for calendar events - use calendarView to automatically expand recurring events
        // Fetch from year-1 to year+1
        const startDate = `${year - 1}-01-01`;
        const endDate = `${year + 1}-01-01`;
        const url = `https://graph.microsoft.com/v1.0/me/calendars/${encodeURIComponent(calId)}/calendarView?startDateTime=${startDate}T00:00:00Z&endDateTime=${endDate}T00:00:00Z&$orderby=start/dateTime&$top=1000`;

        fetches.push(
          (async () => {
            if (!tokenToUse) return { items: [], calendarId: calId, accountId: acc.accountId };
            const doFetch = async (accessToken: string) => {
              const res = await fetch(url, {
                headers: { Authorization: `Bearer ${accessToken}` },
                cache: "no-store",
              });
              if (!res.ok) return { ok: false as const, status: res.status, data: null as any };
              const data = await res.json();
              return { ok: true as const, status: res.status, data };
            };
            let attempt = await doFetch(tokenToUse);
            if (!attempt.ok && attempt.status === 401 && acc.refreshToken) {
              try {
                const refreshed = await refreshMicrosoftAccessToken(acc.refreshToken);
                tokenToUse = refreshed.accessToken;
                attempt = await doFetch(tokenToUse);
              } catch {}
            }
            // Retry on 429 with exponential backoff
            if (!attempt.ok && attempt.status === 429) {
              for (let retry = 1; retry <= 3; retry++) {
                const delay = Math.pow(2, retry) * 1000; // 2s, 4s, 8s
                console.log(`Retrying ${calId} in ${delay}ms (attempt ${retry})`);
                await new Promise(resolve => setTimeout(resolve, delay));
                attempt = await doFetch(tokenToUse);
                if (attempt.ok) break;
              }
            }
            if (!attempt.ok) {
              console.log(`Microsoft fetch failed for ${calId}: status=${attempt.status}, data=${JSON.stringify(attempt.data)}`);
              return { items: [], calendarId: calId, accountId: acc.accountId };
            }

            // Debug: Log raw Microsoft events
            console.log(`Microsoft events for calendar ${calId}:`, attempt.data.value?.length || 0, 'events');
            attempt.data.value?.slice(0, 5).forEach((e: any, i: number) => {
              console.log(`Event ${i}:`, {
                id: e.id,
                subject: e.subject,
                start: e.start,
                end: e.end,
                isCancelled: e.isCancelled,
                seriesMasterId: e.seriesMasterId,
                type: e.type
              });
            });

            // Transform Microsoft events to match Google format
            // calendarView automatically expands recurring events
            const items: any[] = (attempt.data.value || []).filter((e: any) => !e.isCancelled);

            // Debug: Log all event subjects
            console.log('All event subjects for calendar:', items.map(e => e.subject));

            const transformedItems = items.map((e: any) => {
              // Only include all-day events (skip timed events)
              // All-day events have the same start and end times
              const startTime = e.start?.dateTime?.split('T')[1];
              const endTime = e.end?.dateTime?.split('T')[1];
              if (startTime !== endTime) {
                return null; // Skip timed events
              }

              let startDate: string;
              let endDate: string;

              // Extract dates from dateTime
              startDate = e.start.dateTime.split('T')[0];
              endDate = e.end.dateTime.split('T')[0];

              const transformed = {
                id: e.id,
                summary: e.subject || "(Untitled)",
                start: { date: startDate },
                end: { date: endDate },
                status: e.isCancelled ? "cancelled" : "confirmed",
              };

              return transformed;
            }).filter(Boolean) // Remove null entries
            .filter((e: any) => e.start.date.startsWith(`${year}-`)); // Only include events for the requested year

            console.log(`Calendar ${calId}: ${items.length} raw events -> ${transformedItems.length} transformed events`);

            return {
              items: transformedItems,
              calendarId: calId,
              accountId: acc.accountId,
            };
          })()
        );
      } else {
        // Google Calendar API
        const params = new URLSearchParams({
          singleEvents: "true",
          orderBy: "startTime",
          timeMin: startOfYearIso(year),
          timeMax: endOfYearIso(year),
          maxResults: "2500",
        });

        const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
          calId
        )}/events?${params.toString()}`;

        fetches.push(
          (async () => {
            if (!tokenToUse) return { items: [], calendarId: calId, accountId: acc.accountId };
            const doFetch = async (accessToken: string) => {
              const res = await fetch(url, {
                headers: { Authorization: `Bearer ${accessToken}` },
                cache: "no-store",
              });
              if (!res.ok) return { ok: false as const, status: res.status, data: null as any };
              const data = await res.json();
              return { ok: true as const, status: res.status, data };
            };
            let attempt = await doFetch(tokenToUse);
            if (!attempt.ok && attempt.status === 401 && acc.refreshToken) {
              try {
                const refreshed = await refreshGoogleAccessToken(acc.refreshToken);
                tokenToUse = refreshed.accessToken;
                attempt = await doFetch(tokenToUse);
              } catch {}
            }
            if (!attempt.ok) return { items: [], calendarId: calId, accountId: acc.accountId };
            return {
              items: attempt.data.items || [],
              calendarId: calId,
              accountId: acc.accountId,
            };
          })()
        );
      }
    }
  }

  // Fetch sequentially with delay to avoid rate limiting
  const results = [];
  for (const fetchPromise of fetches) {
    results.push(await fetchPromise);
    // Delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  console.log(`Fetch results: ${results.length} results`);
  const events = results.flatMap((r) =>
    (r.items || [])
      .filter((e: any) => e?.start?.date && e.status !== "cancelled")
      .map((e: any) => ({
        id: `${r.accountId || "primary"}|${r.calendarId || "primary"}:${e.id}`,
        calendarId: `${r.accountId || "primary"}|${r.calendarId || "primary"}`,
        summary: e.summary || "(Untitled)",
        startDate: e.start.date as string,
        endDate: e.end?.date as string,
      }))
  );

  console.log(`Final events: ${events.length} events`);
  if (events.length > 0) {
    console.log('Sample events:', events.slice(0, 3));
  }

  return NextResponse.json({ events });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!(session as any)?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const calendarIdComposite = typeof body?.calendarId === "string" ? body.calendarId.trim() : "";
  const startDate = body?.startDate;
  const endDate = body?.endDate; // inclusive, optional

  if (!title) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }
  if (!calendarIdComposite.includes("|")) {
    return NextResponse.json({ error: "calendarId is required" }, { status: 400 });
  }
  if (!isIsoDateOnly(startDate)) {
    return NextResponse.json({ error: "startDate must be YYYY-MM-DD" }, { status: 400 });
  }
  if (endDate != null && !isIsoDateOnly(endDate)) {
    return NextResponse.json({ error: "endDate must be YYYY-MM-DD" }, { status: 400 });
  }
  if (isIsoDateOnly(endDate) && endDate < startDate) {
    return NextResponse.json({ error: "endDate must be on/after startDate" }, { status: 400 });
  }

  const [accountId, calendarId] = calendarIdComposite.split("|");
  if (!accountId || !calendarId) {
    return NextResponse.json({ error: "Invalid calendarId" }, { status: 400 });
  }

  let accounts = await mergeAccountsFromDbAndSession(
    (session as any).user.id as string,
    session as any
  );
  let account = accounts.find((a) => a.accountId === accountId);
  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  // Google all-day events require end.date to be exclusive.
  // UI sends endDate as inclusive; convert to exclusive.
  const endExclusive = addDaysIsoDateOnly(isIsoDateOnly(endDate) ? endDate : startDate, 1);

  const createUrl = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
    calendarId
  )}/events`;
  const createRes = await fetch(createUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${account.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      summary: title,
      start: { date: startDate },
      end: { date: endExclusive },
    }),
    cache: "no-store",
  });

  if (!createRes.ok) {
    let errText = "Failed to create event";
    try {
      const errJson = await createRes.json();
      errText = errJson?.error?.message || errJson?.error_description || errText;
    } catch {}
    return NextResponse.json({ error: errText }, { status: createRes.status });
  }

  const created = await createRes.json();
  return NextResponse.json({
    event: {
      id: `${accountId}|${calendarId}:${created.id as string}`,
      calendarId: `${accountId}|${calendarId}`,
      summary: (created.summary as string) || title,
      startDate,
      endDate: endExclusive,
    },
  });
}

export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions);
  if (!(session as any)?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const compositeId = typeof body?.id === "string" ? body.id : "";
  // Expected format: `${accountId}|${calendarId}:${eventId}`
  const [accAndCal, eventId] = compositeId.split(":");
  const [accountId, calendarId] = (accAndCal || "").split("|");
  if (!accountId || !calendarId || !eventId) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const accounts = await mergeAccountsFromDbAndSession(
    (session as any).user.id as string,
    session as any
  );
  const account = accounts.find((a) => a.accountId === accountId);
  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
    calendarId
  )}/events/${encodeURIComponent(eventId)}`;
  const { response: res } = await fetchWithAutoRefresh(
    url,
    { method: "DELETE" },
    account
  );
  if (!res.ok && res.status !== 204) {
    let errText = "Failed to delete event";
    try {
      const errJson = await res.json();
      errText = errJson?.error?.message || errJson?.error_description || errText;
    } catch {}
    return NextResponse.json({ error: errText }, { status: res.status });
  }
  return NextResponse.json({ ok: true });
}

export async function PUT(req: Request) {
  const session = await getServerSession(authOptions);
  if (!(session as any)?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const compositeId = typeof body?.id === "string" ? body.id : "";
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const calendarIdComposite = typeof body?.calendarId === "string" ? body.calendarId.trim() : "";
  const startDate = body?.startDate;
  const endDate = body?.endDate; // inclusive, optional

  // Expected format: `${accountId}|${calendarId}:${eventId}`
  const [accAndCal, eventId] = compositeId.split(":");
  const [oldAccountId, oldCalendarId] = (accAndCal || "").split("|");
  if (!oldAccountId || !oldCalendarId || !eventId) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  if (!title) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }
  if (!calendarIdComposite.includes("|")) {
    return NextResponse.json({ error: "calendarId is required" }, { status: 400 });
  }
  if (!isIsoDateOnly(startDate)) {
    return NextResponse.json({ error: "startDate must be YYYY-MM-DD" }, { status: 400 });
  }
  if (endDate != null && !isIsoDateOnly(endDate)) {
    return NextResponse.json({ error: "endDate must be YYYY-MM-DD" }, { status: 400 });
  }
  if (isIsoDateOnly(endDate) && endDate < startDate) {
    return NextResponse.json({ error: "endDate must be on/after startDate" }, { status: 400 });
  }

  const [newAccountId, newCalendarId] = calendarIdComposite.split("|");
  if (!newAccountId || !newCalendarId) {
    return NextResponse.json({ error: "Invalid calendarId" }, { status: 400 });
  }

  const accounts = await mergeAccountsFromDbAndSession(
    (session as any).user.id as string,
    session as any
  );
  const oldAccount = accounts.find((a) => a.accountId === oldAccountId);
  const newAccount = accounts.find((a) => a.accountId === newAccountId);
  if (!oldAccount) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }
  if (!newAccount) {
    return NextResponse.json({ error: "New account not found" }, { status: 404 });
  }

  // Google all-day events require end.date to be exclusive.
  // UI sends endDate as inclusive; convert to exclusive.
  const endExclusive = addDaysIsoDateOnly(isIsoDateOnly(endDate) ? endDate : startDate, 1);

  // If moving to a different calendar, we need to delete from old and create in new
  const isMovingCalendar = oldAccountId !== newAccountId || oldCalendarId !== newCalendarId;

  if (isMovingCalendar) {
    // Delete from old calendar
    const deleteUrl = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
      oldCalendarId
    )}/events/${encodeURIComponent(eventId)}`;
    let deleteRes = await fetch(deleteUrl, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${oldAccount.accessToken}` },
      cache: "no-store",
    });
    if (deleteRes.status === 401 && oldAccount.refreshToken) {
      try {
        const refreshed = await refreshGoogleAccessToken(oldAccount.refreshToken);
        deleteRes = await fetch(deleteUrl, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${refreshed.accessToken}` },
          cache: "no-store",
        });
      } catch {}
    }
    if (!deleteRes.ok && deleteRes.status !== 204) {
      let errText = "Failed to delete event from old calendar";
      try {
        const errJson = await deleteRes.json();
        errText = errJson?.error?.message || errJson?.error_description || errText;
      } catch {}
      return NextResponse.json({ error: errText }, { status: deleteRes.status });
    }

    // Create in new calendar
    const createUrl = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
      newCalendarId
    )}/events`;
    const createRes = await fetch(createUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${newAccount.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        summary: title,
        start: { date: startDate },
        end: { date: endExclusive },
      }),
      cache: "no-store",
    });

    if (!createRes.ok) {
      let errText = "Failed to create event in new calendar";
      try {
        const errJson = await createRes.json();
        errText = errJson?.error?.message || errJson?.error_description || errText;
      } catch {}
      return NextResponse.json({ error: errText }, { status: createRes.status });
    }

    const created = await createRes.json();
    return NextResponse.json({
      event: {
        id: `${newAccountId}|${newCalendarId}:${created.id as string}`,
        calendarId: `${newAccountId}|${newCalendarId}`,
        summary: (created.summary as string) || title,
        startDate,
        endDate: endExclusive,
      },
    });
  } else {
    // Update in place
    const updateUrl = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
      oldCalendarId
    )}/events/${encodeURIComponent(eventId)}`;
    const updateRes = await fetch(updateUrl, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${oldAccount.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        summary: title,
        start: { date: startDate },
        end: { date: endExclusive },
      }),
      cache: "no-store",
    });

    if (updateRes.status === 401 && oldAccount.refreshToken) {
      try {
        const refreshed = await refreshGoogleAccessToken(oldAccount.refreshToken);
        const retryRes = await fetch(updateUrl, {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${refreshed.accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            summary: title,
            start: { date: startDate },
            end: { date: endExclusive },
          }),
          cache: "no-store",
        });
        if (!retryRes.ok) {
          let errText = "Failed to update event";
          try {
            const errJson = await retryRes.json();
            errText = errJson?.error?.message || errJson?.error_description || errText;
          } catch {}
          return NextResponse.json({ error: errText }, { status: retryRes.status });
        }
        const updated = await retryRes.json();
        return NextResponse.json({
          event: {
            id: compositeId,
            calendarId: `${oldAccountId}|${oldCalendarId}`,
            summary: (updated.summary as string) || title,
            startDate,
            endDate: endExclusive,
          },
        });
      } catch {}
    }

    if (!updateRes.ok) {
      let errText = "Failed to update event";
      try {
        const errJson = await updateRes.json();
        errText = errJson?.error?.message || errJson?.error_description || errText;
      } catch {}
      return NextResponse.json({ error: errText }, { status: updateRes.status });
    }

    const updated = await updateRes.json();
    return NextResponse.json({
      event: {
        id: compositeId,
        calendarId: `${oldAccountId}|${oldCalendarId}`,
        summary: (updated.summary as string) || title,
        startDate,
        endDate: endExclusive,
      },
    });
  }
}
