'use client';

import { useState } from 'react';
import { Box, Stack, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { PieChart, pieClasses } from '@mui/x-charts/PieChart';
import { fallbackCategoryColor } from '@/src/lib/category-colors';
import { formatMinorUnits } from '@/src/lib/money';

type TransactionCategoryEntry = {
  type: 'expense' | 'income' | 'transfer' | 'adjustment';
  amount: number;
  occurredAt: Date;
  currency: string;
  categoryId: number | null;
  categoryName: string | null;
  categoryColor: string | null;
  parentCategoryName: string | null;
  parentCategoryColor: string | null;
};

type TransactionCategoryChartProps = {
  transactions: TransactionCategoryEntry[];
  asOf: Date;
};

type TransactionType = 'expense' | 'income';
type RangeDays = 7 | 30 | 90;

const rangeOptions: { days: RangeDays; label: string }[] = [
  { days: 7, label: '近 7 天' },
  { days: 30, label: '近 30 天' },
  { days: 90, label: '近 90 天' },
];

const emptyCategoryColor = '#75817C';

/**
 * 组件：收支分类占比图
 * 功能：按所选时间范围展示收入或支出的分类金额占比。
 * 用户可以切换收入/支出、时间范围和账户币种。
 */
export default function TxnCatPieChart({ transactions, asOf }: TransactionCategoryChartProps) {
  // 默认查看最近 30 天的支出，并优先选择人民币账户。
  const [selection, setSelection] = useState(() => ({
    type: 'expense' as TransactionType,
    days: 30 as RangeDays,
    currency: transactions.find((transaction) => transaction.currency === 'CNY')?.currency
      ?? transactions[0]?.currency
      ?? 'CNY',
  }));
  // 当前数据中出现的币种，用于避免跨币种合并金额。
  const currencies = [...new Set(transactions.map((transaction) => transaction.currency))].sort();
  // 当前选择区间的起始时间。
  const startTime = asOf.getTime() - selection.days * 24 * 60 * 60 * 1000;
  // 按分类累计所选收支类型、币种和时间范围内的金额。
  const totalsByCategory = new Map<string, {
    label: string;
    color: string;
    amount: number;
  }>();

  transactions.forEach((transaction) => {
    const occurredAt = transaction.occurredAt.getTime();
    if (
      transaction.type !== selection.type ||
      transaction.currency !== selection.currency ||
      occurredAt < startTime ||
      occurredAt > asOf.getTime()
    ) {
      return;
    }

    const key = transaction.categoryId === null ? 'uncategorized' : String(transaction.categoryId);
    const label = transaction.categoryId === null
      ? '未分类'
      : transaction.parentCategoryName
        ? `${transaction.parentCategoryName} / ${transaction.categoryName}`
        : transaction.categoryName ?? '未分类';
    const color = transaction.categoryColor
      ?? transaction.parentCategoryColor
      ?? (transaction.categoryId === null ? emptyCategoryColor : fallbackCategoryColor(transaction.categoryId));
    const current = totalsByCategory.get(key);

    totalsByCategory.set(key, {
      label,
      color,
      amount: (current?.amount ?? 0) + Math.abs(transaction.amount),
    });
  });

  // 按金额从高到低排列的分类图表数据。
  const categories = [...totalsByCategory.entries()]
    .map(([id, category]) => ({ id, ...category }))
    .sort((left, right) => right.amount - left.amount);
  // 当前图表中全部分类的金额总和，用来计算占比。
  const totalAmount = categories.reduce((total, category) => total + category.amount, 0);
  // 将整数分转换为账本使用的金额格式并标注币种。
  const formatAmount = (amount: number) => `${formatMinorUnits(amount)} ${selection.currency}`;

  return (
    <Stack spacing={2}>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={1.5}
        sx={{ alignItems: { sm: 'center' }, justifyContent: 'space-between' }}
      >
        <ToggleButtonGroup
          exclusive
          size="small"
          value={selection.type}
          aria-label="收支类型"
          onChange={(_, type: TransactionType | null) => {
            if (type) setSelection((current) => ({ ...current, type }));
          }}
        >
          <ToggleButton value="expense">支出</ToggleButton>
          <ToggleButton value="income">收入</ToggleButton>
        </ToggleButtonGroup>

        <Stack direction="row" spacing={1} sx={{ overflowX: 'auto', maxWidth: '100%' }}>
          <ToggleButtonGroup
            exclusive
            size="small"
            value={selection.days}
            aria-label="图表时间范围"
            onChange={(_, days: RangeDays | null) => {
              if (days) setSelection((current) => ({ ...current, days }));
            }}
          >
            {rangeOptions.map((option) => (
              <ToggleButton key={option.days} value={option.days}>
                {option.label}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
          {currencies.length > 1 ? (
            <ToggleButtonGroup
              exclusive
              size="small"
              value={selection.currency}
              aria-label="图表币种"
              onChange={(_, currency: string | null) => {
                if (currency) setSelection((current) => ({ ...current, currency }));
              }}
            >
              {currencies.map((currency) => (
                <ToggleButton key={currency} value={currency}>{currency}</ToggleButton>
              ))}
            </ToggleButtonGroup>
          ) : null}
        </Stack>
      </Stack>

      {categories.length === 0 ? (
        <Typography color="text.secondary" sx={{ py: 5, textAlign: 'center' }}>
          最近 {selection.days} 天没有{selection.type === 'expense' ? '支出' : '收入'}记录
        </Typography>
      ) : (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: 'minmax(220px, 0.9fr) minmax(220px, 1fr)' },
            alignItems: 'center',
            gap: 2,
          }}
        >
          <PieChart
            height={260}
            hideLegend
            series={[{
              id: 'transaction-category-share',
              data: categories.map((category) => ({
                id: category.id,
                value: category.amount,
                label: category.label,
                color: category.color,
              })),
              innerRadius: 48,
              paddingAngle: 0.4,
              cornerRadius: 0,
              highlightScope: { highlight: 'item', fade: 'global' },
              highlighted: { additionalRadius: 7 },
              faded: { additionalRadius: -3 },
              arcLabel: (item) => `${Math.round(item.value / totalAmount * 100)}%`,
              arcLabelMinAngle: 18,
              valueFormatter: (item) => formatAmount(item.value),
            }]}
            sx={{
              width: '100%',
              [`& .${pieClasses.arcLabel}`]: { fill: '#FFFFFF' },
            }}
          />
          <Stack component="ul" spacing={1} sx={{ m: 0, p: 0, listStyle: 'none', maxHeight: 260, overflowY: 'auto' }}>
            {categories.map((category) => (
              <Box
                component="li"
                key={category.id}
                sx={{ display: 'grid', gridTemplateColumns: '12px minmax(0, 1fr) auto', alignItems: 'center', gap: 1 }}
              >
                <Box aria-hidden="true" sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: category.color }} />
                <Typography variant="body2" sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                  {category.label}
                </Typography>
                <Stack sx={{ alignItems: 'flex-end' }}>
                  <Typography variant="body2" color="text.secondary">
                    {formatAmount(category.amount)}
                  </Typography>
                </Stack>
              </Box>
            ))}
          </Stack>
        </Box>
      )}
    </Stack>
  );
}