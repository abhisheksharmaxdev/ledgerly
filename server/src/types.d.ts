import type { SessionUser } from "../../shared/types";

declare global {
  namespace Express {
    interface Request {
      /** Set by the session middleware for an active, signed-in account. */
      user?: SessionUser;
    }
  }
}

export {};
