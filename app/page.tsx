import Stack from "@mui/material/Stack";
import PageHeading from "@/src/components/PageHeading";
import { and, desc, eq, gte, inArray } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import { connection } from 'next/server';
import DashboardChartArea, { DashboardChartSlot } from '@/src/components/DashboardChartArea';
import TxnCatPieChart from '@/src/components/TxnCatPieChart';
import { db } from '@/src/db';
import { accounts, categories, transactions } from '@/src/db/schema';

/**
 * 组件：个人账本首页
 * 功能：作为账本概况入口，展示账户与收支概况提示。
 */
const parentCategories = alias(categories, 'parent_categories');

export default async function Home() {
  await connection();
  // 统一图表的时间基准，避免服务端和客户端使用不同的当前时间。
  const asOf = new Date();
  // 预取图表最长区间，即当前时间往前 180 天。
  const lookbackStart = new Date(asOf.getTime() - 180 * 24 * 60 * 60 * 1000);
  // 读取图表所需的收支、金额、日期、币种及分类显示信息。
  const categoryTransactions = db
    .select({
      type: transactions.type,
      amount: transactions.amount,
      occurredAt: transactions.occurredAt,
      currency: accounts.currency,
      categoryId: categories.id,
      categoryName: categories.name,
      categoryColor: categories.color,
      parentCategoryId: parentCategories.id,
      parentCategoryName: parentCategories.name,
      parentCategoryColor: parentCategories.color,
    })
    .from(transactions)
    .innerJoin(accounts, eq(transactions.accountId, accounts.id))
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .leftJoin(parentCategories, eq(categories.parentId, parentCategories.id))
    .where(and(
      inArray(transactions.type, ['expense', 'income']),
      gte(transactions.occurredAt, lookbackStart),
    ))
    .orderBy(desc(transactions.occurredAt))
    .all();

  return (
    <Stack component="section" spacing={0}>
      <PageHeading eyebrow="OVERVIEW" title="首页看板" description="账户与收支概况" />
      <DashboardChartArea>
        <DashboardChartSlot title="收支分类占比" columns={8} minHeight={360}>
          <TxnCatPieChart transactions={categoryTransactions} asOf={asOf} />
        </DashboardChartSlot>
      </DashboardChartArea>
    </Stack>
  );
}
