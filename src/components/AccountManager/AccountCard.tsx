import type { ReactNode } from 'react';
import Box from '@mui/material/Box';
import Avatar from '@mui/material/Avatar';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardActions from '@mui/material/CardActions';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Typography from '@mui/material/Typography';
import { setAccountArchivedAction } from '@/app/accounts/actions';
import { accountIconUrl } from '@/src/lib/account-icon-url';
import { formatMinorUnits } from '@/src/lib/money';
import type { AccountRecord } from './types';

type AccountCardProps = {
  account: AccountRecord;
  onEdit: () => void;
  dragHandle: ReactNode;
};

export default function AccountCard({ account, onEdit, dragHandle }: AccountCardProps) {
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
                <Typography variant="caption" color="text.secondary">当前余额</Typography>
                <Typography variant="h2" sx={{ fontVariantNumeric: 'tabular-nums', overflowWrap: 'anywhere' }}>
                  {account.currency} {formatMinorUnits(account.balance)}
                </Typography>
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