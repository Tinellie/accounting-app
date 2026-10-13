import type { ReactNode } from 'react';
import { Avatar, Box, Button, Card, CardActions, CardContent, Chip, Typography } from '@mui/material';
import { setAccountArchivedAction } from '@/app/accounts/actions';
import { accountIconUrl } from '@/src/lib/account-icon-url';
import { formatMinorUnits } from '@/src/lib/money';
import type { AccountRecord } from './types';

/**
 * 组件：账户卡片
 * 功能：展示账户名称、类型、余额和归档状态，帮助用户查看账户情况。
 * 用户可以从卡片进入编辑，也可以归档不再使用的账户。
 */
type AccountCardProps = {
  account: AccountRecord;
  onEdit: () => void;
  dragHandle: ReactNode;
};

export default function AccountCard({ account, onEdit, dragHandle }: AccountCardProps) {
  // 根据余额正负选择账户金额的提示颜色。
  const balanceColor = account.balance > 0
    ? 'success.main'
    : account.balance < 0
      ? 'error.main'
      : 'text.secondary';

  return (
    <Card
      id={`account-${account.id}`}
      className="account-card"
      component="article"
      variant="outlined"
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'minmax(0, 1fr) auto' },
        alignItems: 'center',
        borderColor: 'divider',
      }}
    >
      <CardContent sx={{ minWidth: 0, p: 0, '&:last-child': { pb: 0 } }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: '24px minmax(0, 1fr)', alignItems: 'center' }}>
          <Box sx={{ display: 'flex', justifyContent: 'center' }}>{dragHandle}</Box>
          <Box sx={{ minWidth: 0, p: 2.5, pl: 2 }}>
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'minmax(0, 1fr) minmax(180px, auto)' },
                alignItems: 'center',
                gap: { xs: 1, sm: 3 },
              }}
            >
              <Box sx={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Avatar
                  src={accountIconUrl(account.icon)}
                  alt={`${account.name}图标`}
                  variant="rounded"
                  sx={{ width: 48, height: 48, flexShrink: 0 }}
                >
                  {account.name.slice(0, 1).toUpperCase()}
                </Avatar>
                <Box sx={{ minWidth: 0, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
                  <Typography variant="h2" sx={{ overflowWrap: 'anywhere' }}>{account.name}</Typography>
                  <Chip label={account.code ?? `account-${account.id}`} size="small" variant="outlined" />
                  {account.isArchived ? <Chip label="已归档" size="small" color="default" /> : null}
                </Box>
              </Box>

              <Box>
                <Box
                  sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-end',
                    justifyContent: 'center',
                    gap: 0,
                    minWidth: 0,
                    maxWidth: '100%',
                    pl: { xs: 0, sm: 2 },
                    borderLeft: { xs: 0, sm: 1 },
                    borderColor: 'divider',
                    color: balanceColor,
                    textAlign: 'right',
                  }}
                >
                  <Typography component="span" variant="caption" sx={{ 
                    color: 'inherit', 
                    fontSize: '0.875rem', 
                    fontWeight: 600, 
                    lineHeight: 1, 
                    opacity: 0.72, 
                    fontVariantNumeric: 'tabular-nums' 
                    }}>
                    {account.currency}
                  </Typography>
                  <Typography
                    component="span"
                    variant="h2"
                    sx={{ 
                      fontFamily: '"Segoe UI", sans-serif', 
                      fontSize: '2.125rem', 
                      fontWeight: 500, 
                      lineHeight: 1, 
                      color: 'inherit', 
                      fontVariantNumeric: 'tabular-nums', 
                      overflowWrap: 'anywhere' 
                    }}
                  >
                    {formatMinorUnits(account.balance)}
                  </Typography>
                </Box>
              </Box>
            </Box>
          </Box>
        </Box>
      </CardContent>

      <CardActions
        sx={{
          gridColumn: { xs: 1, sm: 2 },
          gridRow: { xs: 2, sm: 1 },
          justifySelf: 'end',
          flexWrap: 'nowrap',
          px: 2,
          py: 1.5,
        }}
      >
        <Button size="small" onClick={onEdit}>编辑</Button>
        <form action={setAccountArchivedAction}>
          <input type="hidden" name="id" value={account.id} />
          <input type="hidden" name="isArchived" value={String(!account.isArchived)} />
          <Button size="small" type="submit">
            {account.isArchived ? '恢复' : '归档'}
          </Button>
        </form>
      </CardActions>
    </Card>
  );
}