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
  amount: number | null;
  occurredAt: Date | null;
  type: 'expense' | 'income' | null;
  accountId: null;
  importDebug: ImportDebug;
};

export type ImportTransaction = Omit<PreviewTransaction, 'occurredAt'> & {
  occurredAt: string | null;
};

export type ImportResult = {
  batchId: string;
  transactions: ImportTransaction[];
  headers: { sequence: number; text: string; year: number | null; month: number | null; boxes: OcrBox[] }[];
};

export type ImportStage = 'health' | 'split' | 'preprocess' | 'ocr' | 'parse' | 'retry' | 'save';

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
