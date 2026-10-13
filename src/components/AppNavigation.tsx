'use client';

import { usePathname } from 'next/navigation';
import { List, ListItemButton, ListItemText, Typography } from '@mui/material';

import NextLink from '@/src/components/NextLink';

/**
 * 组件：应用主导航
 * 功能：提供首页、交易明细、账户管理和分类管理之间的导航入口。
 */
const navigationItems = [
  { href: '/', label: '首页看板', number: '01' },
  { href: '/transactions', label: '交易明细', number: '02' },
  { href: '/accounts', label: '账户管理', number: '03' },
  { href: '/categories', label: '分类与标签', number: '04' },
];

export default function AppNavigation() {
  // 当前访问路径，用来标记对应的导航项目。
  const pathname = usePathname();

  return (
    <List
      component="nav"
      id="app-nav"
      aria-label="主导航"
      disablePadding
      sx={{
        display: 'grid',
        gap: 0.75,
        gridTemplateColumns: { xs: 'repeat(4, max-content)', md: '1fr' },
        overflowX: { xs: 'auto', md: 'visible' },
        pb: { xs: 0.25, md: 0 },
      }}
    >
      {navigationItems.map((item) => {
        const isActive = pathname === item.href;

        return (
          <ListItemButton
            key={item.href}
            component={NextLink}
            href={item.href}
            className="nav-link"
            selected={isActive}
            aria-current={isActive ? 'page' : undefined}
            sx={{
              minHeight: { xs: 40, md: 46 },
              gap: { xs: 0.75, md: 1.625 },
              px: { xs: 1.25, md: 1.5 },
              whiteSpace: 'nowrap',
            }}
          >
            <Typography
              component="span"
              sx={{
                color: isActive ? 'secondary.main' : '#93AAA1',
                fontSize: 10,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {item.number}
            </Typography>
            <ListItemText
              primary={item.label}
              slotProps={{ primary: { sx: { fontSize: { xs: 12, md: 14 } } } }}
              sx={{ my: 0 }}
            />
          </ListItemButton>
        );
      })}
    </List>
  );
}