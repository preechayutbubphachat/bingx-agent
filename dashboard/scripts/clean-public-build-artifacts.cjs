const fs = require("node:fs");
const path = require("node:path");

const publicDir = path.resolve(__dirname, "..", "public");
const staleDirs = ["dashboard", "bingx-agent-runner"];

for (const dirName of staleDirs) {
  const target = path.resolve(publicDir, dirName);
  const relative = path.relative(publicDir, target);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Refusing to clean outside dashboard/public: ${target}`);
  }

  fs.rmSync(target, { recursive: true, force: true });
}
