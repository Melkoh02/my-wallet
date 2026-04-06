import {
  documentDirectory,
  cacheDirectory,
  getInfoAsync,
  makeDirectoryAsync,
  writeAsStringAsync,
  readAsStringAsync,
  deleteAsync,
} from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import * as DocumentPicker from "expo-document-picker";
import { db } from "@/db/client";
import {
  accounts,
  categories,
  subcategories,
  transactions,
  transactionSubcategories,
  recurringTransactions,
  recurringSubcategories,
  cashbackRules,
  themes,
  settings,
  backups,
} from "@/db/schema";
import { getSetting } from "@/db/queries/settings";
import { eq, desc, sql } from "drizzle-orm";

const BACKUP_DIR = `${documentDirectory}backups/`;
const BACKUP_VERSION = 1;

async function ensureBackupDir() {
  const info = await getInfoAsync(BACKUP_DIR);
  if (!info.exists) {
    await makeDirectoryAsync(BACKUP_DIR, { intermediates: true });
  }
}

async function exportAllData() {
  const data = {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    accounts: await db.select().from(accounts),
    categories: await db.select().from(categories),
    subcategories: await db.select().from(subcategories),
    transactions: await db.select().from(transactions),
    transactionSubcategories: await db.select().from(transactionSubcategories),
    recurringTransactions: await db.select().from(recurringTransactions),
    recurringSubcategories: await db.select().from(recurringSubcategories),
    cashbackRules: await db.select().from(cashbackRules),
    themes: await db.select().from(themes),
    settings: await db.select().from(settings),
  };
  return JSON.stringify(data, null, 2);
}

export async function createBackup(isAuto = false): Promise<void> {
  await ensureBackupDir();

  const json = await exportAllData();
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const timeStr = now.toTimeString().slice(0, 5).replace(":", "");
  const prefix = isAuto ? "auto" : "manual";
  const filename = `my-wallet-${prefix}-${dateStr}-${timeStr}.json`;
  const filePath = BACKUP_DIR + filename;

  await writeAsStringAsync(filePath, json);

  const info = await getInfoAsync(filePath);
  const sizeBytes = info.exists && !info.isDirectory ? (info.size ?? json.length) : json.length;

  await db.insert(backups).values({
    filename,
    filePath,
    sizeBytes,
    isAuto,
  });

  // Prune old auto backups
  if (isAuto) {
    const keepCountStr = await getSetting("backup_keep_count");
    const keepCount = parseInt(keepCountStr ?? "2", 10);

    const autoBackups = await db
      .select()
      .from(backups)
      .where(eq(backups.isAuto, true))
      .orderBy(desc(backups.createdAt));

    for (let i = keepCount; i < autoBackups.length; i++) {
      const old = autoBackups[i];
      try {
        await deleteAsync(old.filePath, { idempotent: true });
      } catch {
        // File may already be deleted
      }
      await db.delete(backups).where(eq(backups.id, old.id));
    }
  }
}

export async function checkAndRunAutoBackup(): Promise<boolean> {
  const enabled = await getSetting("backup_enabled");
  if (enabled !== "true") return false;

  const today = new Date().toISOString().slice(0, 10);
  const autoBackups = await db
    .select()
    .from(backups)
    .where(eq(backups.isAuto, true))
    .orderBy(desc(backups.createdAt));

  const lastBackup = autoBackups[0];
  if (lastBackup?.createdAt?.startsWith(today)) return false;

  await createBackup(true);
  return true;
}

export async function exportBackup(): Promise<void> {
  const json = await exportAllData();
  const dateStr = new Date().toISOString().slice(0, 10);
  const filename = `my-wallet-export-${dateStr}.json`;
  const tempPath = `${cacheDirectory}${filename}`;

  await writeAsStringAsync(tempPath, json);
  await Sharing.shareAsync(tempPath, {
    mimeType: "application/json",
    dialogTitle: "Export My Wallet Data",
  });
}

export async function importBackup(): Promise<{ success: boolean; error?: string }> {
  try {
    const result = await DocumentPicker.getDocumentAsync({
      type: "application/json",
      copyToCacheDirectory: true,
    });

    if (result.canceled || !result.assets?.[0]) {
      return { success: false, error: "No file selected" };
    }

    const content = await readAsStringAsync(result.assets[0].uri);
    const data = JSON.parse(content);

    if (!data.version || !data.accounts || !data.transactions) {
      return { success: false, error: "Invalid backup file format" };
    }

    // Run entire import inside a transaction for atomicity.
    // If anything fails, all changes are rolled back — no data loss.
    await db.run(sql`BEGIN TRANSACTION`);
    try {
      // Clear existing data (order matters for foreign keys)
      await db.delete(transactionSubcategories);
      await db.delete(recurringSubcategories);
      await db.delete(cashbackRules);
      await db.delete(transactions);
      await db.delete(recurringTransactions);
      await db.delete(subcategories);
      await db.delete(categories);
      await db.delete(accounts);
      await db.delete(themes);
      await db.delete(settings);

      // Restore data — skip missing keys gracefully for forward compatibility
      if (data.accounts?.length) await db.insert(accounts).values(data.accounts);
      if (data.categories?.length) await db.insert(categories).values(data.categories);
      if (data.subcategories?.length) await db.insert(subcategories).values(data.subcategories);
      if (data.transactions?.length) await db.insert(transactions).values(data.transactions);
      if (data.transactionSubcategories?.length)
        await db.insert(transactionSubcategories).values(data.transactionSubcategories);
      if (data.recurringTransactions?.length)
        await db.insert(recurringTransactions).values(data.recurringTransactions);
      if (data.recurringSubcategories?.length)
        await db.insert(recurringSubcategories).values(data.recurringSubcategories);
      if (data.cashbackRules?.length) await db.insert(cashbackRules).values(data.cashbackRules);
      if (data.themes?.length) await db.insert(themes).values(data.themes);
      if (data.settings?.length) await db.insert(settings).values(data.settings);

      await db.run(sql`COMMIT`);
      return { success: true };
    } catch (e) {
      // Rollback — original data is preserved
      await db.run(sql`ROLLBACK`);
      return {
        success: false,
        error: e instanceof Error ? e.message : "Import failed — data was not modified",
      };
    }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Unknown error" };
  }
}

export async function getBackupList() {
  return db.select().from(backups).orderBy(desc(backups.createdAt));
}

export async function deleteBackup(id: number): Promise<void> {
  const [backup] = await db.select().from(backups).where(eq(backups.id, id));
  if (backup) {
    try {
      await deleteAsync(backup.filePath, { idempotent: true });
    } catch {
      // File may already be deleted
    }
    await db.delete(backups).where(eq(backups.id, id));
  }
}
