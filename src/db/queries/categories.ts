import { eq, and } from "drizzle-orm";
import { db } from "@/db/client";
import {
  categories,
  subcategories,
  type Category,
  type NewCategory,
  type Subcategory,
} from "@/db/schema";

export type CategoryWithSubs = Category & { subcategories: Subcategory[] };

export async function getCategories(activeOnly = true): Promise<CategoryWithSubs[]> {
  const cats = activeOnly
    ? await db
        .select()
        .from(categories)
        .where(eq(categories.isActive, true))
        .orderBy(categories.sortOrder)
    : await db.select().from(categories).orderBy(categories.sortOrder);

  const result: CategoryWithSubs[] = [];
  for (const cat of cats) {
    const subs = activeOnly
      ? await db
          .select()
          .from(subcategories)
          .where(and(eq(subcategories.categoryId, cat.id), eq(subcategories.isActive, true)))
          .orderBy(subcategories.sortOrder)
      : await db
          .select()
          .from(subcategories)
          .where(eq(subcategories.categoryId, cat.id))
          .orderBy(subcategories.sortOrder);
    result.push({ ...cat, subcategories: subs });
  }
  return result;
}

export async function getCategoryById(id: number): Promise<CategoryWithSubs | undefined> {
  const [cat] = await db.select().from(categories).where(eq(categories.id, id));
  if (!cat) return undefined;
  const subs = await db
    .select()
    .from(subcategories)
    .where(eq(subcategories.categoryId, cat.id))
    .orderBy(subcategories.sortOrder);
  return { ...cat, subcategories: subs };
}

export async function createCategory(data: Omit<NewCategory, "isSystem">): Promise<Category> {
  const [cat] = await db
    .insert(categories)
    .values({ ...data, isSystem: false })
    .returning();
  // Create the General subcategory
  await db.insert(subcategories).values({
    categoryId: cat.id,
    name: "General",
    isGeneral: true,
    sortOrder: 0,
  });
  return cat;
}

export async function updateCategory(
  id: number,
  data: Partial<Omit<NewCategory, "id" | "isSystem">>,
): Promise<Category> {
  const [cat] = await db.update(categories).set(data).where(eq(categories.id, id)).returning();
  return cat;
}

export async function deleteCategory(id: number): Promise<void> {
  // Only allow deleting non-system categories
  const [cat] = await db.select().from(categories).where(eq(categories.id, id));
  if (cat?.isSystem) return;
  await db.update(categories).set({ isActive: false }).where(eq(categories.id, id));
}

export async function createSubcategory(categoryId: number, name: string): Promise<Subcategory> {
  const existing = await db
    .select()
    .from(subcategories)
    .where(eq(subcategories.categoryId, categoryId));
  const [sub] = await db
    .insert(subcategories)
    .values({ categoryId, name, sortOrder: existing.length })
    .returning();
  return sub;
}

export async function updateSubcategory(id: number, name: string): Promise<void> {
  await db.update(subcategories).set({ name }).where(eq(subcategories.id, id));
}

export async function deleteSubcategory(id: number): Promise<void> {
  // Don't delete general subcategories
  const [sub] = await db.select().from(subcategories).where(eq(subcategories.id, id));
  if (sub?.isGeneral) return;
  await db.update(subcategories).set({ isActive: false }).where(eq(subcategories.id, id));
}
