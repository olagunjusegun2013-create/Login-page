import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import express from "express";
import type { Request, Response } from "express";

interface StoredUser {
  id: string;
  name: string;
  email: string;
  phone: string;
  passwordSalt: string;
  passwordHash: string;
  createdAt: string;
}

interface StoredSession {
  token: string;
  userId: string;
  expiresAt: number;
}

interface AuthStore {
  users: StoredUser[];
  sessions: StoredSession[];
}

const PORT = 3000;
const DATA_DIR = path.resolve(process.cwd(), ".data");
const STORE_PATH = path.join(DATA_DIR, "auth-store.json");
const SESSION_COOKIE_NAME = "auth_session";
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_CHARS_REGEX = /^[+]?[\d\s().-]+$/;

function readStore(): AuthStore {
  try {
    if (!fs.existsSync(STORE_PATH)) {
      return { users: [], sessions: [] };
    }
    const raw = fs.readFileSync(STORE_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<AuthStore>;
    return {
      users: Array.isArray(parsed.users) ? parsed.users : [],
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
    };
  } catch {
    return { users: [], sessions: [] };
  }
}

function writeStore(store: AuthStore): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const now = Date.now();
  const activeSessions = store.sessions.filter((s) => s.expiresAt > now);
  fs.writeFileSync(
    STORE_PATH,
    JSON.stringify({ users: store.users, sessions: activeSessions }, null, 2),
    "utf8"
  );
}

function hashPassword(password: string, salt: string): string {
  return crypto.scryptSync(password, salt, 64).toString("hex");
}

function verifyPassword(password: string, salt: string, expectedHash: string): boolean {
  const actualBuffer = Buffer.from(hashPassword(password, salt), "hex");
  const expectedBuffer = Buffer.from(expectedHash, "hex");
  if (actualBuffer.length !== expectedBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  if (!cookieHeader) {
    return result;
  }
  const pairs = cookieHeader.split(";");
  for (const pair of pairs) {
    const idx = pair.indexOf("=");
    if (idx === -1) continue;
    const key = pair.slice(0, idx).trim();
    const val = pair.slice(idx + 1).trim();
    if (key) {
      result[key] = decodeURIComponent(val);
    }
  }
  return result;
}

function isHttpsRequest(req: Request): boolean {
  const forwardedProto = req.headers["x-forwarded-proto"];
  if (typeof forwardedProto === "string") {
    return forwardedProto.split(",")[0].trim() === "https";
  }
  return req.secure;
}

function setSessionCookie(req: Request, res: Response, token: string, rememberMe: boolean): void {
  const secure = isHttpsRequest(req);
  res.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: secure ? "none" : "lax",
    secure,
    path: "/",
    ...(rememberMe ? { maxAge: 30 * 24 * 60 * 60 * 1000 } : {}),
  });
}

function clearSessionCookie(req: Request, res: Response): void {
  const secure = isHttpsRequest(req);
  res.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    sameSite: secure ? "none" : "lax",
    secure,
    path: "/",
  });
}

function validatePasswordStrength(password: string): string {
  if (password.length === 0) return "Password is required.";
  if (password.length < 8) return "Password must be at least 8 characters long.";
  if (!/[A-Z]/.test(password)) return "Password must include at least one uppercase letter.";
  if (!/[a-z]/.test(password)) return "Password must include at least one lowercase letter.";
  if (!/\d/.test(password)) return "Password must include at least one number.";
  if (!/[^A-Za-z0-9\s]/.test(password)) {
    return "Password must include at least one special character (e.g., !@#$%).";
  }
  return "";
}

async function startServer(): Promise<void> {
  const app = express();
  app.set("trust proxy", 1);
  app.use(express.json());

  // Check active session
  app.get("/api/me", (req: Request, res: Response) => {
    const cookies = parseCookies(req.headers.cookie);
    const token = cookies[SESSION_COOKIE_NAME];
    if (!token) {
      res.status(401).json({ user: null });
      return;
    }

    const store = readStore();
    const now = Date.now();
    const session = store.sessions.find((s) => s.token === token && s.expiresAt > now);
    if (!session) {
      clearSessionCookie(req, res);
      res.status(401).json({ user: null });
      return;
    }

    const user = store.users.find((u) => u.id === session.userId);
    if (!user) {
      clearSessionCookie(req, res);
      res.status(401).json({ user: null });
      return;
    }

    res.json({
      user: {
        name: user.name,
        email: user.email,
        phone: user.phone,
      },
    });
  });

  // Register a new account
  app.post("/api/register", (req: Request, res: Response) => {
    const body = req.body as Record<string, unknown>;
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const emailRaw = typeof body.email === "string" ? body.email.trim() : "";
    const email = emailRaw.toLowerCase();
    const phone = typeof body.phone === "string" ? body.phone.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const confirmPassword = typeof body.confirmPassword === "string" ? body.confirmPassword : "";

    const fieldErrors: Record<string, string> = {};

    if (!name) {
      fieldErrors.name = "Name is required. Please enter your name.";
    }

    if (!emailRaw) {
      fieldErrors.email = "Email address is required.";
    } else if (!EMAIL_REGEX.test(emailRaw)) {
      fieldErrors.email = "Please enter a valid email address (e.g., name@example.com).";
    }

    if (!phone) {
      fieldErrors.phone = "Phone number is required.";
    } else if (!PHONE_CHARS_REGEX.test(phone)) {
      fieldErrors.phone =
        "Phone number can only contain digits, spaces, parentheses, hyphens, or a leading +.";
    } else {
      const digitsOnly = phone.replace(/\D/g, "");
      if (digitsOnly.length < 10 || digitsOnly.length > 15) {
        fieldErrors.phone = "Please enter a valid phone number containing 10 to 15 digits.";
      }
    }

    const passwordError = validatePasswordStrength(password);
    if (passwordError) {
      fieldErrors.password = passwordError;
    }

    if (!confirmPassword) {
      fieldErrors.confirmPassword = "Please confirm your password.";
    } else if (confirmPassword !== password) {
      fieldErrors.confirmPassword = "Passwords do not match.";
    }

    if (Object.keys(fieldErrors).length > 0) {
      res.status(400).json({
        error: "Please fix the highlighted fields before continuing.",
        fieldErrors,
      });
      return;
    }

    const store = readStore();
    const existing = store.users.find((u) => u.email === email);
    if (existing) {
      res.status(409).json({
        error: "An account with this email address already exists. Try signing in instead.",
        fieldErrors: {
          email: "This email address is already registered.",
        },
      });
      return;
    }

    const salt = crypto.randomBytes(16).toString("hex");
    const newUser: StoredUser = {
      id: crypto.randomUUID(),
      name,
      email,
      phone,
      passwordSalt: salt,
      passwordHash: hashPassword(password, salt),
      createdAt: new Date().toISOString(),
    };

    const token = crypto.randomBytes(32).toString("hex");
    store.users.push(newUser);
    store.sessions.push({
      token,
      userId: newUser.id,
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
    });
    writeStore(store);

    setSessionCookie(req, res, token, false);
    res.status(201).json({
      user: {
        name: newUser.name,
        email: newUser.email,
        phone: newUser.phone,
      },
    });
  });

  // Sign in to an existing account
  app.post("/api/login", (req: Request, res: Response) => {
    const body = req.body as Record<string, unknown>;
    const emailRaw = typeof body.email === "string" ? body.email.trim() : "";
    const email = emailRaw.toLowerCase();
    const password = typeof body.password === "string" ? body.password : "";
    const rememberMe = Boolean(body.rememberMe);

    const fieldErrors: Record<string, string> = {};
    if (!emailRaw) {
      fieldErrors.email = "Email address is required.";
    } else if (!EMAIL_REGEX.test(emailRaw)) {
      fieldErrors.email = "Please enter a valid email address (e.g., name@example.com).";
    }

    if (!password) {
      fieldErrors.password = "Password is required.";
    }

    if (Object.keys(fieldErrors).length > 0) {
      res.status(400).json({
        error: "Please fix the highlighted fields before signing in.",
        fieldErrors,
      });
      return;
    }

    const store = readStore();
    const user = store.users.find((u) => u.email === email);
    if (!user || !verifyPassword(password, user.passwordSalt, user.passwordHash)) {
      res.status(401).json({
        error: "Invalid email or password. Please check your credentials and try again.",
      });
      return;
    }

    const token = crypto.randomBytes(32).toString("hex");
    const ttlMs = rememberMe ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
    store.sessions.push({
      token,
      userId: user.id,
      expiresAt: Date.now() + ttlMs,
    });
    writeStore(store);

    setSessionCookie(req, res, token, rememberMe);
    res.json({
      user: {
        name: user.name,
        email: user.email,
        phone: user.phone,
      },
    });
  });

  // Password reset request
  app.post("/api/forgot-password", (req: Request, res: Response) => {
    const body = req.body as Record<string, unknown>;
    const emailRaw = typeof body.email === "string" ? body.email.trim() : "";

    if (!emailRaw) {
      res.status(400).json({
        error: "Please enter your email address to request a password reset.",
        fieldErrors: { resetEmail: "Email address is required." },
      });
      return;
    }

    if (!EMAIL_REGEX.test(emailRaw)) {
      res.status(400).json({
        error: "Please enter a valid email address.",
        fieldErrors: { resetEmail: "Please enter a valid email address (e.g., name@example.com)." },
      });
      return;
    }

    res.json({
      message: `If an account exists for ${emailRaw}, password reset instructions have been sent.`,
    });
  });

  // Sign out
  app.post("/api/logout", (req: Request, res: Response) => {
    const cookies = parseCookies(req.headers.cookie);
    const token = cookies[SESSION_COOKIE_NAME];
    if (token) {
      const store = readStore();
      store.sessions = store.sessions.filter((s) => s.token !== token);
      writeStore(store);
    }
    clearSessionCookie(req, res);
    res.json({ ok: true });
  });

  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), "dist");
    app.use(express.static(distDir));
    app.get("*all", (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
