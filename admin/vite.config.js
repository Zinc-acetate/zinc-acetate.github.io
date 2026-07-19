import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const adminDirectory = fileURLToPath(new URL(".", import.meta.url));
const sharedDirectory = fileURLToPath(new URL("../shared", import.meta.url));

export default defineConfig({
  server: {
    fs: {
      allow: [adminDirectory, sharedDirectory],
    },
  },
});
