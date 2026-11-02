'use client';

import { Autocomplete, Box, Checkbox, Chip, TextField, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import CategoryIcon from './CategoryIcon';
import { fallbackCategoryColor } from '../lib/category-colors';
import type { TagRecord } from '../lib/tags';
import { filterCodeFirst } from './TransactionEntryForm/optionFilters';
import { getTagSelectionState, type TaggedSelectionRow } from '../lib/tag-selection';

type TransactionTagFieldProps = {
  tags: TagRecord[];
  label: string;
  disabled?: boolean;
  fieldId?: string;
} & ({
  mode?: 'filter';
  value: string[];
  onChange: (ids: string[]) => void;
} | {
  mode: 'bulk';
  transactions: TaggedSelectionRow[];
  onToggle: (tagId: number) => void;
  busy: boolean;
});

export default function TransactionTagField(props: TransactionTagFieldProps) {
  const { tags, label, disabled, fieldId } = props;
  const bulk = props.mode === 'bulk';
  const busy = bulk && props.busy;
  const stateFor = (tag: TagRecord) => bulk ? getTagSelectionState(props.transactions, tag.id)
    : props.value.includes(String(tag.id)) ? 'all' : 'none';
  const ordered = tags.filter((tag) => tag.parentId === null).flatMap((root) => [
    root, ...tags.filter((tag) => tag.parentId === root.id),
  ]);
  const colorFor = (tag: TagRecord) => tag.color ?? tags.find((parent) => parent.id === tag.parentId)?.color
    ?? fallbackCategoryColor(tag.parentId ?? tag.id);
  return (
    <Autocomplete<TagRecord, true, boolean>
      multiple
      disableCloseOnSelect
      disableClearable={bulk}
      fullWidth
      size="small"
      id={fieldId}
      disabled={disabled || tags.length === 0}
      options={ordered}
      value={ordered.filter((tag) => stateFor(tag) !== 'none')}
      onChange={(_, selected, reason, details) => {
        if (busy) return;
        if (props.mode === 'bulk') {
          if (details?.option && (reason === 'selectOption' || reason === 'removeOption')) props.onToggle(details.option.id);
        } else {
          props.onChange(selected.map((tag) => String(tag.id)));
        }
      }}
      getOptionDisabled={() => busy}
      loading={busy}
      getOptionLabel={(tag) => tag.name}
      isOptionEqualToValue={(option, selected) => option.id === selected.id}
      filterOptions={(options, state) => filterCodeFirst(options, state.inputValue)}
      noOptionsText="没有匹配的标签"
      sx={{ minWidth: 0, '& .MuiAutocomplete-inputRoot': { height: 40, flexWrap: 'nowrap', overflow: 'hidden' } }}
      renderValue={(selected, getItemProps) => (
        <Box sx={{ display: 'flex', overflow: 'hidden', maxWidth: 'calc(100% - 36px)', minWidth: 0, flexShrink: 1 }}>
          {selected.map((tag, index) => {
            const { key, ...itemProps } = getItemProps({ index });
            const color = colorFor(tag);
            const partial = stateFor(tag) === 'some';
            return <Chip key={key} {...itemProps} label={tag.name} title={partial ? `${tag.name}（部分流水包含）` : tag.name} size="small" variant="outlined"
              onDelete={bulk ? undefined : itemProps.onDelete}
              sx={{ flexShrink: 0, maxWidth: '100%', mr: 0.5, fontWeight: 400, borderColor: color, bgcolor: alpha(color, 0.1), opacity: partial ? 0.65 : 1 }} />;
          })}
        </Box>
      )}
      renderOption={(option, tag) => {
        const { key, ...optionProps } = option;
        const color = colorFor(tag);
        const state = stateFor(tag);
        return (
          <Box component="li" key={key} {...optionProps} sx={{ display: 'flex', gap: 1 }}>
            <Checkbox checked={state === 'all'} indeterminate={state === 'some'} size="small" tabIndex={-1}
              slotProps={{ input: { 'aria-label': tag.name, 'aria-checked': state === 'some' ? 'mixed' : state === 'all' } }}
              sx={{ pointerEvents: 'none' }} />
            <Box component="span" sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1, minWidth: 0, ml: tag.parentId === null ? 0 : 2 }}>
              <CategoryIcon name={tag.icon ?? 'Label'} color={color} fontSize="small" />
              <Chip label={tag.name} size="small" variant="outlined" sx={{ minWidth: 0, maxWidth: '100%', fontWeight: 400, borderColor: color, bgcolor: alpha(color, 0.1) }} />
            </Box>
            <Typography variant="caption" color="text.secondary">{tag.code}</Typography>
          </Box>
        );
      }}
      renderInput={(params) => <TextField {...params} label={label} placeholder={bulk ? '勾选以添加或移除标签' : props.value.length ? '' : '全部标签'} />}
    />
  );
}
