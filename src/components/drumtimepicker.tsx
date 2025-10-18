/**
 * /src/components/DrumTimePicker.tsx
 * 2025-01-20T10:00+09:00
 * 変更概要: 新規追加 - モバイルフレンドリーなドラム型時間ピッカー
 */
import React, { useState, useEffect, useRef, useCallback } from "react";
import "./drumtimepicker.css";

interface DrumTimePickerProps {
  label: string;
  value: string; // "HH:mm" format
  onChange: (value: string) => void;
  disabled?: boolean;
}

interface DrumPickerItemProps {
  options: string[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

// 安全に "HH:mm" を抽出するヘルパー（未入力は "00:00"）
const parseHHmm = (v: string): [string, string] => {
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(v || "");
  if (!match) return ["00", "00"];
  return [match[1].padStart(2, "0"), match[2].padStart(2, "0")];
};

const DrumPickerItem: React.FC<DrumPickerItemProps> = ({
  options,
  value,
  onChange,
  disabled,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isScrolling, setIsScrolling] = useState(false);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const itemHeight = 50;

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
    if (!isScrolling) {
      const initialIndex = options.indexOf(value);
      const safeIndex = initialIndex >= 0 ? initialIndex : 0;
      scrollToIndex(safeIndex);
    }
  }, [value, options, scrollToIndex, isScrolling]);

  const handleScroll = useCallback(() => {
    if (disabled || !containerRef.current) return;

    setIsScrolling(true);

    // Clear existing timeout
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }

    // Set new timeout for snap behavior
    scrollTimeoutRef.current = setTimeout(() => {
      if (containerRef.current) {
        const { scrollTop } = containerRef.current;
        // Use Math.floor and add 0.5 * itemHeight for better centering
        const index = Math.floor((scrollTop + itemHeight * 0.5) / itemHeight);
        const clampedIndex = Math.max(0, Math.min(index, options.length - 1));

        // Update value if changed
        if (options[clampedIndex] !== value) {
          onChange(options[clampedIndex]);
        }

        // Snap to position only if value actually changed
        if (options[clampedIndex] !== value) {
          scrollToIndex(clampedIndex, true);
        }
        setIsScrolling(false);
      }
    }, 150);
  }, [disabled, itemHeight, options, value, onChange, scrollToIndex]);

  // Clean up timeout on unmount
  useEffect(
    () => () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    },
    [],
  );

  const handleItemClick = (option: string, index: number) => {
    if (disabled) return;
    onChange(option);
    scrollToIndex(index, true);
  };

  return (
    <div className="drum-picker-item">
      <div className="drum-picker-highlight" />
      <div
        ref={containerRef}
        className={`drum-picker-container ${disabled ? "disabled" : ""}`}
        onScroll={handleScroll}
      >
        <div className="drum-picker-padding" />
        {options.map((option, index) => {
          const isSelected = option === value;
          return (
            <div
              key={option}
              className={`drum-picker-option ${isSelected ? "selected" : ""}`}
              onClick={() => handleItemClick(option, index)}
            >
              {option}
            </div>
          );
        })}
        <div className="drum-picker-padding" />
      </div>
    </div>
  );
};

const DrumTimePicker: React.FC<DrumTimePickerProps> = ({
  label,
  value,
  onChange,
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [hours, minutes] = parseHHmm(value);

  // Generate options
  const hourOptions = Array.from({ length: 23 }, (_, i) =>
    String(i + 1).padStart(2, "0"),
  );
  const minuteOptions = Array.from({ length: 12 }, (_, i) =>
    String(i * 5).padStart(2, "0"),
  );

  const handleHourChange = (newHour: string) => {
    const newTime = `${newHour}:${minutes}`;
    onChange(newTime);
  };

  const handleMinuteChange = (newMinute: string) => {
    const newTime = `${hours}:${newMinute}`;
    onChange(newTime);
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      setIsOpen(false);
    }
  };

  return (
    <div className="drum-time-picker">
      <label className="drum-time-picker-label">{label}</label>
      <button
        className={`drum-time-picker-button ${disabled ? "disabled" : ""}`}
        onClick={() => !disabled && setIsOpen(true)}
        disabled={disabled}
      >
        <span className="drum-time-picker-value">{value || "未入力"}</span>
        <span className="drum-time-picker-icon">🕐</span>
      </button>

      {isOpen && (
        <div className="drum-time-picker-overlay" onClick={handleOverlayClick}>
          <div className="drum-time-picker-modal">
            <div className="drum-time-picker-header">
              <h3>{label}</h3>
              <button
                className="drum-time-picker-close"
                onClick={() => setIsOpen(false)}
              >
                ✕
              </button>
            </div>
            <div className="drum-time-picker-content">
              <div className="drum-time-picker-drums">
                <div className="drum-time-picker-column">
                  <div className="drum-time-picker-column-label">時</div>
                  <DrumPickerItem
                    options={hourOptions}
                    value={hours}
                    onChange={handleHourChange}
                    disabled={disabled}
                  />
                </div>
                <div className="drum-time-picker-separator">:</div>
                <div className="drum-time-picker-column">
                  <div className="drum-time-picker-column-label">分</div>
                  <DrumPickerItem
                    options={minuteOptions}
                    value={minutes}
                    onChange={handleMinuteChange}
                    disabled={disabled}
                  />
                </div>
              </div>
            </div>
            <div className="drum-time-picker-footer">
              <button
                className="drum-time-picker-confirm"
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

export default DrumTimePicker;
