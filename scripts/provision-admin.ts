import "dotenv/config";
import { createConnection } from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import {
  parseAdminProvisioningArgs,
  provisionAdministrator,
  revokeAdministrator,
} from "../server/adminProvisioning";
import { reportRuntimeError, withDeadline } from "../server/runtime";

async function main() {
  const args = process.argv.slice(2);
  const revoke = args[args.length - 1] === "--revoke";
  const email = parseAdminProvisioningArgs(revoke ? args.slice(0, -1) : args);
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const connection = await createConnection({
    uri: process.env.DATABASE_URL,
    connectTimeout: 10_000,
  });
  try {
    const result = await withDeadline(
      (revoke ? revokeAdministrator : provisionAdministrator)(
        drizzle(connection),
        email
      ),
      15_000
    );
    console.log(
      JSON.stringify({
        event: revoke ? "administrator_revoked" : "administrator_provisioned",
        ...result,
      })
    );
  } finally {
    connection.destroy();
  }
}

main().catch(error => {
  reportRuntimeError("administrator_provisioning", error);
  console.error(
    "Provisioning refused. Confirm CLI arguments, migrations, and an active email-verified buyer account. No passwords are generated or accepted."
  );
  process.exitCode = 1;
});
