import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Export a fully static site (no Node.js server)
  output: "export",
  images: {
    unoptimized: true,
  },
  turbopack: {
    // Silence root inference warning by explicitly setting the project root
    root: process.cwd(),
  },
};

export default nextConfig;
