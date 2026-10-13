import { useState } from 'react';
import { Autocomplete, Avatar, Box, FormHelperText, InputAdornment, TextField, Typography } from '@mui/material';
import CategoryIcon from '@/src/components/CategoryIcon';
import { accountTypes } from '@/src/components/AccountManager/types';
import { accountIconUrl } from '@/src/lib/account-icon-url';
import { fallbackCategoryColor } from '@/src/lib/category-colors';
import { filterCodeFirst, findExactCode } from './optionFilters';
import type { AccountOption, CategoryOption, TransactionType } from './types';

/**
 * 组件：交易分类或转入账户选择器
 * 功能：支出和收入时供用户选择分类，转账时选择转入账户。
 */
type TransactionDetailFieldProps = {
  type: TransactionType;
  accounts: AccountOption[];
  categories: CategoryOption[];
  sourceAccountId: string;
  categoryId: string;
  destinationAccountId: string;
  onCategoryChange: (categoryId: string) => void;
  onDestinationChange: (accountId: string) => void;
  fieldId?: string;
  disabled?: boolean;
};

// 转账时选择转入账户，收入或支出时选择对应分类。
export default function TransactionDetailField({
  type,
  accounts,
  categories,
  sourceAccountId,
  categoryId,
  destinationAccountId,
  onCategoryChange,
  onDestinationChange,
  fieldId,
  disabled,
}: TransactionDetailFieldProps) {
  // 当前交易是否为转账，决定显示转入账户还是分类。
  const isTransfer = type === 'transfer';
  // 当前输入控件使用的唯一 ID。
  const autocompleteId = fieldId ?? 'txn-detail';
  // 按上级分类整理分类数据，供下拉选项展示层级。
  const categoriesByParent = new Map<number | null, CategoryOption[]>();
  categories.forEach((category) => {
    const siblings = categoriesByParent.get(category.parentId) ?? [];
    siblings.push(category);
    categoriesByParent.set(category.parentId, siblings);
  });
  const sortCategories = (items: CategoryOption[]) => items.sort(
    (left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name),
  );
  // 按一级分类及其子分类的顺序排列选项。
  const orderedCategories = sortCategories(categoriesByParent.get(null) ?? []).flatMap((category) => [
    category,
    ...sortCategories(categoriesByParent.get(category.id) ?? []),
  ]);
  const orderedAccounts = accountTypes.flatMap((accountType) => (
    accounts.filter((account) => account.type === accountType.value)
  ));
  // 找到当前已选中的转入账户和分类。
  const selectedDestinationAccount = accounts.find(
    (account) => String(account.id) === destinationAccountId,
  ) ?? null;
  const selectedCategory = categories.find((category) => String(category.id) === categoryId) ?? null;
  // 两种交易详情搜索框各自保留输入文字，切换类型时不丢失搜索内容。
  const [inputValues, setInputValues] = useState({
    destination: selectedDestinationAccount?.name ?? '',
    category: selectedCategory?.name ?? '',
  });
  const { destination: destinationInputValue, category: categoryInputValue } = inputValues;
  // 一级分类颜色表，用于子分类图标颜色回退。
  const rootColors = new Map(
    categories
      .filter((category) => category.parentId === null)
      .map((category) => [category.id, category.color ?? fallbackCategoryColor(category.id)]),
  );

  return (
    <>
      {isTransfer ? (
        <>
          <input type="hidden" name="toAccountId" value={destinationAccountId} />
          <Autocomplete<AccountOption>
            key={fieldId ? `${fieldId}-transfer-destination` : 'transfer-destination-account'}
            id={autocompleteId}
            fullWidth
            size="small"
            disabled={accounts.length < 2}
            options={orderedAccounts}
            value={selectedDestinationAccount}
            inputValue={destinationInputValue}
            onChange={(_, account) => {
              setInputValues((current) => ({ ...current, destination: account?.name ?? '' }));
              onDestinationChange(account ? String(account.id) : '');
            }}
            onInputChange={(_, inputValue, reason) => {
              if (reason === 'input') {
                const exactMatch = findExactCode(orderedAccounts, inputValue);
                setInputValues((current) => ({ ...current, destination: exactMatch?.name ?? inputValue }));
                onDestinationChange(exactMatch ? String(exactMatch.id) : '');
              } else if (reason === 'clear') {
                setInputValues((current) => ({ ...current, destination: '' }));
                onDestinationChange('');
              }
            }}
            getOptionLabel={(account) => account.name}
            isOptionEqualToValue={(option, value) => option.id === value.id}
            getOptionDisabled={(account) => String(account.id) === sourceAccountId}
            groupBy={(account) => accountTypes.find((item) => item.value === account.type)?.label ?? '其他'}
            filterOptions={(options, state) => filterCodeFirst(options, state.inputValue)}
            noOptionsText="没有匹配的账户"
            renderGroup={({ key, group, children }) => (
              <li key={key}>
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    minHeight: 32,
                    px: 2,
                    color: 'text.secondary',
                    fontSize: '0.875rem',
                    '&::before, &::after': {
                      content: '""',
                      flex: 1,
                      borderTop: '0.5px solid',
                      borderColor: 'divider',
                    },
                  }}
                >
                  {group}
                </Box>
                <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>{children}</ul>
              </li>
            )}
            renderOption={(props, account) => {
              const { key, ...optionProps } = props;
              return (
              <Box key={key} component="li" {...optionProps} sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
                <Avatar
                  src={accountIconUrl(account.icon)}
                  alt={`${account.name}图标`}
                  variant="rounded"
                  sx={{ width: 24, height: 24, flexShrink: 0, fontSize: 12 }}
                >
                  {account.name.slice(0, 1).toUpperCase()}
                </Avatar>
                <Box component="span" sx={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {account.name}
                </Box>
                {account.code ? <Typography variant="caption" color="text.secondary">{account.code}</Typography> : null}
              </Box>
              );
            }}
            renderInput={(params) => (
              <TextField
                {...params}
                label="转入账户"
                placeholder="输入账户代码或名称"
                required
                slotProps={{
                  ...params.slotProps,
                  input: {
                    ...params.slotProps.input,
                    startAdornment: selectedDestinationAccount ? (
                      <>
                        <InputAdornment position="start" sx={{ mr: 0.5 }}>
                          <Avatar
                            src={accountIconUrl(selectedDestinationAccount.icon)}
                            alt={`${selectedDestinationAccount.name}图标`}
                            variant="rounded"
                            sx={{ width: 24, height: 24, fontSize: 12 }}
                          >
                            {selectedDestinationAccount.name.slice(0, 1).toUpperCase()}
                          </Avatar>
                        </InputAdornment>
                        {params.slotProps.input.startAdornment}
                      </>
                    ) : params.slotProps.input.startAdornment,
                  },
                }}
              />
            )}
          />
          {accounts.length < 2 ? (
            <FormHelperText id="txn-transfer-hint">转账需要两个可用账户</FormHelperText>
          ) : null}
        </>
      ) : (
        <>
          <input type="hidden" name="categoryId" value={categoryId} />
          <Autocomplete<CategoryOption>
            key={fieldId ? `${fieldId}-${type}-category` : 'transaction-category'}
            id={autocompleteId}
            fullWidth
            size="small"
            disabled={disabled ?? categories.length === 0}
            options={orderedCategories}
            value={selectedCategory}
            inputValue={categoryInputValue}
            onChange={(_, category) => {
              setInputValues((current) => ({ ...current, category: category?.name ?? '' }));
              onCategoryChange(category ? String(category.id) : '');
            }}
            onInputChange={(_, inputValue, reason) => {
              if (reason === 'input') {
                const exactMatch = findExactCode(orderedCategories, inputValue);
                setInputValues((current) => ({ ...current, category: exactMatch?.name ?? inputValue }));
                onCategoryChange(exactMatch ? String(exactMatch.id) : '');
              } else if (reason === 'clear') {
                setInputValues((current) => ({ ...current, category: '' }));
                onCategoryChange('');
              }
            }}
            getOptionLabel={(category) => category.name}
            isOptionEqualToValue={(option, value) => option.id === value.id}
            filterOptions={(options, state) => filterCodeFirst(options, state.inputValue)}
            noOptionsText="没有匹配的分类"
            renderOption={(props, category) => {
              const { key, ...optionProps } = props;
              return (
              <Box
                key={key}
                component="li"
                {...optionProps}
                sx={{ display: 'flex', alignItems: 'center', minWidth: 0 }}
              >
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    minWidth: 0,
                    flex: 1,
                    ml: category.parentId === null ? 0 : 2,
                  }}
                >
                  <Box
                    component="span"
                    aria-hidden="true"
                    sx={{
                      width: 4,
                      height: 20,
                      flexShrink: 0,
                      borderRadius: 1,
                      bgcolor: category.color ?? rootColors.get(category.parentId ?? category.id)
                        ?? fallbackCategoryColor(category.id),
                    }}
                  />
                  <CategoryIcon name={category.icon ?? 'Category'} color="action" fontSize="small" />
                  <Box component="span" sx={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {category.name}
                  </Box>
                  {category.code ? <Typography variant="caption" color="text.secondary">{category.code}</Typography> : null}
                </Box>
              </Box>
              );
            }}
            renderInput={(params) => (
              <TextField
                {...params}
                label="分类"
                placeholder={categories.length === 0 ? '请先创建对应类型的分类' : '输入分类代码或名称'}
                required
                slotProps={{
                  ...params.slotProps,
                  input: {
                    ...params.slotProps.input,
                    startAdornment: selectedCategory ? (
                      <InputAdornment position="start" sx={{ mr: 0.5, gap: 0.75 }}>
                        <Box
                          component="span"
                          aria-hidden="true"
                          sx={{
                            width: 4,
                            height: 20,
                            flexShrink: 0,
                            borderRadius: 1,
                            bgcolor: selectedCategory.color ?? rootColors.get(selectedCategory.parentId ?? selectedCategory.id)
                              ?? fallbackCategoryColor(selectedCategory.id),
                          }}
                        />
                        <CategoryIcon name={selectedCategory.icon ?? 'Category'} color="action" fontSize="small" />
                      </InputAdornment>
                    ) : params.slotProps.input.startAdornment,
                  },
                }}
              />
            )}
          />
        </>
      )}
    </>
  );
}