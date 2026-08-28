import type { NextConfig } from "next";

const isGitHubPages = process.env.GITHUB_ACTIONS === "true";
const repoBasePath = "/Cars";

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  basePath: isGitHubPages ? repoBasePath : "",
  assetPrefix: isGitHubPages ? repoBasePath : undefined,
};

export default nextConfig;
