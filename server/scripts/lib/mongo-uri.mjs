// The database name a MongoDB connection string's path names, if it names one.
//
// WHY THIS EXISTS. `config/env.ts` resolves the database from `MONGODB_DB_NAME` and passes it
// as `dbName`; the URI's path segment is deliberately ignored by the connection. That is
// correct for the server, and it means a shell can hold two different answers at once: a URI
// that ends `/inventoryai_prod_db` and a resolved name of `inventoryai_dev_db`. The connection
// obeys the resolved name, so the run is not actually ambiguous — but the shell it came from
// is, and every earlier instruction in it was written for the other database.
//
// The seeders and the cleanup commands refuse that combination rather than pick a winner: a
// URI whose path disagrees with the target is evidence that the operator thinks they are
// somewhere else, and a destructive command should stop on that evidence rather than proceed
// correctly-but-unexpectedly.
//
// The parser is deliberately forgiving, because a connection string is not a URL in the strict
// sense and `new URL` rejects some valid forms:
//   * no scheme, or `mongodb://` / `mongodb+srv://`;
//   * credentials containing `@` (password percent-escaped or not);
//   * several hosts, `host:port`, IPv6 in brackets;
//   * a path, a path with a trailing slash, or a query with no path at all.
// It returns ONLY the database segment — never the host, the credentials or the query, all of
// which can carry secrets.

/**
 * @param {string} uri a MongoDB connection string, possibly empty
 * @returns {string} the path's database name, decoded, or `''` when the URI names none
 */
export function databaseNameInUri(uri) {
  const raw = String(uri ?? '').trim();
  if (!raw) return '';

  // Drop the scheme; everything after it is "credentials@hosts/path?query".
  const withoutScheme = raw.replace(/^mongodb(\+srv)?:\/\//i, '');

  // The host section ends at the FIRST '/' after the LAST '@' — credentials are the only
  // place an '@' appears, and a cluster with several hosts still has one host section.
  const at = withoutScheme.lastIndexOf('@');
  const afterCredentials = at === -1 ? withoutScheme : withoutScheme.slice(at + 1);
  const slash = afterCredentials.indexOf('/');
  if (slash === -1) return '';

  const path = afterCredentials.slice(slash + 1).split('?')[0].trim();
  if (!path) return '';

  try {
    return decodeURIComponent(path);
  } catch {
    // A malformed escape is not a reason to guess; the segment is reported as it is.
    return path;
  }
}

export default { databaseNameInUri };
