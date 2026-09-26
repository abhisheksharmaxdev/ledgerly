/**
 * Database maintenance commands:
 *   npm run create-admin -- you@example.com   create/update the single admin (prompts for the password)
 *   npm run db:migrate                        apply pending migrations (also runs automatically on start)
 *   npm run db:seed [-- user@example.com]     add demo data to an account (default: the admin)
 *   npm run db:unseed [-- user@example.com]   remove only demo data from that account
 *   npm run db:reset -- --yes                 delete the database file and recreate an empty schema
 */
import fs from "node:fs";
import readline from "node:readline";
import { config } from "../config";
import { localToday } from "../../../shared/dates";
import { PASSWORD_MIN, emailSchema } from "../../../shared/schemas";
import { hashPassword } from "../auth/password";
import { openDatabase, type DB } from "./connection";
import { loadDemoData, removeDemoData } from "../services/demo";
import { ensureAdmin, getAdmin, getUserByEmail } from "../repositories/users";

const [command, ...args] = process.argv.slice(2);

/** Reads a line without echoing it (for passwords). Falls back to plain input when not a TTY. */
function prompt(question: string, hidden = false): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      const out = rl as unknown as { _writeToOutput: (s: string) => void; output: NodeJS.WriteStream };
      out._writeToOutput = (s: string) => {
        if (s.includes(question)) out.output.write(s);
      };
    }
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write("\n");
      resolve(answer);
    });
  });
}

function targetUser(db: DB): number {
  const email = args.find((a) => a.includes("@"));
  const user = email ? getUserByEmail(db, email) : getAdmin(db);
  if (!user) {
    console.error(email ? `No account with email ${email}.` : "No admin account yet. Run: npm run create-admin -- you@example.com");
    process.exit(1);
  }
  return user.id;
}

async function main() {
  switch (command) {
    case "create-admin": {
      const parsed = emailSchema.safeParse(args[0] ?? "");
      if (!parsed.success) {
        console.error("Usage: npm run create-admin -- you@example.com");
        process.exit(1);
      }
      const password = process.env.ADMIN_PASSWORD ?? (await prompt("Admin password: ", true));
      if (password.length < PASSWORD_MIN) {
        console.error(`Password must be at least ${PASSWORD_MIN} characters.`);
        process.exit(1);
      }
      if (!process.env.ADMIN_PASSWORD && (await prompt("Repeat password: ", true)) !== password) {
        console.error("Passwords don't match.");
        process.exit(1);
      }
      const db = openDatabase(config.databasePath);
      const r = ensureAdmin(db, parsed.data, hashPassword(password));
      db.close();
      console.info(`Admin account ${r.action}: ${parsed.data}${r.claimed ? ` (${r.claimed} existing records assigned to it)` : ""}`);
      break;
    }
    case "migrate": {
      openDatabase(config.databasePath).close();
      console.info(`Migrations applied: ${config.databasePath}`);
      break;
    }
    case "seed": {
      const db = openDatabase(config.databasePath);
      const r = loadDemoData(db, targetUser(db), localToday());
      db.close();
      console.info(`Demo data added: ${r.expenses} expenses, ${r.plans} plans (${r.skippedPlans} months kept their real plan).`);
      break;
    }
    case "unseed": {
      const db = openDatabase(config.databasePath);
      const r = removeDemoData(db, targetUser(db));
      db.close();
      console.info(`Demo data removed: ${r.expenses} expenses, ${r.plans} plans.`);
      break;
    }
    case "reset": {
      if (!args.includes("--yes")) {
        console.error(`This deletes ALL data and accounts in ${config.databasePath}. Re-run with: npm run db:reset -- --yes`);
        process.exit(1);
      }
      for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(config.databasePath + suffix, { force: true });
      openDatabase(config.databasePath).close();
      console.info(`Database reset: ${config.databasePath}`);
      break;
    }
    default:
      console.error("Usage: tsx server/src/db/cli.ts <create-admin|migrate|seed|unseed|reset>");
      process.exit(1);
  }
}

void main();
