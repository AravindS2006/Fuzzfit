let localWriteTail: Promise<void> = Promise.resolve();

/** SQLite has one writer. Queue the complete summary write (including its
 * rate-limit update) so interactive transactions do not deadlock each other.
 * PostgreSQL writes remain concurrent; serialization conflicts are retried.
 */
export async function writeMetrics<T>(
  operation: () => Promise<T>,
  sqlite: boolean,
  beforeWrite?: () => Promise<void>,
): Promise<T> {
  const previous = localWriteTail;
  let release: (() => void) | undefined;
  if (sqlite) {
    localWriteTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
  }
  try {
    await beforeWrite?.();
    for (let attempt = 0; ; attempt++) {
      try {
        return await operation();
      } catch (error) {
        if (
          attempt >= 2 ||
          typeof error !== 'object' ||
          error === null ||
          !('code' in error) ||
          error.code !== 'P2034'
        )
          throw error;
        await new Promise((resolve) =>
          setTimeout(resolve, 25 * (attempt + 1) + Math.random() * 50),
        );
      }
    }
  } finally {
    release?.();
  }
}
