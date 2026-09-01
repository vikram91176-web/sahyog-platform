import { createServer } from "../src/server.js";
import { initDb } from "../src/db.js";

let serverInstance = null;

export default async function handler(req, res) {
  try {
    const db = await initDb().catch((err) => {
      console.warn("Vercel DB init warning:", err.message);
      return null;
    });

    if (!serverInstance) {
      serverInstance = createServer(db);
    }

    serverInstance.emit("request", req, res);
  } catch (error) {
    console.error("Vercel serverless function error:", error);
    res.statusCode = error.status || 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: false, error: error.message || "Internal Server Error" }));
  }
}
