export class HttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(`${status} ${message}`);
    this.name = "HttpError";
    this.status = status;
  }
}
