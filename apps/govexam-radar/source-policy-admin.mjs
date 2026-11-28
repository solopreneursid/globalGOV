import { pathToFileURL } from "node:url";
import { createPostgresPoolFromEnv } from "./postgres-d1.mjs";
import { POLICY_SOURCES } from "./worker.js";
import { recordSourcePolicyReview } from "./source-policy.mjs";

function parseArguments(args) {
  const values = {};
  for (let index = 0; index < args.length; index += 1) {
    const key = args[index];
    if (!key.startsWith("--") || !args[index + 1] || args[index + 1].startsWith("--")) {
      throw new Error("source_policy_argument_invalid");
    }
    const name = key.slice(2);
    if (values[name] !== undefined) throw new Error("source_policy_argument_duplicate");
    values[name] = args[index + 1];
    index += 1;
  }
  return values;
}

function list(value) {
  return String(value || "").split(",").map(item => item.trim()).filter(Boolean);
}

function timestamp(value) {
  if (/^[0-9]{10,16}$/.test(String(value))) return Number(value);
  const parsed = Date.parse(value);
  if (!Number.isSafeInteger(parsed)) throw new Error("source_policy_expiry_invalid");
  return parsed;
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command !== "review") {
    throw new Error("usage: source-policy-admin.mjs review --source-id ID --automation-status STATUS --reuse-status STATUS --allowed-paths /path --content-types application/pdf --policy-url HTTPS_URL --reviewer LABEL --expires-at ISO_DATE --notes TEXT");
  }
  const options = parseArguments(args);
  const source = POLICY_SOURCES.find(item => item.id === options["source-id"]);
  if (!source) throw new Error("unknown_registered_source");
  const paths = list(options["allowed-paths"]);
  const contentTypes = list(options["content-types"]);
  const permittedMethods = paths.flatMap(path => contentTypes.map(contentType => ({
    method: "GET", path, contentType
  })));
  const url = new URL(source.url);
  const allowedHosts = list(options["allowed-hosts"] || url.hostname);
  const pool = await createPostgresPoolFromEnv();
  try {
    const result = await recordSourcePolicyReview(pool, {
      source,
      automatedAccessStatus: options["automation-status"],
      reuseStatus: options["reuse-status"],
      permittedMethods,
      allowedHosts,
      policyUrl: options["policy-url"] || null,
      reviewerLabel: options.reviewer,
      notes: options.notes || "",
      reviewedAt: Date.now(),
      expiresAt: options["expires-at"] ? timestamp(options["expires-at"]) : null
    });
    console.log(JSON.stringify(result));
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(JSON.stringify({ event: "source_policy_review_failed", error: String(error?.message || error) }));
    process.exitCode = 1;
  });
}
