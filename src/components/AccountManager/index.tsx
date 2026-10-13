'use client';

import { useState } from 'react';
import { Box, Button, Dialog, DialogContent, DialogTitle, Stack } from '@mui/material';
import AccountForm from './AccountForm';
import AccountList from './AccountList';
import type { AccountManagerProps, AccountRecord } from './types';

/**
 * 组件：账户管理
 * 功能：汇总展示账户，并提供新增和编辑入口。
 * 用户可以维护账户资料、查看余额并整理账户列表。
 */
export default function AccountManager({ accounts, icons }: AccountManagerProps) {
  // undefined 表示关闭窗口，null 表示新增，有值表示编辑该账户。
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