import { Box, Button, Stack, Tooltip, Typography } from '@mui/material';
import PaletteIcon from '@mui/icons-material/Palette';
import { categoryColorPalette } from '@/src/lib/category-colors';

/**
 * 组件：分类颜色选择器
 * 功能：让用户为分类选择颜色，或使用自动分配/跟随上级分类的颜色。
 */
type CategoryColorPickerProps = {
  color: string | null;
  hasParent: boolean;
  parentColor: string | null;
  onChange: (color: string | null) => void;
};

export default function CategoryColorPicker({ color, hasParent, parentColor, onChange }: CategoryColorPickerProps) {
  return (
    <Stack spacing={0.75}>
      <Typography variant="body2" sx={{ fontWeight: 600 }}>分类颜色</Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 0.5 }}>
        <Button
          type="button"
          size="small"
          variant={color === null ? 'contained' : 'outlined'}
          onClick={() => onChange(null)}
          sx={{ height: 26, minHeight: 26, py: 0, px: 0.75, fontSize: 12, whiteSpace: 'nowrap' }}
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
                width: 26,
                minWidth: 26,
                height: 26,
                p: 0,
                bgcolor: swatch,
                border: color?.toUpperCase() === swatch ? '3px solid' : '1px solid',
                borderColor: color?.toUpperCase() === swatch ? 'text.primary' : 'divider',
                '&:hover': { bgcolor: swatch, filter: 'brightness(0.9)' },
              }}
            />
          </Tooltip>
        ))}
        <Tooltip title="自定义颜色">
          <Box
            component="label"
            aria-label="选择自定义分类颜色"
            sx={{
              position: 'relative',
              display: 'inline-flex',
              width: 34,
              height: 26,
              flex: '0 0 34px',
              overflow: 'hidden',
              border: 1,
              borderColor: color && !categoryColorPalette.includes(color.toUpperCase() as typeof categoryColorPalette[number])
                ? 'text.primary'
                : 'divider',
              borderRadius: 1,
              cursor: 'pointer',
            }}
          >
            <Box
              aria-hidden="true"
              sx={{ position: 'absolute', inset: 0, bgcolor: color ?? categoryColorPalette[0] }}
            />
            <PaletteIcon
              aria-hidden="true"
              sx={{
                position: 'absolute',
                zIndex: 1,
                top: '50%',
                left: '50%',
                color: 'common.white',
                fontSize: 17,
                filter: 'drop-shadow(0 1px 2px rgb(0 0 0 / 75%))',
                transform: 'translate(-50%, -50%)',
                pointerEvents: 'none',
              }}
            />
            <input
              id="category-custom-color"
              aria-label="选择自定义分类颜色"
              type="color"
              value={color ?? categoryColorPalette[0]}
              onChange={(event) => onChange(event.target.value.toUpperCase())}
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                padding: 0,
                border: 0,
                opacity: 0,
                cursor: 'pointer',
              }}
            />
          </Box>
        </Tooltip>
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