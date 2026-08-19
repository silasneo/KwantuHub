import { and, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, InsertVendorAsset, users, vendorAssets } from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const database = await getDb();
  if (!database) throw new Error("Database is unavailable");

  const values: InsertUser = { ...user, lastSignedIn: user.lastSignedIn ?? new Date() };
  const updateSet: Partial<InsertUser> = {
    name: values.name ?? null,
    email: values.email ?? null,
    loginMethod: values.loginMethod ?? null,
    lastSignedIn: values.lastSignedIn,
  };
  if (values.role !== undefined) updateSet.role = values.role;
  if (values.role === undefined && user.openId === ENV.ownerOpenId) updateSet.role = "admin";
  await database.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const database = await getDb();
  if (!database) return undefined;
  const result = await database.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

export async function listVendorAssets(ownerId: number) {
  const database = await getDb();
  if (!database) throw new Error("Database is unavailable");
  return database.select().from(vendorAssets).where(eq(vendorAssets.ownerId, ownerId)).orderBy(desc(vendorAssets.createdAt));
}

export async function createVendorAsset(asset: InsertVendorAsset) {
  const database = await getDb();
  if (!database) throw new Error("Database is unavailable");
  await database.insert(vendorAssets).values(asset);
  const result = await database.select().from(vendorAssets).where(eq(vendorAssets.fileKey, asset.fileKey)).limit(1);
  if (!result[0]) throw new Error("Asset metadata could not be saved");
  return result[0];
}

export async function removeVendorAsset(ownerId: number, id: number) {
  const database = await getDb();
  if (!database) throw new Error("Database is unavailable");
  const result = await database.delete(vendorAssets).where(and(eq(vendorAssets.id, id), eq(vendorAssets.ownerId, ownerId)));
  return result[0].affectedRows > 0;
}
