import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
const N = 131072, r = 8, p = 1, KEY_LENGTH = 64;
function derive(password: string, salt: Buffer) {
  return new Promise<Buffer>((resolve, reject) => scrypt(password, salt, KEY_LENGTH, { N, r, p, maxmem: 192 * 1024 * 1024 }, (error, key) => error ? reject(error) : resolve(key)));
}
export async function hashPassword(password: string) {
  const salt = randomBytes(16), key = await derive(password, salt);
  return `scrypt$${N}$${r}$${p}$${salt.toString("hex")}$${key.toString("hex")}`;
}
// Unknown accounts still execute the same expensive derivation as incorrect passwords.
export const DUMMY_PASSWORD_HASH = `scrypt$${N}$${r}$${p}$${"00".repeat(16)}$${"00".repeat(KEY_LENGTH)}`;
export async function verifyPassword(password: string, encoded: string) {
  const [algorithm, cost, block, parallel, salt, hash] = encoded.split("$");
  if (algorithm !== "scrypt" || Number(cost) !== N || Number(block) !== r || Number(parallel) !== p || !/^[a-f0-9]{32}$/.test(salt ?? "") || !/^[a-f0-9]{128}$/.test(hash ?? "")) return false;
  const key = await derive(password, Buffer.from(salt, "hex"));
  return timingSafeEqual(key, Buffer.from(hash, "hex"));
}
