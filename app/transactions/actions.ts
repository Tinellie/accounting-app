"use server";

import { revalidatePath } from "next/cache";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { getUserDb } from "@/src/db/user";
import { accounts, categories, transactions } from "@/src/db/schema";
import { createTransactionSchema, positiveIdSchema, transactionIdsSchema } from "@/src/lib/validations";
import { TransactionTagError, updateTransactionTags } from "@/src/lib/transaction-tags";

const updateTransactionSchema = createTransactionSchema.extend({ id: positiveIdSchema });
const bulkCategorySchema = z.object({
  transactionIds: transactionIdsSchema,
  categoryId: positiveIdSchema,
});
const bulkAccountSchema = z.object({
  transactionIds: transactionIdsSchema,
  accountId: positiveIdSchema,
});

type TransactionActionState = {
  success: boolean;
  message: string;
};

class TransactionActionError extends Error {}

export async function bulkUpdateTransactionTagsAction(input: unknown): Promise<TransactionActionState> {
  const db = await getUserDb();
  try {
    const result = updateTransactionTags(db, input);
    revalidatePath("/transactions");
    revalidatePath("/categories");
    return { success: true, message: `已为 ${result.transactionIds.length} 笔交易${result.operation === 'add' ? '添加' : '移除'}所选标签` };
  } catch (error) {
    if (error instanceof TransactionTagError) return { success: false, message: error.message };
    console.error("[transaction-tags] Bulk update failed", error);
    return { success: false, message: "批量修改标签失败，请稍后重试" };
  }
}

/**
 * 校验并保存一笔交易，同时更新相关账户余额。
 * @param _previousState useActionState 传入的上一次状态；当前函数不使用它。
 * @param formData 用户提交的交易表单数据。
 * @returns 保存结果及供界面显示的提示信息。
 */
export async function createTransactionAction(
  _previousState: TransactionActionState,
  formData: FormData,
): Promise<TransactionActionState> {
  const db = await getUserDb();
  const parsed = createTransactionSchema.safeParse({
    type: formData.get("type"),
    amount: formData.get("amount"),
    occurredAt: formData.get("occurredAt"),
    accountId: formData.get("accountId"),
    toAccountId: formData.get("toAccountId"),
    categoryId: formData.get("categoryId"),
    notes: formData.get("notes") ?? "",
  });

  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0]?.message ?? "请检查填写内容" };
  }

  const transaction = parsed.data;

  try {
    db.transaction((tx) => {
      const sourceAccount = tx
        .select({ id: accounts.id, currency: accounts.currency, isArchived: accounts.isArchived })
        .from(accounts)
        .where(eq(accounts.id, transaction.accountId))
        .get();

      if (!sourceAccount || sourceAccount.isArchived) {
        throw new TransactionActionError("所选账户不存在或已归档");
      }

      let destinationAccount: typeof sourceAccount | undefined;

      if (transaction.type === "transfer" && transaction.toAccountId !== null) {
        destinationAccount = tx
          .select({ id: accounts.id, currency: accounts.currency, isArchived: accounts.isArchived })
          .from(accounts)
          .where(eq(accounts.id, transaction.toAccountId))
          .get();

        if (!destinationAccount || destinationAccount.isArchived) {
          throw new TransactionActionError("所选转入账户不存在或已归档");
        }

        if (sourceAccount.currency !== destinationAccount.currency) {
          throw new TransactionActionError("转账双方的货币单位不同，暂不支持直接转账");
        }
      }

      if (transaction.categoryId !== null) {
        const category = tx
          .select({ type: categories.type })
          .from(categories)
          .where(eq(categories.id, transaction.categoryId))
          .get();

        if (!category || category.type !== transaction.type) {
          throw new TransactionActionError("所选分类不存在或与交易类型不匹配");
        }
      }

      tx.insert(transactions)
        .values({
          type: transaction.type,
          amount: transaction.amount,
          occurredAt: transaction.occurredAt,
          accountId: transaction.accountId,
          toAccountId: transaction.type === "transfer" ? transaction.toAccountId : null,
          categoryId: transaction.categoryId,
          notes: transaction.notes || null,
        })
        .run();

      const sourceDelta = transaction.type === "income" ? transaction.amount : -transaction.amount;
      tx.update(accounts)
        .set({ balance: sql`${accounts.balance} + ${sourceDelta}` })
        .where(eq(accounts.id, sourceAccount.id))
        .run();

      if (transaction.type === "transfer" && destinationAccount) {
        tx.update(accounts)
          .set({ balance: sql`${accounts.balance} + ${transaction.amount}` })
          .where(eq(accounts.id, destinationAccount.id))
          .run();
      }
    });
  } catch (error) {
    if (error instanceof TransactionActionError) {
      return { success: false, message: error.message };
    }

    return { success: false, message: "保存交易失败，请稍后重试" };
  }

  revalidatePath("/transactions");
  revalidatePath("/");
  revalidatePath("/accounts");

  return { success: true, message: "交易已保存" };
}

export async function updateTransactionAction(
  _previousState: TransactionActionState,
  formData: FormData,
): Promise<TransactionActionState> {
  const db = await getUserDb();
  const parsed = updateTransactionSchema.safeParse({
    id: formData.get("id"),
    type: formData.get("type"),
    amount: formData.get("amount"),
    occurredAt: formData.get("occurredAt"),
    accountId: formData.get("accountId"),
    toAccountId: formData.get("toAccountId"),
    categoryId: formData.get("categoryId"),
    notes: formData.get("notes") ?? "",
  });
  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0]?.message ?? "请检查交易信息" };
  }

  const updated = parsed.data;

  try {
    db.transaction((tx) => {
      const current = tx.select({
        id: transactions.id,
        type: transactions.type,
        amount: transactions.amount,
        accountId: transactions.accountId,
        toAccountId: transactions.toAccountId,
      })
        .from(transactions)
        .where(eq(transactions.id, updated.id))
        .get();

      if (!current || current.type === "adjustment") {
        throw new TransactionActionError("交易不存在或此类型暂不支持编辑");
      }

      const sourceAccount = tx.select({ id: accounts.id, currency: accounts.currency, isArchived: accounts.isArchived })
        .from(accounts)
        .where(eq(accounts.id, updated.accountId))
        .get();
      if (!sourceAccount || sourceAccount.isArchived) {
        throw new TransactionActionError("所选账户不存在或已归档");
      }

      let destinationAccount: typeof sourceAccount | undefined;
      if (updated.type === "transfer" && updated.toAccountId !== null) {
        destinationAccount = tx
          .select({ id: accounts.id, currency: accounts.currency, isArchived: accounts.isArchived })
          .from(accounts)
          .where(eq(accounts.id, updated.toAccountId))
          .get();
        if (!destinationAccount || destinationAccount.isArchived) {
          throw new TransactionActionError("所选转入账户不存在或已归档");
        }
        if (destinationAccount.id === sourceAccount.id || destinationAccount.currency !== sourceAccount.currency) {
          throw new TransactionActionError("转账账户不能相同，且货币单位必须相同");
        }
      }

      if (updated.categoryId !== null) {
        const category = tx.select({ type: categories.type })
          .from(categories)
          .where(eq(categories.id, updated.categoryId))
          .get();
        if (!category || category.type !== updated.type) {
          throw new TransactionActionError("所选分类不存在或与交易类型不匹配");
        }
      }

      const addBalance = (accountId: number, delta: number) => {
        tx.update(accounts)
          .set({ balance: sql`${accounts.balance} + ${delta}` })
          .where(eq(accounts.id, accountId))
          .run();
      };
      const sourceDelta = (type: string, amount: number) => type === "income" ? amount : -amount;

      addBalance(current.accountId, -sourceDelta(current.type, current.amount));
      if (current.type === "transfer" && current.toAccountId !== null) {
        addBalance(current.toAccountId, -current.amount);
      }

      addBalance(sourceAccount.id, sourceDelta(updated.type, updated.amount));
      if (updated.type === "transfer" && destinationAccount) {
        addBalance(destinationAccount.id, updated.amount);
      }

      tx.update(transactions)
        .set({
          type: updated.type,
          amount: updated.amount,
          occurredAt: updated.occurredAt,
          accountId: sourceAccount.id,
          toAccountId: updated.type === "transfer" ? updated.toAccountId : null,
          categoryId: updated.categoryId,
          notes: updated.notes || null,
        })
        .where(eq(transactions.id, updated.id))
        .run();
    });
  } catch (error) {
    if (error instanceof TransactionActionError) {
      return { success: false, message: error.message };
    }
    return { success: false, message: "更新交易失败" };
  }

  revalidatePath("/transactions");
  revalidatePath("/");
  revalidatePath("/accounts");
  return { success: true, message: "交易已更新" };
}

export async function bulkUpdateTransactionCategoryAction(input: unknown): Promise<TransactionActionState> {
  const db = await getUserDb();
  const parsed = bulkCategorySchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0]?.message ?? "分类批量更新数据无效" };
  }

  try {
    db.transaction((tx) => {
      const selected = tx.select({ id: transactions.id, type: transactions.type })
        .from(transactions)
        .where(inArray(transactions.id, parsed.data.transactionIds))
        .all();
      if (selected.length !== parsed.data.transactionIds.length) {
        throw new TransactionActionError("部分交易已不存在，请刷新后重试");
      }
      const firstType = selected[0]?.type;
      if (
        (firstType !== "expense" && firstType !== "income") ||
        selected.some((transaction) => transaction.type !== firstType)
      ) {
        throw new TransactionActionError("只能为同类型的支出或收入批量修改分类");
      }

      const category = tx.select({ id: categories.id, type: categories.type })
        .from(categories)
        .where(eq(categories.id, parsed.data.categoryId))
        .get();
      if (!category || category.type !== firstType) {
        throw new TransactionActionError("分类不存在或与所选交易类型不匹配");
      }

      tx.update(transactions)
        .set({ categoryId: category.id })
        .where(inArray(transactions.id, parsed.data.transactionIds))
        .run();
    });
  } catch (error) {
    if (error instanceof TransactionActionError) return { success: false, message: error.message };
    return { success: false, message: "批量修改分类失败" };
  }

  revalidatePath("/transactions");
  return { success: true, message: "已批量修改分类" };
}

export async function bulkUpdateTransactionAccountAction(input: unknown): Promise<TransactionActionState> {
  const db = await getUserDb();
  const parsed = bulkAccountSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0]?.message ?? "账户批量更新数据无效" };
  }

  try {
    db.transaction((tx) => {
      const selected = tx.select({
        id: transactions.id,
        type: transactions.type,
        amount: transactions.amount,
        accountId: transactions.accountId,
        toAccountId: transactions.toAccountId,
      })
        .from(transactions)
        .where(inArray(transactions.id, parsed.data.transactionIds))
        .all();
      if (selected.length !== parsed.data.transactionIds.length) {
        throw new TransactionActionError("部分交易已不存在，请刷新后重试");
      }

      const targetAccount = tx.select({ id: accounts.id, currency: accounts.currency, isArchived: accounts.isArchived })
        .from(accounts)
        .where(eq(accounts.id, parsed.data.accountId))
        .get();
      if (!targetAccount || targetAccount.isArchived) {
        throw new TransactionActionError("所选账户不存在或已归档");
      }

      const sourceAccounts = tx.select({ id: accounts.id, currency: accounts.currency })
        .from(accounts)
        .where(inArray(accounts.id, [...new Set(selected.map((transaction) => transaction.accountId))]))
        .all();
      const sourceCurrencies = new Map(sourceAccounts.map((account) => [account.id, account.currency]));
      if (selected.some((transaction) => sourceCurrencies.get(transaction.accountId) !== targetAccount.currency)) {
        throw new TransactionActionError("不同货币的交易不能批量移动到同一个账户");
      }

      const addBalance = (accountId: number, delta: number) => {
        tx.update(accounts)
          .set({ balance: sql`${accounts.balance} + ${delta}` })
          .where(eq(accounts.id, accountId))
          .run();
      };

      for (const transaction of selected) {
        if (transaction.type === "transfer") {
          if (transaction.toAccountId === targetAccount.id) {
            throw new TransactionActionError("转账账户不能与转入账户相同");
          }
          if (transaction.toAccountId !== null) {
            const destination = tx.select({ currency: accounts.currency })
              .from(accounts)
              .where(eq(accounts.id, transaction.toAccountId))
              .get();
            if (!destination || destination.currency !== targetAccount.currency) {
              throw new TransactionActionError("转账账户的货币单位必须与转入账户相同");
            }
          }
        }

        if (transaction.accountId === targetAccount.id) continue;
        const sourceDelta = transaction.type === "income"
          ? transaction.amount
          : transaction.type === "adjustment" ? transaction.amount : -transaction.amount;
        addBalance(transaction.accountId, -sourceDelta);
        addBalance(targetAccount.id, sourceDelta);
      }

      tx.update(transactions)
        .set({ accountId: targetAccount.id })
        .where(inArray(transactions.id, parsed.data.transactionIds))
        .run();
    });
  } catch (error) {
    if (error instanceof TransactionActionError) return { success: false, message: error.message };
    return { success: false, message: "批量修改账户失败" };
  }

  revalidatePath("/transactions");
  revalidatePath("/");
  revalidatePath("/accounts");
  return { success: true, message: "已批量修改账户" };
}

export async function reverseTransactionCategoryTypeAction(input: unknown): Promise<TransactionActionState> {
  const db = await getUserDb();
  const parsedIds = transactionIdsSchema.safeParse(input);
  if (!parsedIds.success) {
    return { success: false, message: parsedIds.error.issues[0]?.message ?? "所选交易无效" };
  }

  try {
    db.transaction((tx) => {
      const selected = tx.select({
        id: transactions.id,
        type: transactions.type,
        amount: transactions.amount,
        accountId: transactions.accountId,
      })
        .from(transactions)
        .where(inArray(transactions.id, parsedIds.data))
        .all();
      if (selected.length !== parsedIds.data.length) {
        throw new TransactionActionError("部分交易已不存在，请刷新后重试");
      }
      const currentType = selected[0]?.type;
      if (selected.some((transaction) => transaction.amount < 0)) {
        throw new TransactionActionError("退款记录不能反转收支类型，请通过编辑修改");
      }
      if (
        (currentType !== "expense" && currentType !== "income") ||
        selected.some((transaction) => transaction.type !== currentType)
      ) {
        throw new TransactionActionError("只能反转同类型的支出或收入，不能包含转账");
      }

      const reversedRows = selected.map((transaction) => {
        const signedAmount = currentType === "income" ? transaction.amount : -transaction.amount;
        const reversedSignedAmount = signedAmount * -1;
        return {
          transaction,
          reversedSignedAmount,
          targetType: reversedSignedAmount > 0 ? "income" as const : "expense" as const,
        };
      });
      const targetType = reversedRows[0]?.targetType;
      if (!targetType || reversedRows.some((row) => row.targetType !== targetType)) {
        throw new TransactionActionError("所选交易无法统一反转收支类型");
      }
      const targetCategory = tx.select({ id: categories.id })
        .from(categories)
        .where(and(eq(categories.type, targetType), sql`${categories.parentId} IS NULL`))
        .orderBy(asc(categories.sortOrder), asc(categories.name))
        .get();
      if (!targetCategory) {
        throw new TransactionActionError(`请先创建${targetType === "income" ? "收入" : "支出"}分类`);
      }

      for (const row of reversedRows) {
        const transaction = row.transaction;
        const signedAmount = currentType === "income" ? transaction.amount : -transaction.amount;
        tx.update(accounts)
          .set({ balance: sql`${accounts.balance} + ${row.reversedSignedAmount - signedAmount}` })
          .where(eq(accounts.id, transaction.accountId))
          .run();

        tx.update(transactions)
          .set({
            type: row.targetType,
            amount: Math.abs(row.reversedSignedAmount),
            categoryId: targetCategory.id,
          })
          .where(eq(transactions.id, transaction.id))
          .run();
      }
    });
  } catch (error) {
    if (error instanceof TransactionActionError) return { success: false, message: error.message };
    return { success: false, message: "反转交易类型失败" };
  }

  revalidatePath("/transactions");
  revalidatePath("/");
  revalidatePath("/accounts");
  return { success: true, message: "已反转交易收支类型，并设置为目标类型的首个分类" };
}

export async function deleteTransactionsAction(input: unknown): Promise<TransactionActionState> {
  const db = await getUserDb();
  const parsedIds = transactionIdsSchema.safeParse(input);
  if (!parsedIds.success) {
    return { success: false, message: parsedIds.error.issues[0]?.message ?? "所选交易无效" };
  }

  try {
    db.transaction((tx) => {
      const selected = tx.select({
        id: transactions.id,
        type: transactions.type,
        amount: transactions.amount,
        accountId: transactions.accountId,
        toAccountId: transactions.toAccountId,
      })
        .from(transactions)
        .where(inArray(transactions.id, parsedIds.data))
        .all();
      if (selected.length !== parsedIds.data.length) {
        throw new TransactionActionError("部分交易已不存在，请刷新后重试");
      }

      for (const transaction of selected) {
        const sourceDelta = transaction.type === "income"
          ? transaction.amount
          : transaction.type === "adjustment" ? transaction.amount : -transaction.amount;
        tx.update(accounts)
          .set({ balance: sql`${accounts.balance} + ${-sourceDelta}` })
          .where(eq(accounts.id, transaction.accountId))
          .run();
        if (transaction.type === "transfer" && transaction.toAccountId !== null) {
          tx.update(accounts)
            .set({ balance: sql`${accounts.balance} - ${transaction.amount}` })
            .where(eq(accounts.id, transaction.toAccountId))
            .run();
        }
      }

      tx.delete(transactions).where(inArray(transactions.id, parsedIds.data)).run();
    });
  } catch (error) {
    if (error instanceof TransactionActionError) return { success: false, message: error.message };
    return { success: false, message: "批量删除交易失败" };
  }

  revalidatePath("/transactions");
  revalidatePath("/");
  revalidatePath("/accounts");
  return { success: true, message: `已删除 ${parsedIds.data.length} 笔交易` };
}