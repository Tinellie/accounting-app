'use client';

import { useDeferredValue, useState } from 'react';
import ClearIcon from '@mui/icons-material/Clear';
import CategoryOutlinedIcon from '@mui/icons-material/CategoryOutlined';
import SearchIcon from '@mui/icons-material/Search';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import Popover from '@mui/material/Popover';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import CategoryIcon, {
  getCategoryIconLabel,
  getCategoryIconLigature,
  normalizeCategoryIconName,
  popularCategoryIcons,
} from './CategoryIcon';

type CategoryIconPickerProps = {
  iconNames: string[];
  value: string;
  onChange: (icon: string) => void;
};

const pageSize = 72;

export default function CategoryIconPicker({ iconNames, value, onChange }: CategoryIconPickerProps) {
  const [anchorElement, setAnchorElement] = useState<HTMLElement | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [visibleCount, setVisibleCount] = useState(pageSize);
  const deferredSearchQuery = useDeferredValue(searchQuery.trim().toLowerCase());
  const selectedIcon = normalizeCategoryIconName(value);
  const selectedPopularIcon = popularCategoryIcons.find((option) => option.name === selectedIcon);
  const selectedLabel = selectedPopularIcon?.label ?? (selectedIcon ? getCategoryIconLabel(selectedIcon) : '未选择图标');
  const matchingIcons = deferredSearchQuery
    ? iconNames.filter((name) => {
        const searchableName = `${name} ${getCategoryIconLabel(name)} ${getCategoryIconLigature(name)}`.toLowerCase();
        return searchableName.includes(deferredSearchQuery);
      })
    : [
        ...(selectedIcon && !popularCategoryIcons.some((icon) => icon.name === selectedIcon)
          ? [selectedIcon]
          : []),
        ...popularCategoryIcons.map((icon) => icon.name),
      ];
  const visibleIcons = matchingIcons.slice(0, visibleCount);

  function selectIcon(icon: string) {
    onChange(icon);
    setAnchorElement(null);
  }

  return (
    <>
      <Tooltip title={selectedLabel}>
        <IconButton
          type="button"
          aria-label={`分类图标：${selectedLabel}`}
          aria-haspopup="grid"
          aria-expanded={Boolean(anchorElement)}
          onClick={(event) => {
            setSearchQuery('');
            setVisibleCount(pageSize);
            setAnchorElement(event.currentTarget);
          }}
          sx={{
            width: 40,
            height: 40,
            border: 1,
            borderColor: anchorElement ? 'primary.main' : 'divider',
            borderRadius: 1,
          }}
        >
          {selectedIcon ? <CategoryIcon name={selectedIcon} fontSize="small" /> : <CategoryOutlinedIcon fontSize="small" color="action" />}
        </IconButton>
      </Tooltip>
      <Popover
        open={Boolean(anchorElement)}
        anchorEl={anchorElement}
        onClose={() => setAnchorElement(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
      >
        <Box
          sx={{
            width: { xs: 'min(348px, calc(100vw - 32px))', sm: 380 },
            maxWidth: 'calc(100vw - 32px)',
            p: 1.5,
          }}
        >
          <Stack spacing={1.25}>
            <TextField
              autoFocus
              fullWidth
              size="small"
              label="搜索全部图标"
              value={searchQuery}
              onChange={(event) => {
                setSearchQuery(event.target.value);
                setVisibleCount(pageSize);
              }}
              slotProps={{
                input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> },
              }}
            />
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Typography variant="caption" color="text.secondary">
                {deferredSearchQuery ? `${matchingIcons.length} 个搜索结果` : '常用图标'}
              </Typography>
              <Tooltip title="清除图标">
                <IconButton aria-label="清除图标" onClick={() => selectIcon('')} size="small">
                  <ClearIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>
            <Box
              aria-label="分类图标选项"
              sx={{
                display: 'grid',
                gridTemplateColumns: 'repeat(6, minmax(0, 1fr))',
                gap: 0.5,
                maxHeight: 280,
                overflowY: 'auto',
              }}
            >
              {visibleIcons.map((name) => {
                const label = popularCategoryIcons.find((icon) => icon.name === name)?.label ?? getCategoryIconLabel(name);

                return (
                  <Tooltip key={name} title={label}>
                    <IconButton
                      aria-label={label}
                      aria-pressed={selectedIcon === name}
                      onClick={() => selectIcon(name)}
                      color={selectedIcon === name ? 'primary' : 'default'}
                      sx={{ width: 40, height: 40, justifySelf: 'center' }}
                    >
                      <CategoryIcon name={name} fontSize="small" />
                    </IconButton>
                  </Tooltip>
                );
              })}
            </Box>
            {matchingIcons.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
                没有找到匹配图标
              </Typography>
            ) : null}
            {visibleIcons.length < matchingIcons.length ? (
              <Button type="button" size="small" onClick={() => setVisibleCount((count) => count + pageSize)}>
                加载更多（{visibleIcons.length}/{matchingIcons.length}）
              </Button>
            ) : null}
          </Stack>
        </Box>
      </Popover>
    </>
  );
}