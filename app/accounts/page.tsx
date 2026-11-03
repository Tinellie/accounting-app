import { asc } from "drizzle-orm";
import Stack from "@mui/material/Stack";
import AccountManager from "@/src/components/AccountManager";
import PageHeading from "@/src/components/PageHeading";
import { getUserDb } from "@/src/db/user";
import { accounts } from "@/src/db/schema";
import { listAccountIcons } from "@/src/lib/account-icons";

/**
 * 组件：账户管理页面
 * 功能：展示账户管理工具，供用户新增、编辑和整理账户。
 */
export default async function AccountsPage() {
  const db = await getUserDb();
  // 读取账户管理页需要展示的账户资料，并按归档状态、类型和顺序排列。
  const accountRows = db
    .select({
      id: accounts.id,
      code: accounts.code,
      name: accounts.name,
      icon: accounts.icon,
      type: accounts.type,
      balance: accounts.balance,
      currency: accounts.currency,
      isArchived: accounts.isArchived,
      sortOrder: accounts.sortOrder,
    })
    .from(accounts)
    .orderBy(asc(accounts.isArchived), asc(accounts.type), asc(accounts.sortOrder), asc(accounts.name))
    .all();
  // 读取供账户表单选择的预置图标。
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