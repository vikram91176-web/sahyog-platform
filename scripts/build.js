import fs from "node:fs/promises";

const required = [
  "public/index.html",
  "public/styles.css",
  "public/app.js",
  "src/server.js",
  "src/domain.js",
  "prisma/schema.prisma",
  "prisma/migrations/0001_init/migration.sql",
  ".env.example",
  "README.md"
];

for (const file of required) {
  await fs.access(file);
}

const html = await fs.readFile("public/index.html", "utf8");
if (!html.includes("/app.js") || !html.includes("/styles.css")) throw new Error("Frontend entrypoint is incomplete");

console.log("Production build checks passed. Run with npm start after configuring environment variables.");
