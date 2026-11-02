'use client';

import { useId, useState } from 'react';
import { Alert, Box, Button, Checkbox, FormControl, FormControlLabel, InputLabel, MenuItem, Paper, Popover, Select, Slider, Stack, TextField, Typography } from '@mui/material';
import { DatePicker, LocalizationProvider } from '@mui/x-date-pickers';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import dayjs from 'dayjs';
import TransactionTypeSelector from './TransactionEntryForm/TransactionTypeSelector';
import SourceAccountField from './TransactionEntryForm/SourceAccountField';
import TransactionDetailField from './TransactionEntryForm/TransactionDetailField';
import type { AccountOption, CategoryOption } from './TransactionEntryForm/types';
import { formatMinorUnits, toMinorUnits } from '../lib/money';
import { initialTransactionFilters, type ExchangeRates, type TransactionFilters as FilterValues } from '../lib/transaction-filters';

export default function TransactionFilters({
  value, onChange, accounts, categories, currencies, extent, error, rateError, rates, loading, onRequestRates, onRetryRates,
}: {
  value: FilterValues;
  onChange: (value: FilterValues) => void;
  accounts: AccountOption[];
  categories: CategoryOption[];
  currencies: string[];
  extent: [number, number] | null;
  error: string | null;
  rateError: string | null;
  rates: ExchangeRates | null;
  loading: boolean;
  onRequestRates: () => void;
  onRetryRates: () => void;
}) {
  const prefix = useId();
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  const update = (patch: Partial<FilterValues>) => onChange({ ...value, ...patch });
  let sliderValue: [number, number] | null = null;
  if (extent) {
    try {
      sliderValue = [
        value.minimum.trim() ? toMinorUnits(value.minimum) : extent[0],
        value.maximum.trim() ? toMinorUnits(value.maximum) : extent[1],
      ];
    } catch { /* Invalid manual amounts are reported by the list's shared validation. */ }
  }
  const activeAmount = !value.convert || value.minimum !== '' || value.maximum !== '';
  const amountControls = (
    <Stack spacing={2} sx={{ p: 2, width: { xs: 300, sm: 400 }, maxWidth: 'calc(100vw - 32px)' }}>
      <Typography variant="subtitle1">金额筛选</Typography>
      <FormControlLabel control={<Checkbox checked={value.convert} onChange={(_, convert) => update({ convert })} />} label="转换币值筛选" />
      <FormControl fullWidth size="small">
        <InputLabel id={`${prefix}-currency-label`}>筛选币种</InputLabel>
        <Select labelId={`${prefix}-currency-label`} value={value.currency} label="筛选币种" onChange={(event) => update({ currency: event.target.value })}>
          {currencies.map((currency) => <MenuItem key={currency} value={currency}>{currency}</MenuItem>)}
        </Select>
      </FormControl>
      <Typography variant="caption" color="text.secondary">
        {value.convert ? `按最新公开汇率换算至 ${value.currency}，仅用于筛选，不改变账目。` : `仅显示原币为 ${value.currency} 的交易。`}
        金额按列表显示的正负值筛选，范围包含端点。
      </Typography>
      {value.convert && loading ? <Typography role="status" variant="body2">正在获取最新汇率…</Typography> : null}
      {value.convert && rateError ? <Alert severity="error" action={<Button color="inherit" size="small" onClick={onRetryRates}>重试</Button>}>{rateError}</Alert> : null}
      {value.convert && rates ? <Typography variant="caption" color="text.secondary">Frankfurter 公开参考汇率，最早报价日期：{rates.date}（非实时成交价）</Typography> : null}
      <Box sx={{ px: 1 }}>
        <Slider
          aria-label="金额范围"
          getAriaLabel={(index) => index === 0 ? '最低金额滑块' : '最高金额滑块'}
          min={extent?.[0] ?? 0}
          max={extent && extent[1] > extent[0] ? extent[1] : (extent?.[0] ?? 0) + 1}
          step={1}
          disabled={!extent || extent[0] === extent[1] || !sliderValue}
          value={sliderValue && extent
            ? sliderValue.map((amount) => Math.min(extent[1], Math.max(extent[0], amount))).sort((a, b) => a - b)
            : [0, 0]}
          valueLabelDisplay="auto"
          valueLabelFormat={(amount) => `${value.currency} ${formatMinorUnits(amount)}`}
          onChange={(_, amounts) => {
            if (Array.isArray(amounts)) update({ minimum: formatMinorUnits(amounts[0]), maximum: formatMinorUnits(amounts[1]) });
          }}
        />
      </Box>
      <Stack direction="row" spacing={1}>
        <TextField label="最低金额" size="small" fullWidth value={value.minimum} placeholder={extent ? formatMinorUnits(extent[0]) : '不限'}
          onChange={(event) => update({ minimum: event.target.value })} slotProps={{ htmlInput: { inputMode: 'decimal' } }} />
        <TextField label="最高金额" size="small" fullWidth value={value.maximum} placeholder={extent ? formatMinorUnits(extent[1]) : '不限'}
          onChange={(event) => update({ maximum: event.target.value })} slotProps={{ htmlInput: { inputMode: 'decimal' } }} />
      </Stack>
      {error ? <Alert severity="error">{error}</Alert> : null}
      <Button onClick={() => update({ minimum: '', maximum: '', convert: true })}>清除金额限制</Button>
    </Stack>
  );
  return (
    <Paper component="section" aria-label="流水筛选" variant="outlined" sx={{ p: 2, mb: 2 }}>
      <Stack spacing={2}>
        <TransactionTypeSelector multiple type={value.types} onTypeChange={(types) => update({ types })} fieldId={`${prefix}-types`} />
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'minmax(0, 1fr) minmax(0, 2fr) minmax(0, 1fr)' }, gap: 2, alignItems: 'start' }}>
          <TransactionDetailField multiple categories={categories} categoryId={value.categoryIds} onCategoryChange={(categoryIds) => update({ categoryIds })}
            fieldId={`${prefix}-categories`} labelOverride="筛选分类" />
          <TextField fullWidth size="small" label="描述检索" placeholder="输入交易描述" value={value.description} onChange={(event) => update({ description: event.target.value })} />
          <SourceAccountField multiple accounts={accounts} type="expense" sourceAccountId={value.accountIds} onAccountChange={(accountIds) => update({ accountIds })}
            fieldId={`${prefix}-accounts`} labelOverride="筛选账户" />
        </Box>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} useFlexGap sx={{ alignItems: { sm: 'center' }, flexWrap: 'wrap' }}>
          <Button variant={activeAmount ? 'contained' : 'outlined'} onClick={(event) => { setAnchor(event.currentTarget); onRequestRates(); }} aria-haspopup="dialog" aria-expanded={Boolean(anchor)}>
            {activeAmount ? `金额 · ${value.currency} ${value.minimum || '不限'} ～ ${value.maximum || '不限'}` : '金额筛选'}
          </Button>
          <LocalizationProvider dateAdapter={AdapterDayjs}>
            <DatePicker label="开始日期" value={value.startDate ? dayjs(value.startDate) : null} format="YYYY/MM/DD"
              onChange={(date) => update({ startDate: date ? date.isValid() ? date.format('YYYY-MM-DD') : 'invalid' : '' })}
              slotProps={{ textField: { size: 'small' }, field: { clearable: true } }} />
            <DatePicker label="结束日期" value={value.endDate ? dayjs(value.endDate) : null} format="YYYY/MM/DD"
              onChange={(date) => update({ endDate: date ? date.isValid() ? date.format('YYYY-MM-DD') : 'invalid' : '' })}
              slotProps={{ textField: { size: 'small' }, field: { clearable: true } }} />
          </LocalizationProvider>
          <Button onClick={() => onChange({ ...initialTransactionFilters })}>重置筛选</Button>
        </Stack>
        {error ? <Alert severity="error">{error}</Alert> : null}
      </Stack>
      <Popover open={Boolean(anchor)} anchorEl={anchor} onClose={() => setAnchor(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}>
        <Box role="dialog" aria-label="金额筛选设置">{amountControls}</Box>
      </Popover>
    </Paper>
  );
}
