"use server";

import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { revalidatePath } from "next/cache";
import { asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { buildCategoryTree, classifyTransactions } from "@/scripts/lib/deepseek-category-classifier.mjs";
import { db } from "@/src/db";
import { accounts, categories, transactions } from "@/src/db/schema";
import { toMinorUnits } from "@/src/lib/money";
import { createTransactionSchema, positiveIdSchema } from "@/src/lib/validations";

const execFileAsync = promisify(execFile);
const maxImportImageBytes = 5 * 1024 * 1024;
const allowedImageTypes: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

export type OcrImportRow = {
  id: number;
  description: string | null;
  occurredAt: string | null;
  amount: string | null;
  balance: string | null;
  ocrText: string | null;
  categoryId: number | null;
  categoryCode: string | null;
  categoryName: string | null;
  categoryPath: string | null;
  categoryConfidence: number | null;
  categoryReason: string | null;
};

export type OcrImportPreviewResult =
  | { success: true; rows: OcrImportRow[]; classificationWarning?: string }
  | { success: false; message: string };

const importedTransactionSchema = z.object({
  amount: z.string().trim().regex(/^[+-]?\d+(?:\.\d{1,2})?$/, "交易金额无效"),
  occurredAt: z.coerce.date(),
  description: z.string().trim().max(1000, "交易说明不能超过 1000 个字符"),
  categoryId: positiveIdSchema,
});

const saveImportedTransactionsSchema = z.object({
  accountId: positiveIdSchema,
  rows: z.array(importedTransactionSchema).min(1, "没有可保存的交易").max(200, "一次最多保存 200 笔交易"),
});

export type SaveImportedTransactionsResult = {
  success: boolean;
  message: string;
};

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

export async function previewTransactionImportAction(formData: FormData): Promise<OcrImportPreviewResult> {
  const uploadedFile = formData.get("screenshot");

  if (!(uploadedFile instanceof File)) {
    return { success: false, message: "请选择微信账单截图" };
  }

  const extension = allowedImageTypes[uploadedFile.type];
  if (!extension) {
    return { success: false, message: "仅支持 JPG、PNG 或 WebP 图片" };
  }

  if (uploadedFile.size === 0 || uploadedFile.size > maxImportImageBytes) {
    return { success: false, message: "截图不能为空，且大小不能超过 5 MB" };
  }

  let temporaryDirectory: string | undefined;

  try {
    temporaryDirectory = await mkdtemp(join(tmpdir(), "accounting-ocr-"));
    const inputPath = join(temporaryDirectory, `screenshot${extension}`);
    const outputPath = join(temporaryDirectory, "result.json");
    const cropsPath = join(temporaryDirectory, "crops");
    const scriptPath = join(process.cwd(), "scripts", "crop_transaction_screenshot.py");
    const pythonExecutable = process.env.OCR_PYTHON_EXECUTABLE ?? (
      process.platform === "win32" ? "python" : "python3"
    );

    await writeFile(inputPath, Buffer.from(await uploadedFile.arrayBuffer()));
    await execFileAsync(
      pythonExecutable,
      [scriptPath, "--input", inputPath, "--output", outputPath, "--crops-dir", cropsPath],
      { timeout: 180_000, maxBuffer: 1024 * 1024 },
    );

    const result = JSON.parse(await readFile(outputPath, "utf8")) as { segments?: unknown };
    if (!Array.isArray(result.segments)) {
      return { success: false, message: "OCR 未返回可预览的交易数据" };
    }

    let transactionIndex = 0;
    const rows: OcrImportRow[] = result.segments.flatMap((segment: unknown) => {
      if (!segment || typeof segment !== "object") return [];
      const entry = segment as { type?: unknown; ocrText?: unknown; data?: unknown };
      if (entry.type !== "transaction" || !entry.data || typeof entry.data !== "object") return [];
      const data = entry.data as Record<string, unknown>;

      return [{
        id: ++transactionIndex,
        description: typeof data.description === "string" ? data.description : null,
        occurredAt: typeof data.dateTime === "string" ? data.dateTime : null,
        amount: typeof data.amount === "string" ? data.amount : null,
        balance: typeof data.balance === "string" ? data.balance : null,
        ocrText: typeof entry.ocrText === "string" ? entry.ocrText : null,
        categoryId: null,
        categoryCode: null,
        categoryName: null,
        categoryPath: null,
        categoryConfidence: null,
        categoryReason: null,
      }];
    });

    if (rows.length === 0) {
      return { success: false, message: "没有从截图中识别到交易，请检查图片内容" };
    }

    const categoryRows = db
      .select({
        id: categories.id,
        code: categories.code,
        name: categories.name,
        type: categories.type,
        parentId: categories.parentId,
        sortOrder: categories.sortOrder,
      })
      .from(categories)
      .orderBy(asc(categories.sortOrder), asc(categories.name))
      .all();
    const categoryTree = buildCategoryTree(categoryRows);
    const classifiableRows = rows.filter(
      (row): row is OcrImportRow & { description: string } => Boolean(row.description?.trim()),
    );
    const warnings: string[] = [];

    if (classifiableRows.length < rows.length) {
      warnings.push(`${rows.length - classifiableRows.length} 笔交易没有识别到 Description`);
    }

    if (classifiableRows.length > 0) {
      try {
        const predictions = await classifyTransactions({
          transactions: classifiableRows.map(({ id, description }) => ({ id, description })),
          categoryTree,
          apiKey: process.env.DEEPSEEK_API_KEY,
        }) as {
          id: number;
          categoryId: number;
          categoryCode: string;
          categoryName: string;
          categoryType: "expense" | "income";
          categoryPath: string;
          confidence: number;
          reason: string;
        }[];
        const predictionsById = new Map(predictions.map((prediction) => [prediction.id, prediction]));
        let mismatchedTypes = 0;

        for (const row of rows) {
          const prediction = predictionsById.get(row.id);
          if (!prediction) continue;

          const signedAmount = row.amount === null ? Number.NaN : Number(row.amount);
          const transactionType = signedAmount < 0 ? "expense" : signedAmount > 0 ? "income" : null;
          if (!transactionType || transactionType !== prediction.categoryType) {
            mismatchedTypes += 1;
            continue;
          }

          row.categoryId = prediction.categoryId;
          row.categoryCode = prediction.categoryCode;
          row.categoryName = prediction.categoryName;
          row.categoryPath = prediction.categoryPath;
          row.categoryConfidence = prediction.confidence;
          row.categoryReason = prediction.reason;
        }

        if (mismatchedTypes > 0) {
          warnings.push(`${mismatchedTypes} 笔分类建议与金额方向不符，请手动选择分类`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "";
        if (errorMessage.includes("DEEPSEEK_API_KEY")) {
          warnings.push("Description 已识别，但服务器未配置 DEEPSEEK_API_KEY；配置后重启应用即可自动分类，也可先手动选择分类");
        } else {
          warnings.push("Description 已识别，但 DeepSeek 请求失败；请检查 API 配置和网络后重试，或手动选择分类");
        }
      }
    } else {
      warnings.push("没有可发送给 DeepSeek 的 Description，请手动选择分类");
    }

    return {
      success: true,
      rows,
      classificationWarning: warnings.length > 0 ? warnings.join("；") : undefined,
    };
  } catch {
    return { success: false, message: "截图识别失败，请确认图片清晰且服务器已配置 OCR 运行环境" };
  } finally {
    if (temporaryDirectory) {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  }
}

export async function saveImportedTransactionsAction(
  input: unknown,
): Promise<SaveImportedTransactionsResult> {
  const parsed = saveImportedTransactionsSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0]?.message ?? "导入数据无效" };
  }

  const preparedRows: {
    type: "expense" | "income";
    amount: number;
    occurredAt: Date;
    description: string;
    categoryId: number;
  }[] = [];
  for (const row of parsed.data.rows) {
    let signedAmount: number;
    try {
      signedAmount = toMinorUnits(row.amount.startsWith("+") ? row.amount.slice(1) : row.amount);
    } catch {
      return { success: false, message: "存在无效或超出范围的交易金额" };
    }

    if (signedAmount === 0) {
      return { success: false, message: "交易金额不能为 0" };
    }

    preparedRows.push({
      type: signedAmount < 0 ? "expense" as const : "income" as const,
      amount: Math.abs(signedAmount),
      occurredAt: row.occurredAt,
      description: row.description,
      categoryId: row.categoryId,
    });
  }

  try {
    db.transaction((tx) => {
      const sourceAccount = tx
        .select({ id: accounts.id, isArchived: accounts.isArchived })
        .from(accounts)
        .where(eq(accounts.id, parsed.data.accountId))
        .get();

      if (!sourceAccount || sourceAccount.isArchived) {
        throw new TransactionActionError("所选账户不存在或已归档");
      }

      for (const row of preparedRows) {
        const category = tx
          .select({ type: categories.type })
          .from(categories)
          .where(eq(categories.id, row.categoryId))
          .get();

        if (!category || category.type !== row.type) {
          throw new TransactionActionError("导入分类不存在或与交易类型不匹配");
        }

        tx.insert(transactions)
          .values({
            type: row.type,
            amount: row.amount,
            occurredAt: row.occurredAt,
            accountId: sourceAccount.id,
            toAccountId: null,
            categoryId: row.categoryId,
            notes: row.description || null,
          })
          .run();

        const balanceDelta = row.type === "income" ? row.amount : -row.amount;
        tx.update(accounts)
          .set({ balance: sql`${accounts.balance} + ${balanceDelta}` })
          .where(eq(accounts.id, sourceAccount.id))
          .run();
      }
    });
  } catch (error) {
    if (error instanceof TransactionActionError) {
      return { success: false, message: error.message };
    }

    return { success: false, message: "批量保存交易失败，未导入任何记录" };
  }

  revalidatePath("/transactions");
  revalidatePath("/");
  revalidatePath("/accounts");

  return { success: true, message: `已导入 ${preparedRows.length} 笔交易` };
}