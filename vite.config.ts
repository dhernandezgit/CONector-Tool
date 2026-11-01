import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "./",
  plugins: [react()],
  server: {
    fs: {
      // Keep the private Artist Alley reference pack and all model/archive files
      // out of the dev server. They are reference material only and must never
      // be published or served by the app.
      deny: [
        ".env",
        ".env.*",
        "*.{crt,pem}",
        "**/.git/**",
        "**/ArtistAlleyPack/**",
        "**/*.stl",
        "**/*.zip",
      ],
    },
  },
  build: {
    target: "esnext",
    outDir: "dist",
    emptyOutDir: true,
  },
});
