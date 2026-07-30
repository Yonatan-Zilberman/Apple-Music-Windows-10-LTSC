const { spawnSync } = require("node:child_process");

/**
 * electron-builder afterPack hook — VMP-sign the unpacked app for Widevine.
 * @param {import("electron-builder").AfterPackContext} context
 */
exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== "win32") {
    return;
  }

  const appOutDir = context.appOutDir;
  console.log("[afterPack] VMP signing " + appOutDir);

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
      console.log("[afterPack] VMP signing complete.");
      return;
    }
    if (!result.error) {
      break;
    }
  }

  console.warn(
    "[afterPack] VMP signing skipped (not logged into EVS or castlabs-evs missing)."
  );
  console.warn("Log in once, then re-run packaging or sign manually:");
  console.warn("  py -3 -m castlabs_evs.account login");
  console.warn('  npm run sign:vmp -- "' + appOutDir + '"');
};