const fs = require("fs");
const path = require("path");

const publicDir = path.join(__dirname, "..", "public");
const generatedCopies = [
  path.join(publicDir, "dashboard"),
  path.join(publicDir, "bingx-agent-runner"),
];

for (const target of generatedCopies) {
  fs.rmSync(target, { recursive: true, force: true });
}
