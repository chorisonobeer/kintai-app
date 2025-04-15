import { HTMLProps, ReactNode } from 'react';

interface PickerItemRenderProps {
    selected: boolean;
}
export interface PickerItemProps extends Omit<HTMLProps<HTMLDivElement>, 'value' | 'children'> {
    children: ReactNode | ((renderProps: PickerItemRenderProps) => ReactNode);
    value: string | number;
}
declare function PickerItem({ style, children, value, ...restProps }: PickerItemProps): import("react/jsx-runtime").JSX.Element;
export default PickerItem;
