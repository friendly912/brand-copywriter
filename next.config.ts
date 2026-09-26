import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Local desktop tool: no telemetry-relevant features, keep uploads generous.
  experimental: { serverActions: { bodySizeLimit: "20mb" } },
};

export default nextConfig;
