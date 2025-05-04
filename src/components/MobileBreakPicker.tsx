/** 
 * /src/components/MobileBreakPicker.tsx
 * 2025-05-04T14:45+09:00
 * 変更概要: 更新 - 無限更新ループの修正（単一方向のデータフローに変更）
 */
import React from 'react';
import Picker from 'react-mobile-picker';
import { MobileBreakPickerProps } from '../types';

// 休憩時間のオプション（分）- 選択肢を減らす
const breakTimeOptions = [0, 15, 30, 45, 60, 90, 120];

// 休憩時間ピッカー用の型定義
interface BreakPickerValue {
  breakTime: string;
}

const MobileBreakPicker: React.FC<MobileBreakPickerProps> = ({ 
  value, 
  onChange, 
  disabled = false 
}) => {
  // pickerValueは常に親から受け取ったvalueに基づく
  const pickerValue: BreakPickerValue = {
    breakTime: String(value)
  };

  // 型アサーションを使用して型の互換性を確保
  const handlePickerChange = (newValue: any) => {
    const newBreakTime = Number((newValue as BreakPickerValue).breakTime);
    onChange(newBreakTime);
  };

  const formatBreakTime = (minutes: number): string => {
    return minutes === 0 ? 'なし' : `${minutes}分`;
  };

  return (
    <div className="form-group">
      <label>休憩時間</label>
      <span className="time-display">{formatBreakTime(Number(pickerValue.breakTime))}</span>
      
      <div className="time-picker-wrapper">
        <div className="picker-highlight"></div>
        
        {!disabled && (
          <Picker
            value={pickerValue}
            onChange={handlePickerChange}
            height={90}
            itemHeight={30}
            wheelMode="normal"
          >
            <Picker.Column name="breakTime">
              {breakTimeOptions.map(minutes => (
                <Picker.Item key={minutes} value={String(minutes)}>
                  {formatBreakTime(minutes)}
                </Picker.Item>
              ))}
            </Picker.Column>
          </Picker>
        )}
      </div>
    </div>
  );
};

export default MobileBreakPicker;