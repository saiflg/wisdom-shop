/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Same reasoning as apps/web: standalone output ships only the modules
  // actually traced rather than the whole symlinked workspace node_modules.
  output: "standalone",
};

export default nextConfig;
