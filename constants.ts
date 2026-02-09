
// Cloudflare Worker URL
// For local development: http://localhost:8787
// For production: set VITE_WORKER_URL environment variable
export const API_BASE_URL: string = import.meta.env.VITE_WORKER_URL || 'http://localhost:8787';

// Legacy constant for backward compatibility (deprecated)
export const GOOGLE_SCRIPT_URL: string = API_BASE_URL;