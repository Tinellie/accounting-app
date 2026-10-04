import { sqliteTable, text, integer, primaryKey, type AnySQLiteColumn } from 'drizzle-orm/sqlite-core';

export const accounts = sqliteTable(
  'accounts',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    icon: text('icon'),
    type: text('type', { enum: ['checking', 'savings', 'credit', 'cash', 'other'] }).notNull(),
    balance: integer('balance').notNull().default(0),
    currency: text('currency').notNull().default('CNY'),
    includeInNetWorth: integer('include_in_net_worth', { mode: 'boolean' }).notNull().default(true),
    isArchived: integer('is_archived', { mode: 'boolean' }).notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  },
);

export const categories = sqliteTable(
  'categories',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    type: text('type', { enum: ['expense', 'income'] }).notNull(),
    parentId: integer('parent_id').references((): AnySQLiteColumn => categories.id, { onDelete: 'cascade' }),
    icon: text('icon'),
    color: text('color'),
    sortOrder: integer('sort_order').notNull().default(0),
  },
);

export const transactions = sqliteTable(
  'transactions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    type: text('type', { enum: ['expense', 'income', 'transfer', 'adjustment'] }).notNull(),
    amount: integer('amount').notNull(),
    occurredAt: integer('occurred_at', { mode: 'timestamp' }).notNull(),
    accountId: integer('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
    toAccountId: integer('to_account_id').references(() => accounts.id, { onDelete: 'set null' }),
    categoryId: integer('category_id').references(() => categories.id, { onDelete: 'set null' }),
    notes: text('notes'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  },
);

export const tags = sqliteTable(
  'tags',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull().unique(),
    color: text('color'),
  },
);

export const transactionTags = sqliteTable(
  'transaction_tags',
  {
    transactionId: integer('transaction_id').notNull().references(() => transactions.id, { onDelete: 'cascade' }),
    tagId: integer('tag_id').notNull().references(() => tags.id, { onDelete: 'cascade' }),
  },
  (table) => [
    primaryKey({ columns: [table.transactionId, table.tagId] }),
  ]
);