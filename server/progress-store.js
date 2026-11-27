// Revisions are bounded to JavaScript safe integers by the table constraint.
// PostgreSQL's float8 decoder returns them as numbers on the JSON wire.
const columns = "revision::float8 AS revision, progress";

export function createProgressStore(pool) {
  return {
    async read(keyHash) {
      const result = await pool.query(
        `SELECT ${columns} FROM game_progress WHERE key_hash = $1`,
        [keyHash],
      );
      return result.rows[0] ?? null;
    },

    async write(keyHash, expectedRevision, progress) {
      // The unique key arbitrates concurrent creates. Each update rechecks the
      // expected revision under the row lock, even when two writers race.
      const result = expectedRevision === 0
        ? await pool.query(
            `INSERT INTO game_progress (key_hash, revision, progress)
             VALUES ($1, 1, $2)
             ON CONFLICT (key_hash) DO NOTHING
             RETURNING ${columns}`,
            [keyHash, progress],
          )
        : await pool.query(
            `UPDATE game_progress SET revision = revision + 1, progress = $3
             WHERE key_hash = $1 AND revision = $2 AND revision < 9007199254740991
             RETURNING ${columns}`,
            [keyHash, expectedRevision, progress],
          );
      return result.rows[0] ?? null;
    },
  };
}
