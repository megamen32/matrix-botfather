function configuredOwners(value) {
  return new Set(
    String(value || '')
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean),
  );
}

function isOwner(matrixUserId, configured) {
  return Boolean(matrixUserId) && configuredOwners(configured).has(matrixUserId);
}

module.exports = { configuredOwners, isOwner };
