import type { TransactionListItemData } from '@/src/components/TransactionListItem';

export type OcrBox = {
  text: string;
  confidence: number;
  box: [number, number, number, number];
};

export type OcrFields = {
  description: OcrBox[];
  amount: OcrBox[];
  date: OcrBox[];
  ignored: OcrBox[];
};

export type ImportDebug = {
  sequence: number;
  sourcePath: string;
  imageUrl: string;
  binaryPath: string;
  bounds: { left: number; top: number; width: number; height: number };
  avatarCropLeft: number;
  inverted: boolean;
  header: { text: string; year: number; month: number; sourcePath: string; boxes: OcrBox[] } | null;
  dayHeader?: { text: string; year: number; month: number; day: number; sourcePath: string; boxes: OcrBox[] } | null;
  primary: { boxes: OcrBox[]; fields: OcrFields };
  retries: {
    field: 'amount' | 'date';
    sourcePath: string;
    bounds: { left: number; top: number; width: number; height: number };
    boxes: OcrBox[];
    text: string;
    accepted: boolean;
  }[];
  errors: string[];
};

export type PreviewTransaction = Omit<TransactionListItemData, 'amount' | 'occurredAt' | 'type' | 'accountId'> & {
  sourceCard?: string | null;
  currencyMode?: 'account' | 'HKD';
  isRefund?: boolean;
  fullyRefunded?: boolean;
  syntheticRefund?: boolean;
  refundOfId?: number;
  manualReview?: { fields: boolean; category: boolean };
  amount: number | null;
  occurredAt: Date | null;
  type: 'expense' | 'income' | null;
  accountId: number | null;
  importDebug: ImportDebug;
  aiCategory?: AiCategoryFeedback;
};

export type AiCategoryFeedback = {
  status: 'success' | 'warning' | 'error';
  categoryId: number | null;
  confidence: number | null;
  explanation: string | null;
  errors: string[];
  rawResponse: unknown;
};

export type ImportTransaction = Omit<PreviewTransaction, 'occurredAt' | 'accountId'> & {
  occurredAt: string | null;
  accountId: null;
};

export type ImportResult = {
  source?: 'wechat' | 'alipay' | 'alipay-hk' | 'cmb' | 'hangseng' | 'hangseng-bank';
  screenshotDate?: string;
  batchId: string;
  transactions: ImportTransaction[];
  headers: { sequence: number; text: string; year: number | null; month: number | null; boxes: OcrBox[] }[];
};

export type ImportStage = 'health' | 'split' | 'preprocess' | 'ocr' | 'parse' | 'retry' | 'ai-category' | 'save';

export type ImportProgress = {
  stage: ImportStage;
  status: 'running' | 'complete';
  completed: number;
  total: number | null;
  message: string;
};

export type ImportStreamEvent =
  | { type: 'progress'; progress: ImportProgress }
  | { type: 'result'; result: ImportResult }
  | { type: 'error'; error: string };
