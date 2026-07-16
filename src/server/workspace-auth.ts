import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const WORKSPACE_SESSION_COOKIE = "story_workspace_session";

export function safeTokenEqual(received: string, expected: string): boolean {
  const left = createHash("sha256").update(received).digest();
  const right = createHash("sha256").update(expected).digest();
  return left.length === right.length && timingSafeEqual(left, right);
}

type Session = { id: string; csrf: string; expiresAt: number };

export class WorkspaceSessionManager {
  private readonly sessions = new Map<string, Session>();
  constructor(private readonly ttlMs = 8 * 60 * 60 * 1_000) {}

  create(now = Date.now()): Session {
    this.cleanup(now);
    const session = { id: randomBytes(32).toString("base64url"), csrf: randomBytes(24).toString("base64url"), expiresAt: now + this.ttlMs };
    this.sessions.set(session.id, session);
    return session;
  }

  verify(id: string | undefined, csrf: string | null, now = Date.now()): boolean {
    if (!id || !csrf) return false;
    const session = this.sessions.get(id);
    if (!session || session.expiresAt < now || !safeTokenEqual(csrf, session.csrf)) {
      if (session?.expiresAt && session.expiresAt < now) this.sessions.delete(id);
      return false;
    }
    return true;
  }

  has(id: string | undefined, now = Date.now()): boolean {
    if (!id) return false;
    const session = this.sessions.get(id);
    if (!session || session.expiresAt < now) { this.sessions.delete(id); return false; }
    return true;
  }

  revoke(id: string | undefined): void { if (id) this.sessions.delete(id); }
  private cleanup(now: number): void { for (const [id, value] of this.sessions) if (value.expiresAt < now) this.sessions.delete(id); }
}

export class LoginRateLimiter {
  private readonly failures = new Map<string, { count: number; resetAt: number }>();
  constructor(private readonly limit = 5, private readonly windowMs = 15 * 60 * 1_000) {}
  canAttempt(key: string, now = Date.now()): boolean {
    const entry = this.failures.get(key);
    if (!entry || entry.resetAt < now) { this.failures.delete(key); return true; }
    return entry.count < this.limit;
  }
  fail(key: string, now = Date.now()): void {
    const entry = this.failures.get(key);
    this.failures.set(key, !entry || entry.resetAt < now ? { count: 1, resetAt: now + this.windowMs } : { ...entry, count: entry.count + 1 });
  }
  clear(key: string): void { this.failures.delete(key); }
}

export function isAllowedWorkspaceOrigin(origin: string | null, applicationOrigin: string, allowlist: string[]): boolean {
  if (!origin) return true;
  return origin === applicationOrigin || allowlist.includes(origin);
}

export const workspaceSessions = new WorkspaceSessionManager();
export const workspaceLoginLimiter = new LoginRateLimiter();
