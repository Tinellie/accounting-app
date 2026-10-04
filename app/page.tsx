import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import PageHeading from "@/src/components/PageHeading";

export default function Home() {
  return (
    <Stack component="section" spacing={0}>
      <PageHeading eyebrow="OVERVIEW" title="首页看板" description="账户与收支概况" />
      <Box sx={{ py: 3.75 }}>
        <Typography variant="body2" color="text.secondary">暂无交易记录</Typography>
      </Box>
    </Stack>
  );
}
