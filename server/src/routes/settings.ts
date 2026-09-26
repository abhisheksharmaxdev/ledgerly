import { Router } from "express";
import { userId } from "../auth/session";
import type { DB } from "../db/connection";
import { settingsSchema } from "../../../shared/schemas";
import { getSettings, updateSettings } from "../repositories/settings";
import { parseOrThrow } from "../utils/validate";

export function settingsRouter(db: DB): Router {
  const r = Router();
  r.get("/", (req, res) => {
    res.json(getSettings(db, userId(req)));
  });
  r.put("/", (req, res) => {
    res.json(updateSettings(db, userId(req), parseOrThrow(settingsSchema, req.body)));
  });
  return r;
}
