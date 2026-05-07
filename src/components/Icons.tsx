/**
 * /src/components/Icons.tsx
 * 共通ラインアイコン（lucide風 / stroke ベース / currentColor 追従）
 * すべて 24x24 viewBox / stroke-width 2
 */
import React from "react";

interface IconProps {
  size?: string | number;
  strokeWidth?: number;
  className?: string;
  "aria-hidden"?: boolean;
}

const baseProps = (
  size: string | number,
  strokeWidth: number,
  className?: string,
) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  className,
});

export const CheckIcon: React.FC<IconProps> = ({
  size = "1em",
  strokeWidth = 2.4,
  className,
}) => (
  <svg
    {...baseProps(size, strokeWidth, className)}
    aria-hidden="true"
    focusable="false"
  >
    <polyline points="4 12 10 18 20 6" />
  </svg>
);

export const CloseIcon: React.FC<IconProps> = ({
  size = "1em",
  strokeWidth = 2,
  className,
}) => (
  <svg
    {...baseProps(size, strokeWidth, className)}
    aria-hidden="true"
    focusable="false"
  >
    <line x1="6" y1="6" x2="18" y2="18" />
    <line x1="18" y1="6" x2="6" y2="18" />
  </svg>
);

export const PlusIcon: React.FC<IconProps> = ({
  size = "1em",
  strokeWidth = 2,
  className,
}) => (
  <svg
    {...baseProps(size, strokeWidth, className)}
    aria-hidden="true"
    focusable="false"
  >
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

export const ChevronLeftIcon: React.FC<IconProps> = ({
  size = "1em",
  strokeWidth = 2,
  className,
}) => (
  <svg
    {...baseProps(size, strokeWidth, className)}
    aria-hidden="true"
    focusable="false"
  >
    <polyline points="15 6 9 12 15 18" />
  </svg>
);

export const ChevronRightIcon: React.FC<IconProps> = ({
  size = "1em",
  strokeWidth = 2,
  className,
}) => (
  <svg
    {...baseProps(size, strokeWidth, className)}
    aria-hidden="true"
    focusable="false"
  >
    <polyline points="9 6 15 12 9 18" />
  </svg>
);

export const ChevronDownIcon: React.FC<IconProps> = ({
  size = "1em",
  strokeWidth = 2,
  className,
}) => (
  <svg
    {...baseProps(size, strokeWidth, className)}
    aria-hidden="true"
    focusable="false"
  >
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

export const ClockIcon: React.FC<IconProps> = ({
  size = "1em",
  strokeWidth = 1.8,
  className,
}) => (
  <svg
    {...baseProps(size, strokeWidth, className)}
    aria-hidden="true"
    focusable="false"
  >
    <circle cx="12" cy="12" r="9" />
    <polyline points="12 7 12 12 15.5 14" />
  </svg>
);

export const AlertIcon: React.FC<IconProps> = ({
  size = "1em",
  strokeWidth = 2,
  className,
}) => (
  <svg
    {...baseProps(size, strokeWidth, className)}
    aria-hidden="true"
    focusable="false"
  >
    <path d="M10.3 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.4 0z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12" y2="17.01" />
  </svg>
);

export const PencilIcon: React.FC<IconProps> = ({
  size = "1em",
  strokeWidth = 2,
  className,
}) => (
  <svg
    {...baseProps(size, strokeWidth, className)}
    aria-hidden="true"
    focusable="false"
  >
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
  </svg>
);
