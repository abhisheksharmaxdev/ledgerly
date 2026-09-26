import { Router } from "express";
import { z } from "zod";
import type { DB } from "../db/connection";
import type { AdminOverview } from "../../../shared/types";
import { countUsersByStatus, deleteUserAndData, listUsers, setUserStatus, toAdminUser } from "../repositories/users";
import type { Mailer } from "../services/mailer";
import { notFound } from "../utils/errors";
import { idParam } from "../utils/http";
import { parseOrThrow } from "../utils/validate";

/** Mounted behind requireAdmin. Only ordinary accounts can be managed; the admin can't be altered here. */
export function adminRouter(db: DB, mailer: Mailer): Router {
  const r = Router();

  r.get("/overview", async (_req, res) => {
    const body: AdminOverview = { counts: await countUsersByStatus(db), mailConfigured: mailer.configured };
    res.json(body);
  });

  r.get("/users", async (req, res) => {
    const { status } = parseOrThrow(
      z.object({ status: z.enum(["pending", "active", "rejected", "all"]).default("all") }),
      req.query,
    );
    res.json(await listUsers(db, status === "all" ? undefined : status));
  });

  r.post("/users/:id/approve", async (req, res) => {
    const user = await setUserStatus(db, idParam(req), "active");
    if (!user) throw notFound("User not found");
    res.json(toAdminUser(user));
  });

  r.post("/users/:id/reject", async (req, res) => {
    const user = await setUserStatus(db, idParam(req), "rejected");
    if (!user) throw notFound("User not found");
    res.json(toAdminUser(user));
  });

  r.delete("/users/:id", async (req, res) => {
    if (!(await deleteUserAndData(db, idParam(req)))) throw notFound("User not found");
    res.status(204).end();
  });

  return r;
}
