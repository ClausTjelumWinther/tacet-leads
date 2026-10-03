import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Vite bygger appen til almindelige HTML/JS/CSS-filer i mappen dist/,
// som kan ligge på en hvilken som helst webhost.
export default defineConfig({
  plugins: [react()],
});
