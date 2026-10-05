import { z } from "zod";
import { toMinorUnits } from "./money";

const str = z.string().trim();
const int = z.coerce.number().int();
const nameSchema = str.min(1, "名称不能为空").max(100, "名称不能超过 100 个字符");
const accountCodeSchema = str
  .regex(/^[A-Za-z0-9_-]{1,50}$/, "账户代码只能包含英文字母、数字、连字符和下划线")
  .transform((value) => value.toLowerCase());

export const positiveIdSchema = int.positive().refine(Number.isSafeInteger, "编号无效");

const moneyInputSchema = str
  .regex(/^-?\d+(?:\.\d{1,2})?$/, "请输入最多两位小数的金额")
  .transform((value, context) => {
    try {
      return toMinorUnits(value);
    } catch {
      context.addIssue({ code: "custom", message: "金额超出可处理范围" });
      return z.NEVER;
    }
  });

const positiveMoneyInputSchema = moneyInputSchema.refine(
  (amount) => amount > 0,
  { message: "金额必须大于 0" },
);

const nullableIdSchema = z.preprocess(
  (value) => (value === "" || value === undefined ? null : value),
  positiveIdSchema.nullable(),
);
const nullableColorSchema = z.preprocess(
  (value) => (value === "" || value === undefined ? null : value),
  z.string().regex(/^#[\da-fA-F]{6}$/, "请选择有效的十六进制颜色").nullable(),
);

const accountFields = {
  code: accountCodeSchema,
  name: nameSchema,
  type: z.enum(["checking", "savings", "credit", "cash", "other"]),
};

export const createAccountSchema = z.object({
  ...accountFields,
  balance: z.preprocess(
    (value) => (value === undefined || value === "" ? "0" : value),
    moneyInputSchema,
  ),
  currency: str.regex(/^[A-Za-z]{3}$/, "请输入 3 个字母的货币代码").default("CNY"),
});

export const updateAccountSchema = z.object({
  id: positiveIdSchema,
  ...accountFields,
});

export const createCategorySchema = z.object({
  name: nameSchema,
  type: z.enum(["expense", "income"]),
  parentId: nullableIdSchema,
  icon: z.preprocess(
    (value) => (value === "" || value === undefined ? null : value),
    str.max(100, "图标名称不能超过 100 个字符").nullable(),
  ),
  color: nullableColorSchema,
  sortOrder: int.nonnegative().default(0),
});

export const updateCategorySchema = createCategorySchema.extend({
  id: positiveIdSchema,
});

export const createTransactionSchema = z
  .object({
    type: z.enum(["expense", "income", "transfer"], {
      error: "目前只支持支出、收入和转账",
    }),
    amount: positiveMoneyInputSchema,
    occurredAt: z.coerce.date(),
    accountId: positiveIdSchema,
    toAccountId: nullableIdSchema,
    categoryId: nullableIdSchema,
    notes: str.max(1000, "备注不能超过 1000 个字符").optional(),
  })
  .superRefine((transaction, context) => {
    if (transaction.type !== "transfer" && transaction.categoryId === null) {
      context.addIssue({
        code: "custom",
        path: ["categoryId"],
        message: "请选择交易分类",
      });
    }

    if (transaction.type === "transfer" && transaction.categoryId !== null) {
      context.addIssue({
        code: "custom",
        path: ["categoryId"],
        message: "转账不需要选择收支分类",
      });
    }

    if (transaction.type === "transfer" && transaction.toAccountId === null) {
      context.addIssue({
        code: "custom",
        path: ["toAccountId"],
        message: "转账记录必须选择转入账户",
      });
    }

    if (transaction.toAccountId === transaction.accountId) {
      context.addIssue({
        code: "custom",
        path: ["toAccountId"],
        message: "转出账户和转入账户不能相同",
      });
    }
  });

export type CreateAccountInput = z.infer<typeof createAccountSchema>;
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type CreateTransactionInput = z.infer<typeof createTransactionSchema>;