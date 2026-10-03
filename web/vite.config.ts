import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

// Hver build får et versionsnummer (tidspunktet, den blev bygget).
// Appen kigger efter en nyere version, når du vender tilbage til den, og henter den selv.
// Det er vigtigt for appen på hjemmeskærmen, som ellers kan blive hængende i en gammel udgave.
const VERSION = new Date().toISOString();

const versionFile = (): Plugin => ({
  name: "puls-version",
  generateBundle() {
    this.emitFile({ type: "asset", fileName: "version.json", source: JSON.stringify({ version: VERSION }) });
  },
});

// Vite bygger appen til almindelige HTML/JS/CSS-filer i mappen dist/,
// som kan ligge på en hvilken som helst webhost.
export default defineConfig({
  plugins: [react(), versionFile()],
  define: { __VERSION__: JSON.stringify(VERSION) },
});
