import { eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import {
  templates,
  templateSubcategories,
  subcategories,
  categories,
  accounts,
  type Template,
  type NewTemplate,
} from "@/db/schema";

export type TemplateWithSubs = Template & {
  accountCurrency?: string;
  subcategoryIds: number[];
  subcategoryList: {
    id: number;
    name: string;
    categoryName: string;
    categoryColor: string;
    categoryIcon: string;
  }[];
};

async function enrichTemplates(rows: Template[]): Promise<TemplateWithSubs[]> {
  if (rows.length === 0) return [];
  const tplIds = rows.map((r) => r.id);

  const accountIdSet = new Set<number>();
  for (const tpl of rows) {
    if (tpl.accountId != null) accountIdSet.add(tpl.accountId);
  }
  const accountIds = [...accountIdSet];
  const accountRows =
    accountIds.length > 0
      ? await db.select().from(accounts).where(inArray(accounts.id, accountIds))
      : [];
  const currencyByAccount = new Map(accountRows.map((a) => [a.id, a.currency]));

  const subLinks = await db
    .select({
      templateId: templateSubcategories.templateId,
      id: subcategories.id,
      name: subcategories.name,
      categoryName: categories.name,
      categoryColor: categories.color,
      categoryIcon: categories.icon,
    })
    .from(templateSubcategories)
    .innerJoin(subcategories, eq(templateSubcategories.subcategoryId, subcategories.id))
    .innerJoin(categories, eq(subcategories.categoryId, categories.id))
    .where(inArray(templateSubcategories.templateId, tplIds));

  const subsByTplId = new Map<number, TemplateWithSubs["subcategoryList"]>();
  for (const link of subLinks) {
    let list = subsByTplId.get(link.templateId);
    if (!list) {
      list = [];
      subsByTplId.set(link.templateId, list);
    }
    list.push({
      id: link.id,
      name: link.name,
      categoryName: link.categoryName,
      categoryColor: link.categoryColor,
      categoryIcon: link.categoryIcon,
    });
  }

  return rows.map((tpl) => ({
    ...tpl,
    accountCurrency: tpl.accountId != null ? currencyByAccount.get(tpl.accountId) : undefined,
    subcategoryIds: (subsByTplId.get(tpl.id) ?? []).map((s) => s.id),
    subcategoryList: subsByTplId.get(tpl.id) ?? [],
  }));
}

export async function getTemplates(): Promise<TemplateWithSubs[]> {
  const rows = await db.select().from(templates).orderBy(templates.name);
  return enrichTemplates(rows);
}

export async function getTemplateById(id: number): Promise<TemplateWithSubs | undefined> {
  const [tpl] = await db.select().from(templates).where(eq(templates.id, id));
  if (!tpl) return undefined;
  const [enriched] = await enrichTemplates([tpl]);
  return enriched;
}

export async function createTemplate(
  data: NewTemplate,
  subcategoryIds: number[],
): Promise<Template> {
  const [tpl] = await db.insert(templates).values(data).returning();
  if (subcategoryIds.length > 0) {
    await db.insert(templateSubcategories).values(
      subcategoryIds.map((subId) => ({
        templateId: tpl.id,
        subcategoryId: subId,
      })),
    );
  }
  return tpl;
}

export async function updateTemplate(
  id: number,
  data: Partial<Omit<NewTemplate, "id">>,
  subcategoryIds?: number[],
): Promise<void> {
  await db.update(templates).set(data).where(eq(templates.id, id));
  if (subcategoryIds !== undefined) {
    await db.delete(templateSubcategories).where(eq(templateSubcategories.templateId, id));
    if (subcategoryIds.length > 0) {
      await db.insert(templateSubcategories).values(
        subcategoryIds.map((subId) => ({
          templateId: id,
          subcategoryId: subId,
        })),
      );
    }
  }
}

export async function deleteTemplate(id: number): Promise<void> {
  await db.delete(templates).where(eq(templates.id, id));
}
