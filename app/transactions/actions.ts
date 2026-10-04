"use server";

import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { db } from "@/src/db";
import { accounts, categories, transactions } from "@/src/db/schema";
import { createTransactionSchema } from "@/src/lib/validations";

type TransactionActionState = {
  success: boolean;
  message: string;
};

class TransactionActionError extends Error {}

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