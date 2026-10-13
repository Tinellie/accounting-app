import Stack from "@mui/material/Stack";
import PageHeading from "@/src/components/PageHeading";
import DashboardChartArea from "@/src/components/DashboardChartArea";

/**
 * 组件：个人账本首页
 * 功能：作为账本概况入口，展示账户与收支概况提示。
 */
export default function Home() {
  return (
    <Stack component="section" spacing={0}>
      <PageHeading eyebrow="OVERVIEW" title="首页看板" description="账户与收支概况" />
      <DashboardChartArea />
    </Stack>
  );
}
