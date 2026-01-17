import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  console.log("Disconnect API - session user:", (session as any)?.user);
  if (!(session as any)?.user?.id) {
    console.log("Disconnect API - no authenticated user");
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  try {
    const { accountId } = await req.json();
    console.log("Disconnect API - disconnecting accountId:", accountId, "for user:", (session as any).user.id);
    if (!accountId || typeof accountId !== "string") {
      console.log("Disconnect API - missing accountId");
      return NextResponse.json({ ok: false, error: "Missing accountId" }, { status: 400 });
    }
    // Only delete if the account belongs to this user
    const deleteResult = await prisma.account.deleteMany({
      where: {
        userId: (session as any).user.id as string,
        providerAccountId: accountId,
      },
    });
    console.log("Disconnect API - deleted", deleteResult.count, "accounts");
    return NextResponse.json({ ok: true, deleted: deleteResult.count });
  } catch (e) {
    console.error("Disconnect API - error:", e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
