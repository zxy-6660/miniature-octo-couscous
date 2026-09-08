import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 纯客户端应用（无 API 路由），静态导出适配 Cloudflare Pages
  output: "export",
};

export default nextConfig;
