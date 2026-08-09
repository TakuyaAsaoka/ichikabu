/** pg のエラーから違反した制約名を取り出す。Drizzle は元のエラーを cause に包む */
export function violatedConstraint(error: unknown): string | undefined {
  let current: unknown = error;
  while (current instanceof Error) {
    if ("constraint" in current && typeof current.constraint === "string") {
      return current.constraint;
    }
    current = current.cause;
  }
  return undefined;
}
