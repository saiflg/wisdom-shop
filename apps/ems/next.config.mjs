/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Same reasoning as apps/web: standalone output ships only the modules
  // actually traced rather than the whole symlinked workspace node_modules.
  output: "standalone",
  async rewrites() {
    const apiUrl = process.env.EMS_API_URL ?? "http://localhost:4001";
    // Same-origin proxy, same reasoning as apps/web's own rewrite: the
    // refresh cookie is scoped to Path=/v1/auth, which only matches
    // requests that actually go through this origin.
    return [
      { source: "/v1/:path*", destination: `${apiUrl}/v1/:path*` },
      { source: "/health", destination: `${apiUrl}/health` },
    ];
  },
};

export default nextConfig;
