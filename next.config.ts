import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Loaded at runtime from node_modules rather than bundled (pdf.js does dynamic loading).
  serverExternalPackages: ["unpdf", "mammoth"],
  experimental: {
    // Local desktop tool: keep uploads generous.
    serverActions: { bodySizeLimit: "20mb" },
    // Turbopack's on-disk cache renames files inside .next\cache while it works.
    // On Windows that fails with "os error 32" whenever another process (antivirus,
    // OneDrive/Dropbox sync, a second copy of the app) has the file open. The app is
    // built rarely, so the cache isn't worth the risk.
    turbopackFileSystemCacheForBuild: false,
    turbopackFileSystemCacheForDev: false,
  },
};

export default nextConfig;
