import { boolean, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  googleId: text("google_id").notNull().unique(),
  email: text("email").notNull(),
  name: text("name").notNull(),
  picture: text("picture"),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  tokenExpiry: timestamp("token_expiry", { withTimezone: true }),
  // Bumped on logout to revoke all previously-issued cross-origin bearer
  // tokens (see lib/token.ts). Session-cookie auth ignores this.
  tokenVersion: integer("token_version").notNull().default(0),
  // Opt-in: when true, the scheduled cron auto-labels the user's new unlabeled
  // mail. autoLabelCursor is a watermark (newest message internalDate already
  // considered) so each run only processes mail that arrived since the last.
  autoLabelEnabled: boolean("auto_label_enabled").notNull().default(false),
  autoLabelCursor: timestamp("auto_label_cursor", { withTimezone: true }),
  // Opt-in: when true, the daily digest cron sends one unread-per-label summary
  // email for each connected account.
  dailyDigestEnabled: boolean("daily_digest_enabled").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
