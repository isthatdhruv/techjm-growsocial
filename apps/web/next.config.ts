import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@techjm/shared', '@techjm/db'],
};

export default nextConfig;
