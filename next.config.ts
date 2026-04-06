import type { NextConfig } from "next";
import path from "path";

/**
 * Security headers applied to every response.
 * The app is same-origin (Next.js serves both UI and API routes)
 * so CORS headers are intentionally omitted — the browser enforces
 * same-origin policy automatically.
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-XSS-Protection", value: "1; mode=block" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  // "standalone" is needed for Docker/Fly.io but breaks Vercel — only enable for Docker builds.
  ...(process.env.BUILD_TARGET === "docker" && {
    output: "standalone",
    outputFileTracingRoot: path.join(__dirname),
  }),

  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
    ];
  },

  // Ensure server-only env vars are never bundled into the client.
  // GEMINI_API_KEY and GROQ_API_KEY lack the NEXT_PUBLIC_ prefix
  // so Next.js already excludes them, but this is an explicit safety net.
  serverExternalPackages: ["pdf-parse", "tesseract.js"],
};

export default nextConfig;
