/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',  // Enable static exports
  images: {
    unoptimized: true, // Required for static export
  },
  basePath: '/Blockchain-based-Industry-Project',
  assetPrefix: '/Blockchain-based-Industry-Project/',
}

module.exports = nextConfig 