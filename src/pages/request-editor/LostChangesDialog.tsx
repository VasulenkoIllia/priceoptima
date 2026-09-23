// «Ці зміни не збереглися»: редагування втрачено або заявку змінили деінде — документ відкрито заново з сервера,
// а тут список того, що треба внести ще раз (з кнопкою скопіювати).
import { CopyOutlined } from '@ant-design/icons';
import { App, Button, Modal, Typography } from 'antd';
import { formatTime } from '@shared/format';
import { useRequestDoc } from '@/stores/requestDocStore';

export function LostChangesDialog() {
  const { message } = App.useApp();
  const lost = useRequestDoc((s) => s.lostChanges);
  const lockLost = useRequestDoc((s) => s.lockLost);
  const dismiss = useRequestDoc((s) => s.dismissLostChanges);
  if (!lost) return null;

  const why =
    lockLost?.reason === 'forced'
      ? `Редагування забрав ${(lockLost.byUserShortName ?? 'інший користувач').replace(/\.$/u, '')}.`
      : lockLost
        ? 'Редагування втрачено (довго не було зв’язку або комп’ютер засинав).'
        : 'Заявку тим часом змінили в іншій вкладці.';

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(lost.items.join('\n'));
      message.success('Список скопійовано');
    } catch {
      message.error('Не вдалося скопіювати, виділіть список вручну');
    }
  };

  return (
    <Modal
      open
      title="Ці зміни не збереглися"
      onCancel={dismiss}
      footer={[
        <Button key="copy" icon={<CopyOutlined />} onClick={() => void copy()}>
          Скопіювати список
        </Button>,
        <Button key="ok" type="primary" onClick={dismiss}>
          Зрозуміло
        </Button>,
      ]}
      width={620}
    >
      <Typography.Paragraph>
        {why} Заявку відкрито заново з сервера о {formatTime(lost.at, false)}. Щоб нічого не загубилось, внесіть ці зміни ще раз:
      </Typography.Paragraph>
      <ul className="po-lost-changes">
        {lost.items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </Modal>
  );
}
