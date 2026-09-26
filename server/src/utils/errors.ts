/** Errors that are safe to show to users. Anything else becomes a generic 500. */
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly fields?: Record<string, string>,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export const badRequest = (message: string, fields?: Record<string, string>) =>
  new HttpError(400, "validation_error", message, fields);
export const notFound = (message = "Not found") => new HttpError(404, "not_found", message);
export const conflict = (message: string) => new HttpError(409, "conflict", message);
export const unauthorized = (message = "Please sign in to continue") => new HttpError(401, "unauthorized", message);
