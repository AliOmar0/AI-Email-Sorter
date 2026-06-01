import express, { type Express } from "express";
import cors from "cors";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import pinoHttp from "pino-http";
import { pool } from "@workspace/db";
import router from "./routes";
import { errorHandler } from "./middlewares/errorHandler";
import { logger } from "./lib/logger";

const app: Express = express();

const sessionSecret = process.env["SESSION_SECRET"];
if (!sessionSecret) {
  throw new Error("SESSION_SECRET environment variable is required");
}

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
// Cross-origin deployments (static frontend on a different domain than this API)
// must allow that origin explicitly with credentials. On Replit the app is
// same-origin, so the permissive default is used. Set WEB_APP_URL to the
// deployed frontend URL to enable the restricted, credentialed policy.
const webAppUrl = process.env["WEB_APP_URL"];
if (webAppUrl) {
  app.use(
    cors({
      origin: new URL(webAppUrl).origin,
      credentials: true,
    }),
  );
} else {
  app.use(cors());
}
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Behind the Replit reverse proxy; required for secure cookies.
app.set("trust proxy", 1);

// connect-pg-simple's `createTableIfMissing` reads a bundled `table.sql` at
// runtime, which esbuild does not emit into dist/. Create the session table
// ourselves with idempotent DDL (see ensureSessionTable, called at startup)
// and disable the library's own table creation.
export async function ensureSessionTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "session" (
      "sid" varchar NOT NULL PRIMARY KEY,
      "sess" json NOT NULL,
      "expire" timestamp(6) NOT NULL
    );
    CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");
  `);
}

const PgStore = connectPgSimple(session);
app.use(
  session({
    store: new PgStore({ pool, createTableIfMissing: false }),
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 24 * 30,
    },
  }),
);

app.use("/api", router);

app.use(errorHandler);

export default app;
