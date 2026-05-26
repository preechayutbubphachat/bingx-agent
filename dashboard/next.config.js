/** @type {import('next').NextConfig} */
const fs = require("fs");
const path = require("path");

const publicDir = path.join(__dirname, "public");
for (const staleCopy of ["dashboard", "bingx-agent-runner"]) {
  fs.rmSync(path.join(publicDir, staleCopy), { recursive: true, force: true });
}

const nextConfig = {
  experimental: {
    optimizePackageImports: ["react", "react-dom"],
  },
  turbopack: {
    root: __dirname,
  },
};

module.exports = nextConfig;
