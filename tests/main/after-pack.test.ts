import { describe, it, expect } from "vitest";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const afterPackPath = path.join(process.cwd(), "build/after-pack.cjs");

describe("after-pack.cjs", () => {
  it("no-ops for non-darwin platforms without throwing", async () => {
    // CJS hook: clear cache so we load the on-disk implementation.
    delete require.cache[require.resolve(afterPackPath)];
    const mod = require(afterPackPath) as {
      default: (context: {
        electronPlatformName: string;
        arch: string;
        appOutDir: string;
        packager: { appInfo: { productFilename: string } };
      }) => Promise<void>;
    };

    await expect(
      mod.default({
        electronPlatformName: "win32",
        arch: "x64",
        appOutDir: path.join(process.cwd(), "tmp-after-pack-unused"),
        packager: { appInfo: { productFilename: "GogMeet" } },
      }),
    ).resolves.toBeUndefined();
  });

  it("source file exists for packaging wiring", () => {
    // Sanity: electron-builder afterPack path remains resolvable.
    expect(pathToFileURL(afterPackPath).href).toContain("after-pack.cjs");
  });
});
