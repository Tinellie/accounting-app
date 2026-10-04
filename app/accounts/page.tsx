import { asc } from "drizzle-orm";
import Stack from "@mui/material/Stack";
import AccountManager from "@/src/components/AccountManager";
import PageHeading from "@/src/components/PageHeading";
import { db } from "@/src/db";
import { accounts } from "@/src/db/schema";
import { listAccountIcons } from "@/src/lib/account-icons";

export default async function AccountsPage() {
  const accountRows = db
    .select({
      id: accounts.id,
      name: accounts.name,
      icon: accounts.icon,
      type: accounts.type,
      balance: accounts.balance,
      currency: accounts.currency,
      isArchived: accounts.isArchived,
      sortOrder: accounts.sortOrder,
    })
    .from(accounts)
    .orderBy(asc(accounts.isArchived), asc(accounts.sortOrder), asc(accounts.name))
    .all();
  const availableIcons = await listAccountIcons();

  return (
    <Stack component="section" spacing={0}>
      <PageHeading eyebrow="ACCOUNTS" title="账户管理" description="管理现金、银行卡及其他账户" />
      <Stack sx={{ pt: 3.75 }}>
        <AccountManager accounts={accountRows} icons={availableIcons} />
      </Stack>
    </Stack>
  );
}