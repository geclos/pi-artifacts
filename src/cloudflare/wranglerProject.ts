import { mkdir, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { artifactDir, slugify } from "../store/artifactStore.js";

export async function writeWranglerProject(cwd: string, id: string) {
  const dir = artifactDir(cwd, id);
  const deployDir = join(dir, "deploy");
  const distDir = join(dir, "dist");
  await mkdir(deployDir, { recursive: true });
  const relDist = relative(deployDir, distDir).replaceAll("\\", "/");
  const workerName = `pi-artifact-${slugify(id)}`.slice(0, 63).replace(/-+$/g, "");
  const config = {
    $schema: "node_modules/wrangler/config-schema.json",
    name: workerName,
    compatibility_date: new Date().toISOString().slice(0, 10),
    assets: {
      directory: relDist,
      not_found_handling: "single-page-application",
    },
  };
  const configPath = join(deployDir, "wrangler.jsonc");
  await writeFile(configPath, JSON.stringify(config, null, 2) + "\n", "utf8");
  return { deployDir, configPath, workerName };
}
