import { z } from 'zod';

export const transactionDataSchema = z.record(z.string(), z.json());
export type TransactionData = z.infer<typeof transactionDataSchema>;
