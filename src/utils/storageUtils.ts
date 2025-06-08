import { KintaiData } from "../types";

const STORAGE_KEY_PREFIX = "kintai_data_";

/**
 * 日付に基づいたストレージキーを生成
 */
const getStorageKey = (date: string): string => `${STORAGE_KEY_PREFIX}${date}`;

/**
 * 勤怠データを保存
 */
export const saveKintaiData = (data: KintaiData): void => {
  try {
    const key = getStorageKey(data.date);
    localStorage.setItem(key, JSON.stringify(data));
  } catch (error) {
    // 保存エラーは無視
  }
};

/**
 * 特定の日付の勤怠データを取得
 */
export const getKintaiData = (date: string): KintaiData | null => {
  try {
    const key = getStorageKey(date);
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    return null;
  }
};

/**
 * 特定の日付のデータが保存済みかをチェック
 */
export const isDateSaved = (date: string): boolean =>
  getKintaiData(date) !== null;

/**
 * 保存済みの勤怠データを削除
 */
export const deleteKintaiData = (date: string): void => {
  try {
    const key = getStorageKey(date);
    localStorage.removeItem(key);
  } catch (error) {
    // 削除エラーは無視
  }
};
