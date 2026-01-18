import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Хук для отслеживания изменений в форме
 * @param initialValue - начальное значение для сравнения
 * @param getCurrentValue - функция получения текущего значения
 * @returns объект с hasChanges и функциями для работы с изменениями
 */
export function useFormChanges<T>(
  initialValue: T,
  getCurrentValue: () => T,
  compareFn?: (a: T, b: T) => boolean
): {
  hasChanges: boolean;
  resetChanges: () => void;
  getChanges: () => T;
} {
  const [hasChanges, setHasChanges] = useState(false);
  const initialRef = useRef(initialValue);
  
  const defaultCompare = (a: T, b: T): boolean => {
    return JSON.stringify(a) === JSON.stringify(b);
  };
  
  const compare = compareFn || defaultCompare;
  
  useEffect(() => {
    initialRef.current = initialValue;
  }, [initialValue]);
  
  useEffect(() => {
    const current = getCurrentValue();
    const changed = !compare(current, initialRef.current);
    setHasChanges(changed);
  }, [getCurrentValue, compare]);
  
  const resetChanges = useCallback(() => {
    initialRef.current = getCurrentValue();
    setHasChanges(false);
  }, [getCurrentValue]);
  
  const getChanges = useCallback(() => {
    return getCurrentValue();
  }, [getCurrentValue]);
  
  return {
    hasChanges,
    resetChanges,
    getChanges
  };
}
