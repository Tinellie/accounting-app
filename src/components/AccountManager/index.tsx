'use client';

import { useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import AccountForm from './AccountForm';
import AccountList from './AccountList';
import type { AccountManagerProps, AccountRecord } from './types';

export default function AccountManager({ accounts, icons }: AccountManagerProps) {
  const [editingAccount, setEditingAccount] = useState<AccountRecord | null | undefined>(undefined);
  const closeDialog = () => setEditingAccount(undefined);

  return (
    <Stack id="account-manager" spacing={3}>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button id="account-add" variant="contained" onClick={() => setEditingAccount(null)}>
          添加账户
        </Button>
      </Box>

      <AccountList accounts={accounts} onEdit={setEditingAccount} />

      <Dialog open={editingAccount !== undefined} onClose={closeDialog} fullWidth maxWidth="sm">
        <DialogTitle>{editingAccount ? '编辑账户' : '添加账户'}</DialogTitle>
        <DialogContent>
          {editingAccount !== undefined ? (
            <AccountForm
              key={editingAccount?.id ?? 'new-account'}
              account={editingAccount}
              icons={icons}
              onCancel={closeDialog}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </Stack>
  );
}