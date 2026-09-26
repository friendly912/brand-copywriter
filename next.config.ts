import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Loaded at runtime from node_modules rather than bundled (pdf.js does dynamic loading).
  serverExternalPackages: ["unpdf", "mammoth"],
  // Local desktop tool: no telemetry-relevant features, keep uploads generous.
  experimental: { serverActions: { bodySizeLimit: "20mb" } },
};

export default nextConfig;
