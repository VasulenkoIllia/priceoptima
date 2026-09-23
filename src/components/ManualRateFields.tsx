// Ручний курс постачальника (USD, EUR): ті самі поля у формі постачальника й у «Курсах валют».
import { Form, InputNumber } from 'antd';
import type { CSSProperties } from 'react';

const POSITIVE = [
  {
    validator: (_: unknown, v: number | null | undefined) =>
      v == null || v > 0 ? Promise.resolve() : Promise.reject(new Error('Курс має бути більшим за нуль або порожнім (курс не задано)')),
  },
];

export interface ManualRateFieldsProps {
  /** Підпис поля: «Курс USD, грн» / «Ручний курс USD, грн». */
  label?: (currency: 'USD' | 'EUR') => string;
  extra?: string;
  inputStyle?: CSSProperties;
}

/** Два поля форми — manualRateUsd і manualRateEur; розкладку (сітка чи стовпчик) задає форма навколо. */
export function ManualRateFields({ label = (c) => `Курс ${c}, грн`, extra = 'Порожньо, якщо курс не задано', inputStyle }: ManualRateFieldsProps) {
  return (
    <>
      {(['USD', 'EUR'] as const).map((c) => (
        <Form.Item key={c} name={c === 'USD' ? 'manualRateUsd' : 'manualRateEur'} label={label(c)} extra={extra} rules={POSITIVE}>
          <InputNumber min={0.0001} max={10_000} step={0.01} decimalSeparator="," style={{ width: '100%', ...inputStyle }} placeholder="не задано" />
        </Form.Item>
      ))}
    </>
  );
}
