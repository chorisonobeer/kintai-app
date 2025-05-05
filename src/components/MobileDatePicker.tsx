/** 
 * /src/components/MobileDatePicker.tsx
 * 2025-05-04T23:15+09:00
 * 変更概要: 更新 - ホイール式から左右矢印による日付選択方式へ変更、型定義の修正
 */
import React from 'react';

// 明示的なプロパティ型定義
interface MobileDatePickerProps {
  value: string;
  onChange: (date: string) => void;
  disabled?: boolean;
  selectableDates: { value: string; label: string }[];
}

const MobileDatePicker: React.FC<MobileDatePickerProps> = ({ 
  value, 
  onChange, 
  disabled = false,
  selectableDates 
}) => {
  // 現在選択中の日付のインデックスを取得
  const currentIndex = selectableDates.findIndex(date => date.value === value);
  
  // 前の日付に移動
  const goToPreviousDate = () => {
    if (currentIndex > 0 && !disabled) {
      onChange(selectableDates[currentIndex - 1].value);
    }
  };
  
  // 次の日付に移動
  const goToNextDate = () => {
    if (currentIndex < selectableDates.length - 1 && !disabled) {
      onChange(selectableDates[currentIndex + 1].value);
    }
  };
  
  // 表示用の日付ラベルを取得
  const displayLabel = selectableDates.find(date => date.value === value)?.label || '';
  
  // 前後の日付ボタンの無効状態を設定
  const isPrevDisabled = currentIndex <= 0 || disabled;
  const isNextDisabled = currentIndex >= selectableDates.length - 1 || disabled;

  return (
    <div className="form-group">
      <label>日付</label>
      <div className="date-selector-container">
        <button 
          className={`date-nav-button ${isPrevDisabled ? 'date-nav-button-disabled' : ''}`}
          onClick={goToPreviousDate}
          disabled={isPrevDisabled}
          aria-label="前日"
        >
          ＜
        </button>
        <span className="date-display">{displayLabel}</span>
        <button 
          className={`date-nav-button ${isNextDisabled ? 'date-nav-button-disabled' : ''}`}
          onClick={goToNextDate}
          disabled={isNextDisabled}
          aria-label="翌日"
        >
          ＞
        </button>
      </div>
    </div>
  );
};

export default MobileDatePicker;