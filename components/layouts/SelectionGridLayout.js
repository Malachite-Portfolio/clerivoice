import React from 'react';
import { StyleSheet, View } from 'react-native';
import { SelectionCard } from '../ui';
import theme from '../../theme';

const SelectionGridLayout = ({
  options = [],
  selectedValues = [],
  onSelect,
  columns = 2,
  cardStyle,
}) => {
  const normalizedSelections = Array.isArray(selectedValues)
    ? selectedValues
    : [selectedValues];

  return (
    <View style={styles.grid}>
      {options.map((item) => {
        const key = item.key || item.value || item.title;
        const selected = normalizedSelections.includes(item.value || key);

        return (
          <SelectionCard
            key={key}
            title={item.title}
            subtitle={item.subtitle}
            selected={selected}
            style={[styles.card, { width: `${100 / columns - 2}%` }, cardStyle]}
            onPress={() => onSelect(item.value || key)}
          />
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  card: {
    minHeight: 50,
  },
});

export default SelectionGridLayout;
