function mapEntityById(list, entityId, next) {
  return list.map((row) => row.id === entityId ? next(row) : row);
}
export {
  mapEntityById
};
