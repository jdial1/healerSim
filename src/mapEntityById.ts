export function mapEntityById<T extends { id: string }>(
  list: readonly T[],
  entityId: string,
  next: (row: T) => T,
): T[] {
  return list.map((row) => (row.id === entityId ? next(row) : row));
}
