/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Emits .next/standalone with a self-contained server and only the modules
  // it actually traced. The alternative for a pnpm workspace is shipping the
  // whole symlinked node_modules tree into the runtime image.
  output: "standalone",
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
    ],
  },
  async rewrites() {
    const apiUrl = process.env.API_URL ?? "http://localhost:4000";
    // Preserve the exact /v1/... path (not prefixed with /api) so the
    // API's refresh cookie — scoped to Path=/v1/auth — actually matches
    // requests the browser makes through this same-origin proxy.
    return [
      { source: "/v1/:path*", destination: `${apiUrl}/v1/:path*` },
      { source: "/health", destination: `${apiUrl}/health` },
    ];
  },
};

export default nextConfig;
