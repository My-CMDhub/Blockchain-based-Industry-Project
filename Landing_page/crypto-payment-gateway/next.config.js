/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',  // Enable static exports
  images: {
    unoptimized: true, // Required for static export
  },
  basePath: process.env.NODE_ENV === 'production' ? '/{repo-name}' : '',
  assetPrefix: process.env.NODE_ENV === 'production' ? '/{repo-name}/' : '',
}

module.exports = nextConfig 