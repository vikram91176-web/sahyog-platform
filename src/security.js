import crypto from "node:crypto";

const ITERATIONS = 120000;
const KEY_LENGTH = 32;
const DIGEST = "sha256";

export function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, DIGEST).toString("hex");
  return `pbkdf2$${ITERATIONS}$${salt}$${hash}`;
}

export function verifyPassword(password, stored) {
  const [kind, iterations, salt, originalHash] = String(stored).split("$");
  if (kind !== "pbkdf2" || !iterations || !salt || !originalHash) return false;
  const hash = crypto.pbkdf2Sync(password, salt, Number(iterations), KEY_LENGTH, DIGEST);
  const original = Buffer.from(originalHash, "hex");
  return original.length === hash.length && crypto.timingSafeEqual(original, hash);
}

export function randomId(prefix = "id") {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

export function sign(value, secret) {
  return crypto.createHmac("sha256", secret).update(value).digest("hex");
}

export function parseCookies(header = "") {
  return Object.fromEntries(
    header
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=");
        return [decodeURIComponent(part.slice(0, index)), decodeURIComponent(part.slice(index + 1))];
      })
  );
}

export function createSessionCookie(sessionId, secret, secure = false) {
  const value = `${sessionId}.${sign(sessionId, secret)}`;
  const attrs = ["HttpOnly", "Path=/", "SameSite=Lax", "Max-Age=604800"];
  if (secure) attrs.push("Secure");
  return `sahyog_session=${encodeURIComponent(value)}; ${attrs.join("; ")}`;
}

export function readSignedSession(cookieValue, secret) {
  if (!cookieValue) return null;
  const [sessionId, signature] = decodeURIComponent(cookieValue).split(".");
  if (!sessionId || !signature) return null;
  return sign(sessionId, secret) === signature ? sessionId : null;
}

export function sanitizeUser(user) {
  if (!user) return null;
  const { passwordHash, ...safe } = user;
  return safe;
}

export async function registerUser(prisma, data) {
  const email = String(data.email || "").toLowerCase().trim();
  if (!email || !data.password || !data.name) {
    const err = new Error("Name, email, and password are required");
    err.status = 400;
    throw err;
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    const err = new Error("An account with this email already exists");
    err.status = 409;
    throw err;
  }

  const role = data.role === "CUSTOMER" ? "CUSTOMER"
    : data.role === "COOPERATIVE_EMPLOYEE" ? "COOPERATIVE_EMPLOYEE"
    : "WORKER";

  const passwordHash = hashPassword(data.password);
  const coop = await prisma.cooperative.findFirst();

  const user = await prisma.user.create({
    data: {
      email,
      name: String(data.name).trim(),
      mobile: String(data.mobile || "").trim(),
      passwordHash,
      role,
      accountStatus: "ACTIVE",
      cooperativeId: coop?.id || null
    }
  });

  if (role === "CUSTOMER") {
    await prisma.customerProfile.create({
      data: {
        userId: user.id,
        location: String(data.location || "Noida Sector 62"),
        savedAddresses: [String(data.location || "Noida Sector 62")]
      }
    });
  } else if (role === "WORKER") {
    const workerCode = `WKR-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
    const profile = await prisma.workerProfile.create({
      data: {
        userId: user.id,
        cooperativeId: coop?.id || "coop_default",
        workerCode,
        location: String(data.location || "Noida Sector 62"),
        serviceRadiusKm: 15,
        yearsExperience: Number(data.yearsExperience || 2),
        rating: 5.0,
        completedJobs: 0,
        verificationStatus: "PENDING",
        availabilityStatus: "AVAILABLE",
        languages: ["Hindi", "English"]
      }
    });

    // Assign default skill if available
    const skill = await prisma.skill.findFirst();
    if (skill) {
      await prisma.workerSkill.create({
        data: {
          workerId: profile.id,
          skillId: skill.id
        }
      }).catch(() => {});
    }
  } else if (role === "COOPERATIVE_EMPLOYEE") {
    const employeeCode = `EMP-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
    await prisma.employeeProfile.create({
      data: {
        userId: user.id,
        cooperativeId: coop?.id || null,
        employeeCode,
        department: "Operations",
        designation: "Cooperative Coordinator"
      }
    });
  }

  // Create default settings
  await prisma.userSetting.create({
    data: {
      userId: user.id,
      notifications: { jobs: true, payments: true, safety: true },
      privacy: { showExactLocation: true }
    }
  }).catch(() => {});

  // Welcome notification
  await prisma.notification.create({
    data: {
      userId: user.id,
      title: "Welcome to SAHYOG Platform",
      body: `Welcome ${user.name}! Your ${role.toLowerCase().replace(/_/g, " ")} account is registered.`,
      type: "INFO"
    }
  }).catch(() => {});

  return sanitizeUser(user);
}

export async function loginUser(prisma, email, password, secret, secure = false) {
  const normalized = String(email || "").toLowerCase().trim();
  const user = await prisma.user.findUnique({
    where: { email: normalized },
    include: {
      workerProfile: true,
      customerProfile: true,
      employeeProfile: true
    }
  });

  if (!user || !verifyPassword(password, user.passwordHash)) {
    const err = new Error("Invalid email address or password");
    err.status = 401;
    throw err;
  }

  const csrfToken = randomId("csrf");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  const session = await prisma.session.create({
    data: {
      userId: user.id,
      csrfToken,
      expiresAt
    }
  });

  const cookie = createSessionCookie(session.id, secret, secure);
  return {
    user: sanitizeUser(user),
    csrfToken,
    cookie
  };
}

export async function authenticateRequest(prisma, req, secret) {
  const cookies = parseCookies(req.headers.cookie);
  const rawSession = cookies.sahyog_session;
  if (!rawSession) return { user: null, session: null };

  const sessionId = readSignedSession(rawSession, secret);
  if (!sessionId) return { user: null, session: null };

  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      user: {
        include: {
          workerProfile: true,
          customerProfile: true,
          employeeProfile: true
        }
      }
    }
  });

  if (!session || new Date(session.expiresAt) < new Date()) {
    if (session) {
      await prisma.session.delete({ where: { id: sessionId } }).catch(() => {});
    }
    return { user: null, session: null };
  }

  return {
    user: sanitizeUser(session.user),
    session
  };
}

export async function logoutUser(prisma, sessionId) {
  if (sessionId) {
    await prisma.session.delete({ where: { id: sessionId } }).catch(() => {});
  }
  return `sahyog_session=; Path=/; HttpOnly; Max-Age=0`;
}

export async function requestPasswordReset(prisma, email) {
  const normalized = String(email || "").toLowerCase().trim();
  if (!normalized) {
    const err = new Error("Email address is required");
    err.status = 400;
    throw err;
  }

  const user = await prisma.user.findUnique({ where: { email: normalized } });
  if (!user) {
    const err = new Error("No account found with this email address");
    err.status = 404;
    throw err;
  }

  const token = randomId("rst");
  await prisma.passwordReset.create({
    data: {
      userId: user.id,
      token
    }
  });

  return {
    ok: true,
    token,
    message: "Password reset token generated. Submit this token along with your new password to complete the reset."
  };
}

export async function executePasswordReset(prisma, token, newPassword) {
  if (!token || !newPassword) {
    const err = new Error("Reset token and new password are required");
    err.status = 400;
    throw err;
  }

  if (String(newPassword).length < 8) {
    const err = new Error("Password must be at least 8 characters long");
    err.status = 400;
    throw err;
  }

  const resetRecord = await prisma.passwordReset.findUnique({ where: { token } });
  if (!resetRecord || resetRecord.usedAt) {
    const err = new Error("Invalid or already used password reset token");
    err.status = 400;
    throw err;
  }

  // Verify expiry (24 hours)
  const ageMs = Date.now() - new Date(resetRecord.createdAt).getTime();
  if (ageMs > 24 * 60 * 60 * 1000) {
    const err = new Error("Password reset token has expired");
    err.status = 400;
    throw err;
  }

  const newHash = hashPassword(newPassword);
  await prisma.user.update({
    where: { id: resetRecord.userId },
    data: { passwordHash: newHash }
  });

  await prisma.passwordReset.update({
    where: { id: resetRecord.id },
    data: { usedAt: new Date() }
  });

  // Terminate all existing sessions for security
  await prisma.session.deleteMany({ where: { userId: resetRecord.userId } }).catch(() => {});

  return {
    ok: true,
    message: "Password has been successfully updated. You may now log in with your new password."
  };
}

const rateLimitMap = new Map();
export function checkRateLimit(key, limit = 30, windowMs = 60000) {
  const current = rateLimitMap.get(key) || { count: 0, resetAt: Date.now() + windowMs };
  if (Date.now() > current.resetAt) {
    current.count = 1;
    current.resetAt = Date.now() + windowMs;
  } else {
    current.count += 1;
  }
  rateLimitMap.set(key, current);
  return current.count <= limit;
}
