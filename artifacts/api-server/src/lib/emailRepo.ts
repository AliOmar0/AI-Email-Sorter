import { db, emailsTable, labelsTable, emailLabelsTable } from "@workspace/db";
import { eq, inArray, sql } from "drizzle-orm";

export interface ApiLabel {
  id: number;
  name: string;
  color: string;
  description: string | null;
  isSystem: boolean;
  emailCount: number;
}

export interface ApiEmail {
  id: number;
  sender: string;
  senderEmail: string;
  subject: string;
  snippet: string;
  body: string;
  receivedAt: string;
  isRead: boolean;
  isStarred: boolean;
  labels: ApiLabel[];
}

function toApiLabel(row: typeof labelsTable.$inferSelect): ApiLabel {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    description: row.description ?? null,
    isSystem: row.isSystem,
    emailCount: 0,
  };
}

export async function getLabelsForEmails(
  emailIds: number[],
): Promise<Map<number, ApiLabel[]>> {
  const map = new Map<number, ApiLabel[]>();
  if (emailIds.length === 0) return map;

  const rows = await db
    .select({
      emailId: emailLabelsTable.emailId,
      id: labelsTable.id,
      name: labelsTable.name,
      color: labelsTable.color,
      description: labelsTable.description,
      isSystem: labelsTable.isSystem,
    })
    .from(emailLabelsTable)
    .innerJoin(labelsTable, eq(emailLabelsTable.labelId, labelsTable.id))
    .where(inArray(emailLabelsTable.emailId, emailIds));

  for (const r of rows) {
    const list = map.get(r.emailId) ?? [];
    list.push({
      id: r.id,
      name: r.name,
      color: r.color,
      description: r.description ?? null,
      isSystem: r.isSystem,
      emailCount: 0,
    });
    map.set(r.emailId, list);
  }
  return map;
}

export function serializeEmail(
  row: typeof emailsTable.$inferSelect,
  labels: ApiLabel[],
): ApiEmail {
  return {
    id: row.id,
    sender: row.sender,
    senderEmail: row.senderEmail,
    subject: row.subject,
    snippet: row.snippet,
    body: row.body,
    receivedAt: row.receivedAt.toISOString(),
    isRead: row.isRead,
    isStarred: row.isStarred,
    labels,
  };
}

export async function getEmailById(id: number): Promise<ApiEmail | null> {
  const [row] = await db
    .select()
    .from(emailsTable)
    .where(eq(emailsTable.id, id));
  if (!row) return null;
  const labelMap = await getLabelsForEmails([id]);
  return serializeEmail(row, labelMap.get(id) ?? []);
}

export async function getEmailsByIds(ids: number[]): Promise<ApiEmail[]> {
  if (ids.length === 0) return [];
  const rows = await db
    .select()
    .from(emailsTable)
    .where(inArray(emailsTable.id, ids));
  const labelMap = await getLabelsForEmails(rows.map((r) => r.id));
  return rows.map((r) => serializeEmail(r, labelMap.get(r.id) ?? []));
}

export async function listLabelsWithCounts(): Promise<ApiLabel[]> {
  const labels = await db.select().from(labelsTable);
  const counts = await db
    .select({
      labelId: emailLabelsTable.labelId,
      count: sql<number>`cast(count(*) as int)`,
    })
    .from(emailLabelsTable)
    .groupBy(emailLabelsTable.labelId);

  const countMap = new Map<number, number>();
  for (const c of counts) countMap.set(c.labelId, c.count);

  return labels
    .map((l) => ({ ...toApiLabel(l), emailCount: countMap.get(l.id) ?? 0 }))
    .sort((a, b) => {
      if (a.isSystem !== b.isSystem) return a.isSystem ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
}
