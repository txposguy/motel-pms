import "server-only";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

const COOKIE_NAME = "hk_session";

export async function setHousekeeperSession(userId: string) {
  const store = await cookies();
  store.set(COOKIE_NAME, userId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12, // 12 hours — a shift, roughly
  });
}

export async function clearHousekeeperSession() {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

// Re-verifies the cookie against the database on every read (not just at
// login) — a tampered or stale cookie referencing a deactivated user or the
// wrong property should never silently keep working.
export async function getHousekeeperSession(propertyId: string) {
  const store = await cookies();
  const userId = store.get(COOKIE_NAME)?.value;
  if (!userId) return null;

  const user = await prisma.user.findFirst({
    where: { id: userId, propertyId, role: "housekeeper", active: true },
  });
  return user;
}
