/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static HTML export — Netlify serves `out/` directly from its CDN.
  output: 'export',
  reactStrictMode: true,
  trailingSlash: true,
  images: { unoptimized: true },
  eslint: { ignoreDuringBuilds: true },
  webpack: (config) => {
    // pdfjs-dist tries to require node-canvas when it thinks it is on the server.
    // We only ever render in the browser, so stub it out.
    config.resolve.alias = { ...config.resolve.alias, canvas: false };
    config.resolve.fallback = { ...config.resolve.fallback, fs: false, path: false };
    return config;
  },
};

export default nextConfig;
