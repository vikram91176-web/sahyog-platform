import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import crypto from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "./security.js";

const DEFAULT_PORT = 54329;
const DEFAULT_URL = `postgresql://postgres:password@localhost:${DEFAULT_PORT}/postgres`;
const DATA_DIR = path.resolve(process.cwd(), "data/postgres-data");

let embeddedPgInstance = null;
let prismaInstance = null;
let activeDb = null;

async function isPortInUse(port, host = "127.0.0.1") {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(800);
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.once("error", () => {
      resolve(false);
    });
    socket.connect(port, host);
  });
}

function genId(prefix = "id") {
  return `${prefix}_${crypto.randomBytes(6).toString("hex")}`;
}

function matchesWhere(item, where) {
  if (!where) return true;
  for (const [key, val] of Object.entries(where)) {
    if (val === undefined) continue;
    if (val && typeof val === "object" && !Array.isArray(val) && !(val instanceof Date)) {
      if (val.in && Array.isArray(val.in)) {
        if (!val.in.includes(item[key])) return false;
      } else if (val.equals !== undefined) {
        if (item[key] !== val.equals) return false;
      }
    } else if (item[key] !== val) {
      return false;
    }
  }
  return true;
}

function createModelHandler(store, modelName) {
  if (!store[modelName]) store[modelName] = [];
  const list = store[modelName];

  return {
    async findUnique({ where } = {}) {
      return list.find((item) => matchesWhere(item, where)) || null;
    },
    async findFirst({ where } = {}) {
      return list.find((item) => matchesWhere(item, where)) || null;
    },
    async findMany({ where } = {}) {
      return list.filter((item) => matchesWhere(item, where));
    },
    async create({ data } = {}) {
      const newItem = {
        id: data?.id || genId(modelName),
        createdAt: new Date(),
        updatedAt: new Date(),
        ...(data || {})
      };
      list.push(newItem);
      return newItem;
    },
    async update({ where, data } = {}) {
      const idx = list.findIndex((item) => matchesWhere(item, where));
      if (idx === -1) {
        const newItem = { id: where?.id || genId(modelName), createdAt: new Date(), updatedAt: new Date(), ...data };
        list.push(newItem);
        return newItem;
      }
      list[idx] = { ...list[idx], ...data, updatedAt: new Date() };
      return list[idx];
    },
    async upsert({ where, update, create: createData } = {}) {
      const existing = list.find((item) => matchesWhere(item, where));
      if (existing) {
        Object.assign(existing, update, { updatedAt: new Date() });
        return existing;
      }
      const newItem = {
        id: createData?.id || genId(modelName),
        createdAt: new Date(),
        updatedAt: new Date(),
        ...(createData || {})
      };
      list.push(newItem);
      return newItem;
    },
    async delete({ where } = {}) {
      const idx = list.findIndex((item) => matchesWhere(item, where));
      if (idx !== -1) list.splice(idx, 1);
      return { count: idx !== -1 ? 1 : 0 };
    },
    async deleteMany({ where } = {}) {
      let count = 0;
      for (let i = list.length - 1; i >= 0; i--) {
        if (matchesWhere(list[i], where)) {
          list.splice(i, 1);
          count++;
        }
      }
      return { count };
    },
    async updateMany({ where, data } = {}) {
      let count = 0;
      for (const item of list) {
        if (matchesWhere(item, where)) {
          Object.assign(item, data, { updatedAt: new Date() });
          count++;
        }
      }
      return { count };
    },
    async count({ where } = {}) {
      return list.filter((item) => matchesWhere(item, where)).length;
    }
  };
}

export function createInMemoryDb() {
  const store = {};
  const passHash = hashPassword("Password123!", "development-seed-salt");

  const defaultFed = { id: "fed_north", name: "North India Service Federation", region: "North India", status: "ACTIVE" };
  const defaultCoop = { id: "coop_delhi", federationId: "fed_north", name: "Delhi NCR Household Services Cooperative", region: "Delhi NCR", policyFeePercent: 8, status: "ACTIVE" };

  store.federation = [defaultFed];
  store.cooperative = [defaultCoop];
  store.serviceCategory = [
    { id: "svc_plumbing", name: "Plumbing", baseHourlyRate: 350, complexityMultiplier: 1.2 },
    { id: "svc_electrical", name: "Electrical", baseHourlyRate: 420, complexityMultiplier: 1.3 },
    { id: "svc_carpentry", name: "Carpentry", baseHourlyRate: 320, complexityMultiplier: 1.1 },
    { id: "svc_cleaning", name: "Cleaning", baseHourlyRate: 250, complexityMultiplier: 1.0 }
  ];
  store.skill = [
    { id: "skill_plumbing", name: "Leak repair", categoryId: "svc_plumbing" },
    { id: "skill_wiring", name: "Wiring", categoryId: "svc_electrical" }
  ];
  store.welfareScheme = [
    { id: "welfare_health", name: "Cooperative Health & Maternity Security", description: "Immediate cashless medical coverage.", eligibility: "Active worker", documents: ["Aadhaar"] }
  ];
  store.trainingProgram = [
    { id: "train_domestic_wiring", title: "Certified Modern Residential Wiring", serviceCategoryId: "svc_electrical", skillsCovered: ["Smart MCBs"], durationHours: 16, provider: "Sahyog Academy" }
  ];

  store.user = [
    { id: "user_worker", email: "worker@sahyog.local", name: "Rahul Kumar", mobile: "+91 98765 43210", role: "WORKER", passwordHash: passHash, cooperativeId: "coop_delhi" },
    { id: "user_customer", email: "customer@sahyog.local", name: "Ananya Sharma", mobile: "+91 98111 22334", role: "CUSTOMER", passwordHash: passHash, cooperativeId: "coop_delhi" },
    { id: "user_coop_admin", email: "coop@sahyog.local", name: "Meera Coordinator", mobile: "+91 98333 44556", role: "COOPERATIVE_EMPLOYEE", passwordHash: passHash, cooperativeId: "coop_delhi" },
    { id: "user_federation_admin", email: "federation@sahyog.local", name: "Federation Manager", mobile: "+91 98444 55667", role: "FEDERATION_ADMIN", passwordHash: passHash, cooperativeId: "coop_delhi", federationId: "fed_north" },
    { id: "user_super_admin", email: "admin@sahyog.local", name: "Sahyog Administrator", mobile: "+91 98555 66778", role: "SUPER_ADMIN", passwordHash: passHash, cooperativeId: "coop_delhi", federationId: "fed_north" }
  ];

  store.workerProfile = [
    { id: "wp_worker", userId: "user_worker", cooperativeId: "coop_delhi", workerCode: "SAH-1001", location: "Noida Sector 62", yearsExperience: 5, rating: 4.9, completedJobs: 48, verificationStatus: "VERIFIED", availabilityStatus: "AVAILABLE", languages: ["Hindi", "English"] }
  ];
  store.customerProfile = [
    { id: "cp_customer", userId: "user_customer", location: "Noida Sector 62", savedAddresses: ["Noida Sector 62, Block B"] }
  ];
  store.employeeProfile = [
    { id: "ep_admin", userId: "user_coop_admin", cooperativeId: "coop_delhi", employeeCode: "EMP-101", department: "Operations", designation: "Lead Coordinator" }
  ];

  return new Proxy({}, {
    get(_target, prop) {
      if (prop === "$connect" || prop === "$disconnect") return async () => {};
      return createModelHandler(store, String(prop));
    }
  });
}

export async function initDb() {
  const url = process.env.DATABASE_URL || DEFAULT_URL;
  const isLocalDefault = url.includes(`:${DEFAULT_PORT}/`);

  if (isLocalDefault && !process.env.VERCEL && !process.env.AWS_LAMBDA_FUNCTION_NAME) {
    try {
      const inUse = await isPortInUse(DEFAULT_PORT);
      if (!inUse) {
        if (!fs.existsSync(DATA_DIR)) {
          fs.mkdirSync(DATA_DIR, { recursive: true });
        }

        const { default: EmbeddedPostgres } = await import("embedded-postgres");

        embeddedPgInstance = new EmbeddedPostgres({
          port: DEFAULT_PORT,
          databaseDir: DATA_DIR,
          user: "postgres",
          password: "password"
        });

        const hasCluster = fs.existsSync(path.join(DATA_DIR, "PG_VERSION"));
        if (!hasCluster) {
          await embeddedPgInstance.initialise();
        }
        await embeddedPgInstance.start();
      }
    } catch (err) {
      console.warn("Embedded PostgreSQL start skipped:", err.message);
    }
  }

  process.env.DATABASE_URL = url;

  if (!prismaInstance) {
    prismaInstance = new PrismaClient({
      datasources: {
        db: { url }
      },
      log: process.env.NODE_ENV === "development" && process.env.DEBUG_SQL ? ["query", "error", "warn"] : ["error"]
    });
  }

  try {
    await prismaInstance.$connect();
    activeDb = prismaInstance;
  } catch (err) {
    console.warn("Prisma connect warning (using resilient DB store):", err.message);
    activeDb = createInMemoryDb();
  }

  // Register cleanup hooks
  const cleanup = async () => {
    await closeDb().catch(() => {});
  };
  process.once("SIGINT", cleanup);
  process.once("SIGTERM", cleanup);

  return activeDb;
}

export async function closeDb() {
  if (prismaInstance) {
    await prismaInstance.$disconnect().catch(() => {});
    prismaInstance = null;
  }
  if (embeddedPgInstance) {
    await embeddedPgInstance.stop().catch(() => {});
    embeddedPgInstance = null;
  }
  activeDb = null;
}

export function getPrisma() {
  if (!activeDb) {
    if (!prismaInstance) {
      prismaInstance = new PrismaClient({
        datasources: {
          db: { url: process.env.DATABASE_URL || DEFAULT_URL }
        }
      });
    }
    activeDb = prismaInstance;
  }
  return activeDb;
}

export const prisma = new Proxy({}, {
  get(_target, prop) {
    return getPrisma()[prop];
  }
});
