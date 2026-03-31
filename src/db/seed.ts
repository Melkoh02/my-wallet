import { count } from "drizzle-orm";
import type { ExpoSQLiteDatabase } from "drizzle-orm/expo-sqlite";
import * as schema from "./schema";
import { DEFAULT_CATEGORIES } from "@/constants/categories";
import { DEFAULT_SETTINGS } from "@/constants/settings";

export async function seed(db: ExpoSQLiteDatabase<typeof schema>) {
  // Only seed if categories table is empty
  const [result] = await db.select({ total: count() }).from(schema.categories);
  if (result.total > 0) return;

  for (const cat of DEFAULT_CATEGORIES) {
    const [inserted] = await db
      .insert(schema.categories)
      .values({
        name: cat.name,
        color: cat.color,
        icon: cat.icon,
        isIncome: cat.isIncome,
        isExpense: cat.isExpense,
        isSystem: true,
      })
      .returning();

    // Always insert "General" as the first subcategory
    await db.insert(schema.subcategories).values({
      categoryId: inserted.id,
      name: "General",
      isGeneral: true,
      sortOrder: 0,
    });

    // Insert specific subcategories
    for (let i = 0; i < cat.subcategories.length; i++) {
      await db.insert(schema.subcategories).values({
        categoryId: inserted.id,
        name: cat.subcategories[i],
        sortOrder: i + 1,
      });
    }
  }

  // Seed default settings
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await db.insert(schema.settings).values({ key, value }).onConflictDoNothing();
  }
}
