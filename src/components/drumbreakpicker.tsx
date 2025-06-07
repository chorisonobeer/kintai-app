/**
 * /src/components/DrumBreakPicker.tsx
 * 2025-01-20T10:00+09:00
 * 変更概要: 新規追加 - モバイルフレンドリーなドラム型休憩時間ピッカー
 */
import React, { useState, useEffect, useRef, useCallback } from "react";
import "./DrumBreakPicker.css";

interface DrumBreakPickerProps {
  value: number; // minutes
  onChange: (value: number) => void;
  disabled?: boolean;
}

interface DrumPickerItemProps {
  options: number[];
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  formatOption: (value: number) => string;
}

const DrumPickerItem: React.FC<DrumPickerItemProps> = ({
  options,
  value,
  onChange,
  disabled,
  formatOption,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const itemHeight = 50;

  const currentIndex = options.indexOf(value);

  const scrollToIndex = useCallback(
    (index: number, smooth = false) => {
      if (containerRef.current) {
        const targetScrollTop = index * itemHeight;
        if (smooth) {
          containerRef.current.scrollTo({
            top: targetScrollTop,
            behavior: "smooth",
          });
        } else {
          containerRef.current.scrollTop = targetScrollTop;
        }
      }
    },
    [itemHeight],
  );

  useEffect(() => {
    if (currentIndex >= 0) {
      scrollToIndex(currentIndex);
    }
  }, [currentIndex, scrollToIndex]);

  const handleScroll = useCallback(() => {
    if (disabled || !containerRef.current) return;

    // Clear existing timeout
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }

    // Set new timeout for snap behavior
    scrollTimeoutRef.current = setTimeout(() => {
      if (containerRef.current) {
        const scrollTop = containerRef.current.scrollTop;
        const index = Math.round(scrollTop / itemHeight);
        const clampedIndex = Math.max(0, Math.min(index, options.length - 1));

        // Update value if changed
        if (options[clampedIndex] !== value) {
          onChange(options[clampedIndex]);
        }

        // Snap to position
        scrollToIndex(clampedIndex, true);
      }
    }, 150);
  }, [disabled, itemHeight, options, value, onChange, scrollToIndex]);

  // Clean up timeout on unmount
  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, []);

  const handleItemClick = (option: number, index: number) => {
    if (disabled) return;
    onChange(option);
    scrollToIndex(index, true);
  };

  return (
    <div className="drum-break-picker-item">
      <div className="drum-break-picker-highlight"></div>
      <div
        ref={containerRef}
        className={`drum-break-picker-container ${disabled ? "disabled" : ""}`}
        onScroll={handleScroll}
      >
        <div className="drum-break-picker-padding"></div>
        {options.map((option, index) => (
          <div
            key={option}
            className={`drum-break-picker-option ${option === value ? "selected" : ""}`}
            onClick={() => handleItemClick(option, index)}
          >
            {formatOption(option)}
          </div>
        ))}
        <div className="drum-break-picker-padding"></div>
      </div>
    </div>
  );
};

const DrumBreakPicker: React.FC<DrumBreakPickerProps> = ({
  value,
  onChange,
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);

  // Generate break time options (0-180 minutes in 15-minute intervals)
  const breakTimeOptions = Array.from({ length: 13 }, (_, i) => i * 15);

  const formatBreakTime = (minutes: number): string => {
    return `${minutes}分`;
  };

  const formatDisplayValue = (minutes: number): string => {
    return formatBreakTime(minutes);
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      setIsOpen(false);
    }
  };

  return (
    <div className="drum-break-picker">
      <label className="drum-break-picker-label">休憩時間</label>
      <button
        className={`drum-break-picker-button ${disabled ? "disabled" : ""}`}
        onClick={() => !disabled && setIsOpen(true)}
        disabled={disabled}
      >
        <span className="drum-break-picker-value">
          {formatDisplayValue(value)}
        </span>
        <span className="drum-break-picker-icon">⏰</span>
      </button>

      {isOpen && (
        <div className="drum-break-picker-overlay" onClick={handleOverlayClick}>
          <div className="drum-break-picker-modal">
            <div className="drum-break-picker-header">
              <h3>休憩時間を選択</h3>
              <button
                className="drum-break-picker-close"
                onClick={() => setIsOpen(false)}
              >
                ✕
              </button>
            </div>
            <div className="drum-break-picker-content">
              <div className="drum-break-picker-drums">
                <div className="drum-break-picker-column">
                  <div className="drum-break-picker-column-label">休憩時間</div>
                  <DrumPickerItem
                    options={breakTimeOptions}
                    value={value}
                    onChange={onChange}
                    disabled={disabled}
                    formatOption={formatBreakTime}
                  />
                </div>
              </div>
            </div>
            <div className="drum-break-picker-footer">
              <button
                className="drum-break-picker-confirm"
                onClick={() => setIsOpen(false)}
              >
                確定
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DrumBreakPicker;
