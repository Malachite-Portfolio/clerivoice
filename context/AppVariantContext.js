import React, { createContext, useContext, useMemo } from 'react';

const AppVariantContext = createContext(null);

export const AppVariantProvider = ({ children, value }) => {
  const memoizedValue = useMemo(() => value, [value]);

  return <AppVariantContext.Provider value={memoizedValue}>{children}</AppVariantContext.Provider>;
};

export const useAppVariant = () => {
  const context = useContext(AppVariantContext);

  if (!context) {
    throw new Error('useAppVariant must be used within AppVariantProvider');
  }

  return context;
};
