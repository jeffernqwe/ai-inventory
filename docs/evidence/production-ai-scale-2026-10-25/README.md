# A large tenant in production, and the assistant measured there — 2026-10-25

The first run of `seed:perf-tenant` against `inventoryai_prod_db`, followed by
`perf:turns --login` against the deployed server. Both were run from the owner's laptop;
nothing was installed on a phone and no mobile build was made.

- Database: `inventoryai_prod_db` (production), `NODE_ENV=production`
- Tenant: `PERF SEED — AI assistant stress test (do not use)`
  (`6addbf51feb6d4c5b40c1a93`), owner `perf-seed-ai@example.invalid`
- Server: `https://ai-inventory-l1mi.onrender.com`
- Auth for the probe: Firebase sign-in over REST as the seeded owner, then
  `POST /api/auth/firebase/exchange` — the production path, not a locally minted session
- Model: `nvidia/nemotron-3.5-lightning:free`

## The seed

`npm run seed:perf-tenant -- --database=inventoryai_prod_db --size=60000`

```text
[seed:perf-tenant] database : inventoryai_prod_db   (PRODUCTION)
[seed:perf-tenant] size     : 60000 document(s), PRNG seed 1 (reproducible)
[seed:perf-tenant] identity : uid OwS6t2TkFE… (already existed, password refreshed)
[seed:perf-tenant] tenant   : reused 6addbf51feb6d4c5b40c1a93
[seed:perf-tenant] reset    : removed 6008 previous document(s) of this tenant
[seed:perf-tenant]   categories               18
[seed:perf-tenant]   locations                6
[seed:perf-tenant]   suppliers                240
[seed:perf-tenant]   products                 13500
[seed:perf-tenant]   inventory                27200
[seed:perf-tenant]   inventory_transactions   17836
[seed:perf-tenant]   purchase_orders          1200
[seed:perf-tenant] ledger   : 17836 movement(s) checked
[seed:perf-tenant] OK — verification found no problems
[seed:perf-tenant] elapsed    : 110448 ms
```

The seeder reads every collection back and checks the ledger arithmetic, so "OK" above is a
re-query, not a report of what it intended to write.

## The measurement

`npm run perf:turns -- --base=https://ai-inventory-l1mi.onrender.com --database=inventoryai_prod_db --business=6addbf51feb6d4c5b40c1a93 --login --only=1,2,3,4,5,6`

Allowance before the run: **43 of 50** free-model requests left for the UTC day; after it, **30**, so
the six questions cost **13 provider requests** — about two per question when the answer needs a
lookup.

| # | Question | ms | Tools | Facts checked |
|---|---|---|---|---|
| 1 | How is my inventory doing? | 5,938 | `getInventorySummary` | 13,500 / 2,109 / 848 — present |
| 2 | Which products need restocking, and how many? | 7,366 | `getReorderNeededProducts` | 2,109 — present |
| 3 | Stock of SKU `SEEDSKU-0`? | 3,380 | `getProduct` | `Compact Kettle 10000`, 301 on hand — present |
| 4 | Out-of-stock count and percentage? | 4,220 | `getInventorySummary` | 848, 13,500 — present |
| 5 | How many total units? | 3,275 | `getInventorySummary` | 3,330,619 — present |
| 6 | Products per location, and which holds most? | 13,321 | `getLocationBreakdown` | 13,500 / 9,092 — present |

Result line, verbatim:

```text
[turns] answered 6/6 | grounded 6/6 | ms: 3275, 3380, 4220, 5938, 7366, 13321 | slowest 13321
```

`turns.json` in this folder is the probe's own record of those six answers, written by the run.

## What this proves, and what it does not

- **Proven:** the production database can be given a large, self-consistent, sign-in-able tenant
  without touching any customer's rows; the deployed server answers the assistant's six
  representative questions against 13,500 products in **3.3–13.3 s**; every answer was grounded in
  the tenant's real figures; and the probe authenticated through the production Firebase exchange.
- **Not proven:** a phone signed in to this tenant (the OPPO run is separate evidence), the same
  spread at 60,000+ products, or provider latency on a day with less allowance left.
- The tenant was left in place at the end of the run so the owner could sign in to it; `cleanup:perf-tenant`
  removes it and proves 0 documents remain. See [guide 10](../../guides/10-seeding-production.md) (the seed)
  and [guide 12](../../guides/12-deleting-production.md) (the cleanup).

## Repeat at 80,000 documents, and the full teardown

Later the same day the cycle was run again, at the size the owner asked for, and finished with both
cleanups. The tenant used here is a new one (`6addcd807dfb545ca5383c08`); the earlier one had already
been removed, so the seeder created it and then reused it across runs.

### The seed

`npm run seed:perf-tenant -- --database=inventoryai_prod_db --size=80000`

```text
[seed:perf-tenant] database : inventoryai_prod_db   (PRODUCTION)
[seed:perf-tenant] size     : 80000 document(s), PRNG seed 1 (reproducible)
[seed:perf-tenant] identity : uid OwS6t2TkFE… (already existed, password refreshed)
[seed:perf-tenant] tenant   : reused 6addcd807dfb545ca5383c08
[seed:perf-tenant] reset    : removed 60016 previous document(s) of this tenant
[seed:perf-tenant]   categories               24
[seed:perf-tenant]   locations                6
[seed:perf-tenant]   suppliers                300
[seed:perf-tenant]   products                 18000
[seed:perf-tenant]   inventory                36104
[seed:perf-tenant]   inventory_transactions   23966
[seed:perf-tenant]   purchase_orders          1600
[seed:perf-tenant] ledger   : 23966 movement(s) checked
[seed:perf-tenant] OK — verification found no problems
[seed:perf-tenant] elapsed    : 171465 ms
```

### The measurement

`node --env-file=../mobile/.env scripts/measure-ai-turns.mjs --base=https://ai-inventory-l1mi.onrender.com --database=inventoryai_prod_db --business=6addcd807dfb545ca5383c08 --login --only=1,2`

Allowance before the run: **20 of 50** free-model requests left for the UTC day (30 already used), so
two questions were chosen rather than six.

| # | Question | ms | Tools | Facts checked |
|---|---|---|---|---|
| 1 | How is my inventory doing? | 8,713 | `getInventorySummary` | 18,000 / 2,777 / 1,109 — present |
| 2 | Which products need restocking, and how many? | 16,419 | `getReorderNeededProducts` | 2,777 — present |

Result line, verbatim:

```text
[turns] answered 2/2 | grounded 2/2 | ms: 8713, 16419 | slowest 16419
```

`80k-turns.json` in this folder is the probe's own record of those two answers.

### The teardown

`cleanup:demo` ([guide 12](../../guides/12-deleting-production.md)) emptied the tenant and kept the account:

```text
[cleanup:demo]   ai_messages              4
[cleanup:demo]   ai_conversations         1
[cleanup:demo]   inventory                36104
[cleanup:demo]   inventory_transactions   23966
[cleanup:demo]   purchase_orders          1600
[cleanup:demo]   products                 18000
[cleanup:demo]   categories               24
[cleanup:demo]   locations                6
[cleanup:demo]   suppliers                300
[cleanup:demo]   audit_logs               1
[cleanup:demo] OK — removed 80006 document(s); verification found 0 remaining.
```

Before that number was trusted, the same command was run with a **wrong** business id and refused —
the account belonged to `6addcd807dfb545ca5383c08`, not `000000000000000000000000` — proving the two
identifiers must agree and that the refusal happened before any delete.

`cleanup:perf-tenant` then removed the empty tenant's rows:

```text
[cleanup:perf-tenant] tenant    : 6addcd807dfb545ca5383c08
[cleanup:perf-tenant]   sessions                 2
[cleanup:perf-tenant]   users                    1
[cleanup:perf-tenant]   businesses               1
[cleanup:perf-tenant] OK — removed 4 document(s); verification found 0 remaining.
[cleanup:perf-tenant] kept the Firebase identity for perf-seed-ai@example.invalid (F-50)
```

**Two transient failures, recorded rather than smoothed over:** `cleanup:perf-tenant` answered
`connect ETIMEDOUT 159.143.174.111:27017` twice, and a DNS lookup of the cluster host failed between
the attempts (`curl: (6) Could not resolve host`). A minute later the same command connected and
completed. Both failures happened before any write, so neither left partial state; the sequence is
the intermittent network/DNS note now in guide 6, Part 9.

**End state:** `inventoryai_prod_db` holds no seed tenant (0 documents, 0 users, 0 businesses for it),
and the `perf-seed-ai@example.invalid` Firebase identity remains **on purpose** — deleting an identity
whose database record exists is the unrecoverable direction (F-50). The next `seed:perf-tenant` run
reuses it and refreshes its password.
