'use client';

import { createTheme } from '@mui/material/styles';

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#176B5B',
      dark: '#10483E',
      contrastText: '#FFFFFF',
    },
    secondary: {
      main: '#C86B4A',
      contrastText: '#FFFFFF',
    },
    background: {
      default: '#F4F5F1',
      paper: '#FFFFFF',
    },
    text: {
      primary: '#202A27',
      secondary: '#697570',
    },
    divider: '#E2E7E2',
  },
  shape: {
    borderRadius: 8,
  },
  typography: {
    fontFamily: '"Trebuchet MS", "Segoe UI", sans-serif',
    allVariants: {
      letterSpacing: 0,
    },
    h1: {
      fontFamily: 'Georgia, "Times New Roman", serif',
      fontSize: '2rem',
      fontWeight: 500,
      lineHeight: 1.2,
    },
    h2: {
      fontFamily: 'Georgia, "Times New Roman", serif',
      fontSize: '1.5rem',
      fontWeight: 500,
    },
    button: {
      textTransform: 'none',
      fontWeight: 600,
    },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        'html, body': {
          width: '100%',
          minHeight: '100%',
        },
        body: {
          WebkitFontSmoothing: 'antialiased',
          MozOsxFontSmoothing: 'grayscale',
        },
        a: {
          color: 'inherit',
          textDecoration: 'none',
        },
      },
    },
    MuiListItemButton: {
      styleOverrides: {
        root: ({ theme }) => ({
          minHeight: 46,
          borderRadius: 6,
          color: '#C2D0CA',
          transition: theme.transitions.create(['background-color', 'color'], {
            duration: theme.transitions.duration.shortest,
          }),
          '&:hover': {
            backgroundColor: 'rgb(255 255 255 / 8%)',
            color: '#FFFFFF',
          },
          '&.Mui-selected': {
            backgroundColor: '#E7EEE8',
            color: '#10483E',
            fontWeight: 600,
          },
          '&.Mui-selected:hover': {
            backgroundColor: '#E7EEE8',
          },
        }),
      },
    },
  },
});

export default theme;