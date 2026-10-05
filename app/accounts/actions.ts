"use server";

import { revalidatePath } from "next/cache";
import { and, asc, eq, inArray, min, ne, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/src/db";
import { accounts } from "@/src/db/schema";
import {
  AccountIconError,
  deleteAccountIcon,
  resolveAccountIcon,
  saveAccountIcon,
} from "@/src/lib/account-icons";
import { accountIconSelection } from "@/src/lib/account-icon-url";
import { createAccountSchema, positiveIdSchema, updateAccountSchema } from "@/src/lib/validations";

export type AccountActionState = {
  success: boolean;
  message: string;
};

/** 刷新受账户数据影响的页面。 */
function refresh() {
  revalidatePath("/accounts");
  revalidatePath("/transactions");
  revalidatePath("/");
}

/** 新建账户，并将初始余额按分保存。 */
export async function createAccountAction(
  _previousState: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  const parsed = createAccountSchema.safeParse({
    name: formData.get("name"),
    code: formData.get("code"),
    type: formData.get("type"),
    balance: formData.get("balance"),
    currency: formData.get("currency"),
  });

  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0]?.message ?? "请检查账户信息" };
  }

  const codeExists = db.select({ id: accounts.id })
    .from(accounts)
    .where(eq(accounts.code, parsed.data.code))
    .get();
  if (codeExists) return { success: false, message: "账户代码已被使用" };

  let icon: string | null = null;
  let uploadedIcon: string | null = null;
  try {
    icon = await resolveAccountIcon(formData.get("icon"));
    if (icon?.startsWith("upload:")) {
      throw new AccountIconError("只能选择预置图标，或上传新图标");
    }
    uploadedIcon = await saveAccountIcon(formData.get("iconUpload"));
    icon = uploadedIcon ?? icon;
    const firstAccount = db.select({ sortOrder: min(accounts.sortOrder) })
      .from(accounts)
      .where(and(eq(accounts.isArchived, false), eq(accounts.type, parsed.data.type)))
      .get();
    const sortOrder = (firstAccount?.sortOrder ?? 0) - 1;
    db.insert(accounts).values({ ...parsed.data, icon, sortOrder }).run();
  } catch (error) {
    if (uploadedIcon) await deleteAccountIcon(uploadedIcon).catch(() => undefined);
    if (error instanceof AccountIconError) {
      return { success: false, message: error.message };
    }
    return { success: false, message: "添加账户失败，请稍后重试" };
  }

  refresh();

  return { success: true, message: "账户已添加" };
}

/** 修改账户名称和类型，不直接改写由流水维护的余额。 */
export async function updateAccountAction(
  _previousState: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  const parsed = updateAccountSchema.safeParse({
    id: formData.get("id"),
    code: formData.get("code"),
    name: formData.get("name"),
    type: formData.get("type"),
  });

  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0]?.message ?? "请检查账户信息" };
  }

  const { id, code, name, type } = parsed.data;
  const existingAccount = db.select({ id: accounts.id, code: accounts.code, icon: accounts.icon, isArchived: accounts.isArchived })
    .from(accounts)
    .where(eq(accounts.id, id))
    .get();

  if (!existingAccount || existingAccount.isArchived) {
    return { success: false, message: "账户不存在或已归档" };
  }

  const duplicateCode = db.select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.code, code), ne(accounts.id, id)))
    .get();
  if (duplicateCode) return { success: false, message: "账户代码已被使用" };

  let uploadedIcon: string | null = null;
  let nextIcon: string | null = null;
  try {
    const selectedIcon = await resolveAccountIcon(formData.get("icon"));
    const currentIcon = accountIconSelection(existingAccount.icon);
    if (selectedIcon?.startsWith("upload:") && selectedIcon !== currentIcon) {
      throw new AccountIconError("只能选择预置图标，或保留当前上传图标");
    }
    uploadedIcon = await saveAccountIcon(formData.get("iconUpload"));
    nextIcon = uploadedIcon ?? selectedIcon;
    db.update(accounts)
      .set({ code, name, type, icon: nextIcon })
      .where(eq(accounts.id, id))
      .run();
  } catch (error) {
    if (uploadedIcon) await deleteAccountIcon(uploadedIcon).catch(() => undefined);
    if (error instanceof AccountIconError) {
      return { success: false, message: error.message };
    }
    return { success: false, message: "更新账户失败，请稍后重试" };
  }

  const oldIcon = accountIconSelection(existingAccount.icon);
  if (oldIcon.startsWith("upload:") && oldIcon !== nextIcon) {
    const oldIconFilename = oldIcon.slice("upload:".length);
    const otherReference = db.select({ id: accounts.id })
      .from(accounts)
      .where(and(
        ne(accounts.id, id),
        or(
          eq(accounts.icon, existingAccount.icon!),
          eq(accounts.icon, oldIcon),
          eq(accounts.icon, oldIconFilename),
        ),
      ))
      .limit(1)
      .get();

    if (!otherReference) {
      await deleteAccountIcon(oldIcon).catch(() => undefined);
    }
  }

  refresh();

  return { success: true, message: "账户信息已更新" };
}

/** 在活动或归档账户的同一列表内保存新的顺序。 */
export async function reorderAccountsAction(
  accountIds: number[],
  isArchived: boolean,
  accountType: string,
): Promise<AccountActionState> {
  const parsedIds = z.array(positiveIdSchema).min(1).max(500).safeParse(accountIds);
  const parsedArchived = z.boolean().safeParse(isArchived);
  const parsedType = z.enum(["checking", "savings", "credit", "cash", "other"]).safeParse(accountType);
  if (
    !parsedIds.success ||
    new Set(parsedIds.data).size !== parsedIds.data.length ||
    !parsedArchived.success ||
    !parsedType.success
  ) {
    return { success: false, message: "账户排序数据无效" };
  }

  try {
    db.transaction((tx) => {
      const selectedAccounts = tx.select({ id: accounts.id, isArchived: accounts.isArchived, type: accounts.type })
        .from(accounts)
        .where(inArray(accounts.id, parsedIds.data))
        .all();
      if (
        selectedAccounts.length !== parsedIds.data.length ||
        selectedAccounts.some((account) => (
          account.isArchived !== parsedArchived.data || account.type !== parsedType.data
        ))
      ) {
        throw new Error("只能在同一账户列表内调整顺序");
      }

      const siblings = tx.select({ id: accounts.id })
        .from(accounts)
        .where(and(eq(accounts.isArchived, parsedArchived.data), eq(accounts.type, parsedType.data)))
        .orderBy(asc(accounts.sortOrder), asc(accounts.name))
        .all();
      if (
        siblings.length !== parsedIds.data.length ||
        siblings.some((sibling) => !parsedIds.data.includes(sibling.id))
      ) {
        throw new Error("账户列表已变化，请刷新后重新排序");
      }

      parsedIds.data.forEach((id, index) => {
        tx.update(accounts).set({ sortOrder: index }).where(eq(accounts.id, id)).run();
      });
    });
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "保存账户顺序失败，请稍后重试",
    };
  }

  revalidatePath("/accounts");
  return { success: true, message: "账户顺序已保存" };
}

/** 归档或恢复账户，保留已有流水和余额。 */
export async function setAccountArchivedAction(formData: FormData): Promise<void> {
  const parsedId = positiveIdSchema.safeParse(formData.get("id"));
  const parsedStatus = z.enum(["true", "false"]).safeParse(formData.get("isArchived"));
  if (!parsedId.success || !parsedStatus.success) return;

  const isArchived = parsedStatus.data === "true";
  db.update(accounts).set({ isArchived }).where(eq(accounts.id, parsedId.data)).run();
  refresh();
}