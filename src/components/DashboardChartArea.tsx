import { Box, Paper, Stack, Typography } from '@mui/material';
import type { ReactNode } from 'react';

/**
 * 组件：看板图表区域
 * 功能：集中展示首页的收支图表；没有图表时显示空状态。
 */
type DashboardChartAreaProps = {
  children?: ReactNode;
};

export type DashboardChartColumns = 'auto' | 3 | 4 | 6 | 8 | 9 | 12;

/**
 * 组件：看板图表插槽
 * 功能：承载一种具体图表，并提供标题、列宽和最小高度设置。
 */
type DashboardChartSlotProps = {
  title?: string;
  columns?: DashboardChartColumns;
  minHeight?: number | string;
  children: ReactNode;
};

export function DashboardChartSlot({
  title,
  columns = 'auto',
  minHeight = 220,
  children,
}: DashboardChartSlotProps) {
  const desktopColumnSpan = columns === 'auto' ? 'span 4' : `span ${columns}`;

  return (
    <Paper
      component="article"
      aria-label={title ?? '收支图表'}
      variant="outlined"
      sx={{
        gridColumn: { xs: '1 / -1', sm: 'span 6', md: desktopColumnSpan },
        minWidth: 0,
        minHeight,
        p: 2,
        borderColor: 'divider',
      }}
    >
      <Stack spacing={1.5} sx={{ height: '100%' }}>
        {title ? (
          <Typography component="h3" variant="subtitle1" sx={{ fontWeight: 600 }}>
            {title}
          </Typography>
        ) : null}
        {children}
      </Stack>
    </Paper>
  );
}

export default function DashboardChartArea({ children }: DashboardChartAreaProps) {
  return (
    <Box component="section" aria-labelledby="dashboard-chart-area-title" sx={{ py: 3.75 }}>
      <Stack spacing={1.5}>
        <Typography id="dashboard-chart-area-title" component="h2" variant="h2">
          收支图表
        </Typography>
        {children ? (
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: 'repeat(12, minmax(0, 1fr))',
              gap: 2,
            }}
          >
            {children}
          </Box>
        ) : (
          <Typography color="text.secondary" sx={{ py: 1.5 }}>
            暂无可展示的图表
          </Typography>
        )}
      </Stack>
    </Box>
  );
}