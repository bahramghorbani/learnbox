import path from 'node:path';

/** @type {import('next').NextConfig} */
export default {
  reactStrictMode: true,
  outputFileTracingRoot: path.join(import.meta.dirname, '../..'),
};
