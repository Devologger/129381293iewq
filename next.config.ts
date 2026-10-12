import type { NextConfig } from "next";

const development = process.env.NODE_ENV !== "production";
const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  outputFileTracingIncludes: { "/api/terminal/research": ["./research/*.py"], "/api/terminal/strategy-lab": ["./research/*.py"] },
  outputFileTracingExcludes: { "**/*": [".runtime/**/*", ".env*", ".git/**/*", "obsidian-vault/Research/**/*"] },
  async headers() {
    return [{ source: "/:path*", headers: [
      { key: "Content-Security-Policy", value: `default-src 'self'; base-uri 'self'; frame-ancestors 'none'; object-src 'none'; form-action 'self'; script-src 'self' 'unsafe-inline'${development ? " 'unsafe-eval'" : ""}; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'${development ? " ws://localhost:* ws://127.0.0.1:*" : ""}; worker-src 'self' blob:` },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=(), payment=(), usb=()" },
    ] }];
  },
};
export default nextConfig;
