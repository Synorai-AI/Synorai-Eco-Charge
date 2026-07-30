import { randomUUID } from "node:crypto";
import db from "../db.server";

/**
 * "Notify me when EHF rates change" list, collected on the public /rates page.
 *
 * CASL notes (this list is Canadian business contacts, so it matters):
 *  - Consent is express: the visitor types their own address and submits.
 *  - `unsubscribeToken` powers a one-click unsubscribe link that must appear
 *    in every message sent to this list, together with Synorai's mailing
 *    address. Both are legal requirements, not niceties.
 *  - We store the address and nothing else. No name, no IP, no user agent.
 */

// Deliberately loose: the goal is to catch typos and junk, not to police
// every exotic-but-legal address. Real validation is the first send.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const MAX_EMAIL_LENGTH = 254; // RFC 5321

export type SubscribeResult = {
  ok: boolean;
  message: string;
};

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return email.length <= MAX_EMAIL_LENGTH && EMAIL_RE.test(email);
}

function sanitizeSrc(raw: string | null): string {
  if (!raw) return "direct";
  const cleaned = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 24);
  return cleaned || "direct";
}

/**
 * Idempotent subscribe. Re-subscribing an address that previously opted out
 * clears `unsubscribedAt` — the visitor is asking to come back.
 *
 * The success message is identical whether the address was new or already on
 * the list, so the form can't be used to test whether someone is subscribed.
 */
export async function subscribeToRateAlerts(
  rawEmail: string,
  rawSrc: string | null,
): Promise<SubscribeResult> {
  const email = normalizeEmail(rawEmail);

  if (!email) {
    return { ok: false, message: "Enter an email address." };
  }
  if (!isValidEmail(email)) {
    return { ok: false, message: "That doesn't look like a valid email address." };
  }

  const src = sanitizeSrc(rawSrc);

  try {
    await db.rateAlertSubscriber.upsert({
      where: { email },
      create: { email, src, unsubscribeToken: randomUUID() },
      update: { unsubscribedAt: null },
    });
  } catch (error) {
    console.error("[rate-alerts] subscribe failed", error);
    return {
      ok: false,
      message:
        "Something went wrong saving that. Try again, or email support@synorai.ai.",
    };
  }

  return {
    ok: true,
    message:
      "You're on the list. We'll email you when a province changes its EHF schedule.",
  };
}

/**
 * Token-based unsubscribe. Returns false for an unknown token so the caller
 * can show an honest "we couldn't find that" rather than a false success.
 */
export async function unsubscribeByToken(token: string): Promise<boolean> {
  const clean = token.trim();
  if (!clean) return false;

  try {
    await db.rateAlertSubscriber.update({
      where: { unsubscribeToken: clean },
      data: { unsubscribedAt: new Date() },
    });
    return true;
  } catch {
    // Prisma throws when no row matches the token.
    return false;
  }
}

export async function getSubscriberCount(): Promise<number> {
  return db.rateAlertSubscriber.count({ where: { unsubscribedAt: null } });
}
