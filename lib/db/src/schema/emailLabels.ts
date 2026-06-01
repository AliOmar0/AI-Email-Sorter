import { pgTable, integer, primaryKey } from "drizzle-orm/pg-core";
import { emailsTable } from "./emails";
import { labelsTable } from "./labels";

export const emailLabelsTable = pgTable(
  "email_labels",
  {
    emailId: integer("email_id")
      .notNull()
      .references(() => emailsTable.id, { onDelete: "cascade" }),
    labelId: integer("label_id")
      .notNull()
      .references(() => labelsTable.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.emailId, t.labelId] })],
);

export type EmailLabel = typeof emailLabelsTable.$inferSelect;
