import { spawnSync } from "node:child_process";
import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const targetArg = process.argv[2];
const target = targetArg
  ? path.resolve(targetArg)
  : path.join(root, "node_modules", "electron", "dist");

if (!existsSync(target)) {
  console.error(`[sign:vmp] Target not found: ${target}`);
  console.error("Run npm install first, or pass a path: npm run sign:vmp -- <path>");
  process.exit(1);
}

function run(bin, args) {
  return spawnSync(bin, args, { stdio: "inherit", shell: false });
}

const attempts = [];
if (process.platform === "win32") {
  attempts.push(["py", ["-3", "-m", "castlabs_evs.vmp", "-n", "sign-pkg", target]]);
}
attempts.push(["python3", ["-m", "castlabs_evs.vmp", "-n", "sign-pkg", target]]);
attempts.push(["python", ["-m", "castlabs_evs.vmp", "-n", "sign-pkg", target]]);

let result = null;
for (const [bin, args] of attempts) {
  result = run(bin, args);
  if (result.error && result.error.code === "ENOENT") {
    continue;
  }
  if (result.status === 0) {
    console.log(`[sign:vmp] Signed: ${target}`);
    process.exit(0);
  }
  if (!result.error) {
    break;
  }
}

console.error("[sign:vmp] Signing failed.");
console.error("Install Python 3.7+ and castlabs-evs, then signup or reauth to EVS:");
console.error("  py -3 -m castlabs_evs.account signup");
console.error("  py -3 -m castlabs_evs.account reauth");
console.error("Docs: https://github.com/castlabs/electron-releases/wiki/EVS");
process.exit(result?.status ?? 1);