import assert from "node:assert/strict";
import { once } from "node:events";
import { after, before, describe, it } from "node:test";
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

describe("SAHYOG PostgreSQL + Prisma Full-Stack System", () => {
  let customerAuth;
  let workerAuth;
  let employeeAuth;
  let jobId;

  before(async () => {
    const db = await initDb();
    await seedPrisma(db);
    server = createServer(db);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    if (server) await new Promise((r) => server.close(r));
    await closeDb();
  });

  it("supports dynamic registration for Customer, Worker, and Staff", async () => {
    const ts = Date.now();
    const custRes = await request("/api/auth/register", {
      method: "POST",
      body: { name: "Test Customer", email: `cust_${ts}@sahyog.test`, password: "Password123!", role: "CUSTOMER", location: "Noida" }
    });
    assert.equal(custRes.response.status, 201);
    assert.equal(custRes.data.user.role, "CUSTOMER");

    const wrkRes = await request("/api/auth/register", {
      method: "POST",
      body: { name: "Test Worker", email: `wrk_${ts}@sahyog.test`, password: "Password123!", role: "WORKER", location: "Noida", yearsExperience: 3 }
    });
    assert.equal(wrkRes.response.status, 201);
    assert.equal(wrkRes.data.user.role, "WORKER");

    const empRes = await request("/api/auth/register", {
      method: "POST",
      body: { name: "Test Staff", email: `emp_${ts}@sahyog.test`, password: "Password123!", role: "COOPERATIVE_EMPLOYEE", location: "Delhi" }
    });
    assert.equal(empRes.response.status, 201);
    assert.equal(empRes.data.user.role, "COOPERATIVE_EMPLOYEE");

    customerAuth = await login(`cust_${ts}@sahyog.test`);
    workerAuth = await login(`wrk_${ts}@sahyog.test`);
    employeeAuth = await login(`emp_${ts}@sahyog.test`);
  });

  it("enforces session authentication and CSRF token protection", async () => {
    const me = await request("/api/auth/me", { headers: { Cookie: customerAuth.cookie } });
    assert.equal(me.response.status, 200);
    assert.ok(me.data.csrfToken);

    const unauth = await request("/api/jobs");
    assert.equal(unauth.response.status, 401);

    const noCsrf = await request("/api/jobs", {
      method: "POST",
      headers: { Cookie: customerAuth.cookie },
      body: { title: "No CSRF Test" }
    });
    assert.equal(noCsrf.response.status, 403);
  });

  it("executes entire service lifecycle: create, match, assign, accept, message, complete, pay, review", async () => {
    // 1. Create job
    const created = await request("/api/jobs", {
      method: "POST",
      headers: { Cookie: customerAuth.cookie, "X-CSRF-Token": customerAuth.csrf },
      body: {
        serviceCategoryId: "svc_electrical",
        title: "Ceiling Fan Repair & Capacitor Fix",
        description: "Ceiling fan making buzzing noise.",
        location: "Noida Sector 62",
        scheduledAt: "2026-09-06T10:00:00.000Z",
        estimatedDurationHours: 2
      }
    });
    assert.equal(created.response.status, 201);
    jobId = created.data.data.id;
    assert.ok(created.data.data.fairWageEstimate > 0);

    // 2. Match workers
    const matches = await request(`/api/matching/jobs/${jobId}`, {
      headers: { Cookie: customerAuth.cookie }
    });
    assert.equal(matches.response.status, 200);
    assert.ok(matches.data.data.length > 0);

    // 3. Assign worker
    const assigned = await request(`/api/jobs/${jobId}/transition`, {
      method: "POST",
      headers: { Cookie: customerAuth.cookie, "X-CSRF-Token": customerAuth.csrf },
      body: { status: "ASSIGNED", workerId: workerAuth.user.id }
    });
    assert.equal(assigned.response.status, 200);
    assert.equal(assigned.data.data.status, "ASSIGNED");

    // 4. Worker accepts and starts
    await request(`/api/jobs/${jobId}/transition`, {
      method: "POST",
      headers: { Cookie: workerAuth.cookie, "X-CSRF-Token": workerAuth.csrf },
      body: { status: "ACCEPTED" }
    });
    await request(`/api/jobs/${jobId}/transition`, {
      method: "POST",
      headers: { Cookie: workerAuth.cookie, "X-CSRF-Token": workerAuth.csrf },
      body: { status: "IN_PROGRESS" }
    });

    // 5. In-app messaging
    const thread = await request(`/api/messages/jobs/${jobId}`, { headers: { Cookie: customerAuth.cookie } });
    const convId = thread.data.data.conversation.id;
    const sent = await request("/api/messages", {
      method: "POST",
      headers: { Cookie: customerAuth.cookie, "X-CSRF-Token": customerAuth.csrf },
      body: { conversationId: convId, body: "Fan is located in the living room." }
    });
    assert.equal(sent.response.status, 201);

    // 6. Complete job
    await request(`/api/jobs/${jobId}/transition`, {
      method: "POST",
      headers: { Cookie: workerAuth.cookie, "X-CSRF-Token": workerAuth.csrf },
      body: { status: "COMPLETED" }
    });

    // 7. Settle payment
    const payment = await request("/api/payments", {
      method: "POST",
      headers: { Cookie: customerAuth.cookie, "X-CSRF-Token": customerAuth.csrf },
      body: { jobId, amount: 1092 }
    });
    assert.equal(payment.response.status, 201);
    assert.equal(payment.data.data.status, "COMPLETED");

    // 8. Submit review
    const review = await request("/api/reviews", {
      method: "POST",
      headers: { Cookie: customerAuth.cookie, "X-CSRF-Token": customerAuth.csrf },
      body: { jobId, rating: 5, body: "Fan fixed quickly and smoothly." }
    });
    assert.equal(review.response.status, 201);
  });

  it("employee dashboard displays real database aggregations", async () => {
    const summary = await request("/api/analytics/summary", { headers: { Cookie: employeeAuth.cookie } });
    assert.equal(summary.response.status, 200);
    const totals = summary.data.data.totals;
    assert.ok(totals.workers >= 1);
    assert.ok(totals.customers >= 1);
    assert.ok(totals.completedJobs >= 1);
    assert.ok(totals.earnings >= 1092);
  });

  it("supports password reset flow via database tokens", async () => {
    const forgot = await request("/api/auth/forgot-password", {
      method: "POST",
      body: { email: customerAuth.user.email }
    });
    assert.equal(forgot.response.status, 200);
    assert.ok(forgot.data.token);

    const reset = await request("/api/auth/reset-password", {
      method: "POST",
      body: { token: forgot.data.token, password: "NewPassword123!" }
    });
    assert.equal(reset.response.status, 200);

    const reLogin = await login(customerAuth.user.email, "NewPassword123!");
    assert.equal(reLogin.user.email, customerAuth.user.email);
    customerAuth = reLogin;
  });

  it("allows worker profile update and job decline workflow", async () => {
    const profileUpdate = await request("/api/workers/profile", {
      method: "PUT",
      headers: { Cookie: workerAuth.cookie, "X-CSRF-Token": workerAuth.csrf },
      body: { serviceRadiusKm: 25, yearsExperience: 8 }
    });
    assert.equal(profileUpdate.response.status, 200);
    assert.equal(profileUpdate.data.data.serviceRadiusKm, 25);

    // Create and decline a job
    const newJob = await request("/api/jobs", {
      method: "POST",
      headers: { Cookie: customerAuth.cookie, "X-CSRF-Token": customerAuth.csrf },
      body: {
        serviceCategoryId: "svc_plumbing",
        title: "Kitchen Drain Trap Fix",
        description: "Trap pipe clogged.",
        location: "Noida Sector 62",
        estimatedDurationHours: 1
      }
    });
    assert.equal(newJob.response.status, 201);
    const testJobId = newJob.data.data.id;

    await request(`/api/jobs/${testJobId}/transition`, {
      method: "POST",
      headers: { Cookie: customerAuth.cookie, "X-CSRF-Token": customerAuth.csrf },
      body: { status: "ASSIGNED", workerId: workerAuth.user.id }
    });

    const decline = await request(`/api/jobs/${testJobId}/transition`, {
      method: "POST",
      headers: { Cookie: workerAuth.cookie, "X-CSRF-Token": workerAuth.csrf },
      body: { status: "POSTED", reason: "Worker not in area" }
    });
    assert.equal(decline.response.status, 200);
    assert.equal(decline.data.data.status, "POSTED");
    assert.equal(decline.data.data.workerId, null);
  });
});
