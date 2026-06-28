/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // @react-pdf/renderer (used server-side for PDF attachments) ships fontkit and
  // a wasm layout engine — keep it out of the webpack bundle so it loads natively.
  experimental: {
    serverComponentsExternalPackages: ["@react-pdf/renderer"],
  },
};

export default nextConfig;
