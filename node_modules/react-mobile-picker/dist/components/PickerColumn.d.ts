import { HTMLProps } from 'react';

interface PickerColumnProps extends HTMLProps<HTMLDivElement> {
    name: string;
}
export declare function useColumnData(componentName: string): {
    key: string;
};
declare function PickerColumn({ style, children, name: key, ...restProps }: PickerColumnProps): import("react/jsx-runtime").JSX.Element;
export default PickerColumn;
