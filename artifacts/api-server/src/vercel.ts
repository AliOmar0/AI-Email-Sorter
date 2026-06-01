import type { IncomingMessage, ServerResponse } from "node:http";
import app, { ensureSessionTable } from "./app";

// Serverless entry for Vercel. The Express app is exported as the request
// handler; we ensure the Postgres-backed session table exists once per warm
// instance before forwarding the request. Replit uses src/index.ts instead.
let ready: Promise<void> | null = null;
function ensureReady(): Promise<void> {
  if (!ready) ready = ensureSessionTable();
  return ready;
}

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  await ensureReady();
  (app as unknown as (req: IncomingMessage, res: ServerResponse) => void)(
    req,
    res,
  );
}
