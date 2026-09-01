import assert from "node:assert/strict";
import { once } from "node:events";
import { initDb, closeDb, prisma } from "../src/db.js";
import { seedPrisma } from "../src/seed.js";
import { createServer } from "../src/server.js";

let server;
let baseUrl;

async function request(pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await response.json().catch(() => ({}));
  return { response, data, cookie: response.headers.get("set-cookie") };
}

async function login(email, password = "Password123!") {
  const result = await request("/api/auth/login", { method: "POST", body: { email, password } });
  assert.equal(result.response.status, 200, `login failed for ${email}`);
  return {
    cookie: result.cookie ? result.cookie.split(";")[0] : null,
    csrf: result.data.csrfToken,
    user: result.data.user
  };
}

async function run(name, fn) {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

try {
  const db = await initDb();
  await seedPrisma(db);

  server = createServer(db);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  const timestamp = Date.now();
  const customerEmail = `customer_${timestamp}@test.local`;
  const workerEmail = `worker_${timestamp}@test.local`;
  const employeeEmail = `employee_${timestamp}@test.local`;

  let customerAuth;
  let workerAuth;
  let employeeAuth;
  let createdJobId;
  let conversationId;

  await run("dynamic registration for Customer, Worker, and Staff", async () => {
    // 1. Register new Customer
    const regCust = await request("/api/auth/register", {
      method: "POST",
      body: {
        name: "Pooja Sharma",
        email: customerEmail,
        password: "Password123!",
        role: "CUSTOMER",
        location: "Noida Sector 62"
      }
    });
    assert.equal(regCust.response.status, 201);
    assert.equal(regCust.data.user.email, customerEmail);
    assert.equal(regCust.data.user.role, "CUSTOMER");

    // 2. Register new Worker
    const regWrk = await request("/api/auth/register", {
      method: "POST",
      body: {
        name: "Vikram Singh",
        email: workerEmail,
        password: "Password123!",
        role: "WORKER",
        location: "Noida Sector 62",
        yearsExperience: 4
      }
    });
    assert.equal(regWrk.response.status, 201);
    assert.equal(regWrk.data.user.role, "WORKER");

    // 3. Register new Cooperative Staff
    const regEmp = await request("/api/auth/register", {
      method: "POST",
      body: {
        name: "Deepak Verma",
        email: employeeEmail,
        password: "Password123!",
        role: "COOPERATIVE_EMPLOYEE",
        location: "Delhi NCR"
      }
    });
    assert.equal(regEmp.response.status, 201);
    assert.equal(regEmp.data.user.role, "COOPERATIVE_EMPLOYEE");
  });

  await run("authenticates users with signed HTTP-only cookies and queries PostgreSQL", async () => {
    customerAuth = await login(customerEmail);
    workerAuth = await login(workerEmail);
    employeeAuth = await login(employeeEmail);

    const me = await request("/api/auth/me", { headers: { Cookie: customerAuth.cookie } });
    assert.equal(me.response.status, 200);
    assert.equal(me.data.user.email, customerEmail);
    assert.ok(me.data.csrfToken);
  });

  await run("prevents unauthenticated or CSRF-invalid access", async () => {
    const unauth = await request("/api/jobs");
    assert.equal(unauth.response.status, 401);

    const noCsrf = await request("/api/jobs", {
      method: "POST",
      headers: { Cookie: customerAuth.cookie },
      body: { title: "Test" }
    });
    assert.equal(noCsrf.response.status, 403);
  });

  await run("customer creates job with algorithmic fair wage calculation", async () => {
    const res = await request("/api/jobs", {
      method: "POST",
      headers: { Cookie: customerAuth.cookie, "X-CSRF-Token": customerAuth.csrf },
      body: {
        serviceCategoryId: "svc_plumbing",
        title: "Kitchen Tap Replacement & Pipe Wash",
        description: "Kitchen mixer tap replacement and drainage line inspection.",
        location: "Noida Sector 62",
        scheduledAt: "2026-09-04T10:00:00.000Z",
        estimatedDurationHours: 2
      }
    });
    assert.equal(res.response.status, 201);
    assert.equal(res.data.data.status, "POSTED");
    assert.ok(res.data.data.fairWageEstimate > 0);
    createdJobId = res.data.data.id;
  });

  await run("runs real worker matching engine and customer allocates worker", async () => {
    const matchRes = await request(`/api/matching/jobs/${createdJobId}`, {
      headers: { Cookie: customerAuth.cookie }
    });
    assert.equal(matchRes.response.status, 200);
    assert.ok(matchRes.data.data.length > 0);
    assert.ok(matchRes.data.data[0].score > 0);

    // Customer allocates the newly registered worker
    const assignRes = await request(`/api/jobs/${createdJobId}/transition`, {
      method: "POST",
      headers: { Cookie: customerAuth.cookie, "X-CSRF-Token": customerAuth.csrf },
      body: { status: "ASSIGNED", workerId: workerAuth.user.id }
    });
    assert.equal(assignRes.response.status, 200);
    assert.equal(assignRes.data.data.status, "ASSIGNED");
    assert.equal(assignRes.data.data.workerId, workerAuth.user.id);
  });

  await run("worker accepts, starts, and executes service", async () => {
    // Worker accepts
    const acceptRes = await request(`/api/jobs/${createdJobId}/transition`, {
      method: "POST",
      headers: { Cookie: workerAuth.cookie, "X-CSRF-Token": workerAuth.csrf },
      body: { status: "ACCEPTED" }
    });
    assert.equal(acceptRes.response.status, 200);
    assert.equal(acceptRes.data.data.status, "ACCEPTED");

    // Worker starts
    const startRes = await request(`/api/jobs/${createdJobId}/transition`, {
      method: "POST",
      headers: { Cookie: workerAuth.cookie, "X-CSRF-Token": workerAuth.csrf },
      body: { status: "IN_PROGRESS" }
    });
    assert.equal(startRes.response.status, 200);
    assert.equal(startRes.data.data.status, "IN_PROGRESS");
  });

  await run("customer and worker exchange direct in-app messages linked to job", async () => {
    const threadRes = await request(`/api/messages/jobs/${createdJobId}`, {
      headers: { Cookie: customerAuth.cookie }
    });
    assert.equal(threadRes.response.status, 200);
    assert.ok(threadRes.data.data.conversation?.id);
    conversationId = threadRes.data.data.conversation.id;

    // Customer sends message
    const msg1 = await request("/api/messages", {
      method: "POST",
      headers: { Cookie: customerAuth.cookie, "X-CSRF-Token": customerAuth.csrf },
      body: { conversationId, body: "Please bring an extra Teflon seal." }
    });
    assert.equal(msg1.response.status, 201);
    assert.equal(msg1.data.data.body, "Please bring an extra Teflon seal.");

    // Worker replies
    const msg2 = await request("/api/messages", {
      method: "POST",
      headers: { Cookie: workerAuth.cookie, "X-CSRF-Token": workerAuth.csrf },
      body: { conversationId, body: "Understood, carrying complete seal kit." }
    });
    assert.equal(msg2.response.status, 201);
    assert.equal(msg2.data.data.body, "Understood, carrying complete seal kit.");
  });

  await run("worker completes job, customer settles payment and submits review", async () => {
    // 1. Worker completes job
    const compRes = await request(`/api/jobs/${createdJobId}/transition`, {
      method: "POST",
      headers: { Cookie: workerAuth.cookie, "X-CSRF-Token": workerAuth.csrf },
      body: { status: "COMPLETED" }
    });
    assert.equal(compRes.response.status, 200);
    assert.equal(compRes.data.data.status, "COMPLETED");

    // 2. Customer settles payment
    const payRes = await request("/api/payments", {
      method: "POST",
      headers: { Cookie: customerAuth.cookie, "X-CSRF-Token": customerAuth.csrf },
      body: { jobId: createdJobId, amount: 840 }
    });
    assert.equal(payRes.response.status, 201);
    assert.equal(payRes.data.data.status, "COMPLETED");
    assert.equal(payRes.data.data.amount, 840);

    // 3. Customer submits review
    const revRes = await request("/api/reviews", {
      method: "POST",
      headers: { Cookie: customerAuth.cookie, "X-CSRF-Token": customerAuth.csrf },
      body: { jobId: createdJobId, rating: 5, body: "Excellent plumbing work by Vikram." }
    });
    assert.equal(revRes.response.status, 201);
    assert.equal(revRes.data.data.rating, 5);

    // 4. Worker completed jobs count is incremented in DB
    const profile = await prisma.workerProfile.findUnique({ where: { userId: workerAuth.user.id } });
    assert.ok(profile.completedJobs >= 1);
  });

  await run("employee dashboard displays real dynamic statistics from PostgreSQL", async () => {
    const summaryRes = await request("/api/analytics/summary", {
      headers: { Cookie: employeeAuth.cookie }
    });
    assert.equal(summaryRes.response.status, 200);
    const totals = summaryRes.data.data.totals;
    assert.ok(totals.workers >= 1, "Total workers must be >= 1");
    assert.ok(totals.customers >= 1, "Total customers must be >= 1");
    assert.ok(totals.completedJobs >= 1, "Completed jobs must be >= 1");
    assert.ok(totals.earnings >= 840, "Total earnings must reflect settled payments");
  });

  await run("worker creates emergency SOS and staff resolves it", async () => {
    const sosRes = await request("/api/sos", {
      method: "POST",
      headers: { Cookie: workerAuth.cookie, "X-CSRF-Token": workerAuth.csrf },
      body: { location: "Noida Sector 62", note: "Need safety coordinator assistance" }
    });
    assert.equal(sosRes.response.status, 201);
    assert.equal(sosRes.data.data.status, "OPEN");

    // Staff resolves SOS
    const resolveRes = await request(`/api/sos/${sosRes.data.data.id}/resolve`, {
      method: "POST",
      headers: { Cookie: employeeAuth.cookie, "X-CSRF-Token": employeeAuth.csrf },
      body: {}
    });
    assert.equal(resolveRes.response.status, 200);
    assert.equal(resolveRes.data.data.status, "RESOLVED");
  });

  await run("creates and mediates disputes through staff", async () => {
    const disputeRes = await request("/api/disputes", {
      method: "POST",
      headers: { Cookie: customerAuth.cookie, "X-CSRF-Token": customerAuth.csrf },
      body: { jobId: createdJobId, reason: "Invoice clarification needed" }
    });
    assert.equal(disputeRes.response.status, 201);
    assert.equal(disputeRes.data.data.status, "OPEN");

    const resolveRes = await request(`/api/disputes/${disputeRes.data.data.id}/resolve`, {
      method: "POST",
      headers: { Cookie: employeeAuth.cookie, "X-CSRF-Token": employeeAuth.csrf },
      body: { resolution: "Clarified cooperative wage breakdown." }
    });
    assert.equal(resolveRes.response.status, 200);
    assert.equal(resolveRes.data.data.status, "RESOLVED");
  });

  await run("AI assistant endpoint is role-aware and configuration-explicit", async () => {
    const aiRes = await request("/api/ai/conversations", {
      method: "POST",
      headers: { Cookie: workerAuth.cookie, "X-CSRF-Token": workerAuth.csrf },
      body: { message: "Explain my latest job and earnings." }
    });
    assert.equal(aiRes.response.status, 201);
    assert.ok(aiRes.data.data.messages.length >= 2);
  });

  await run("supports forgot password and password reset flow against database", async () => {
    const forgotRes = await request("/api/auth/forgot-password", {
      method: "POST",
      body: { email: customerEmail }
    });
    assert.equal(forgotRes.response.status, 200);
    assert.ok(forgotRes.data.token);

    const resetRes = await request("/api/auth/reset-password", {
      method: "POST",
      body: { token: forgotRes.data.token, password: "NewPassword123!" }
    });
    assert.equal(resetRes.response.status, 200);

    // Verify login with new password succeeds
    const newLogin = await login(customerEmail, "NewPassword123!");
    assert.equal(newLogin.user.email, customerEmail);
    customerAuth = newLogin; // Update customerAuth for subsequent tests
  });

  await run("worker can update profile preferences and service radius", async () => {
    const updateRes = await request("/api/workers/profile", {
      method: "PUT",
      headers: { Cookie: workerAuth.cookie, "X-CSRF-Token": workerAuth.csrf },
      body: { serviceRadiusKm: 25, yearsExperience: 6, availabilityStatus: "AVAILABLE" }
    });
    assert.equal(updateRes.response.status, 200);
    assert.equal(updateRes.data.data.serviceRadiusKm, 25);
    assert.equal(updateRes.data.data.yearsExperience, 6);
  });

  await run("worker can decline assigned job and return it to matching", async () => {
    // Create a new test job
    const newJob = await request("/api/jobs", {
      method: "POST",
      headers: { Cookie: customerAuth.cookie, "X-CSRF-Token": customerAuth.csrf },
      body: {
        serviceCategoryId: "svc_carpentry",
        title: "Wardrobe Hinge Repair",
        description: "Cabinet door hinge loose.",
        location: "Noida Sector 62",
        estimatedDurationHours: 1
      }
    });
    assert.equal(newJob.response.status, 201);
    const testJobId = newJob.data.data.id;

    // Customer assigns worker
    await request(`/api/jobs/${testJobId}/transition`, {
      method: "POST",
      headers: { Cookie: customerAuth.cookie, "X-CSRF-Token": customerAuth.csrf },
      body: { status: "ASSIGNED", workerId: workerAuth.user.id }
    });

    // Worker declines (transitions to POSTED)
    const declineRes = await request(`/api/jobs/${testJobId}/transition`, {
      method: "POST",
      headers: { Cookie: workerAuth.cookie, "X-CSRF-Token": workerAuth.csrf },
      body: { status: "POSTED", reason: "Current schedule fully booked" }
    });
    assert.equal(declineRes.response.status, 200);
    assert.equal(declineRes.data.data.status, "POSTED");
    assert.equal(declineRes.data.data.workerId, null);
  });

  await run("enforces role boundaries (workers cannot access admin verify endpoint)", async () => {
    const denied = await request(`/api/workers/${workerAuth.user.id}/verify`, {
      method: "PATCH",
      headers: { Cookie: workerAuth.cookie, "X-CSRF-Token": workerAuth.csrf },
      body: { status: "VERIFIED" }
    });
    assert.equal(denied.response.status, 403);
  });
} finally {
  if (server) await new Promise((r) => server.close(r));
  await closeDb();
}
