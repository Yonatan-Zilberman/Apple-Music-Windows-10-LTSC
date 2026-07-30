const { spawnSync } = require("node:child_process");
const path = require("node:path");

/**
 * Run VMP signing AFTER Windows Authenticode so the Widevine signature is not invalidated.
 * @param {import("electron-builder").AfterPackContext} context
 */
exports.default = async function afterSign(context) {
  if (context.electronPlatformName !== "win32") {
    return;
  }

  const appOutDir = context.appOutDir;
  console.log("[afterSign] VMP signing " + appOutDir);

  const attempts = [
    ["py", ["-3", "-m", "castlabs_evs.vmp", "-n", "sign-pkg", appOutDir]],
    ["python3", ["-m", "castlabs_evs.vmp", "-n", "sign-pkg", appOutDir]],
    ["python", ["-m", "castlabs_evs.vmp", "-n", "sign-pkg", appOutDir]],
  ];

  let result = null;
  for (const [bin, args] of attempts) {
    result = spawnSync(bin, args, { stdio: "inherit", shell: false });
    if (result.error && result.error.code === "ENOENT") {
      continue;
    }
    if (result.status === 0) {
      console.log("[afterSign] VMP signing complete.");
      return;
    }
    if (!result.error) {
      break;
    }
  }

  console.warn("[afterSign] VMP signing skipped (EVS credentials missing?).");
  console.warn("  py -3 -m castlabs_evs.account reauth");
  console.warn('  npm run sign:vmp -- "' + appOutDir + '"');
};