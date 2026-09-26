// Usage: npm run hash-password -- "admin password"
// Prints an ADMIN_PASSWORD_HASH value and a random SESSION_SECRET for your .env / hosting settings.
// (Locally you can instead run `npm run create-admin -- you@example.com`, which prompts for the password.)
import crypto from "node:crypto";

const password = process.argv[2];
if (!password || password.length < 10) {
  console.error('Usage: npm run hash-password -- "a password of at least 10 characters"');
  process.exit(1);
}

const N = 32768, r = 8, p = 1;
const salt = crypto.randomBytes(16);
const hash = crypto.scryptSync(password, salt, 64, { N, r, p, maxmem: 64 * 1024 * 1024 });

console.log("Add these lines to your .env (keep them secret), together with ADMIN_EMAIL=you@example.com:\n");
console.log(`ADMIN_PASSWORD_HASH=${["scrypt", N, r, p, salt.toString("base64"), hash.toString("base64")].join(":")}`);
console.log(`SESSION_SECRET=${crypto.randomBytes(32).toString("base64url")}`);
