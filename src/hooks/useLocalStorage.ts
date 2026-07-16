"use client";

import { useState, useCallback, useEffect } from "react";

// ============================================
// useLocalStorage - 持久化到 localStorage 的 Hook
// ============================================

export function useLocalStorage<T>(
  key: string,
  initialValue: T,
  deserialize?: (raw: unknown) => T,
): [T, (value: T | ((prev: T) => T)) => void, () => void] {
  // 初始化时从 localStorage 读取
  const [storedValue, setStoredValue] = useState<T>(() => {
    if (typeof window === "undefined") {
      return initialValue;
    }
    try {
      const item = window.localStorage.getItem(key);
      if (!item) return initialValue;
      const parsed = JSON.parse(item) as unknown;
      return deserialize ? deserialize(parsed) : parsed as T;
    } catch (error) {
      console.warn(`读取 localStorage key="${key}" 失败:`, error);
      return initialValue;
    }
  });

  // 写入 localStorage
  const setValue = useCallback(
    (value: T | ((prev: T) => T)) => {
      setStoredValue((prev) => {
        const newValue = value instanceof Function ? value(prev) : value;
        try {
          if (typeof window !== "undefined") {
            window.localStorage.setItem(key, JSON.stringify(newValue));
          }
        } catch (error) {
          console.warn(`写入 localStorage key="${key}" 失败:`, error);
        }
        return newValue;
      });
    },
    [key],
  );

  // 清除指定 key
  const removeValue = useCallback(() => {
    try {
      if (typeof window !== "undefined") {
        window.localStorage.removeItem(key);
      }
      setStoredValue(initialValue);
    } catch (error) {
      console.warn(`移除 localStorage key="${key}" 失败:`, error);
    }
  }, [key, initialValue]);

  return [storedValue, setValue, removeValue];
}
