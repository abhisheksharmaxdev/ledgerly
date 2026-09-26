import { Router } from "express";
import { userId } from "../auth/session";
import type { DB } from "../db/connection";
import { categoryCreateSchema, categoryUpdateSchema } from "../../../shared/schemas";
import { createCategory, listCategories, updateCategory } from "../repositories/categories";
import { idParam } from "../utils/http";
import { parseOrThrow } from "../utils/validate";

export function categoriesRouter(db: DB): Router {
  const r = Router();

  r.get("/", (req, res) => {
    res.json(listCategories(db, userId(req)));
  });

  r.post("/", (req, res) => {
    res.status(201).json(createCategory(db, userId(req), parseOrThrow(categoryCreateSchema, req.body)));
  });

  // Categories are archived rather than deleted, so historical expenses keep their meaning.
  r.patch("/:id", (req, res) => {
    res.json(updateCategory(db, userId(req), idParam(req), parseOrThrow(categoryUpdateSchema, req.body)));
  });

  return r;
}
