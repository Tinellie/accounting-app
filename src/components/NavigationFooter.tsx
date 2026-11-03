'use client';

import { useFormStatus } from 'react-dom';
import LogoutIcon from '@mui/icons-material/Logout';
import { Box, Button, Icon, IconButton, Tooltip } from '@mui/material';
import { usePathname } from 'next/navigation';
import { logoutAction } from '@/app/auth/actions';
import NextLink from '@/src/components/NextLink';

function LogoutButton() {
  const { pending } = useFormStatus();

  return (
    <Tooltip title="退出登录">
      <span>
        <IconButton
          type="submit"
          aria-label="退出登录"
          disabled={pending}
          loading={pending}
          sx={{
            width: 40,
            height: 40,
            borderRadius: 1,
            border: '1px solid rgb(255 255 255 / 24%)',
            color: 'inherit',
            '&.Mui-disabled': { color: '#93AAA1' },
          }}
        >
          <LogoutIcon fontSize="small" />
        </IconButton>
      </span>
    </Tooltip>
  );
}

export default function NavigationFooter() {
  const pathname = usePathname();

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 1,
        mt: { xs: 1.5, md: 'auto' },
        px: { xs: 0, md: 1.5 },
        pt: { xs: 1.5, md: 2.25 },
        borderTop: '1px solid rgb(255 255 255 / 14%)',
      }}
    >
      <Button
        component={NextLink}
        href="/profile"
        startIcon={<Icon aria-hidden="true">person_outline</Icon>}
        aria-current={pathname === '/profile' ? 'page' : undefined}
        sx={{ color: pathname === '/profile' ? '#E9B28D' : '#B6C7C0' }}
      >
        个人主页
      </Button>
      <Box component="form" action={logoutAction}>
        <LogoutButton />
      </Box>
    </Box>
  );
}
