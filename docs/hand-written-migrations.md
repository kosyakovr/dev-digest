# Hand-written Drizzle migrations

`pnpm db:generate` is forbidden by name in [AGENTS.md](../AGENTS.md), and every
file under `server/src/db/migrations/` is off-limits without the user's explicit
approval. **Ask first.** Once approved, a migration is added entirely by hand —
this is the procedure, proven on `0011_add_skill_types` and
`0012_add_convention_triage`.

Doing it by hand is not merely the permitted route, it is the safer one:
`db:generate` diffs the whole schema and will sweep up unrelated drift that
happens to be sitting in `src/db/schema/`, whereas a hand-written migration
contains exactly what you intended.

## The four files

A migration is one `.sql` file plus two JSON edits:

| File | What to do |
|---|---|
| `NNNN_<name>.sql` | write by hand, statements separated by `--> statement-breakpoint` |
| `meta/NNNN_snapshot.json` | copy the previous snapshot, mutate only the intended object |
| `meta/_journal.json` | append one entry |
| `src/db/schema/*.ts` | the Drizzle schema must end up describing the same shape |

Both JSON files ship **without a trailing newline**. Keep it that way — adding
one puts a spurious diff line in every future migration.

## Script the snapshot edit — never hand-edit it

drizzle-kit writes these files with Python's `json.dumps(indent=2)` formatting,
so a load → mutate → re-dump round-trip reproduces them **byte for byte**.
Assert that before changing anything, and the resulting diff contains only what
you meant:

```python
import json, collections, uuid

raw = open('meta/0011_snapshot.json', encoding='utf-8').read()
d = json.loads(raw, object_pairs_hook=collections.OrderedDict)
assert json.dumps(d, indent=2) == raw, "round-trip differs — stop"

# ... mutate d['tables']['public.<table>'] here ...

d['prevId'] = d['id']
d['id'] = str(uuid.uuid4())
open('meta/0012_snapshot.json', 'w', encoding='utf-8').write(json.dumps(d, indent=2))
```

`id` is a fresh uuid and `prevId` is the previous snapshot's `id` — that chain
is what drizzle-kit walks.

Verify the result with a key-sorted diff of the two snapshots; every changed
line should be one you intended:

```sh
diff <(python3 -c "import json;print(json.dumps(json.load(open('meta/0011_snapshot.json')),indent=2,sort_keys=True))") \
     <(python3 -c "import json;print(json.dumps(json.load(open('meta/0012_snapshot.json')),indent=2,sort_keys=True))")
```

## Object shapes — copy them, do not invent them

Read the real shapes out of `node_modules/drizzle-kit/bin.cjs` rather than
guessing. Two that have bitten us:

- a unique constraint is `{name, nullsNotDistinct, columns}`;
- a table needs all ten keys, including the easily-forgotten `policies`,
  `checkConstraints` and `isRLSEnabled`.

An index entry looks like:

```json
{ "name": "conventions_repo_created_idx",
  "columns": [{ "expression": "repo_id", "isExpression": false, "asc": true, "nulls": "last" }],
  "isUnique": false, "concurrently": false, "method": "btree", "with": {} }
```

Column order inside `columns` mirrors the TypeScript schema's declaration order.
Postgres appends physically-new columns at the end of the table, so `\d <table>`
will not match that order — drizzle compares by name, so this is fine.

## The journal entry

Append to `entries`, copying `version` from the previous entry and giving `when`
a timestamp after it:

```json
{ "idx": 12, "version": "7", "when": 1789939321715,
  "tag": "0012_add_convention_triage", "breakpoints": true }
```

## Writing the SQL

Match drizzle-kit's own style so a future generated migration reads the same:

```sql
ALTER TABLE "conventions" ADD COLUMN "status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
CREATE INDEX "conventions_repo_created_idx" ON "conventions" USING btree ("repo_id","created_at");
```

Adding a `NOT NULL` column to a table that might hold rows needs a `DEFAULT`, or
the `ALTER` fails. When a column is only defaulted to make the `ALTER` safe, say
so in the schema comment — `conventions.evidence_line` is defaulted to `1` for
exactly that reason, and every row the service writes sets it explicitly.

Dropping a column that carries meaning means migrating the data first:

```sql
UPDATE "conventions" SET "status" = 'accepted' WHERE "accepted" = true;--> statement-breakpoint
ALTER TABLE "conventions" DROP COLUMN "accepted";
```

## Verify before you commit

Apply the whole chain to a throwaway database — never to the dev database first:

```sh
docker exec devdigest-postgres psql -U devdigest -d postgres -c 'CREATE DATABASE mig_check;'
DATABASE_URL=postgres://devdigest:<pw>@localhost:5432/mig_check npx tsx src/db/migrate.ts
docker exec devdigest-postgres psql -U devdigest -d mig_check -c '\d <table>'
docker exec devdigest-postgres psql -U devdigest -d postgres -c 'DROP DATABASE mig_check;'
```

`src/db/migrate.ts` reads `DATABASE_URL` through `dotenv`, which loads `.env` —
this repo keeps its values in `.env.local`, so pass the variable explicitly.

`scripts/e2e.sh` applies the full chain to an ephemeral database on every run, so
a broken migration fails CI rather than a developer's machine.
