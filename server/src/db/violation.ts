/** pg のエラーから違反した制約名を取り出す。Drizzle は元のエラーを cause に包む */
export function violatedConstraint(error: unknown): string | undefined {
  let current: unknown = error;
  while (current instanceof Error) {
    const { constraint } = current as Error & { constraint?: unknown };
    if (typeof constraint === "string") return constraint;
    current = current.cause;
  }
  return undefined;
}
