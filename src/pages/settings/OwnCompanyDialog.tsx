// Редагування реквізитів нашої юрособи (сформовані КП не змінюються — у них знімок реквізитів).
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { App, Checkbox, Form, Input, Modal, Tooltip } from 'antd';
import type { OwnCompanyDto, OwnCompanyInput } from '@shared/types';
import { LogoField } from '@/components';
import { ds, errorMessage, qk } from '@/data';

type FormValues = Pick<
  OwnCompanyDto,
  | 'nameShort'
  | 'nameFull'
  | 'edrpou'
  | 'ipn'
  | 'isVatPayer'
  | 'iban'
  | 'bankName'
  | 'addressLegal'
  | 'phone'
  | 'email'
  | 'website'
  | 'slogan'
  | 'logoUrl'
  | 'isDefault'
>;

const text = (v: string | null | undefined) => v?.trim() || null;
const noSpaces = (v: string) => v.replace(/\s/gu, '');
const GRID_2 = { display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 12 } as const;
const GRID_3 = { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', columnGap: 12 } as const;

/** Повний OwnCompanyInput: поля, яких немає у формі (код, підвал КП), — без змін. */
function toInput(c: OwnCompanyDto, v: FormValues): OwnCompanyInput {
  const { id: _id, ...rest } = c;
  return {
    ...rest,
    nameShort: v.nameShort.trim(),
    nameFull: v.nameFull.trim(),
    edrpou: text(v.edrpou),
    ipn: text(v.ipn),
    isVatPayer: !!v.isVatPayer,
    iban: text(v.iban)?.toUpperCase() ?? null,
    bankName: text(v.bankName),
    addressLegal: text(v.addressLegal),
    phone: text(v.phone),
    email: text(v.email),
    website: text(v.website),
    slogan: text(v.slogan),
    logoUrl: v.logoUrl ?? null,
    isDefault: !!v.isDefault,
  };
}

export interface OwnCompanyDialogProps {
  open: boolean;
  company: OwnCompanyDto;
  onClose: () => void;
}

export function OwnCompanyDialog({ open, company, onClose }: OwnCompanyDialogProps) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<FormValues>();

  const save = useMutation({
    mutationFn: (v: FormValues) => ds.saveOwnCompany(company.id, toInput(company, v)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.ownCompanies });
      message.success('Реквізити збережено');
      onClose();
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  return (
    <Modal
      open={open}
      title={`Реквізити: ${company.nameShort}`}
      okText="Зберегти"
      cancelText="Скасувати"
      confirmLoading={save.isPending}
      onOk={() => form.submit()}
      onCancel={onClose}
      destroyOnHidden
      width={720}
    >
      <Form<FormValues>
        form={form}
        layout="vertical"
        requiredMark={false}
        preserve={false}
        initialValues={company}
        onFinish={(v) => save.mutate(v)}
        style={{ marginTop: 12 }}
      >
        <div style={GRID_2}>
          <Form.Item name="nameShort" label="Коротка назва" rules={[{ required: true, whitespace: true, message: 'Вкажіть коротку назву' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="nameFull" label="Повна назва" rules={[{ required: true, whitespace: true, message: 'Вкажіть повну назву' }]}>
            <Input />
          </Form.Item>
        </div>
        <div style={GRID_3}>
          {/* ДОВ-6: коди — лише попередження; неправильний IBAN — помилка */}
          <Form.Item name="edrpou" label="ЄДРПОУ" normalize={noSpaces} rules={[{ pattern: /^\d{8}$/u, message: 'Зазвичай 8 цифр', warningOnly: true }]}>
            <Input className="po-num" maxLength={8} />
          </Form.Item>
          <Form.Item name="ipn" label="ІПН" normalize={noSpaces} rules={[{ pattern: /^(\d{10}|\d{12})$/u, message: 'Зазвичай 10 або 12 цифр', warningOnly: true }]}>
            <Input className="po-num" maxLength={12} />
          </Form.Item>
          <Form.Item name="isVatPayer" label=" " valuePropName="checked">
            <Checkbox>Платник ПДВ</Checkbox>
          </Form.Item>
        </div>
        <div style={GRID_2}>
          <Form.Item name="iban" label="IBAN" normalize={noSpaces} rules={[{ pattern: /^UA\d{27}$/iu, message: 'UA і 27 цифр' }]}>
            <Input className="po-num" maxLength={29} />
          </Form.Item>
          <Form.Item name="bankName" label="Банк">
            <Input />
          </Form.Item>
        </div>
        <Form.Item name="addressLegal" label="Юридична адреса">
          <Input />
        </Form.Item>
        <div style={GRID_3}>
          <Form.Item name="phone" label="Телефон">
            <Input />
          </Form.Item>
          <Form.Item name="email" label="E-mail" rules={[{ type: 'email', message: 'Схоже на некоректний e-mail', warningOnly: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="website" label="Сайт">
            <Input />
          </Form.Item>
        </div>
        <div style={GRID_2}>
          <Form.Item name="slogan" label="Слоган (у шапці КП)">
            <Input />
          </Form.Item>
          <Form.Item name="logoUrl" label="Логотип (у шапці КП)">
            <LogoField hint="PNG, JPEG або SVG; зменшимо самі" />
          </Form.Item>
        </div>
        <Form.Item name="isDefault" valuePropName="checked" style={{ marginBottom: 0 }}>
          <Checkbox disabled={company.isDefault}>
            <Tooltip title={company.isDefault ? 'Щоб змінити, позначте іншу юрособу' : undefined}>За замовчуванням у нових заявках</Tooltip>
          </Checkbox>
        </Form.Item>
      </Form>
    </Modal>
  );
}
