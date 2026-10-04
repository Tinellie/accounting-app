import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { categoryColorPalette } from '@/src/lib/category-colors';

type CategoryColorPickerProps = {
  color: string | null;
  hasParent: boolean;
  parentColor: string | null;
  onChange: (color: string | null) => void;
};

export default function CategoryColorPicker({ color, hasParent, parentColor, onChange }: CategoryColorPickerProps) {
  return (
    <Stack spacing={1}>
      <Typography variant="body2" sx={{ fontWeight: 600 }}>分类颜色</Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
        <Button
          type="button"
          size="small"
          variant={color === null ? 'contained' : 'outlined'}
          onClick={() => onChange(null)}
          sx={{ minHeight: 36, px: 1.25 }}
        >
          {hasParent ? '跟随一级分类' : '自动分配'}
        </Button>
        {categoryColorPalette.map((swatch) => (
          <Tooltip key={swatch} title={swatch}>
            <Button
              type="button"
              aria-label={`选择颜色 ${swatch}`}
              aria-pressed={color?.toUpperCase() === swatch}
              onClick={() => onChange(swatch)}
              sx={{
                width: 34,
                minWidth: 34,
                height: 34,
                p: 0,
                bgcolor: swatch,
                border: color?.toUpperCase() === swatch ? '3px solid' : '1px solid',
                borderColor: color?.toUpperCase() === swatch ? 'text.primary' : 'divider',
                '&:hover': { bgcolor: swatch, filter: 'brightness(0.9)' },
              }}
            />
          </Tooltip>
        ))}
        <TextField
          id="category-custom-color"
          label="自定义"
          type="color"
          value={color ?? categoryColorPalette[0]}
          onChange={(event) => onChange(event.target.value.toUpperCase())}
          size="small"
          sx={{ width: 112 }}
          slotProps={{
            inputLabel: { shrink: true },
            htmlInput: { 'aria-label': '选择自定义分类颜色' },
          }}
        />
      </Box>
      <Typography variant="caption" color="text.secondary">
        {color
          ? `已选择 ${color.toUpperCase()}`
          : hasParent
            ? `不指定时使用一级分类颜色${parentColor ? ` ${parentColor}` : ''}`
            : '未手动选择时，将自动分配适合图表展示的颜色'}
      </Typography>
    </Stack>
  );
}