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

  const getOptionElements = () =>
    (containerRef.current?.querySelectorAll(
      ".drum-picker-option",
    ) as NodeListOf<HTMLElement>) || null;

  const scrollToIndex = useCallback((index: number, smooth = false) => {
    const container = containerRef.current;
    const optionEls = getOptionElements();
    if (!container || !optionEls || !optionEls[index]) return;
    const el = optionEls[index];
    // コンテナ中央に対象要素が来るスクロール位置を算出
    const containerCenterOffset =
      container.clientHeight / 2 - el.offsetHeight / 2;
    const targetTop = el.offsetTop - containerCenterOffset;
    container.scrollTo({
      top: targetTop,
      behavior: smooth ? "smooth" : "auto",
    });
  }, []);

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

    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }

    // スクロール終了後に中央に最も近い要素を選択
    scrollTimeoutRef.current = setTimeout(() => {
      const container = containerRef.current;
      const optionEls = getOptionElements();
      if (container && optionEls && optionEls.length > 0) {
        const containerRect = container.getBoundingClientRect();
        const centerY = containerRect.top + containerRect.height / 2;

        let bestIndex = 0;
        let minDist = Number.POSITIVE_INFINITY;
        optionEls.forEach((el, idx) => {
          const rect = el.getBoundingClientRect();
          const elCenterY = rect.top + rect.height / 2;
          const dist = Math.abs(elCenterY - centerY);
          if (dist < minDist) {
            minDist = dist;
            bestIndex = idx;
          }
        });

        const nextValue = options[bestIndex];
        if (nextValue !== value) {
          onChange(nextValue);
          scrollToIndex(bestIndex, true);
        }
        setIsScrolling(false);
      }
    }, 150);
  }, [disabled, options, value, onChange, scrollToIndex]);

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
  // draft選択値（モーダル内専用）
  const [draftHour, setDraftHour] = useState<string>("00");
  const [draftMinute, setDraftMinute] = useState<string>("00");
  // 表示用の現在値（親から渡される）

  // Generate options
  const hourOptions = Array.from({ length: 24 }, (_, i) =>
    String(i).padStart(2, "0"),
  );
  const minuteOptions = Array.from({ length: 12 }, (_, i) =>
    String(i * 5).padStart(2, "0"),
  );

  // 初期値の設定はhandleOpenでモーダル表示前に同期的に行う

  const handleHourChange = (newHour: string) => {
    setDraftHour(newHour);
  };

  const handleMinuteChange = (newMinute: string) => {
    setDraftMinute(newMinute);
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      setIsOpen(false);
    }
  };

  const handleOpen = () => {
    if (disabled) return;
    const isValid = /^([01]?\d|2[0-3]):([0-5]\d)$/.test(value || "");
    if (isValid) {
      const [vh, vm] = parseHHmm(value);
      setDraftHour(vh);
      setDraftMinute(vm);
    } else if (label.includes("出勤")) {
      setDraftHour("08");
      setDraftMinute("00");
    } else if (label.includes("退勤")) {
      setDraftHour("17");
      setDraftMinute("00");
    } else {
      const [vh, vm] = parseHHmm(value);
      setDraftHour(vh);
      setDraftMinute(vm);
    }
    setIsOpen(true);
  };

  return (
    <div className="drum-time-picker">
      <label className="drum-time-picker-label">{label}</label>
      <button
        className={`drum-time-picker-button ${disabled ? "disabled" : ""}`}
        onClick={handleOpen}
        disabled={disabled}
      >
        <span className="drum-time-picker-value">
          {value || "未入力 / Not entered"}
        </span>
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
                  <div className="drum-time-picker-column-label">時 / Hour</div>
                  <DrumPickerItem
                    options={hourOptions}
                    value={draftHour}
                    onChange={handleHourChange}
                    disabled={disabled}
                  />
                </div>
                <div className="drum-time-picker-separator">:</div>
                <div className="drum-time-picker-column">
                  <div className="drum-time-picker-column-label">
                    分 / Minute
                  </div>
                  <DrumPickerItem
                    options={minuteOptions}
                    value={draftMinute}
                    onChange={handleMinuteChange}
                    disabled={disabled}
                  />
                </div>
              </div>
            </div>
            <div className="drum-time-picker-footer">
              <button
                className="drum-time-picker-confirm"
                onClick={() => {
                  onChange(`${draftHour}:${draftMinute}`);
                  setIsOpen(false);
                }}
              >
                確定 / Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Generate options
export default DrumTimePicker;
