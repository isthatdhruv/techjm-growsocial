import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@techjm/shared', '@techjm/db', '@techjm/rate-limiter'],
};

export default nextConfig;
