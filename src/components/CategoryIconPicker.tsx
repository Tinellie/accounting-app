'use client';

import { useDeferredValue, useState } from 'react';
import {
  Clear as ClearIcon,
  CategoryOutlined as CategoryOutlinedIcon,
  Search as SearchIcon,
} from '@mui/icons-material';
import { Box, Button, IconButton, InputAdornment, Popover, Stack, TextField, Tooltip, Typography } from '@mui/material';
import CategoryIcon, {
  getCategoryIconLabel,
  getCategoryIconLigature,
  normalizeCategoryIconName,
  popularCategoryIcons,
} from './CategoryIcon';

/**
 * 组件：分类图标选择器
 * 功能：供用户搜索、浏览并选择分类图标，也可清除当前选择。
 */
type CategoryIconPickerProps = {
  iconNames: string[];
  value: string;
  onChange: (icon: string) => void;
};

type CategoryIconPickerState = {
  anchorElement: HTMLElement | null;
  searchQuery: string;
  visibleCount: number;
};

const pageSize = 72;

export default function CategoryIconPicker({ iconNames, value, onChange }: CategoryIconPickerProps) {
  // 图标弹窗锚点、搜索词和当前展示数量共同描述选择器界面。
  const [pickerState, setPickerState] = useState<CategoryIconPickerState>({
    anchorElement: null,
    searchQuery: '',
    visibleCount: pageSize,
  });
  const { anchorElement, searchQuery, visibleCount } = pickerState;
  // 延后用于筛选的搜索词，避免输入时立即处理全部图标。
  const deferredSearchQuery = useDeferredValue(searchQuery.trim().toLowerCase());
  // 标准化后的当前图标名称。
  const selectedIcon = normalizeCategoryIconName(value);
  // 当前图标在常用图标列表中的资料，用于显示本地化标签。
  const selectedPopularIcon = popularCategoryIcons.find((option) => option.name === selectedIcon);
  // 选择器按钮上展示的图标名称。
  const selectedLabel = selectedPopularIcon?.label ?? (selectedIcon ? getCategoryIconLabel(selectedIcon) : '未选择图标');
  // 按搜索词筛选出的图标；没有搜索时显示当前图标和常用图标。
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
  // 当前分页中实际展示的图标。
  const visibleIcons = matchingIcons.slice(0, visibleCount);

  function selectIcon(icon: string) {
    onChange(icon);
    setPickerState((current) => ({ ...current, anchorElement: null }));
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
            setPickerState({ anchorElement: event.currentTarget, searchQuery: '', visibleCount: pageSize });
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
        onClose={() => setPickerState((current) => ({ ...current, anchorElement: null }))}
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
                setPickerState((current) => ({
                  ...current,
                  searchQuery: event.target.value,
                  visibleCount: pageSize,
                }));
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
              <Button
                type="button"
                size="small"
                onClick={() => setPickerState((current) => ({
                  ...current,
                  visibleCount: current.visibleCount + pageSize,
                }))}
              >
                加载更多（{visibleIcons.length}/{matchingIcons.length}）
              </Button>
            ) : null}
          </Stack>
        </Box>
      </Popover>
    </>
  );
}