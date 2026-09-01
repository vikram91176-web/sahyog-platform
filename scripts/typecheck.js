import fs from "node:fs/promises";

const requiredExports = [
  ["src/domain.js", "matchWorkers"],
  ["src/domain.js", "estimateWage"],
  ["src/security.js", "hashPassword"],
  ["src/server.js", "createServer"]
];

for (const [file, symbol] of requiredExports) {
  const source = await fs.readFile(file, "utf8");
  if (!source.includes(` ${symbol}`) && !source.includes(`function ${symbol}`)) {
    throw new Error(`Expected ${symbol} in ${file}`);
  }
}

console.log("Static project type contract checks passed.");
