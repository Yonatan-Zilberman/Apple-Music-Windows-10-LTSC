import path from "node:path";
import { app } from "electron";

export function getAssetsDir(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "assets");
  }
  return path.join(__dirname, "..", "..", "assets");
}

export function assetPath(...parts: string[]): string {
  return path.join(getAssetsDir(), ...parts);
}