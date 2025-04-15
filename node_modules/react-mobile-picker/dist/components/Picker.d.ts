import { HTMLProps, MutableRefObject } from 'react';

interface Option {
    value: string | number;
    element: MutableRefObject<HTMLElement | null>;
}
export interface PickerValue {
    [key: string]: string | number;
}
export interface PickerRootProps<TType extends PickerValue> extends Omit<HTMLProps<HTMLDivElement>, 'value' | 'onChange'> {
    value: TType;
    onChange: (value: TType, key: string) => void;
    height?: number;
    itemHeight?: number;
    wheelMode?: 'off' | 'natural' | 'normal';
}
export declare function usePickerData(componentName: string): {
    height: number;
    itemHeight: number;
    wheelMode: "off" | "natural" | "normal";
    value: PickerValue;
    optionGroups: {
        [key: string]: Option[];
    };
};
export declare function usePickerActions(componentName: string): {
    registerOption(key: string, option: Option): () => void;
    change(key: string, value: string | number): boolean;
};
declare function PickerRoot<TType extends PickerValue>(props: PickerRootProps<TType>): import("react/jsx-runtime").JSX.Element;
export default PickerRoot;
