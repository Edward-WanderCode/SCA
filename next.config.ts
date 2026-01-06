import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Empty turbopack config to silence warning
  turbopack: {},
  outputFileTracingExcludes: {
    '*': [
      'OpenGrep/**/*',
      '.sca-data/**/*',
      './**/OpenGrep/**/*',
      './**/.sca-data/**/*'
    ]
  },
};

export default nextConfig;
