import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { themes, type Theme, type NewTheme } from "@/db/schema";

export async function getThemes(): Promise<Theme[]> {
  return db.select().from(themes).orderBy(themes.createdAt);
}

export async function getActiveTheme(): Promise<Theme | undefined> {
  const [theme] = await db.select().from(themes).where(eq(themes.isActive, true));
  return theme;
}

export async function createTheme(data: NewTheme): Promise<Theme> {
  const [theme] = await db.insert(themes).values(data).returning();
  return theme;
}

export async function updateTheme(id: number, data: Partial<Omit<NewTheme, "id">>): Promise<void> {
  await db.update(themes).set(data).where(eq(themes.id, id));
}

export async function deleteTheme(id: number): Promise<void> {
  await db.delete(themes).where(eq(themes.id, id));
}
