import { asc, desc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import Stack from "@mui/material/Stack";
import PageHeading from "@/src/components/PageHeading";
import TransactionEntryForm from "@/src/components/TransactionEntryForm";
import TransactionsList from "@/src/components/TransactionsList";
import { db } from "@/src/db";
import { accounts, categories, transactions } from "@/src/db/schema";

const destinationAccounts = alias(accounts, "destination_accounts");

export default function TransactionsPage() {

  // Fetch account options from the database
  const accountOptions = db
    .select({
      id: accounts.id,
      name: accounts.name,
      currency: accounts.currency,
      type: accounts.type,
      icon: accounts.icon,
    })
    .from(accounts)
    .where(eq(accounts.isArchived, false))
    .orderBy(asc(accounts.name))
    .all();

  // Fetch category options from the database
  const categoryOptions = db
    .select({
      id: categories.id,
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

  // Fetch transaction rows from the database
  const transactionRows = db
    .select({
      id: transactions.id,
      type: transactions.type,
      amount: transactions.amount,
      occurredAt: transactions.occurredAt,
      notes: transactions.notes,
      accountName: accounts.name,
      currency: accounts.currency,
      categoryName: categories.name,
      destinationAccountName: destinationAccounts.name,
    })
    .from(transactions)
    .innerJoin(accounts, eq(transactions.accountId, accounts.id))
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .leftJoin(destinationAccounts, eq(transactions.toAccountId, destinationAccounts.id))
    .orderBy(desc(transactions.occurredAt), desc(transactions.id))
    .all();

  return (
    <Stack component="section" spacing={3.5}>
      <PageHeading eyebrow="ACTIVITY" title="交易明细" description="记录收支与账户转账，查看完整流水" />
      <TransactionEntryForm accounts={accountOptions} categories={categoryOptions} />
      <TransactionsList transactions={transactionRows} />
    </Stack>
  );
}