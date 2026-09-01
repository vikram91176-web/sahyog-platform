import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { default as EmbeddedPostgres } from "embedded-postgres";

const DEFAULT_PORT = 54329;
const DEFAULT_URL = `postgresql://postgres:password@localhost:${DEFAULT_PORT}/postgres`;
const DATA_DIR = path.resolve(process.cwd(), "data/postgres-data");

let embeddedPgInstance = null;
let prismaInstance = null;

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

export async function initDb() {
  const url = process.env.DATABASE_URL || DEFAULT_URL;
  const isLocalDefault = url.includes(`:${DEFAULT_PORT}/`);

  if (isLocalDefault && !process.env.VERCEL) {
    try {
      const inUse = await isPortInUse(DEFAULT_PORT);
      if (!inUse) {
        if (!fs.existsSync(DATA_DIR)) {
          fs.mkdirSync(DATA_DIR, { recursive: true });
        }

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
  } catch (err) {
    console.warn("Prisma connect warning:", err.message);
  }

  // Register cleanup hooks
  const cleanup = async () => {
    await closeDb().catch(() => {});
  };
  process.once("SIGINT", cleanup);
  process.once("SIGTERM", cleanup);

  return prismaInstance;
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
}

export function getPrisma() {
  if (!prismaInstance) {
    prismaInstance = new PrismaClient({
      datasources: {
        db: { url: process.env.DATABASE_URL || DEFAULT_URL }
      }
    });
  }
  return prismaInstance;
}

export const prisma = new Proxy({}, {
  get(_target, prop) {
    return getPrisma()[prop];
  }
});
