import { randomUUID } from "node:crypto";
import {
  mkdir,
  readFile,
  realpath,
  rename,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

export function normalizeRelativePath(value: string) {
  return value.replaceAll("\\", "/").replace(/^\/+/, "");
}

export function isInside(root: string, candidate: string) {
  const relative = path.relative(root, candidate);
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
}

export async function assertExistingDirectory(directory: string) {
  const resolved = await realpath(path.resolve(directory));
  const details = await stat(resolved);
  if (!details.isDirectory()) {
    throw new Error("The selected path is not a directory.");
  }
  return resolved;
}

export async function resolveExistingInside(root: string, relative: string) {
  const rootReal = await realpath(root);
  const candidate = await realpath(path.resolve(rootReal, relative));
  if (!isInside(rootReal, candidate)) {
    throw new Error("The requested path escapes the active workspace.");
  }
  return candidate;
}

export function resolvePlannedInside(root: string, relative: string) {
  const candidate = path.resolve(root, relative);
  if (!isInside(path.resolve(root), candidate)) {
    throw new Error("The requested path escapes the active workspace.");
  }
  return candidate;
}

export async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

export async function writeJsonAtomic(filePath: string, value: unknown) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporary, filePath);
}

export function safeFileSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
}
