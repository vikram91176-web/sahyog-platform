import { handleRequest } from "../src/server.js";
import { initDb } from "../src/db.js";

let dbInstance = null;

export default async function handler(req, res) {
  try {
    if (!dbInstance) {
      dbInstance = await initDb().catch((err) => {
        console.warn("Vercel DB initialization note:", err.message);
        return null;
      });
    }

    await handleRequest(dbInstance, req, res);
  } catch (error) {
    console.error("Vercel serverless function error:", error);
    if (!res.headersSent) {
      res.statusCode = error.status || 500;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ ok: false, error: error.message || "Internal Server Error" }));
    }
  }
}
