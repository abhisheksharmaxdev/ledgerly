import { Router } from "express";
import { userId } from "../auth/session";
import type { DB } from "../db/connection";
import { categoryCreateSchema, categoryUpdateSchema } from "../../../shared/schemas";
import { createCategory, listCategories, updateCategory } from "../repositories/categories";
import { idParam } from "../utils/http";
import { parseOrThrow } from "../utils/validate";

export function categoriesRouter(db: DB): Router {
  const r = Router();

  r.get("/", async (req, res) => {
    res.json(await listCategories(db, userId(req)));
  });

  r.post("/", async (req, res) => {
    res.status(201).json(await createCategory(db, userId(req), parseOrThrow(categoryCreateSchema, req.body)));
  });

  // Categories are archived rather than deleted, so historical expenses keep their meaning.
  r.patch("/:id", async (req, res) => {
    res.json(await updateCategory(db, userId(req), idParam(req), parseOrThrow(categoryUpdateSchema, req.body)));
  });

  return r;
}
