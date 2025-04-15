import React, { useState, useRef, useEffect } from 'react';
import Picker from 'react-mobile-picker';
import { getSelectableDates, formatDateWithWeekday } from '../utils/dateUtils';

interface MobileDatePickerProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

interface DatePickerValue {
  date: string;
}

const MobileDatePicker: React.FC<MobileDatePickerProps> = ({ 
  value, 
  onChange, 
  disabled = false 
}) => {
  // 選択可能な日付の取得
  const selectableDates = getSelectableDates();
  
  // 初期化されたかどうかを追跡
  const initializedRef = useRef(false);
  
  // 現在の日付文字列からラベルを検索
  const currentDateLabel = selectableDates.find(date => date.value === value)?.label || selectableDates[0].label;
  
  // ローカル状態
  const [pickerValue, setPickerValue] = useState<DatePickerValue>({
    date: currentDateLabel
  });
  
  // ユーザーの変更を処理
  const handlePickerChange = (newValue: any) => {
    const typedValue = newValue as DatePickerValue;
    setPickerValue(typedValue);
    
    // 親コンポーネントに変更を通知（初期化後のみ）
    if (initializedRef.current) {
      // ラベルから日付値を検索
      const selectedDate = selectableDates.find(date => date.label === typedValue.date);
      if (selectedDate && selectedDate.value !== value) {
        onChange(selectedDate.value);
      }
    }
  };
  
  // 初期化とpropsの変更を処理
  useEffect(() => {
    // 値が変わったときだけ更新
    const dateLabel = selectableDates.find(date => date.value === value)?.label;
    if (dateLabel && pickerValue.date !== dateLabel) {
      setPickerValue({
        date: dateLabel
      });
    }
    
    // 初期化完了をマーク
    if (!initializedRef.current) {
      initializedRef.current = true;
    }
  }, [value, selectableDates]);
  
  // 表示用の日付
  const displayDate = formatDateWithWeekday(value);
  
  return (
    <div className="form-group">
      <label>日付</label>
      <span className="date-display">{displayDate}</span>
      
      <div className="date-picker-wrapper">
        <div className="picker-highlight"></div>
        
        {!disabled && (
          <Picker
            value={pickerValue}
            onChange={handlePickerChange}
            height={90}
            itemHeight={30}
            wheelMode="normal"
            style={{ margin: '0 auto' }}
          >
            <Picker.Column name="date">
              {selectableDates.map(date => (
                <Picker.Item key={date.value} value={date.label}>
                  {date.label}
                </Picker.Item>
              ))}
            </Picker.Column>
          </Picker>
        )}
      </div>
    </div>
  );
};

export default MobileDatePicker;