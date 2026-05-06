import { Platform } from "react-native";
import {
  documentDirectory,
  cacheDirectory,
  getInfoAsync,
  makeDirectoryAsync,
  writeAsStringAsync,
  readAsStringAsync,
  deleteAsync,
  StorageAccessFramework,
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
  themes,
  settings,
  backups,
  templates,
  templateSubcategories,
  budgets,
  places,
} from "@/db/schema";
import { getSetting, setSetting } from "@/db/queries/settings";
import { eq, desc, sql } from "drizzle-orm";

const BACKUP_DIR = `${documentDirectory}backups/`;
const BACKUP_VERSION = 1;
export const BACKUP_FOLDER_KEY = "backup_folder_uri";
export const BACKUP_SETUP_DONE_KEY = "backup_setup_done";
const SAF_SUBFOLDER_NAME = "MyWallet";

function isSafUri(uri: string): boolean {
  return uri.startsWith("content://");
}

/**
 * Look for an existing subfolder by name inside a SAF tree URI.
 * Returns the subfolder's URI if found, otherwise null. SAF child URIs encode
 * the document path after `/document/`; the trailing segment is the file or
 * folder name once URL-decoded.
 */
async function findSubfolderByName(parentUri: string, name: string): Promise<string | null> {
  try {
    const children = await StorageAccessFramework.readDirectoryAsync(parentUri);
    for (const childUri of children) {
      const docPart = childUri.split("/document/")[1];
      if (!docPart) continue;
      const segments = decodeURIComponent(docPart).split("/");
      if (segments[segments.length - 1] === name) {
        return childUri;
      }
    }
  } catch {
    // Reading the directory failed — fall through and let the caller create.
  }
  return null;
}

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
    themes: await db.select().from(themes),
    settings: await db.select().from(settings),
    templates: await db.select().from(templates),
    templateSubcategories: await db.select().from(templateSubcategories),
    budgets: await db.select().from(budgets),
    places: await db.select().from(places),
  };
  return JSON.stringify(data, null, 2);
}

function buildFilename(isAuto: boolean, now = new Date()): string {
  const dateStr = now.toISOString().slice(0, 10);
  const timeStr = now.toTimeString().slice(0, 5).replace(":", "");
  const prefix = isAuto ? "auto" : "manual";
  return `my-wallet-${prefix}-${dateStr}-${timeStr}.json`;
}

async function deleteBackupFile(filePath: string): Promise<void> {
  try {
    if (isSafUri(filePath)) {
      await StorageAccessFramework.deleteAsync(filePath, { idempotent: true });
    } else {
      await deleteAsync(filePath, { idempotent: true });
    }
  } catch {
    // File may already be gone or inaccessible — non-fatal.
  }
}

function utf8ByteLength(s: string): number {
  // RN runtimes (Hermes / JSC) ship TextEncoder; falls back to a manual count
  // if a future runtime drops it.
  if (typeof TextEncoder !== "undefined") {
    return new TextEncoder().encode(s).length;
  }
  let bytes = 0;
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff) {
      bytes += 4;
      i++;
    } else bytes += 3;
  }
  return bytes;
}

async function writeBackupFile(
  json: string,
  filename: string,
): Promise<{ filePath: string; sizeBytes: number }> {
  const folderUri = await getSetting(BACKUP_FOLDER_KEY);
  if (folderUri && Platform.OS === "android") {
    // SAF write — extension is appended by Android based on mime type.
    const baseName = filename.replace(/\.json$/, "");
    const fileUri = await StorageAccessFramework.createFileAsync(
      folderUri,
      baseName,
      "application/json",
    );
    await StorageAccessFramework.writeAsStringAsync(fileUri, json);
    return { filePath: fileUri, sizeBytes: utf8ByteLength(json) };
  }
  await ensureBackupDir();
  const filePath = BACKUP_DIR + filename;
  await writeAsStringAsync(filePath, json);
  const info = await getInfoAsync(filePath);
  const sizeBytes =
    info.exists && !info.isDirectory ? (info.size ?? utf8ByteLength(json)) : utf8ByteLength(json);
  return { filePath, sizeBytes };
}

export async function createBackup(isAuto = false): Promise<void> {
  const json = await exportAllData();
  const filename = buildFilename(isAuto);
  const { filePath, sizeBytes } = await writeBackupFile(json, filename);

  await db.insert(backups).values({ filename, filePath, sizeBytes, isAuto });

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
      await deleteBackupFile(old.filePath);
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
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const timeStr = now.toTimeString().slice(0, 5).replace(":", "");
  const filename = `my-wallet-export-${dateStr}-${timeStr}.json`;
  const tempPath = `${cacheDirectory}${filename}`;

  await writeAsStringAsync(tempPath, json);
  await Sharing.shareAsync(tempPath, {
    mimeType: "application/json",
    dialogTitle: "Export My Wallet Data",
  });
}

// Exported for tests; not part of the public API. The `_` prefix flags that
// callers should go through importBackup / restoreFromBackup, which validate
// the file before calling this.
export async function _restoreDataForTests(
  data: Record<string, unknown[]>,
): Promise<{ success: boolean; error?: string }> {
  return restoreData(data);
}

async function restoreData(
  data: Record<string, unknown[]>,
): Promise<{ success: boolean; error?: string }> {
  // invariant: import is atomic — wrap in BEGIN TRANSACTION; ROLLBACK on any error so the
  // user's existing data is never partially overwritten. delete order = reverse FK dependency
  // order; insert order = FK dependency order. see docs/merge-points.md § restoreData.
  await db.run(sql`BEGIN TRANSACTION`);
  try {
    // invariant: delete in reverse FK order (children before parents) and re-insert in forward
    // order. reordering for "readability" produces orphan/missing-reference errors mid-import.
    await db.delete(budgets);
    await db.delete(templateSubcategories);
    await db.delete(templates);
    await db.delete(transactionSubcategories);
    // Places sit between transactions and the rest in FK terms — transactions
    // reference places. Delete transactions BEFORE places so the FK column
    // doesn't dangle.
    await db.delete(recurringSubcategories);
    await db.delete(transactions);
    await db.delete(recurringTransactions);
    await db.delete(places);
    await db.delete(subcategories);
    await db.delete(categories);
    await db.delete(accounts);
    await db.delete(themes);
    await db.delete(settings);

    if (data.accounts?.length) await db.insert(accounts).values(data.accounts as never[]);
    if (data.categories?.length) await db.insert(categories).values(data.categories as never[]);
    if (data.subcategories?.length)
      await db.insert(subcategories).values(data.subcategories as never[]);
    // Places must be restored BEFORE transactions because transactions.place_id
    // references them.
    if (data.places?.length) await db.insert(places).values(data.places as never[]);
    if (data.transactions?.length)
      await db.insert(transactions).values(data.transactions as never[]);
    if (data.transactionSubcategories?.length)
      await db.insert(transactionSubcategories).values(data.transactionSubcategories as never[]);
    if (data.recurringTransactions?.length)
      await db.insert(recurringTransactions).values(data.recurringTransactions as never[]);
    if (data.recurringSubcategories?.length)
      await db.insert(recurringSubcategories).values(data.recurringSubcategories as never[]);
    if (data.themes?.length) await db.insert(themes).values(data.themes as never[]);
    if (data.settings?.length) await db.insert(settings).values(data.settings as never[]);
    if (data.templates?.length) await db.insert(templates).values(data.templates as never[]);
    if (data.templateSubcategories?.length)
      await db.insert(templateSubcategories).values(data.templateSubcategories as never[]);
    // Budgets reference categories + subcategories, so insert AFTER both —
    // categories and subcategories are populated above.
    if (data.budgets?.length) await db.insert(budgets).values(data.budgets as never[]);

    await db.run(sql`COMMIT`);
    return { success: true };
  } catch (e) {
    await db.run(sql`ROLLBACK`);
    return {
      success: false,
      error: e instanceof Error ? e.message : "Restore failed — data was not modified",
    };
  }
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

    return restoreData(data);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Unknown error" };
  }
}

export async function restoreFromBackup(
  filePath: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    let content: string;
    if (isSafUri(filePath)) {
      try {
        content = await StorageAccessFramework.readAsStringAsync(filePath);
      } catch (e) {
        // SAF read fails if the file was moved/deleted in the user's file manager
        // or the directory permission was revoked. Log the cause for diagnosis.
        console.warn("SAF read failed for", filePath, e);
        return { success: false, error: "Backup file not found or no longer accessible" };
      }
    } else {
      const info = await getInfoAsync(filePath);
      if (!info.exists) {
        return { success: false, error: "Backup file not found" };
      }
      content = await readAsStringAsync(filePath);
    }
    const data = JSON.parse(content);

    if (!data.version || !data.accounts || !data.transactions) {
      return { success: false, error: "Invalid backup file format" };
    }

    return restoreData(data);
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
    await deleteBackupFile(backup.filePath);
    await db.delete(backups).where(eq(backups.id, id));
  }
}

/**
 * Prompt the user to pick a directory via SAF, create (or reuse) a "MyWallet"
 * subfolder inside it, and persist the resulting URI.
 *
 * The URI returned by `makeDirectoryAsync` is a tree-document URI of form
 * `content://.../tree/X/document/Y`. Android's `DocumentsContract.createDocument`
 * accepts this form as a parent, so subsequent `createFileAsync` calls on this
 * URI correctly write into the subfolder. Test on real devices before relying.
 *
 * Android-only. On iOS this is a no-op (returns cancelled).
 */
export async function pickBackupFolder(): Promise<{
  folderUri: string | null;
  cancelled: boolean;
  error?: string;
}> {
  if (Platform.OS !== "android") {
    return { folderUri: null, cancelled: true };
  }
  try {
    const result = await StorageAccessFramework.requestDirectoryPermissionsAsync();
    if (!result.granted) {
      return { folderUri: null, cancelled: true };
    }
    // Prefer reusing an existing MyWallet subfolder so re-picking the same parent
    // doesn't scatter files across two locations.
    const existing = await findSubfolderByName(result.directoryUri, SAF_SUBFOLDER_NAME);
    const folderUri =
      existing ??
      (await StorageAccessFramework.makeDirectoryAsync(result.directoryUri, SAF_SUBFOLDER_NAME));
    await setSetting(BACKUP_FOLDER_KEY, folderUri);
    return { folderUri, cancelled: false };
  } catch (e) {
    return {
      folderUri: null,
      cancelled: false,
      error: e instanceof Error ? e.message : "Folder selection failed",
    };
  }
}

export async function clearBackupFolder(): Promise<void> {
  await setSetting(BACKUP_FOLDER_KEY, "");
}

/**
 * Copy every legacy internal-storage backup into the SAF folder, updating each
 * `backups` row's file_path to the new content:// URI and deleting the
 * internal copy. Stale rows (DB row exists but file is gone) are removed.
 */
export async function migrateLegacyBackupsToFolder(folderUri: string): Promise<{
  migrated: number;
  failed: number;
  removed: number;
}> {
  const allBackups = await db.select().from(backups);
  let migrated = 0;
  let failed = 0;
  let removed = 0;

  for (const backup of allBackups) {
    if (isSafUri(backup.filePath)) continue;
    try {
      const info = await getInfoAsync(backup.filePath);
      if (!info.exists) {
        await db.delete(backups).where(eq(backups.id, backup.id));
        removed++;
        continue;
      }
      const content = await readAsStringAsync(backup.filePath);
      const baseName = backup.filename.replace(/\.json$/, "");
      const newUri = await StorageAccessFramework.createFileAsync(
        folderUri,
        baseName,
        "application/json",
      );
      await StorageAccessFramework.writeAsStringAsync(newUri, content);
      await db.update(backups).set({ filePath: newUri }).where(eq(backups.id, backup.id));
      await deleteAsync(backup.filePath, { idempotent: true });
      migrated++;
    } catch (e) {
      console.warn("Backup migration failed for", backup.filename, e);
      failed++;
    }
  }

  return { migrated, failed, removed };
}

/**
 * Best-effort check that the persisted SAF folder URI is still readable.
 * Returns false if the user revoked the permission via system settings.
 */
export async function verifyBackupFolderAccess(folderUri: string): Promise<boolean> {
  if (Platform.OS !== "android" || !isSafUri(folderUri)) return false;
  try {
    await StorageAccessFramework.readDirectoryAsync(folderUri);
    return true;
  } catch {
    return false;
  }
}
