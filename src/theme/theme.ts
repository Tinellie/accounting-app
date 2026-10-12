'use client';

import { createTheme } from '@mui/material/styles';

type TransactionColorSet = {
  main: string;
  dark: string;
  light: string;
};

const transactionColors = {
  expense: { main: '#D32F2F', dark: '#C62828', light: '#F7ECEE' },
  income: { main: '#2E7D32', dark: '#1B5E20', light: '#E7EEE8' },
  transfer: { main: '#0288D1', dark: '#0277BD', light: '#E5F3FA' },
} as const;

declare module '@mui/material/styles' {
  interface Palette {
    transaction: {
      expense: TransactionColorSet;
      income: TransactionColorSet;
      transfer: TransactionColorSet;
    };
  }

  interface PaletteOptions {
    transaction?: {
      expense: TransactionColorSet;
      income: TransactionColorSet;
      transfer: TransactionColorSet;
    };
  }
}

const theme = createTheme({
  palette: {
    mode: 'light',
    error: { main: transactionColors.expense.main },
    success: { main: transactionColors.income.main },
    info: { main: transactionColors.transfer.main },
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
    transaction: transactionColors,
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