import { asc, desc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import Stack from "@mui/material/Stack";
import PageHeading from "@/src/components/PageHeading";
import TransactionEntryForm from "@/src/components/TransactionEntryForm";
import TransactionsList from "@/src/components/TransactionsList";
import WechatImportDialog from "@/src/components/WechatImportDialog";
import { db } from "@/src/db";
import { accounts, categories, transactions } from "@/src/db/schema";

/**
 * 组件：交易明细页面
 * 功能：提供交易录入表单和完整流水列表，供用户记录、查看及整理交易。
 */
const destinationAccounts = alias(accounts, "destination_accounts");
const parentCategories = alias(categories, "parent_categories");

export default function TransactionsPage() {

  // 读取未归档账户，供交易表单选择。
  const accountOptions = db
    .select({
      id: accounts.id,
      code: accounts.code,
      name: accounts.name,
      currency: accounts.currency,
      type: accounts.type,
      icon: accounts.icon,
    })
    .from(accounts)
    .where(eq(accounts.isArchived, false))
    .orderBy(asc(accounts.name))
    .all();

  // 读取交易分类及其层级、图标和颜色，供录入和流水展示使用。
  const categoryOptions = db
    .select({
      id: categories.id,
      code: categories.code,
      name: categories.name,
      type: categories.type,
      parentId: categories.parentId,
      sortOrder: categories.sortOrder,
      icon: categories.icon,
      color: categories.color,
    })
    .from(categories)
    .orderBy(asc(categories.sortOrder), asc(categories.name)) 
    .all();

  // 读取交易流水，并补充账户、分类、上级分类和转入账户的显示信息。
  const transactionRows = db
    .select({
      id: transactions.id,
      type: transactions.type,
      amount: transactions.amount,
      occurredAt: transactions.occurredAt,
      notes: transactions.notes,
      accountId: transactions.accountId,
      toAccountId: transactions.toAccountId,
      accountName: accounts.name,
      currency: accounts.currency,
      categoryId: transactions.categoryId,
      categoryName: categories.name,
      categoryIcon: categories.icon,
      categoryColor: categories.color,
      categoryParentId: categories.parentId,
      categoryParentColor: parentCategories.color,
      destinationAccountName: destinationAccounts.name,
    })
    .from(transactions)
    .innerJoin(accounts, eq(transactions.accountId, accounts.id))
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .leftJoin(parentCategories, eq(categories.parentId, parentCategories.id))
    .leftJoin(destinationAccounts, eq(transactions.toAccountId, destinationAccounts.id))
    .orderBy(desc(transactions.occurredAt), desc(transactions.id))
    .all();

  return (
    <Stack component="section" spacing={3.5}>
      <PageHeading eyebrow="ACTIVITY" title="交易明细" description="记录收支与账户转账，查看完整流水" />
      <WechatImportDialog accounts={accountOptions} />
      <TransactionEntryForm accounts={accountOptions} categories={categoryOptions} />
      <TransactionsList transactions={transactionRows} accounts={accountOptions} categories={categoryOptions} />
    </Stack>
  );
}