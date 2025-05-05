/** 
 * /src/components/MobileDatePicker.tsx
 * 2025-05-06T10:15+09:00
 * 変更概要: 修正 - 日付ナビゲーションボタンの動作を修正（< で前日、> で翌日）
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
          onClick={goToPreviousDate} // 正: 前日へ移動
          disabled={isPrevDisabled}
          aria-label="前日" // 正: ラベル
        >
          ＜
        </button>
        <span className="date-display">{displayLabel}</span>
        <button 
          className={`date-nav-button ${isNextDisabled ? 'date-nav-button-disabled' : ''}`}
          onClick={goToNextDate} // 正: 翌日へ移動
          disabled={isNextDisabled}
          aria-label="翌日" // 正: ラベル
        >
          ＞
        </button>
      </div>
    </div>
  );
};

export default MobileDatePicker;