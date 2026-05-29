import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  serverExternalPackages: ["@prisma/client", "@prisma/engines"],
}

export default nextConfig
