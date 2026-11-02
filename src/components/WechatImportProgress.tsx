import { Box, CircularProgress, LinearProgress, Stack, Typography } from '@mui/material';
import { CheckCircleOutlined as CheckCircleOutlineIcon, ErrorOutlined as ErrorOutlineIcon } from '@mui/icons-material';
import type { ImportProgress, ImportStage } from '@/src/lib/wechat-import/types';

const stages: { stage: ImportStage; label: string }[] = [
  { stage: 'health', label: '检查 OCR 服务' },
  { stage: 'split', label: '截图切分' },
  { stage: 'preprocess', label: '图片预处理' },
  { stage: 'ocr', label: '首次 OCR 识别' },
  { stage: 'parse', label: '交易数据整理' },
  { stage: 'retry', label: '失败字段灰度重试' },
  { stage: 'ai-category', label: 'DeepSeek AI 自动分类' },
  { stage: 'save', label: '生成预览' },
];

export default function WechatImportProgress({ progress, pending, failed, pdf = false, pdfOcr = false }: {
  progress: Partial<Record<ImportStage, ImportProgress>>;
  pending: boolean;
  failed: boolean;
  pdf?: boolean;
  pdfOcr?: boolean;
}) {
  return (
    <Stack component="section" aria-label={pdf ? 'PDF 导入进度' : '截图导入进度'} spacing={1.5} sx={{ p: 2, border: 1, borderColor: 'divider', borderRadius: 1 }}>
      <Typography variant="subtitle2">处理步骤进度</Typography>
      <Typography variant="caption" color="text.secondary" aria-live="polite">
        {failed ? '处理已停止，请查看下方错误信息。' : pending
          ? pdf ? '正在逐页读取 PDF 并整理交易，可随时取消。'
            : Object.keys(progress).length ? '实时接收服务端进度；预处理与 OCR 可同时进行，可随时取消。' : '正在上传图片，等待服务端开始处理。'
          : '处理完成，请对照原图检查识别结果。'}
      </Typography>
      {stages.filter(({ stage }) => !pdf || ['split', 'parse', 'ai-category', 'save', ...(pdfOcr ? ['ocr'] : [])].includes(stage)).map(({ stage, label: originalLabel }) => {
        const label = pdf && stage === 'split' ? 'PDF 分页与文字提取'
          : pdfOcr && stage === 'ocr' ? '中文描述本地 OCR' : originalLabel;
        const current = progress[stage];
        const complete = current?.status === 'complete';
        const active = current?.status === 'running';
        const total = current?.total ?? 0;
        const hasTotal = total > 0;
        return (
          <Box key={stage}>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
              {complete ? <CheckCircleOutlineIcon color="success" fontSize="small" />
                : active && pending ? <CircularProgress size={18} />
                  : active && failed ? <ErrorOutlineIcon color="error" fontSize="small" />
                    : <Box sx={{ width: 18, height: 18, border: 1, borderColor: 'divider', borderRadius: '50%' }} />}
              <Typography variant="body2" sx={{ flex: 1 }}>{label}</Typography>
              <Typography variant="caption" color={active && failed ? 'error' : 'text.secondary'}>
                {complete ? '已完成' : active ? failed ? '已停止' : '处理中' : '等待中'}
                {current && hasTotal ? ` · ${current.completed} / ${current.total}` : current && current.completed > 0 ? ` · 已完成 ${current.completed} 项` : ''}
              </Typography>
            </Stack>
            {active && hasTotal ? (
              <LinearProgress
                aria-label={`${label}进度`}
                variant="determinate"
                value={Math.min(100, current.completed / total * 100)}
                color={failed ? 'error' : 'primary'}
                sx={{ mt: 0.75, ml: 3.25 }}
              />
            ) : null}
            {current ? <Typography variant="caption" color="text.secondary" sx={{ display: 'block', ml: 3.25, mt: 0.5 }}>{current.message}</Typography> : null}
          </Box>
        );
      })}
    </Stack>
  );
}
