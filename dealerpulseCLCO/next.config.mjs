/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    optimizePackageImports: ["echarts/core", "echarts/charts", "echarts/components", "echarts/renderers"],
  },
};

export default nextConfig;
