const path = require("node:path");
const fs = require("node:fs");
const esbuild = require("esbuild");

const projectRoot = path.resolve(__dirname, "..");
const outputDirectory = path.join(projectRoot, "_site", "assets");

fs.mkdirSync(outputDirectory, { recursive: true });

esbuild.buildSync({
  bundle: true,
  entryPoints: [path.join(__dirname, "browser", "mermaid-entry.js")],
  format: "iife",
  globalName: "ZincMermaidBundle",
  legalComments: "eof",
  minify: true,
  outfile: path.join(outputDirectory, "mermaid.min.js"),
  target: ["es2020"],
});
