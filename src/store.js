import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomId } from "./security.js";
import { seedData } from "./seed.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultPath = path.resolve(__dirname, "../data/sahyog.dev.json");

export class JsonStore {
  constructor(filePath = process.env.SAHYOG_DB_PATH || defaultPath) {
    this.filePath = path.resolve(filePath);
    this.data = null;
  }

  async load() {
    if (this.data) return this.data;
    try {
      this.data = JSON.parse(await fs.readFile(this.filePath, "utf8"));
    } catch {
      this.data = seedData();
      await this.save();
    }
    return this.data;
  }

  async save() {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(this.data, null, 2));
  }

  async mutate(fn) {
    await this.load();
    const result = await fn(this.data);
    await this.save();
    return result;
  }

  async read(fn) {
    await this.load();
    return fn(this.data);
  }
}

export function now() {
  return new Date().toISOString();
}

export function insert(collection, row) {
  const entity = { id: randomId(collection.slice(0, 3)), createdAt: now(), updatedAt: now(), ...row };
  return entity;
}
