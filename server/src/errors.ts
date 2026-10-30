/** An error whose message is safe and useful to show to the user. */
export class UserError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status = 400, code = 'bad_request') {
    super(message);
    this.name = 'UserError';
    this.status = status;
    this.code = code;
  }
}
