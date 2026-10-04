import type { Metadata } from "next";
import type { ReactNode } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { AppRouterCacheProvider } from "@mui/material-nextjs/v16-appRouter";
import CssBaseline from "@mui/material/CssBaseline";
import { ThemeProvider } from "@mui/material/styles";
import AppNavigation from "@/src/components/AppNavigation";
import NextLink from "@/src/components/NextLink";
import theme from "@/src/theme/theme";

export const metadata: Metadata = {
  title: "个人账本",
  description: "个人收支与账户管理",
};

type RootLayoutProps = {
  children: ReactNode;
};

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="zh-CN">
      <body>
        <AppRouterCacheProvider>
          <ThemeProvider theme={theme}>
            <CssBaseline />
            <Box sx={{ display: 'flex', minHeight: '100vh', flexDirection: { xs: 'column', md: 'row' }, bgcolor: 'background.default' }}>
              <Box
                component="aside"
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  position: { xs: 'static', md: 'sticky' },
                  top: 0,
                  alignSelf: 'flex-start',
                  flex: { xs: '0 0 auto', md: '0 0 256px' },
                  width: { xs: '100%', md: 256 },
                  minHeight: { xs: 'auto', md: '100vh' },
                  px: { xs: 2, md: 2.25 },
                  py: { xs: 1.75, md: 3.75 },
                  bgcolor: '#173B34',
                  color: '#F4F5F1',
                }}
              >
                <Box
                  component={NextLink}
                  href="/"
                  aria-label="个人账本首页"
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.5,
                    px: { xs: 0.25, md: 1.25 },
                    pb: { xs: 1.75, md: 4.75 },
                    color: 'inherit',
                  }}
                >
                  <Box
                    aria-hidden="true"
                    sx={{
                      display: 'grid',
                      width: { xs: 36, md: 42 },
                      height: { xs: 36, md: 42 },
                      flex: '0 0 auto',
                      placeItems: 'center',
                      border: '1px solid rgb(255 255 255 / 28%)',
                      borderRadius: '12px 12px 12px 3px',
                      color: '#E9B28D',
                      fontFamily: 'Georgia, "Times New Roman", serif',
                      fontSize: 21,
                    }}
                  >
                    账
                  </Box>
                  <Box>
                    <Typography component="strong" sx={{ display: 'block', fontSize: 16, fontWeight: 600 }}>
                      个人账本
                    </Typography>
                    <Typography component="span" sx={{ display: { xs: 'none', md: 'block' }, color: '#A9BEB7', fontSize: 9 }}>
                      FINANCE DESK
                    </Typography>
                  </Box>
                </Box>
                <AppNavigation />
                <Box
                  sx={{
                    display: { xs: 'none', md: 'flex' },
                    alignItems: 'center',
                    gap: 1.125,
                    mt: 'auto',
                    px: 1.5,
                    pt: 2.25,
                    borderTop: '1px solid rgb(255 255 255 / 14%)',
                  }}
                >
                  <Box aria-hidden="true" sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: '#E9B28D' }} />
                  <Typography variant="caption" sx={{ color: '#B6C7C0' }}>本地账本</Typography>
                </Box>
              </Box>
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Box
                  component="header"
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    minHeight: { xs: 48, md: 64 },
                    px: { xs: 2.5, md: 5.5 },
                    borderBottom: 1,
                    borderColor: 'divider',
                    bgcolor: 'rgba(255, 255, 255, 0.72)',
                  }}
                >
                  <Typography variant="body2" color="text.secondary">个人财务</Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: { xs: 'none', md: 'block' } }}>
                    ACCOUNTING / PERSONAL
                  </Typography>
                </Box>
                <Box component="main" sx={{ width: '100%', maxWidth: 1200, mx: 'auto', px: { xs: 2.5, md: 5.5 }, py: { xs: 4, md: 6 } }}>
                  {children}
                </Box>
              </Box>
            </Box>
          </ThemeProvider>
        </AppRouterCacheProvider>
      </body>
    </html>
  );
}
