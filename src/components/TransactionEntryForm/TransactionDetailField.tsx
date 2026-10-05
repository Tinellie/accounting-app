import FormControl from '@mui/material/FormControl';
import FormHelperText from '@mui/material/FormHelperText';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Box from '@mui/material/Box';
import CategoryIcon from '@/src/components/CategoryIcon';
import { accountTypes } from '@/src/components/AccountManager/types';
import { fallbackCategoryColor } from '@/src/lib/category-colors';
import type { AccountOption, CategoryOption, TransactionType } from './types';

type TransactionDetailFieldProps = {
  type: TransactionType;
  accounts: AccountOption[];
  categories: CategoryOption[];
  sourceAccountId: string;
  categoryId: string;
  destinationAccountId: string;
  onCategoryChange: (categoryId: string) => void;
  onDestinationChange: (accountId: string) => void;
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
}: TransactionDetailFieldProps) {
  const isTransfer = type === 'transfer';
  const label = isTransfer ? '转入账户' : '分类';
  const categoriesByParent = new Map<number | null, CategoryOption[]>();
  categories.forEach((category) => {
    const siblings = categoriesByParent.get(category.parentId) ?? [];
    siblings.push(category);
    categoriesByParent.set(category.parentId, siblings);
  });
  const sortCategories = (items: CategoryOption[]) => items.sort(
    (left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name),
  );
  const orderedCategories = sortCategories(categoriesByParent.get(null) ?? []).flatMap((category) => [
    category,
    ...sortCategories(categoriesByParent.get(category.id) ?? []),
  ]);
  const rootColors = new Map(
    categories
      .filter((category) => category.parentId === null)
      .map((category) => [category.id, category.color ?? fallbackCategoryColor(category.id)]),
  );

  return (
    <FormControl
      id="txn-detail-field"
      fullWidth
      size="small"
      required
      disabled={isTransfer ? accounts.length < 2 : categories.length === 0}
    >
      <InputLabel id="txn-detail-label">{label}</InputLabel>
      <Select
        id="txn-detail"
        labelId="txn-detail-label"
        name={isTransfer ? 'toAccountId' : 'categoryId'}
        label={label}
        value={isTransfer ? destinationAccountId : categoryId}
        onChange={(event) => {
          const value = String(event.target.value);
          if (isTransfer) onDestinationChange(value);
          else onCategoryChange(value);
        }}
      >
        <MenuItem className="txn-detail-option" value=""><em>请选择{label}</em></MenuItem>
        {isTransfer
          ? accountTypes.flatMap((accountType) => {
              const groupedAccounts = accounts.filter((account) => account.type === accountType.value);
              if (groupedAccounts.length === 0) return [];

              return [
                <MenuItem
                  key={`${accountType.value}-heading`}
                  value={`group-${accountType.value}`}
                  disabled
                  sx={{
                    minHeight: 32,
                    py: 0.25,
                    gap: 1,
                    color: 'text.secondary',
                    fontWeight: 400,
                    '&.Mui-disabled': { opacity: 1, color: 'text.secondary' },
                    '&::before, &::after': {
                      content: '""',
                      flex: 1,
                      borderTop: 1,
                      borderColor: 'divider',
                    },
                  }}
                >
                  {accountType.label}
                </MenuItem>,
                ...groupedAccounts.map((account) => (
                  <MenuItem
                    className="txn-detail-option"
                    key={account.id}
                    value={account.id}
                    disabled={String(account.id) === sourceAccountId}
                  >
                    {account.name}
                  </MenuItem>
                )),
              ];
            })
          : orderedCategories.map((category) => (
              <MenuItem
                className="txn-detail-option"
                key={category.id}
                value={category.id}
                sx={{ pl: category.parentId === null ? 2 : 4 }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', minWidth: 0, gap: 1 }}>
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
                  <Box component="span" sx={{ overflowWrap: 'anywhere' }}>{category.name}</Box>
                </Box>
              </MenuItem>
            ))}
      </Select>

      {isTransfer && accounts.length < 2 ? (
        <FormHelperText id="txn-transfer-hint">转账需要两个可用账户</FormHelperText>
      ) : null}
      {!isTransfer && categories.length === 0 ? (
        <FormHelperText id="txn-category-hint">请先创建对应类型的分类</FormHelperText>
      ) : null}
    </FormControl>
  );
}