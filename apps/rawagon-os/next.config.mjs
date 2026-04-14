/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow importing workspace packages (CommonJS) in API routes
  serverExternalPackages: [
    '@rawagon/allcard-sdk',
    '@rawagon/fee-distributor',
    '@rawagon/gold-oracle',
    '@rawagon/ltn-token',
    '@rawagon/zk-identity',
  ],
};

export default nextConfig;
