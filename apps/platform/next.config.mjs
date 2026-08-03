/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  async rewrites() {
    const apiUrl = process.env.EMS_API_URL ?? "http://localhost:4001";
    // Same-origin proxy, same reasoning as apps/ems: the platform refresh
    // cookie is path-scoped and only matches requests through this origin.
    // Note this portal runs on its own origin (port 3002) precisely so a
    // platform token can never be reached from the school portal's origin.
    return [
      { source: "/v1/:path*", destination: `${apiUrl}/v1/:path*` },
      { source: "/health", destination: `${apiUrl}/health` },
    ];
  },
};

export default nextConfig;
