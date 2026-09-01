import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { initDb, prisma as defaultPrisma } from "./db.js";
import { seedPrisma } from "./seed.js";
import {
  authenticateRequest,
  checkRateLimit,
  executePasswordReset,
  loginUser,
  logoutUser,
  registerUser,
  requestPasswordReset,
  sanitizeUser
} from "./security.js";
import {
  analyticsSummary,
  createDispute,
  createJob,
  createPayment,
  createReview,
  createSosIncident,
  decorateJob,
  estimateWage,
  generateAiResponse,
  getOrCreateJobConversation,
  matchWorkers,
  publicUser,
  resolveDispute,
  resolveSosIncident,
  roleHome,
  sendMessage,
  statusError,
  transitionJob,
  updateWorkerProfile,
  visibleJobs,
  visibleWorkers
} from "./domain.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, "../public");
const stitchDir = path.resolve(__dirname, "../stitch_sahyog_worker_first_cooperative_marketplace");
const secret = process.env.SESSION_SECRET || "sahyog-production-secret-key-2026";

export function createServer(prisma = defaultPrisma) {
  return http.createServer(async (req, res) => {
    await handleRequest(prisma, req, res);
  });
}

export async function handleRequest(prisma, req, res) {
  try {
    const host = req.headers["x-forwarded-host"] || req.headers.host || "localhost";
    const proto = req.headers["x-forwarded-proto"] || "https";
    const rawUrl = req.headers["x-forwarded-uri"] || req.url || "/";
    const url = new URL(rawUrl, `${proto}://${host}`);

    if (url.pathname === "/api" || url.pathname.startsWith("/api/")) return await handleApi(prisma, req, res, url);
    return await serveStatic(req, res, url);
  } catch (error) {
    if (!error.status || error.status >= 500) {
      console.error("handleRequest error:", error);
    }
    json(res, error.status || 500, { ok: false, error: error.status ? error.message : "Unexpected server error" });
  }
}

async function handleApi(prisma, req, res, url) {
  const body = ["POST", "PUT", "PATCH", "DELETE"].includes(req.method) ? await readJson(req) : {};
  const auth = await authenticateRequest(prisma, req, secret);
  const openWrite = ["/api/auth/login", "/api/auth/register", "/api/auth/forgot-password", "/api/auth/reset-password"].includes(url.pathname);

  // Rate limiting for sensitive auth routes
  if (openWrite) {
    const clientIp = req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "local";
    if (!checkRateLimit(clientIp, 60, 60000)) {
      throw statusError(429, "Too many requests. Please try again in one minute.");
    }
  }

  if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method) && auth.user && !openWrite && req.headers["x-csrf-token"] !== auth.session?.csrfToken) {
    throw statusError(403, "Invalid CSRF token");
  }

  // 1. Authentication Endpoints
  if (req.method === "GET" && url.pathname === "/api/auth/me") {
    return json(res, 200, {
      ok: true,
      user: publicUser(auth.user),
      csrfToken: auth.session?.csrfToken || null,
      home: auth.user ? roleHome[auth.user.role] : "/"
    });
  }

  if (req.method === "POST" && url.pathname === "/api/auth/login") {
    const result = await loginUser(prisma, body.email, body.password, secret, req.headers["x-forwarded-proto"] === "https");
    res.setHeader("Set-Cookie", result.cookie);
    return json(res, 200, { ok: true, user: result.user, csrfToken: result.csrfToken, home: roleHome[result.user.role] || "/" });
  }

  if (req.method === "POST" && url.pathname === "/api/auth/register") {
    const newUser = await registerUser(prisma, body);
    return json(res, 201, { ok: true, user: newUser });
  }

  if (req.method === "POST" && url.pathname === "/api/auth/logout") {
    const cookieHeader = await logoutUser(prisma, auth.session?.id);
    res.setHeader("Set-Cookie", cookieHeader);
    return json(res, 200, { ok: true });
  }

  if (req.method === "POST" && url.pathname === "/api/auth/forgot-password") {
    const result = await requestPasswordReset(prisma, body.email);
    return json(res, 200, result);
  }

  if (req.method === "POST" && url.pathname === "/api/auth/reset-password") {
    const result = await executePasswordReset(prisma, body.token, body.password);
    return json(res, 200, result);
  }

  if (!auth.user) throw statusError(401, "Authentication required");
  const user = auth.user;

  // 2. Services & Wage Estimation
  if (req.method === "GET" && url.pathname === "/api/services") {
    const categories = await prisma.serviceCategory.findMany({ orderBy: { name: "asc" } });
    return json(res, 200, { ok: true, data: categories });
  }

  if (req.method === "POST" && url.pathname === "/api/wages/estimate") {
    const estimate = await estimateWage(prisma, body);
    return json(res, 200, { ok: true, data: estimate });
  }

  // 3. Workers Directory, Profile, & Verification
  if (req.method === "GET" && url.pathname === "/api/workers") {
    const workers = await visibleWorkers(prisma, user);
    return json(res, 200, { ok: true, data: workers });
  }

  if (req.method === "PUT" && url.pathname === "/api/workers/profile") {
    const updated = await updateWorkerProfile(prisma, user, body);
    return json(res, 200, { ok: true, data: updated });
  }

  const workerVerifyRoute = url.pathname.match(/^\/api\/workers\/([^/]+)\/verify$/);
  if (req.method === "PATCH" && workerVerifyRoute) {
    requireStaff(user);
    const workerTarget = workerVerifyRoute[1];
    const newStatus = body.status === "VERIFIED" ? "VERIFIED" : "PENDING";
    const profile = await prisma.workerProfile.findFirst({
      where: { OR: [{ id: workerTarget }, { userId: workerTarget }] }
    });
    if (!profile) throw statusError(404, "Worker profile not found");
    const updated = await prisma.workerProfile.update({
      where: { id: profile.id },
      data: { verificationStatus: newStatus }
    });
    return json(res, 200, { ok: true, data: updated });
  }

  // 4. Jobs & Matching
  if (req.method === "GET" && url.pathname === "/api/jobs") {
    const jobs = await visibleJobs(prisma, user);
    return json(res, 200, { ok: true, data: jobs });
  }

  const singleJobRoute = url.pathname.match(/^\/api\/jobs\/([^/]+)$/);
  if (req.method === "GET" && singleJobRoute) {
    const job = await prisma.job.findUnique({ where: { id: singleJobRoute[1] } });
    if (!job) throw statusError(404, "Job not found");
    if (!canReadJob(user, job)) throw statusError(403, "Access denied to this job");
    const decorated = await decorateJob(prisma, job);
    return json(res, 200, { ok: true, data: decorated });
  }

  if (req.method === "POST" && url.pathname === "/api/jobs") {
    const created = await createJob(prisma, user, body);
    return json(res, 201, { ok: true, data: created });
  }

  const transitionMatch = url.pathname.match(/^\/api\/jobs\/([^/]+)\/transition$/);
  if (req.method === "POST" && transitionMatch) {
    const transitioned = await transitionJob(prisma, user, transitionMatch[1], body.status, body);
    return json(res, 200, { ok: true, data: transitioned });
  }

  const matchRoute = url.pathname.match(/^\/api\/matching\/jobs\/([^/]+)$/);
  if (req.method === "GET" && matchRoute) {
    const matches = await matchWorkers(prisma, matchRoute[1], user);
    return json(res, 200, { ok: true, data: matches });
  }

  // 5. Reviews
  if (req.method === "POST" && url.pathname === "/api/reviews") {
    const review = await createReview(prisma, user, body);
    return json(res, 201, { ok: true, data: review });
  }

  const workerReviewRoute = url.pathname.match(/^\/api\/reviews\/worker\/([^/]+)$/);
  if (req.method === "GET" && workerReviewRoute) {
    const reviews = await prisma.review.findMany({
      where: { workerId: workerReviewRoute[1] },
      orderBy: { createdAt: "desc" }
    });
    return json(res, 200, { ok: true, data: reviews });
  }

  // 6. Payments
  if (req.method === "POST" && url.pathname === "/api/payments") {
    const payment = await createPayment(prisma, user, body);
    return json(res, 201, { ok: true, data: payment });
  }

  if (req.method === "GET" && url.pathname === "/api/payments") {
    let where = {};
    if (user.role === "CUSTOMER") where = { payerId: user.id };
    else if (user.role === "WORKER") where = { workerId: user.id };

    const payments = await prisma.payment.findMany({
      where,
      orderBy: { createdAt: "desc" }
    });
    return json(res, 200, { ok: true, data: payments });
  }

  // 7. Direct Messaging
  const jobMessageRoute = url.pathname.match(/^\/api\/messages\/jobs\/([^/]+)$/);
  if (req.method === "GET" && jobMessageRoute) {
    const conversation = await getOrCreateJobConversation(prisma, user, jobMessageRoute[1]);
    return json(res, 200, { ok: true, data: conversation });
  }

  if (req.method === "POST" && url.pathname === "/api/messages") {
    const message = await sendMessage(prisma, user, body);
    return json(res, 201, { ok: true, data: message });
  }

  // 8. Notifications
  if (req.method === "GET" && url.pathname === "/api/notifications") {
    const [notifications, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" }
      }),
      prisma.notification.count({
        where: { userId: user.id, read: false }
      })
    ]);
    return json(res, 200, { ok: true, data: notifications, unreadCount });
  }

  if (req.method === "POST" && url.pathname === "/api/notifications/read") {
    await prisma.notification.updateMany({
      where: { userId: user.id, read: false },
      data: { read: true }
    });
    return json(res, 200, { ok: true });
  }

  // 9. Welfare & Training
  if (req.method === "GET" && url.pathname === "/api/welfare") {
    const schemes = await prisma.welfareScheme.findMany();
    const applications = await prisma.welfareApplication.findMany({ where: { userId: user.id } });
    return json(res, 200, { ok: true, data: { schemes, applications } });
  }

  if (req.method === "POST" && url.pathname === "/api/welfare/apply") {
    if (user.role !== "WORKER") throw statusError(403, "Only workers can apply for welfare schemes");
    const app = await prisma.welfareApplication.create({
      data: { schemeId: body.schemeId, userId: user.id, status: "SUBMITTED" }
    });
    return json(res, 201, { ok: true, data: app });
  }

  if (req.method === "GET" && url.pathname === "/api/training") {
    const programs = await prisma.trainingProgram.findMany();
    const enrollments = await prisma.trainingEnrollment.findMany({ where: { userId: user.id } });
    return json(res, 200, { ok: true, data: { programs, enrollments } });
  }

  if (req.method === "POST" && url.pathname === "/api/training/enroll") {
    if (user.role !== "WORKER") throw statusError(403, "Only workers can enroll in training");
    const enr = await prisma.trainingEnrollment.create({
      data: { programId: body.programId, userId: user.id, status: "ENROLLED" }
    });
    return json(res, 201, { ok: true, data: enr });
  }

  // 10. SOS & Disputes
  if (req.method === "GET" && url.pathname === "/api/sos") {
    let where = {};
    if (user.role === "WORKER") where = { userId: user.id };
    const incidents = await prisma.sosIncident.findMany({ where, orderBy: { createdAt: "desc" } });
    return json(res, 200, { ok: true, data: incidents });
  }

  if (req.method === "POST" && url.pathname === "/api/sos") {
    const incident = await createSosIncident(prisma, user, body);
    return json(res, 201, { ok: true, data: incident });
  }

  const sosResolveRoute = url.pathname.match(/^\/api\/sos\/([^/]+)\/resolve$/);
  if (req.method === "POST" && sosResolveRoute) {
    requireStaff(user);
    const resolved = await resolveSosIncident(prisma, user, sosResolveRoute[1]);
    return json(res, 200, { ok: true, data: resolved });
  }

  if (req.method === "GET" && url.pathname === "/api/disputes") {
    const disputes = await prisma.dispute.findMany({ orderBy: { createdAt: "desc" } });
    return json(res, 200, { ok: true, data: disputes });
  }

  if (req.method === "POST" && url.pathname === "/api/disputes") {
    const dispute = await createDispute(prisma, user, body);
    return json(res, 201, { ok: true, data: dispute });
  }

  const disputeResolveRoute = url.pathname.match(/^\/api\/disputes\/([^/]+)\/resolve$/);
  if (req.method === "POST" && disputeResolveRoute) {
    requireStaff(user);
    const resolved = await resolveDispute(prisma, user, disputeResolveRoute[1], body.resolution);
    return json(res, 200, { ok: true, data: resolved });
  }

  // 11. Dynamic Analytics & AI Assistant
  if (req.method === "GET" && url.pathname === "/api/analytics/summary") {
    const summary = await analyticsSummary(prisma, user);
    return json(res, 200, { ok: true, data: summary });
  }

  if (req.method === "GET" && url.pathname === "/api/ai/conversations") {
    const conv = await prisma.aiConversation.findFirst({
      where: { userId: user.id },
      include: { messages: { orderBy: { createdAt: "asc" } } }
    });
    return json(res, 200, { ok: true, data: { messages: conv?.messages || [] } });
  }

  if (req.method === "POST" && url.pathname === "/api/ai/conversations") {
    const reply = await generateAiResponse(prisma, user, body.message);
    const conv = await prisma.aiConversation.findFirst({
      where: { userId: user.id },
      include: { messages: { orderBy: { createdAt: "asc" } } }
    });
    return json(res, 201, { ok: true, data: { messages: conv?.messages || [] } });
  }

  // 12. Settings
  if (req.method === "GET" && url.pathname === "/api/settings") {
    const setting = await prisma.userSetting.findUnique({ where: { userId: user.id } });
    return json(res, 200, { ok: true, data: setting || { notifications: {}, privacy: {} } });
  }

  if (req.method === "PUT" && url.pathname === "/api/settings") {
    const updated = await prisma.userSetting.upsert({
      where: { userId: user.id },
      update: {
        notifications: body.notifications || undefined,
        privacy: body.privacy || undefined
      },
      create: {
        userId: user.id,
        notifications: body.notifications || {},
        privacy: body.privacy || {}
      }
    });

    if (body.workerPreferences && user.role === "WORKER") {
      const profile = await prisma.workerProfile.findFirst({
        where: { userId: user.id }
      });
      if (profile) {
        await prisma.workerProfile.update({
          where: { id: profile.id },
          data: {
            availabilityStatus: body.workerPreferences.availabilityStatus || undefined,
            serviceRadiusKm: body.workerPreferences.serviceRadiusKm ? Number(body.workerPreferences.serviceRadiusKm) : undefined
          }
        }).catch(() => {});
      }
    }

    return json(res, 200, { ok: true, data: updated });
  }

  throw statusError(404, "API endpoint not found");
}

function requireStaff(user) {
  if (!["COOPERATIVE_EMPLOYEE", "COOPERATIVE_ADMIN", "FEDERATION_ADMIN", "SUPER_ADMIN"].includes(user.role)) {
    throw statusError(403, "Administrator or Employee privileges required");
  }
}

async function serveStatic(req, res, url) {
  const cleanPath = url.pathname === "/" ? "/index.html" : url.pathname;
  let targetPath = path.join(publicDir, cleanPath);

  try {
    const stat = await fs.stat(targetPath);
    if (stat.isDirectory()) targetPath = path.join(targetPath, "index.html");
  } catch {
    targetPath = path.join(publicDir, "index.html");
  }

  const ext = path.extname(targetPath).toLowerCase();
  const types = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".svg": "image/svg+xml"
  };

  try {
    const data = await fs.readFile(targetPath);
    res.writeHead(200, {
      "Content-Type": types[ext] || "application/octet-stream",
      "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=3600"
    });
    res.end(data);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not Found");
  }
}

async function readJson(req) {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve({});
      }
    });
  });
}

function json(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(payload));
}

const port = Number(process.env.PORT || 3000);

if (process.argv[1] && process.argv[1].endsWith("server.js")) {
  const db = await initDb();
  await seedPrisma(db);
  const server = createServer(db);
  server.listen(port, () => {
    console.log(`SAHYOG PostgreSQL Server running at http://localhost:${port}`);
  });
}
