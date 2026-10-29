import { randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

export const FACTORY_YAML_NAME = "factory.yaml";

export async function readTextIfExists(file: string): Promise<string | undefined> {
  try {
    return await readFile(file, "utf8");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") return undefined;
    throw error;
  }
}

export async function writeTextAtomically(file: string, text: string): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });

  let mode: number | undefined;
  try {
    mode = (await stat(file)).mode & 0o777;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, text, "utf8");
    if (mode !== undefined) await chmod(temporary, mode);
    await rename(temporary, file);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

export function factoryYamlPath(factoryDir: string): string {
  return path.join(factoryDir, FACTORY_YAML_NAME);
}

export function readFactoryYamlText(factoryDir: string): Promise<string | undefined> {
  return readTextIfExists(factoryYamlPath(factoryDir));
}

export function writeFactoryYamlText(factoryDir: string, text: string): Promise<void> {
  return writeTextAtomically(factoryYamlPath(factoryDir), text);
}
