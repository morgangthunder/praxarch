// Single source of truth for the API build version.
// Imported by main.ts (boot log) and the /health route — kept out of main.ts
// so importing it never triggers bootstrap().
export const API_VERSION = "0.8.40";
