import { Router, type IRouter } from "express";
import { SwitchAccountBody } from "@workspace/api-zod";
import { db, accountsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import {
  listAccountsForUser,
  getAccountForUser,
  toApiAccount,
} from "../lib/accounts";
import { asyncRoute } from "../middlewares/asyncRoute";

const router: IRouter = Router();

// List the signed-in user's connected accounts, flagging the active one.
router.get(
  "/accounts",
  asyncRoute("accounts.list", async (req, res) => {
    const accounts = await listAccountsForUser(req.user!.id);
    res.json(accounts.map((a) => toApiAccount(a, req.account?.id)));
  }),
);

// Switch the active account (persisted in the session for cookie mode; clients
// in bearer mode additionally send the choice via the X-Account-Id header).
router.post(
  "/accounts/switch",
  asyncRoute("accounts.switch", async (req, res, next) => {
    const body = SwitchAccountBody.parse(req.body);
    const account = await getAccountForUser(req.user!.id, body.accountId);
    if (!account) {
      res.status(404).json({ error: "Account not found" });
      return;
    }
    req.session.activeAccountId = account.id;
    const accounts = await listAccountsForUser(req.user!.id);
    req.session.save((err) => {
      if (err) return next(err);
      res.json(accounts.map((a) => toApiAccount(a, account.id)));
    });
  }),
);

// Unlink a connected account. The primary account (the login identity) cannot
// be removed. If the active account is unlinked, fall back to the primary.
router.delete(
  "/accounts/:id",
  asyncRoute("accounts.unlink", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Invalid account id" });
      return;
    }
    const account = await getAccountForUser(req.user!.id, id);
    if (!account) {
      res.status(404).json({ error: "Account not found" });
      return;
    }
    if (account.isPrimary) {
      res.status(400).json({ error: "The primary account cannot be removed" });
      return;
    }
    await db
      .delete(accountsTable)
      .where(and(eq(accountsTable.id, id), eq(accountsTable.userId, req.user!.id)));

    if (req.session.activeAccountId === id) {
      delete req.session.activeAccountId;
    }
    const accounts = await listAccountsForUser(req.user!.id);
    const activeId = req.session.activeAccountId ?? accounts.find((a) => a.isPrimary)?.id;
    res.json(accounts.map((a) => toApiAccount(a, activeId)));
  }),
);

export default router;
