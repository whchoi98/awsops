/** @type {import('next').NextConfig} */
const nextConfig = {
  basePath: '/awsops',
  env: {
    NEXT_PUBLIC_DOCS_URL: process.env.NEXT_PUBLIC_DOCS_URL || 'https://whchoi98.github.io/awsops',
  },
};

export default nextConfig;
