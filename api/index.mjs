// Vercel serverless function entry. Vercel auto-detects files in this top-level
// `/api` directory as functions. It re-exports the pre-bundled Express handler
// produced by `pnpm --filter @workspace/api-server run build:vercel`
// (see vercel.json buildCommand). The bundle inlines the workspace TypeScript
// source, so no separate library build step is needed on Vercel.
export { default } from "../artifacts/api-server/dist/vercel.mjs";
