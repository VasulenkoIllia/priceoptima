import { Button, Result } from 'antd';
import { useNavigate } from 'react-router';

export default function NotFoundPage() {
  const navigate = useNavigate();
  return (
    <Result
      status="404"
      title="Сторінку не знайдено"
      subTitle="Можливо, посилання застаріло."
      extra={
        <Button type="primary" onClick={() => navigate('/requests')}>
          До реєстру заявок
        </Button>
      }
    />
  );
}
