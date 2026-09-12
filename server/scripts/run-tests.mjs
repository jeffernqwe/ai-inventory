// Phase 07F (M9) — test runner. Sets TEST_MODE and runs the node:test suite for
// exactly the file set that mode owns, so every mode is deterministic and no
// suite is silently dropped.
//
//   full  (npm test)            — every test file. DB-required suites fail loudly
//                                 if MongoDB is unreachable (never a false green).
//   unit  (npm run test:unit)   — DB-independent files + mixed files; DB-required
//                                 suites inside mixed files are skipped with a
//                                 visible reason (testEnv.mjs). No MongoDB needed.
//   db    (npm run test:db)     — DB-required files + mixed files; DB-independent
//                                 suites inside mixed files are skipped with a
//                                 visible reason. MongoDB required.
//
// The classification below is authoritative for what each mode runs; it mirrors
// the Phase 07F suite-classification report and the server test docs.
import { spawn } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(scriptDir, '..');
const testDir = path.join(serverRoot, 'test');

const VALID = ['full', 'unit', 'db'];
const mode = String(process.argv[2] || 'full').trim().toLowerCase();
if (!VALID.includes(mode)) {
  console.error(`[run-tests] Unknown mode "${process.argv[2] || ''}" — expected one of ${VALID.join(', ')}.`);
  process.exit(2);
}

// ---------------------------------------------------------------------------
// Phase 07F suite classification (by actual DB/unit content, not filenames).
// ---------------------------------------------------------------------------
const PURE_UNIT = [
  'phase03-rbac.test.mjs',            // middleware/constants unit tests
  'phase06-ai-wire.test.mjs',         // AgentRouter/Anthropic wire mapping
  'phase07d-production-config.test.mjs', // env validation, health, shutdown
  'phase20f-ai-conversation-index.test.mjs', // schema-declaration guard for the ai_conversations list index (M-5)
  'phase20g-list-sort-indexes.test.mjs', // schema-declaration guards for the products/purchase_orders/users list-sort indexes
  'phase21-product-archive-invariant.test.mjs', // declaration guards for the archive-only product lifecycle + inventory↔product dependency
  'phase22-authorization-contract.test.mjs', // route↔permission bindings, catalogue coverage, CATALOGUE_ONLY declaration
  'phase23-authorization-contract.test.mjs', // route authorization classification, mobile RBAC mirror, requireRole inertness, client error-code contract
];
const PURE_DB = [
  'phase03-auth.test.mjs',            // auth + RBAC over real routes + Mongo
  'phase04-catalog.test.mjs',         // categories/locations/products CRUD
  'phase04-inventory.test.mjs',       // stock in/out/adjust + dashboard
  'phase06-ai-behavior.test.mjs',     // AI chat over real routes (fake provider)
  'phase06-ai-tools.test.mjs',        // read-only AI tools against real data
  'phase06-ai-security.test.mjs',     // session/business isolation on AI routes
  'phase07a-inventory-compensation.test.mjs', // failure-injection hardening
  'phase07b-auth-security.test.mjs',  // business status + auth rate limiting
  'phase19-transfers.test.mjs',       // stock transfers between locations + compensation
  'phase20-pagination-order.test.mjs', // offset-pagination ordering determinism across the nine list paths
  'phase20-pagination-contract.test.mjs', // offset-pagination coercion contract (page/limit defaults, cap, empty past-end page)
  'phase20-filter-contract.test.mjs', // list filter contract (invalid status/supplierId/blank q rejected, valid filters still narrow)
  'phase24-runtime-authorization-matrix.test.mjs', // runtime role x real-route matrix + role-change effect on an existing JWT
];
const MIXED = [
  'phase06-ai-provider.test.mjs',     // unit: provider selection; db: loop + mapping
  'phase07c-http-security.test.mjs',  // unit: headers/body-limit/CORS; db: auth cases + M4
  'phase07d-db-reliability.test.mjs', // unit: error mapping; db: readiness + DB-down
  'phase07e-ai-reliability.test.mjs', // unit: message shape; db: M6/M7 routes
  'phase08a-request-logging.test.mjs', // unit: request-id + log shape; db: authed context
  'phase10-commercialization.test.mjs', // unit: plan catalog + decision core; db: plan state
  'phase11-intelligence.test.mjs', // unit: stock-status classifier; db: reorder list + dashboard health + AI restock tool
  'phase12a-barcode.test.mjs', // db: barcode lookup endpoint (success, isolation, duplicate, archived, RBAC)
  'phase12d-barcode-generation.test.mjs', // db: POST /:id/generate-barcode (generate, no-overwrite, lookup, isolation, archived, RBAC)
  'phase13-suppliers.test.mjs', // db: suppliers CRUD over /api/suppliers (extra contact fields, RBAC, isolation, archive)
  'phase13-purchase-orders.test.mjs', // db: PO create/list/get/DRAFT-edit/issue/cancel (numbering, lifecycle, RBAC, isolation, no stock writes)
  'phase13-receiving.test.mjs', // db: PO receiving into the ledger (partial/full, auto-RECEIVED, over-receive 409, concurrency, full precise undo, RBAC/isolation)
  'phase14-users.test.mjs', // db: user management over /api/users (create/list/role+status, RBAC, OWNER/ADMIN/self protections, dup email, disabled, isolation, audit)
  'phase15-account-security.test.mjs', // db: change-password + PATCH /me (session invalidation via passwordChangedAt vs JWT iat, strict /me whitelist)
  'phase16-audit-viewer.test.mjs', // db: read-only audit trail over GET /api/audit (RBAC, isolation, filters, pagination, actor population, DTO hygiene)
];

const FILE_LISTS = {
  full: [...PURE_UNIT, ...PURE_DB, ...MIXED],
  unit: [...PURE_UNIT, ...MIXED],
  db: [...PURE_DB, ...MIXED],
};

// Resolve every listed file against the real test dir so a typo/drift fails now
// instead of silently shrinking a run. Any *.test.mjs file not classified here
// is reported so the classification cannot silently go stale.
const onDisk = readdirSync(testDir).filter((f) => f.endsWith('.test.mjs')).sort();
const classified = new Set([...PURE_UNIT, ...PURE_DB, ...MIXED]);
const unclassified = onDisk.filter((f) => !classified.has(f));
if (unclassified.length) {
  console.error(`[run-tests] Unclassified test file(s) present — add them to run-tests.mjs: ${unclassified.join(', ')}`);
  process.exit(2);
}

const files = FILE_LISTS[mode].map((f) => path.join(testDir, f));

// ---------------------------------------------------------------------------
// Run.
// ---------------------------------------------------------------------------
const desc = {
  full: 'full suite (DB-backed suites fail loudly if MongoDB is unreachable)',
  unit: 'DB-independent tests only (no MongoDB required)',
  db: 'DB-backed tests only (MongoDB required; fails loudly if unreachable)',
}[mode];

console.log(`[run-tests] TEST_MODE=${mode}: ${files.length} file(s) — ${desc}`);
console.log(`[run-tests] files: ${FILE_LISTS[mode].join(', ')}`);

const child = spawn(process.execPath, ['--test', ...files], {
  cwd: serverRoot,
  // LOG_REQUESTS=0 keeps the Phase 08A per-request access log off during test
  // runs (error logs are unaffected and always emit). Individual suites that
  // must exercise the access log enable it explicitly via createApp.
  env: { ...process.env, TEST_MODE: mode, LOG_REQUESTS: process.env.LOG_REQUESTS || '0' },
  stdio: 'inherit',
});

child.on('error', (err) => {
  console.error(`[run-tests] failed to start node --test: ${err.message}`);
  process.exit(1);
});

child.on('exit', (code, signal) => {
  if (signal) {
    console.error(`[run-tests] node --test terminated by signal ${signal}`);
    process.exit(1);
  }
  process.exit(code ?? 1);
});
