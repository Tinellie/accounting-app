'use client';

import { useState } from 'react';
import { Avatar, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Radio, RadioGroup, Stack, Typography } from '@mui/material';
import { accountIconUrl } from '@/src/lib/account-icon-url';

/**
 * 组件：账户图标选择器
 * 功能：展示当前账户图标，并让用户从预置图标中挑选一个。
 */
type AccountIconPickerProps = {
  icons: string[];
  value: string;
  onChange: (icon: string) => void;
};

export default function AccountIconPicker({ icons, value, onChange }: AccountIconPickerProps) {
  // 控制预置账户图标选择窗口的开关。
  const [isOpen, setIsOpen] = useState(false);

  function selectIcon(icon: string) {
    onChange(icon);
    setIsOpen(false);
  }

  return (
    <>
      <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
        <Avatar src={accountIconUrl(value || null)} alt="当前账户图标" variant="rounded" />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="body2">账户图标</Typography>
          <Typography variant="caption" color="text.secondary">
            {!value ? '未选择' : value.startsWith('preset:') ? '已选择预置图标' : '当前上传图标'}
          </Typography>
        </Box>
        <Button type="button" variant="outlined" onClick={() => setIsOpen(true)}>
          选择图标
        </Button>
      </Stack>

      <Dialog open={isOpen} onClose={() => setIsOpen(false)} fullWidth maxWidth="sm" scroll="paper">
        <DialogTitle>选择预置图标</DialogTitle>
        <DialogContent dividers sx={{ maxHeight: 'min(60vh, 480px)', overflowY: 'auto' }}>
          <RadioGroup
            aria-label="预置账户图标"
            value={value}
            sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(3, minmax(0, 1fr))', sm: 'repeat(4, minmax(0, 1fr))' }, gap: 1 }}
          >
            <FormControlLabel
              value=""
              control={<Radio size="small" />}
              onChange={() => selectIcon('')}
              label={
                <Stack spacing={0.5} sx={{ alignItems: 'center' }}>
                  <Avatar variant="rounded" sx={{ width: 48, height: 48 }}>无</Avatar>
                  <Typography variant="caption">无图标</Typography>
                </Stack>
              }
              sx={{ m: 0, p: 1, border: 1, borderColor: value === '' ? 'primary.main' : 'divider', borderRadius: 1 }}
            />
            {icons.map((icon) => {
              const filename = icon.slice(icon.indexOf(':') + 1);

              return (
                <FormControlLabel
                  key={icon}
                  value={icon}
                  control={<Radio size="small" />}
                  onChange={() => selectIcon(icon)}
                  label={
                    <Stack spacing={0.5} sx={{ alignItems: 'center' }}>
                      <Avatar
                        src={accountIconUrl(icon)}
                        alt={filename}
                        variant="rounded"
                        sx={{ width: 48, height: 48 }}
                      />
                      <Typography variant="caption">{filename}</Typography>
                    </Stack>
                  }
                  sx={{ m: 0, p: 1, border: 1, borderColor: value === icon ? 'primary.main' : 'divider', borderRadius: 1 }}
                />
              );
            })}
          </RadioGroup>
          {icons.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
              预置图标目录中没有可选图片
            </Typography>
          ) : null}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIsOpen(false)}>关闭</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}